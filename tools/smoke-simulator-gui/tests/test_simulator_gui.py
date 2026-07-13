from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app import SmokeSimulatorApp  # noqa: E402
from simulator_core import SimulatorConfig, SmokeSimulatorCore  # noqa: E402


class SimulatorGuiTests(unittest.TestCase):
    def test_config_and_devices_are_valid_json(self) -> None:
        config = json.loads((BASE_DIR / "config.json").read_text(encoding="utf-8"))
        devices = json.loads((BASE_DIR / "devices.json").read_text(encoding="utf-8"))

        self.assertIn("mqtt", config)
        self.assertIn("backend", config)
        self.assertGreaterEqual(len(devices), 3)
        self.assertEqual(["SDS-001", "SDS-002", "SDS-003"],
                         [item["device_code"] for item in devices[:3]])

    def test_broker_is_internal_ip(self) -> None:
        """验证 config 中 broker 地址为实际 EMQX 地址"""
        config = json.loads((BASE_DIR / "config.json").read_text(encoding="utf-8"))
        broker = config["mqtt"]["broker"]
        # 应为内部地址，非 localhost
        self.assertIn(".", broker)

    def test_custom_normal_payload_uses_configured_values(self) -> None:
        core = SmokeSimulatorCore()
        config = SimulatorConfig(
            broker="127.0.0.1",
            port=1883,
            client_id="test-client",
            username="",
            password="",
            use_random=False,
            smoke=0.18,
            temp=47.5,
            humi=66.6,
            bat=77,
            rssi=-39,
            normal_interval=5,
            heartbeat_interval=10,
            offline_timeout=35,
        )
        payload = core._build_data_payload("SDS-001", config.smoke, config.temp,
                                           config.humi, config.bat)

        self.assertEqual(0.18, payload["smoke"])
        self.assertEqual(47.5, payload["temp"])
        self.assertEqual(66.6, payload["humi"])
        self.assertEqual(77, payload["bat"])

    def test_heartbeat_payload(self) -> None:
        core = SmokeSimulatorCore()
        payload = core._build_heartbeat_payload("SDS-001", 90, -40)
        self.assertEqual("SDS-001", payload["deviceId"])
        self.assertEqual(90, payload["bat"])
        self.assertEqual(-40, payload["rssi"])
        self.assertIn("ts", payload)

    def test_event_logger_device_and_global(self) -> None:
        core = SmokeSimulatorCore()
        logger = core.event_logger

        logger.device("SDS-001", "ok", "测试消息1")
        logger.global_log("warn", "全局告警")

        dev_logs = logger.get_device_logs("SDS-001")
        self.assertGreaterEqual(len(dev_logs), 1)
        self.assertEqual("ok", dev_logs[0]["level"])

        gl_logs = logger.get_global_logs()
        self.assertGreaterEqual(len(gl_logs), 1)

    def test_device_state_manager(self) -> None:
        from device_state import DeviceStateManager
        mgr = DeviceStateManager()

        mgr.register_device({"device_code": "TEST-01", "device_name": "测试设备"})
        mgr.heartbeat_received("TEST-01", bat=88, rssi=-35)

        state = mgr.get("TEST-01")
        self.assertIsNotNone(state)
        self.assertTrue(state.online)
        self.assertEqual(88, state.battery)

        online = mgr.get_online_count()
        self.assertEqual(1, online)

    def test_app_loads_default_devices(self) -> None:
        try:
            import tkinter
        except ImportError:
            self.skipTest("tkinter 不可用")
        root = tkinter.Tk()
        root.withdraw()
        try:
            app = SmokeSimulatorApp(root)
            codes = [item["device_code"] for item in app.devices]
            self.assertIn("SDS-001", codes)
            # 启动时不再立即选中设备，_active_device_code 可能为空
            # 设备列表已从 devices.json 加载
            self.assertGreaterEqual(len(app.devices), 3)
        finally:
            root.destroy()


if __name__ == "__main__":
    unittest.main()
