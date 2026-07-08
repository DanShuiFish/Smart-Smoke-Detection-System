from __future__ import annotations

import json
import random
import threading
from dataclasses import dataclass
from datetime import datetime
from typing import Callable

import paho.mqtt.client as mqtt


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
    def __init__(self, logger: LogFn) -> None:
        self.logger = logger
        self.client: mqtt.Client | None = None
        self.connected = False
        self.running = False
        self.worker_thread: threading.Thread | None = None
        self.heartbeat_thread: threading.Thread | None = None
        self.stop_event = threading.Event()

    def _log(self, message: str) -> None:
        now = datetime.now().strftime("%H:%M:%S")
        self.logger(f"[{now}] {message}")

    @staticmethod
    def _now_ts() -> int:
        return int(datetime.now().timestamp() * 1000)

    def _on_connect(self, client, userdata, flags, reason_code, properties) -> None:
        self.connected = reason_code == 0
        if self.connected:
            self._log(f"MQTT 已连接，broker={client._host}:{client._port}")
            client.subscribe("smoke/+/cmd")
        else:
            self._log(f"MQTT 连接失败，reason_code={reason_code}")

    def _on_disconnect(self, client, userdata, flags, reason_code, properties) -> None:
        self.connected = False
        self._log(f"MQTT 已断开，reason_code={reason_code}")

    def _on_message(self, client, userdata, msg) -> None:
        """MQTT message callback - receive broadcast commands"""
        try:
            payload = json.loads(msg.payload.decode())
            device_code = msg.topic.split("/")[1]
            content = payload.get("content", payload.get("cmd", "无内容"))
            self._log(f"收到广播指令 [{device_code}]: {content}")
        except Exception as e:
            self._log(f"解析广播消息失败: {e}")

    def connect(self, config: SimulatorConfig, timeout: float = 5.0) -> bool:
        if self.connected and self.client is not None:
            return True

        self.disconnect()
        try:
            self.client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION2,
                client_id=config.client_id,
            )
            if config.username:
                self.client.username_pw_set(config.username, config.password)

            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message

            self._log(f"正在连接 MQTT：{config.broker}:{config.port}")
            self.client.connect(config.broker, config.port, keepalive=60)
            self.client.loop_start()

            waited = 0.0
            while waited < timeout and not self.connected:
                if self.stop_event.wait(0.2):
                    break
                waited += 0.2

            if not self.connected:
                self._log("MQTT 连接超时")
            return self.connected
        except Exception as exc:
            self._log(f"连接异常：{exc}")
            return False

    def disconnect(self) -> None:
        if self.client is None:
            self.connected = False
            return

        try:
            self.client.loop_stop()
            self.client.disconnect()
        except Exception as exc:
            self._log(f"断开连接时发生异常：{exc}")
        finally:
            self.client = None
            self.connected = False

    def publish(self, topic: str, payload: dict) -> bool:
        if not self.client or not self.connected:
            self._log("MQTT 未连接，无法发送消息")
            return False

        try:
            payload_text = json.dumps(payload, ensure_ascii=False)
            result = self.client.publish(topic, payload_text, qos=1)
            ok = result.rc == 0
            if ok:
                self._log(f"已发送到 {topic}")
            else:
                self._log(f"发送失败，topic={topic}，rc={result.rc}")
            self._log(payload_text)
            return ok
        except Exception as exc:
            self._log(f"发送异常：{exc}")
            return False

    def build_normal_payload(self, device: dict, config: SimulatorConfig) -> dict:
        if config.use_random:
            smoke = round(random.uniform(0.01, 0.03), 4)
            temp = round(random.uniform(22.0, 28.0), 2)
            humi = round(random.uniform(40.0, 55.0), 2)
            bat = random.randint(85, 100)
        else:
            smoke = round(config.smoke, 4)
            temp = round(config.temp, 2)
            humi = round(config.humi, 2)
            bat = int(config.bat)

        return {
            "deviceId": device["device_code"],
            "smoke": smoke,
            "temp": temp,
            "humi": humi,
            "bat": bat,
            "ts": self._now_ts(),
        }

    def build_alert_payload(self, device: dict, config: SimulatorConfig) -> dict:
        if config.use_random:
            smoke = 0.35
            temp = 68.0
            humi = round(random.uniform(15.0, 25.0), 2)
            bat = random.randint(85, 100)
        else:
            smoke = round(config.smoke, 4)
            temp = round(config.temp, 2)
            humi = round(config.humi, 2)
            bat = int(config.bat)

        return {
            "deviceId": device["device_code"],
            "smoke": smoke,
            "temp": temp,
            "humi": humi,
            "bat": bat,
            "ts": self._now_ts(),
        }

    def build_heartbeat_payload(self, device: dict, config: SimulatorConfig) -> dict:
        bat = random.randint(85, 100) if config.use_random else int(config.bat)
        rssi = random.randint(-50, -30) if config.use_random else int(config.rssi)
        return {
            "deviceId": device["device_code"],
            "bat": bat,
            "rssi": rssi,
            "ts": self._now_ts(),
        }

    def send_normal_once(self, device: dict, config: SimulatorConfig) -> bool:
        return self.publish(
            f"smoke/{device['device_code']}/data",
            self.build_normal_payload(device, config),
        )

    def send_alert_once(self, device: dict, config: SimulatorConfig) -> bool:
        return self.publish(
            f"smoke/{device['device_code']}/data",
            self.build_alert_payload(device, config),
        )

    def _heartbeat_loop(self, device: dict, config: SimulatorConfig) -> None:
        while self.running and not self.stop_event.is_set():
            self.publish(
                f"smoke/{device['device_code']}/heartbeat",
                self.build_heartbeat_payload(device, config),
            )
            if self.stop_event.wait(config.heartbeat_interval):
                break

    def _normal_loop(self, device: dict, config: SimulatorConfig) -> None:
        while self.running and not self.stop_event.is_set():
            self.send_normal_once(device, config)
            if self.stop_event.wait(config.normal_interval):
                break

    def _offline_loop(self, device: dict, config: SimulatorConfig) -> None:
        self._log(f"设备 {device['device_code']} 开始模拟离线")
        remaining = config.offline_timeout
        while self.running and remaining > 0 and not self.stop_event.is_set():
            self._log(f"离线倒计时：{remaining} 秒")
            step = 1 if remaining < 5 else 5
            if self.stop_event.wait(step):
                return
            remaining -= step

        self._log(f"设备 {device['device_code']} 离线模拟结束")
        self.running = False

    def start_normal(self, device: dict, config: SimulatorConfig) -> bool:
        """单设备正常模式（保留兼容）"""
        return self._start_normal_devices([device], config)

    def start_multi_normal(self, devices: list[dict], config: SimulatorConfig) -> bool:
        """多设备正常模式 — 每个设备独立线程并发发送"""
        return self._start_normal_devices(devices, config)

    def _start_normal_devices(self, devices: list[dict], config: SimulatorConfig) -> bool:
        self.stop_running()
        self.stop_event.clear()
        if not self.connect(config):
            return False

        self.running = True
        # 每台设备独立的数据发送线程
        for device in devices:
            t = threading.Thread(
                target=self._normal_loop,
                args=(device, config),
                daemon=True,
            )
            t.start()
            self._log(f"正常模式线程已启动，设备={device['device_code']}")

        # 单心跳线程负责所有设备
        self.heartbeat_thread = threading.Thread(
            target=self._heartbeat_multi_loop,
            args=(devices, config),
            daemon=True,
        )
        self.heartbeat_thread.start()
        self._log(f"多设备正常模式已启动，共 {len(devices)} 台")
        return True

    def _heartbeat_multi_loop(self, devices: list[dict], config: SimulatorConfig) -> None:
        """多设备心跳循环"""
        while self.running and not self.stop_event.is_set():
            for device in devices:
                self.publish(
                    f"smoke/{device['device_code']}/heartbeat",
                    self.build_heartbeat_payload(device, config),
                )
            if self.stop_event.wait(config.heartbeat_interval):
                break

    def start_offline(self, device: dict, config: SimulatorConfig) -> bool:
        self.stop_running()
        self.stop_event.clear()
        if not self.connect(config):
            return False

        self.publish(
            f"smoke/{device['device_code']}/heartbeat",
            self.build_heartbeat_payload(device, config),
        )
        self.disconnect()

        self.running = True
        self.worker_thread = threading.Thread(
            target=self._offline_loop,
            args=(device, config),
            daemon=True,
        )
        self.worker_thread.start()
        return True

    def stop_running(self) -> None:
        self.running = False
        self.stop_event.set()

        if self.worker_thread and self.worker_thread.is_alive():
            self.worker_thread.join(timeout=1.0)
        if self.heartbeat_thread and self.heartbeat_thread.is_alive():
            self.heartbeat_thread.join(timeout=1.0)

        self.worker_thread = None
        self.heartbeat_thread = None
        self.disconnect()
        self._log("模拟已停止")
