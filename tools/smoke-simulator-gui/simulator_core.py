"""智慧烟感模拟器核心引擎 v2 — MQTT 正链路 + 离线检测 + 断线重连"""
from __future__ import annotations

import json
import random
import threading
import time
from dataclasses import dataclass
from typing import Callable

import paho.mqtt.client as mqtt

from device_state import DeviceStateManager, DEFAULT_HEARTBEAT_TIMEOUT
from event_logger import EventLogger
from rest_client import RestClient
from ws_client import WsClient

LogFn = Callable[[str], None]


@dataclass
class SimulatorConfig:
    broker: str
    port: int
    client_id: str
    username: str
    password: str
    use_random: bool
    smoke: float
    temp: float
    humi: float
    bat: int
    rssi: int
    normal_interval: int
    heartbeat_interval: int
    offline_timeout: int


class SmokeSimulatorCore:
    """模拟器核心引擎 — 每个实例管理一组设备 + MQTT 连接"""

    def __init__(self, logger: LogFn | None = None) -> None:
        # 日志
        self.event_logger = EventLogger()
        self._external_logger = logger

        # 设备状态管理器
        self.state_manager = DeviceStateManager(
            on_offline_callback=self._on_device_offline
        )

        # MQTT
        self.client: mqtt.Client | None = None
        self.connected = False
        self.running = False
        self._stop_event = threading.Event()

        # 线程管理
        self._threads: list[threading.Thread] = []
        self._heartbeat_timer_thread: threading.Thread | None = None

        # 离线检测
        self._offline_check_running = False

        # MQTT 重连
        self._reconnect_running = False
        self._reconnect_thread: threading.Thread | None = None
        self._last_config: SimulatorConfig | None = None

        # 每设备独立数据参数 {device_code: {smoke, temp, humi}}
        self._device_params: dict[str, dict] = {}

        # 连续发送定时器
        self._continuous_timer: threading.Thread | None = None

        # REST 客户端（懒初始化）
        self.rest_client: RestClient | None = None

        # WebSocket
        self.ws_client: WsClient | None = None

        # 日志回调（给 GUI）
        self._gui_log_cb: LogFn | None = None

    def set_gui_log_callback(self, cb: LogFn) -> None:
        self._gui_log_cb = cb

    def _log(self, message: str) -> None:
        self.event_logger.global_log("info", message)
        if self._external_logger:
            self._external_logger(message)

    def _log_dev(self, code: str, level: str, message: str) -> None:
        self.event_logger.device(code, level, message)

    @staticmethod
    def _now_ts() -> int:
        return int(time.time() * 1000)

    # ═══════════════════════════════════════════════════════════════
    # MQTT 连接管理
    # ═══════════════════════════════════════════════════════════════

    def _on_connect(self, client, userdata, flags, reason_code, properties) -> None:
        self.connected = (reason_code == 0)
        if self.connected:
            self._log(f"MQTT 已连接 broker={client._host}:{client._port}")
            # 订阅下行指令
            client.subscribe("smoke/+/cmd")
            # 订阅所有设备心跳（用于离线检测）
            client.subscribe("smoke/+/heartbeat")
            self._log("已订阅 smoke/+/cmd 和 smoke/+/heartbeat")
            self._stop_reconnect()
        else:
            self._log(f"MQTT 连接失败 reason_code={reason_code}")

    def _on_disconnect(self, client, userdata, flags, reason_code, properties) -> None:
        was_connected = self.connected
        self.connected = False
        if reason_code != 0:
            self._log(f"⚠ MQTT 连接断开 (原因码={reason_code})，仿真数据无法送达后端！")
        else:
            self._log("MQTT 正常断开")
        if was_connected and self.running:
            self._log("🔄 正在自动重连 MQTT...")
            self._start_reconnect()

    def _on_message(self, client, userdata, msg) -> None:
        topic = msg.topic
        try:
            payload = json.loads(msg.payload.decode())
        except (json.JSONDecodeError, UnicodeDecodeError):
            return

        parts = topic.split("/")
        if len(parts) < 3:
            return

        device_code = parts[1]
        subtopic = parts[2]

        if subtopic == "cmd":
            # 下行广播指令
            content = payload.get("content") or payload.get("cmd") or payload.get("message", "")
            self._log(f"收到广播指令 [{device_code}]: {content}")
            self._log_dev(device_code, "info", f"广播指令: {content}")

        elif subtopic == "heartbeat":
            # 监听所有设备心跳
            bat = payload.get("bat")
            rssi = payload.get("rssi")
            self.state_manager.heartbeat_received(device_code, bat=bat, rssi=rssi)

        elif subtopic == "data":
            # 监听数据包（也算存活信号）
            smoke = payload.get("smoke", 0)
            temp = payload.get("temp", 0)
            humi = payload.get("humi", 0)
            bat = payload.get("bat")
            self.state_manager.data_received(device_code, smoke, temp, humi, bat)

    def connect(self, config: SimulatorConfig, timeout: float = 8.0) -> bool:
        if self.connected and self.client is not None:
            return True

        self._last_config = config
        self.disconnect()

        try:
            self.client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION2,
                client_id=config.client_id + "-" + str(random.randint(1000, 9999)),
            )
            if config.username:
                self.client.username_pw_set(config.username, config.password)

            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message

            # 设置遗嘱消息
            self.client.will_set(
                f"smoke/{config.client_id}/status",
                json.dumps({"status": "offline", "ts": self._now_ts()}),
                qos=1,
            )

            self._log(f"正在连接 MQTT: {config.broker}:{config.port}")
            self.client.connect(config.broker, config.port, keepalive=60)
            self.client.loop_start()

            waited = 0.0
            while waited < timeout and not self.connected:
                if self._stop_event.wait(0.2):
                    break
                waited += 0.2

            if not self.connected:
                self._log("MQTT 连接超时")
            return self.connected
        except Exception as exc:
            self._log(f"MQTT 连接异常: {exc}")
            return False

    def disconnect(self) -> None:
        self._stop_reconnect()
        if self.client is None:
            self.connected = False
            return
        try:
            self.client.loop_stop()
            self.client.disconnect()
        except Exception:
            pass
        finally:
            self.client = None
            self.connected = False

    # ── 断线重连 ──

    def _start_reconnect(self) -> None:
        if self._reconnect_running:
            return
        self._reconnect_running = True
        self._reconnect_thread = threading.Thread(target=self._reconnect_loop, daemon=True)
        self._reconnect_thread.start()
        self._log("MQTT 断线重连已启动")

    def _stop_reconnect(self) -> None:
        self._reconnect_running = False
        if self._reconnect_thread and self._reconnect_thread.is_alive():
            self._reconnect_thread.join(timeout=1)
        self._reconnect_thread = None

    def _reconnect_loop(self) -> None:
        delay = 2
        max_delay = 60
        while self._reconnect_running and not self.connected and self._last_config is not None:
            self._log(f"尝试重连 MQTT... ({delay}s 后)")
            time.sleep(delay)
            if not self._reconnect_running:
                break
            if self.connect(self._last_config, timeout=6.0):
                self._log("✅ MQTT 重连成功！仿真数据发送已恢复")
                # 恢复运行中的设备心跳+数据
                self._resume_running_devices()
                break
            delay = min(delay * 2, max_delay)

    def _resume_running_devices(self) -> None:
        """重连后恢复之前正在运行的设备"""
        if self._last_config is None:
            return
        states = self.state_manager.get_all()
        resumed = []
        for code, state in states.items():
            if state.heartbeat_running or state.data_running:
                resumed.append(code)
        if resumed:
            self._log(f"恢复设备运行: {', '.join(resumed)}")

    # ═══════════════════════════════════════════════════════════════
    # 设备离线回调
    # ═══════════════════════════════════════════════════════════════

    def _on_device_offline(self, code: str, name: str) -> None:
        self._log(f"⚠ 设备离线检测: {code} ({name}) - 超过心跳超时阈值")
        self._log_dev(code, "error", f"设备离线! 超时未收到心跳")

    # ═══════════════════════════════════════════════════════════════
    # MQTT 发布
    # ═══════════════════════════════════════════════════════════════

    def publish(self, topic: str, payload: dict) -> bool:
        if not self.client or not self.connected:
            return False
        try:
            payload_text = json.dumps(payload, ensure_ascii=False)
            result = self.client.publish(topic, payload_text, qos=1)
            ok = result.rc == mqtt.MQTT_ERR_SUCCESS
            return ok
        except Exception:
            return False

    # ── Payload 构建 ──

    def _build_data_payload(self, device_code: str, smoke: float, temp: float,
                            humi: float, bat: int) -> dict:
        return {
            "deviceId": device_code,
            "smoke": round(smoke, 4),
            "temp": round(temp, 2),
            "humi": round(humi, 2),
            "bat": bat,
            "ts": self._now_ts(),
        }

    def _build_heartbeat_payload(self, device_code: str, bat: int, rssi: int) -> dict:
        return {
            "deviceId": device_code,
            "bat": bat,
            "rssi": rssi,
            "ts": self._now_ts(),
        }

    def _random_or_fixed(self, config: SimulatorConfig) -> tuple[float, float, float, int, int]:
        if config.use_random:
            return (
                round(random.uniform(0.01, 0.03), 4),
                round(random.uniform(22.0, 28.0), 2),
                round(random.uniform(40.0, 55.0), 2),
                random.randint(85, 100),
                random.randint(-50, -30),
            )
        return (
            round(config.smoke, 4),
            round(config.temp, 2),
            round(config.humi, 2),
            int(config.bat),
            int(config.rssi),
        )

    def _alert_values(self, config: SimulatorConfig) -> tuple[float, float, float, int]:
        if config.use_random:
            return 0.35, 68.0, round(random.uniform(15.0, 25.0), 2), random.randint(85, 100)
        return round(config.smoke, 4), round(config.temp, 2), round(config.humi, 2), int(config.bat)

    # ═══════════════════════════════════════════════════════════════
    # 单次发送
    # ═══════════════════════════════════════════════════════════════

    def send_normal_once(self, device_code: str, config: SimulatorConfig) -> bool:
        smoke, temp, humi, bat, _ = self._random_or_fixed(config)
        ok = self.publish(
            f"smoke/{device_code}/data",
            self._build_data_payload(device_code, smoke, temp, humi, bat),
        )
        if ok:
            self.state_manager.data_received(device_code, smoke, temp, humi, bat)
            self._log_dev(device_code, "ok", f"数据: smoke={smoke:.4f} temp={temp:.1f}°C humi={humi:.1f}% bat={bat}%")
        return ok

    def send_alert_once(self, device_code: str, config: SimulatorConfig) -> bool:
        smoke, temp, humi, bat = self._alert_values(config)
        ok = self.publish(
            f"smoke/{device_code}/data",
            self._build_data_payload(device_code, smoke, temp, humi, bat),
        )
        if ok:
            self.state_manager.data_received(device_code, smoke, temp, humi, bat)
            self._log_dev(device_code, "warn", f"告警: smoke={smoke:.4f} temp={temp:.1f}°C")
        return ok

    def _send_data_with_params(self, device_code: str, smoke: float, temp: float,
                                humi: float, config: SimulatorConfig) -> bool:
        """使用指定参数发送数据（供 _data_loop 调用）"""
        _, _, _, bat, _ = self._random_or_fixed(config)
        ok = self.publish(
            f"smoke/{device_code}/data",
            self._build_data_payload(device_code, smoke, temp, humi, bat),
        )
        if ok:
            self.state_manager.data_received(device_code, smoke, temp, humi, bat)
            is_alarm = smoke >= 0.30
            level = "warn" if is_alarm else "ok"
            label = "⚠火警" if is_alarm else "正常"
            msg = f"📤 [{label}] {device_code}: smoke={smoke:.4f} temp={temp:.1f}°C humi={humi:.1f}% bat={bat}%"
            self._log_dev(device_code, level, msg)
            self._log(msg)  # 同时输出到全局日志
        return ok

    def send_heartbeat_once(self, device_code: str, config: SimulatorConfig) -> bool:
        _, _, _, bat, rssi = self._random_or_fixed(config)
        ok = self.publish(
            f"smoke/{device_code}/heartbeat",
            self._build_heartbeat_payload(device_code, bat, rssi),
        )
        if ok:
            self.state_manager.update_local_status(device_code, True)
            self._log_dev(device_code, "ok", f"心跳: bat={bat}% rssi={rssi}dBm")
        return ok

    # ═══════════════════════════════════════════════════════════════
    # 批量发送
    # ═══════════════════════════════════════════════════════════════

    def batch_send(self, device_codes: list[str], config: SimulatorConfig, alert: bool = False) -> int:
        """批量发送数据，返回成功数"""
        count = 0
        for code in device_codes:
            if alert:
                ok = self.send_alert_once(code, config)
            else:
                ok = self.send_normal_once(code, config)
            if ok:
                count += 1
            time.sleep(0.1)  # 避免 MQTT 拥塞
        self._log(f"批量发送完成: {count}/{len(device_codes)} 台设备")
        return count

    # ═══════════════════════════════════════════════════════════════
    # 模式：正常模式（多设备并发）
    # ═══════════════════════════════════════════════════════════════

    def start_normal(self, device_codes: list[str], config: SimulatorConfig) -> bool:
        self.stop_running()
        self._stop_event.clear()

        if not self.connect(config):
            return False

        self.running = True
        self._last_config = config

        # 注册设备状态
        for code in device_codes:
            self.state_manager.register_device({"device_code": code, "device_name": code})

        # 每设备独立数据线程
        for code in device_codes:
            t = threading.Thread(target=self._data_loop, args=(code, config), daemon=True)
            t.start()
            self._threads.append(t)
            self.state_manager.mark_data_running(code, True)
            self._log_dev(code, "info", "数据上报已启动")

        # 统一心跳线程（轮询所有设备）
        self._heartbeat_timer_thread = threading.Thread(
            target=self._heartbeat_multi_loop, args=(device_codes, config), daemon=True
        )
        self._heartbeat_timer_thread.start()
        for code in device_codes:
            self.state_manager.mark_heartbeat_running(code, True)

        # 启动离线检测
        self.state_manager.start_offline_check()

        self._log(f"正常模式已启动: {len(device_codes)} 台设备")
        return True

    def set_device_params(self, code: str, smoke: float, temp: float, humi: float) -> None:
        """设置设备的独立数据参数（由 GUI 滑块控制）"""
        self._device_params[code] = {"smoke": smoke, "temp": temp, "humi": humi}

    def _data_loop(self, device_code: str, config: SimulatorConfig) -> None:
        """数据发送循环：80% 正常数据（滑块值）+ 20% 告警数据（随机超标值）"""
        fail_count = 0
        import random as _random
        while self.running and not self._stop_event.is_set():
            # 80% 正常 + 20% 告警
            if _random.random() < 0.20:
                # 告警数据：烟雾 0.30~0.60，温度 65~85
                smoke = round(_random.uniform(0.30, 0.60), 4)
                temp = round(_random.uniform(65, 85), 2)
                humi = round(_random.uniform(15, 30), 2)
                self._log_dev(device_code, "warn",
                    f"🔥 告警数据: smoke={smoke:.4f} temp={temp:.1f}°C humi={humi:.1f}%")
            else:
                # 正常数据：使用 GUI 滑块值
                params = self._device_params.get(device_code, {})
                smoke = params.get("smoke", config.smoke)
                temp = params.get("temp", config.temp)
                humi = params.get("humi", config.humi)
            ok = self._send_data_with_params(device_code, smoke, temp, humi, config)
            if not ok:
                fail_count += 1
                if fail_count == 1:
                    self._log_dev(device_code, "warn", "数据发送失败，MQTT 可能已断开")
                elif fail_count % 10 == 0:
                    self._log_dev(device_code, "error", f"数据发送连续失败 {fail_count} 次")
            else:
                if fail_count > 0:
                    self._log_dev(device_code, "ok", f"数据发送已恢复 (之前失败 {fail_count} 次)")
                fail_count = 0
            if self._stop_event.wait(config.normal_interval):
                break

    def _heartbeat_multi_loop(self, device_codes: list[str], config: SimulatorConfig) -> None:
        fail_counts: dict[str, int] = {c: 0 for c in device_codes}
        while self.running and not self._stop_event.is_set():
            for code in device_codes:
                ok = self.send_heartbeat_once(code, config)
                if not ok:
                    fail_counts[code] += 1
                    if fail_counts[code] == 1:
                        self._log_dev(code, "warn", "心跳发送失败，MQTT 可能已断开")
                else:
                    if fail_counts[code] > 0:
                        self._log_dev(code, "ok", f"心跳发送已恢复")
                    fail_counts[code] = 0
            if self._stop_event.wait(config.heartbeat_interval):
                break

    # ═══════════════════════════════════════════════════════════════
    # 独立心跳控制（不影响数据发送）
    # ═══════════════════════════════════════════════════════════════

    def start_heartbeat_only(self, device_codes: list[str], config: SimulatorConfig) -> bool:
        """仅启动心跳，不启动数据发送"""
        if not self.connected:
            if not self.connect(config):
                return False

        self._last_config = config

        for code in device_codes:
            self.state_manager.register_device({"device_code": code, "device_name": code})
            self.state_manager.mark_heartbeat_running(code, True)
            self._log_dev(code, "ok", "心跳已启动（仅心跳模式）")

        # 启动统一心跳线程（如未运行）
        if self._heartbeat_timer_thread is None or not self._heartbeat_timer_thread.is_alive():
            self.running = True
            self._stop_event.clear()
            self._heartbeat_timer_thread = threading.Thread(
                target=self._heartbeat_multi_loop, args=(device_codes, config), daemon=True
            )
            self._heartbeat_timer_thread.start()

        self.state_manager.start_offline_check()
        return True

    def stop_heartbeat_only(self, device_codes: list[str]) -> None:
        """停止指定设备心跳"""
        for code in device_codes:
            self.state_manager.mark_heartbeat_running(code, False)
            self._log_dev(code, "warn", "心跳已停止")
        # 如果所有设备心跳都停了，关闭心跳线程
        all_states = self.state_manager.get_all()
        if not any(s.heartbeat_running for s in all_states.values()):
            if self._heartbeat_timer_thread and self._heartbeat_timer_thread.is_alive():
                self.running = False
                self._stop_event.set()
                self._heartbeat_timer_thread.join(timeout=2)
                self._heartbeat_timer_thread = None

    # ═══════════════════════════════════════════════════════════════
    # 连续发送模式（临时连接，发完即断）
    # ═══════════════════════════════════════════════════════════════

    def start_continuous(self, device_codes: list[str], config: SimulatorConfig, alert: bool = False) -> bool:
        """启动连续发送 — 保持 MQTT 连接持续发送数据"""
        if not self.connected:
            if not self.connect(config):
                return False

        self.running = True
        self._stop_event.clear()
        self._last_config = config

        for code in device_codes:
            self.state_manager.register_device({"device_code": code, "device_name": code})
            self.state_manager.mark_data_running(code, True)

        self._continuous_timer = threading.Thread(
            target=self._continuous_loop, args=(device_codes, config, alert), daemon=True
        )
        self._continuous_timer.start()
        self._log(f"连续发送已启动: {len(device_codes)} 台设备, 间隔={config.normal_interval}s")
        return True

    def _continuous_loop(self, device_codes: list[str], config: SimulatorConfig, alert: bool) -> None:
        while self.running and not self._stop_event.is_set():
            for code in device_codes:
                if alert:
                    self.send_alert_once(code, config)
                else:
                    self.send_normal_once(code, config)
            if self._stop_event.wait(config.normal_interval):
                break

    def stop_continuous(self) -> None:
        for code in self.state_manager.get_all():
            self.state_manager.mark_data_running(code, False)
        self.running = False
        self._stop_event.set()
        if self._continuous_timer and self._continuous_timer.is_alive():
            self._continuous_timer.join(timeout=2)
        self._continuous_timer = None

    # ═══════════════════════════════════════════════════════════════
    # 离线模式
    # ═══════════════════════════════════════════════════════════════

    def start_offline(self, device_code: str, config: SimulatorConfig) -> bool:
        self.stop_running()
        self._stop_event.clear()

        if not self.connect(config):
            return False

        # 先发一次心跳（模拟正常在线），然后断开
        self.send_heartbeat_once(device_code, config)
        self.disconnect()
        self.state_manager.update_local_status(device_code, False)
        self.state_manager.mark_heartbeat_running(device_code, False)
        self.state_manager.mark_data_running(device_code, False)

        self._log(f"设备 {device_code} 模拟离线开始 (倒计时 {config.offline_timeout}s)")
        self._log_dev(device_code, "warn", f"模拟离线! 倒计时 {config.offline_timeout}s")

        self.running = True
        t = threading.Thread(target=self._offline_countdown, args=(device_code, config), daemon=True)
        t.start()
        self._threads.append(t)
        return True

    def _offline_countdown(self, device_code: str, config: SimulatorConfig) -> None:
        remaining = config.offline_timeout
        while self.running and remaining > 0 and not self._stop_event.is_set():
            step = 1 if remaining <= 5 else 5
            if self._stop_event.wait(step):
                return
            remaining -= step
            self._log_dev(device_code, "error", f"离线倒计时: {remaining}s")
        self._log(f"设备 {device_code} 离线模拟结束")
        self.running = False

    # ═══════════════════════════════════════════════════════════════
    # 停止
    # ═══════════════════════════════════════════════════════════════

    def stop_running(self) -> None:
        self.running = False
        self._stop_event.set()
        self._stop_reconnect()

        for t in self._threads:
            if t.is_alive():
                t.join(timeout=1)
        self._threads.clear()

        if self._heartbeat_timer_thread and self._heartbeat_timer_thread.is_alive():
            self._heartbeat_timer_thread.join(timeout=1)
            self._heartbeat_timer_thread = None

        if self._continuous_timer and self._continuous_timer.is_alive():
            self._continuous_timer.join(timeout=1)
            self._continuous_timer = None

        # 清理状态
        for code in self.state_manager.get_all():
            self.state_manager.mark_heartbeat_running(code, False)
            self.state_manager.mark_data_running(code, False)
            self.state_manager.update_local_status(code, False)

        self.state_manager.stop_offline_check()
        self.disconnect()
        self._log("所有模拟已停止")

    # ═══════════════════════════════════════════════════════════════
    # REST API 集成（可选）
    # ═══════════════════════════════════════════════════════════════

    def init_rest(self, base_url: str, username: str = "admin", password: str = "admin123") -> RestClient:
        self.rest_client = RestClient(base_url, username, password, logger=self._log)
        return self.rest_client

    def sync_devices_from_backend(self) -> list[dict] | None:
        """从后端拉取设备列表，同步到本地状态管理器"""
        if self.rest_client is None:
            return None
        devices = self.rest_client.fetch_devices()
        if devices:
            for dev in devices:
                code = dev.get("deviceCode") or dev.get("device_code", "")
                if code:
                    mapped = {
                        "device_code": code,
                        "device_name": dev.get("name") or dev.get("deviceName", code),
                        "building": dev.get("building") or dev.get("locationBuilding", ""),
                        "floor": dev.get("floor") or dev.get("locationFloor", ""),
                        "room": dev.get("room") or dev.get("locationRoom", ""),
                    }
                    self.state_manager.register_device(mapped)
            self._log(f"从后端同步了 {len(devices)} 台设备")
        return devices

    # ═══════════════════════════════════════════════════════════════
    # WebSocket 集成（可选）
    # ═══════════════════════════════════════════════════════════════

    def init_ws(self, base_url: str, ws_path: str = "/ws/alarm", token: str = "") -> WsClient:
        self.ws_client = WsClient(base_url, ws_path, token, logger=self._log)
        return self.ws_client
