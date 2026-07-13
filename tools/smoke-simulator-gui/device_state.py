"""设备状态管理器 — 本地状态表、心跳超时判定、定时器管理"""
from __future__ import annotations

import threading
import time
from datetime import datetime
from typing import Callable

# 默认心跳超时秒数（设备配置可能不同，这里给全局默认值）
DEFAULT_HEARTBEAT_TIMEOUT = 30
# 超时判定倍数：超过 timeout * MULTIPLIER 秒未收到心跳 → OFFLINE
TIMEOUT_MULTIPLIER = 2


class DeviceState:
    """单设备运行时状态"""

    def __init__(self, device_code: str, device_name: str = "",
                 building: str = "", floor: str = "", room: str = "",
                 heartbeat_timeout: int = DEFAULT_HEARTBEAT_TIMEOUT) -> None:
        self.device_code = device_code
        self.device_name = device_name
        self.building = building
        self.floor = floor
        self.room = room
        self.heartbeat_timeout = heartbeat_timeout

        # 运行时状态
        self.online = False
        self.last_heartbeat_ts: float = 0.0
        self.battery: int = 100
        self.rssi: int = -40
        self.latest_smoke: float = 0.0
        self.latest_temp: float = 0.0
        self.latest_humi: float = 0.0

        # 本地定时器状态（模拟器自己是否在发心跳）
        self.heartbeat_running = False
        self.data_running = False

    def heartbeat_received(self, bat: int | None = None, rssi: int | None = None) -> None:
        """外部心跳到达（通过 MQTT subscribe 监听）"""
        self.last_heartbeat_ts = time.time()
        self.online = True
        if bat is not None:
            self.battery = bat
        if rssi is not None:
            self.rssi = rssi

    def check_offline(self, now: float | None = None) -> bool:
        """判定是否超时离线。返回 True 表示刚变成离线"""
        if now is None:
            now = time.time()
        if not self.online:
            return False
        threshold = self.heartbeat_timeout * TIMEOUT_MULTIPLIER
        if self.last_heartbeat_ts > 0 and (now - self.last_heartbeat_ts) > threshold:
            self.online = False
            return True
        return False

    def to_dict(self) -> dict:
        return {
            "device_code": self.device_code,
            "device_name": self.device_name,
            "building": self.building,
            "floor": self.floor,
            "room": self.room,
            "online": self.online,
            "last_heartbeat_ts": self.last_heartbeat_ts,
            "last_heartbeat_str": datetime.fromtimestamp(self.last_heartbeat_ts).strftime("%H:%M:%S") if self.last_heartbeat_ts else "--",
            "battery": self.battery,
            "rssi": self.rssi,
            "latest_smoke": self.latest_smoke,
            "latest_temp": self.latest_temp,
            "latest_humi": self.latest_humi,
            "heartbeat_running": self.heartbeat_running,
            "data_running": self.data_running,
            "heartbeat_timeout": self.heartbeat_timeout,
        }


class DeviceStateManager:
    """管理所有设备的运行时状态 + 周期性离线检测"""

    def __init__(self, on_offline_callback: Callable[[str, str], None] | None = None) -> None:
        """
        on_offline_callback(device_code, device_name) — 当某个设备判定为离线时回调
        """
        self._lock = threading.Lock()
        self._devices: dict[str, DeviceState] = {}
        self._on_offline = on_offline_callback

        self._check_running = False
        self._check_thread: threading.Thread | None = None
        self._check_interval = 5  # 每 5 秒扫描一次

    def register_device(self, device: dict) -> DeviceState:
        """注册或更新一个设备（从配置/数据库加载时调用）"""
        code = device["device_code"]
        with self._lock:
            if code in self._devices:
                state = self._devices[code]
                state.device_name = device.get("device_name", code)
                state.building = device.get("building", "")
                state.floor = device.get("floor", "")
                state.room = device.get("room", "")
                state.heartbeat_timeout = device.get("heartbeat_timeout", DEFAULT_HEARTBEAT_TIMEOUT)
            else:
                state = DeviceState(
                    device_code=code,
                    device_name=device.get("device_name", code),
                    building=device.get("building", ""),
                    floor=device.get("floor", ""),
                    room=device.get("room", ""),
                    heartbeat_timeout=device.get("heartbeat_timeout", DEFAULT_HEARTBEAT_TIMEOUT),
                )
                self._devices[code] = state
            return state

    def unregister_device(self, code: str) -> bool:
        with self._lock:
            if code in self._devices:
                del self._devices[code]
                return True
            return False

    def get(self, code: str) -> DeviceState | None:
        with self._lock:
            return self._devices.get(code)

    def get_all(self) -> dict[str, DeviceState]:
        with self._lock:
            return dict(self._devices)

    def heartbeat_received(self, code: str, bat: int | None = None, rssi: int | None = None) -> None:
        """MQTT 心跳到达"""
        with self._lock:
            state = self._devices.get(code)
            if state:
                state.heartbeat_received(bat, rssi)

    def data_received(self, code: str, smoke: float, temp: float, humi: float, bat: int | None = None) -> None:
        """MQTT 传感器数据到达"""
        with self._lock:
            state = self._devices.get(code)
            if state:
                state.latest_smoke = smoke
                state.latest_temp = temp
                state.latest_humi = humi
                if bat is not None:
                    state.battery = bat
                state.last_heartbeat_ts = time.time()  # 数据包也算存活信号
                state.online = True

    def mark_heartbeat_running(self, code: str, running: bool) -> None:
        with self._lock:
            state = self._devices.get(code)
            if state:
                state.heartbeat_running = running

    def mark_data_running(self, code: str, running: bool) -> None:
        with self._lock:
            state = self._devices.get(code)
            if state:
                state.data_running = running

    def update_local_status(self, code: str, online: bool) -> None:
        """手动更新在线状态（用于模拟器自身启停心跳）"""
        with self._lock:
            state = self._devices.get(code)
            if state:
                state.online = online
                if online:
                    state.last_heartbeat_ts = time.time()

    def get_online_count(self) -> int:
        with self._lock:
            return sum(1 for s in self._devices.values() if s.online)

    def get_offline_count(self) -> int:
        with self._lock:
            return sum(1 for s in self._devices.values() if not s.online)

    # ── 离线检测循环 ──

    def start_offline_check(self) -> None:
        if self._check_running:
            return
        self._check_running = True
        self._check_thread = threading.Thread(target=self._offline_check_loop, daemon=True)
        self._check_thread.start()

    def stop_offline_check(self) -> None:
        self._check_running = False
        if self._check_thread and self._check_thread.is_alive():
            self._check_thread.join(timeout=2)
        self._check_thread = None

    def _offline_check_loop(self) -> None:
        while self._check_running:
            time.sleep(self._check_interval)
            if not self._check_running:
                break
            now = time.time()
            gone_offline: list[tuple[str, str]] = []
            with self._lock:
                for code, state in self._devices.items():
                    if state.check_offline(now):
                        gone_offline.append((code, state.device_name))
            for code, name in gone_offline:
                if self._on_offline:
                    self._on_offline(code, name)
