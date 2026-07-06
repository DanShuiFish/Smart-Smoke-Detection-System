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
        self.assertGreaterEqual(len(devices), 3)
        self.assertEqual(["SDS-001", "SDS-002", "SDS-003"], [item["device_code"] for item in devices[:3]])

    def test_custom_normal_payload_uses_configured_values(self) -> None:
        core = SmokeSimulatorCore(lambda _: None)
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
        payload = core.build_normal_payload({"device_code": "SDS-001"}, config)

        self.assertEqual(0.18, payload["smoke"])
        self.assertEqual(47.5, payload["temp"])
        self.assertEqual(66.6, payload["humi"])
        self.assertEqual(77, payload["bat"])

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
            self.assertIn(app.selected_device_code_var.get(), codes)
        finally:
            root.destroy()


if __name__ == "__main__":
    unittest.main()
