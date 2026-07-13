"""无 GUI 冒烟测试 — 验证 MQTT 心跳/数据全链路 + 离线检测"""
from __future__ import annotations

import json
import sys
import time
import io
from pathlib import Path

# Fix Windows GBK encoding for emoji output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from simulator_core import SimulatorConfig, SmokeSimulatorCore


def load_config() -> SimulatorConfig:
    cfg = json.loads((BASE_DIR / "config.json").read_text(encoding="utf-8"))
    mqtt = cfg["mqtt"]
    defaults = cfg["defaults"]
    return SimulatorConfig(
        broker=mqtt["broker"],
        port=mqtt["port"],
        client_id="smoke-test-" + str(int(time.time())),
        username=mqtt["username"],
        password=mqtt["password"],
        use_random=False,
        smoke=0.35,
        temp=68.0,
        humi=20.0,
        bat=95,
        rssi=-40,
        normal_interval=3,
        heartbeat_interval=5,
        offline_timeout=15,
    )


def test_mqtt_connect(core: SmokeSimulatorCore, config: SimulatorConfig) -> bool:
    print("[TEST 1] MQTT 连接...", end=" ")
    ok = core.connect(config, timeout=8)
    print("✅ 成功" if ok else "❌ 失败")
    return ok


def test_heartbeat(core: SmokeSimulatorCore, config: SimulatorConfig) -> bool:
    print("[TEST 2] 发送心跳...", end=" ")
    ok = core.send_heartbeat_once("SMOKE-TEST-01", config)
    print("✅ 成功" if ok else "❌ 失败")
    return ok


def test_data_report(core: SmokeSimulatorCore, config: SimulatorConfig) -> bool:
    print("[TEST 3] 发送传感器数据...", end=" ")
    ok = core.send_normal_once("SMOKE-TEST-01", config)
    print("✅ 成功" if ok else "❌ 失败")
    return ok


def test_alert_report(core: SmokeSimulatorCore, config: SimulatorConfig) -> bool:
    print("[TEST 4] 发送火警告警...", end=" ")
    config.smoke = 0.45
    config.temp = 72.0
    ok = core.send_alert_once("SMOKE-TEST-01", config)
    print("✅ 成功" if ok else "❌ 失败")
    return ok


def test_batch(core: SmokeSimulatorCore, config: SimulatorConfig) -> bool:
    print("[TEST 5] 批量发送 (3台)...", end=" ")
    codes = ["SMOKE-TEST-01", "SMOKE-TEST-02", "SMOKE-TEST-03"]
    count = core.batch_send(codes, config, alert=True)
    ok = count == len(codes)
    print(f"✅ {count}/{len(codes)} 台" if ok else f"❌ 仅 {count}/{len(codes)}")
    return ok


def test_offline_detection(core: SmokeSimulatorCore) -> bool:
    print("[TEST 6] 离线检测...", end=" ")
    core.state_manager.register_device({"device_code": "SMOKE-TEST-01", "device_name": "测试设备"})
    core.state_manager.heartbeat_received("SMOKE-TEST-01", bat=90, rssi=-40)
    state = core.state_manager.get("SMOKE-TEST-01")
    if state is None or not state.online:
        print("❌ 状态未注册")
        return False

    # 模拟超时
    state.last_heartbeat_ts = time.time() - 100
    import time as _time
    now = _time.time()
    went_offline = state.check_offline(now)
    ok = went_offline and not state.online
    print("✅ 离线已检测" if ok else "❌ 离线检测失败")
    return ok


def test_event_logger(core: SmokeSimulatorCore) -> bool:
    print("[TEST 7] 事件日志...", end=" ")
    logger = core.event_logger
    logger.device("SMOKE-TEST-01", "ok", "测试消息")
    logger.global_log("warn", "全局警告")
    dev_logs = logger.get_device_logs("SMOKE-TEST-01")
    gl_logs = logger.get_global_logs()
    ok = len(dev_logs) >= 1 and len(gl_logs) >= 1
    print("✅ 正常" if ok else "❌ 失败")
    return ok


def main() -> int:
    config = load_config()
    core = SmokeSimulatorCore()

    results = []
    tests = [
        ("MQTT连接", lambda: test_mqtt_connect(core, config)),
        ("心跳上报", lambda: test_heartbeat(core, config)),
        ("数据上报", lambda: test_data_report(core, config)),
        ("告警上报", lambda: test_alert_report(core, config)),
        ("批量发送", lambda: test_batch(core, config)),
        ("离线检测", lambda: test_offline_detection(core)),
        ("事件日志", lambda: test_event_logger(core)),
    ]

    print("=" * 50)
    print("  智慧烟感模拟器 — 冒烟测试")
    print(f"  MQTT Broker: {config.broker}:{config.port}")
    print("=" * 50)

    passed = 0
    for name, fn in tests:
        try:
            ok = fn()
            results.append((name, ok))
            if ok:
                passed += 1
        except Exception as e:
            results.append((name, False))
            print(f"  [{name}] ❌ 异常: {e}")

    core.disconnect()

    print("=" * 50)
    print(f"  结果: {passed}/{len(tests)} 通过")
    for name, ok in results:
        print(f"  {'✅' if ok else '❌'} {name}")
    print("=" * 50)
    return 0 if passed == len(tests) else 1


if __name__ == "__main__":
    sys.exit(main())
