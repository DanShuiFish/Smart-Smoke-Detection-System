"""
智慧烟感预警系统 - 烟感设备模拟器 (BE1)
=============================================
功能:
  1. 正常模式: 每5秒发送一次正常环境数据 (烟雾0.02, 温度25°C)
  2. 告警模式: 一键发送超标数据触发整个告警链路
  3. 离线模式: 停止指定设备心跳，模拟设备掉线
  4. 动态管理设备: 添加/移除/查看设备

依赖: pip install paho-mqtt
MQTT Broker: 默认连接 tcp://192.168.130.101:1883 (EMQX on VMware Ubuntu)

用法:
  python smoke_simulator.py                          # 交互式菜单模式
  python smoke_simulator.py --normal                 # 直接启动正常模式（全设备）
  python smoke_simulator.py --alert SDS-001          # 发送一次告警数据后退出
  python smoke_simulator.py --offline SDS-001        # 模拟指定设备离线
  python smoke_simulator.py --add-device SDS-006 5号楼 2F 仓库  # 添加设备
"""

import json
import os
import time
import random
import sys
import threading
from datetime import datetime

# ====================== 配置区（优先从环境变量读取）======================
MQTT_BROKER = os.getenv("MQTT_BROKER", "192.168.130.101")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
CLIENT_ID = os.getenv("MQTT_CLIENT_ID", "smoke-simulator-python")
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "fasong")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "fasong123")

# 设备列表 (模拟多台烟感) — device_code 按 API 文档规范: SDS-00x
DEVICES = [
    {"device_id": 1, "device_code": "SDS-001", "building": "1栋", "floor": "1F", "room": "入户大厅"},
    {"device_id": 2, "device_code": "SDS-002", "building": "1栋", "floor": "3F", "room": "走廊"},
    {"device_id": 3, "device_code": "SDS-003", "building": "2栋", "floor": "5F", "room": "电梯前室"},
    {"device_id": 4, "device_code": "SDS-004", "building": "3栋", "floor": "B1", "room": "车库C区"},
    {"device_id": 5, "device_code": "SDS-005", "building": "4栋", "floor": "2F", "room": "消防通道"},
]

# 模拟参数
NORMAL_INTERVAL = 5        # 正常数据发送间隔 (秒)
HEARTBEAT_INTERVAL = 10    # 心跳发送间隔 (秒)
OFFLINE_TIMEOUT = 35       # 离线判定: 超过此秒数不发心跳

# 设备运行时状态
_offline_devices = set()     # 当前被标记为离线的设备 code 集合
_paused_devices = set()      # 临时暂停心跳的设备 code 集合
_status_lock = threading.Lock()


def now_ts():
    """返回当前毫秒级时间戳，匹配 DeviceReportDTO.ts"""
    return int(datetime.now().timestamp() * 1000)


# ====================== 工具函数 ======================

def find_device(device_code):
    """根据 device_code 查找设备，返回 dict 或 None"""
    for d in DEVICES:
        if d["device_code"] == device_code:
            return d
    return None


def device_label(d):
    """生成设备可读标签"""
    return f"{d['device_code']} ({d['building']}{d['floor']}{d['room']})"


def list_device_codes():
    return [d["device_code"] for d in DEVICES]


# ====================== 数据生成 ======================

def normal_sensor_data(device):
    """生成正常环境数据，匹配 DeviceReportDTO(deviceId/smoke/temp/humi/bat/ts)"""
    return {
        "deviceId": device["device_code"],
        "smoke": round(random.uniform(0.01, 0.03), 4),
        "temp": round(random.uniform(22.0, 28.0), 2),
        "humi": round(random.uniform(40.0, 55.0), 2),
        "bat": random.randint(85, 100),
        "ts": now_ts(),
    }


def alert_sensor_data(device, smoke_val=0.35, temp_val=68.0):
    """生成告警数据，匹配 DeviceReportDTO"""
    return {
        "deviceId": device["device_code"],
        "smoke": round(smoke_val, 4),
        "temp": round(temp_val, 2),
        "humi": round(random.uniform(15.0, 25.0), 2),
        "bat": random.randint(85, 100),
        "ts": now_ts(),
    }


def heartbeat_data(device):
    """生成心跳报文 — API文档 3.3: deviceId/bat/rssi/ts"""
    return {
        "deviceId": device["device_code"],
        "bat": random.randint(85, 100),
        "rssi": random.randint(-50, -30),
        "ts": now_ts(),
    }


# ====================== MQTT 客户端 ======================

class SmokeSimulator:
    def __init__(self):
        self.client = None
        self.connected = False
        self.running = False
        self.heartbeat_running = False
        self.heartbeat_thread = None
        self._active_devices = None  # None=全部设备, set=指定设备

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            self.connected = True
            print(f"[OK] 已成功连接 MQTT Broker: {MQTT_BROKER}:{MQTT_PORT}")
            self.client.subscribe("smoke/+/cmd")
        else:
            self.connected = False
            print(f"[FAIL] 连接被拒绝, reason_code={reason_code}")

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        self.connected = False
        print(f"[WARN] MQTT 连接断开, reason_code={reason_code}")

    def _on_message(self, client, userdata, msg):
        """MQTT 消息回调 - 接收广播指令"""
        try:
            payload = json.loads(msg.payload.decode())
            device_code = msg.topic.split("/")[1]
            content = payload.get("content", payload.get("cmd", "无内容"))
            print(f"\n[模拟器 {device_code}] 收到广播指令: {content}\n")
        except Exception as e:
            print(f"\n[ERR] 解析广播消息失败: {e}\n")

    def _connect(self, timeout=5):
        """阻塞式连接 MQTT Broker，确认连上才返回"""
        try:
            import paho.mqtt.client as mqtt

            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=CLIENT_ID)
            self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message

            print(f"[...] 正在连接 {MQTT_BROKER}:{MQTT_PORT} ...")
            self.client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
            self.client.loop_start()

            waited = 0
            while not self.connected and waited < timeout:
                time.sleep(0.5)
                waited += 0.5

            if self.connected:
                return True
            else:
                print(f"[FAIL] 连接超时 ({timeout}秒)")
                self._disconnect()
                return False

        except Exception as e:
            print(f"[FAIL] 连接异常: {e}")
            print(f"  提示: pip install paho-mqtt")
            return False

    def _publish(self, topic, payload_dict):
        """发送一条 MQTT 消息"""
        if self.client is None or not self.connected:
            print("[ERR] MQTT 未连接, 无法发送")
            return False
        payload_str = json.dumps(payload_dict, ensure_ascii=False)
        info = self.client.publish(topic, payload_str, qos=1)
        if info.rc == 0:
            print(f"  [{datetime.now().strftime('%H:%M:%S')}] → {topic}")
            return True
        else:
            print(f"  [FAIL] → {topic} rc={info.rc}")
            return False

    def _get_active_devices(self):
        """获取当前应运行的设备列表（排除离线设备）"""
        if self._active_devices:
            return [d for d in DEVICES if d["device_code"] in self._active_devices]
        return list(DEVICES)

    # ==================== 正常模式 ====================

    def run_normal(self, device_codes=None):
        """持续发送正常数据 + 心跳。
        device_codes: 可选，指定只运行哪些设备（None=全部）
        """
        if not self._connect():
            return
        self.running = True
        self._active_devices = set(device_codes) if device_codes else None

        devices = self._get_active_devices()
        print(f"\n[RUN] 正常模式启动 — 每{NORMAL_INTERVAL}秒发数据, 每{HEARTBEAT_INTERVAL}秒发心跳")
        print(f"  设备数: {len(devices)} 台 — {[d['device_code'] for d in devices]}")
        print(f"  按 Ctrl+C 停止...\n")

        self._start_heartbeat()

        try:
            while self.running:
                devices = self._get_active_devices()
                for dev in devices:
                    with _status_lock:
                        if dev["device_code"] in _offline_devices:
                            continue
                    topic_data = f"smoke/{dev['device_code']}/data"
                    data = normal_sensor_data(dev)
                    self._publish(topic_data, data)
                time.sleep(NORMAL_INTERVAL)
        except KeyboardInterrupt:
            self.stop()

    # ==================== 告警模式 ====================

    def send_alert(self, device_code=None, smoke_val=0.35, temp_val=68.0):
        """发送一次告警数据 (一键触发全链路)"""
        if not self._connect():
            return

        target = None
        if device_code:
            target = find_device(device_code)
            if target is None:
                print(f"[WARN] 未找到设备 {device_code}, 使用默认设备")
                target = DEVICES[0]
        else:
            target = DEVICES[0]

        print(f"\n[ALERT!] 向 {device_label(target)} 发送火警告警!")
        print(f"  烟雾: {smoke_val} mg/m³")
        print(f"  温度: {temp_val}°C\n")

        topic = f"smoke/{target['device_code']}/data"
        data = alert_sensor_data(target, smoke_val, temp_val)
        self._publish(topic, data)

        time.sleep(1)
        print("\n[DONE] 告警数据已发出, 预期链路:")
        print("  模拟器 → MQTT → MqttConsumer → AlarmRuleEngine → 告警 → WebSocket推送大屏")
        self._disconnect()

    # ==================== 离线模式 ====================

    def simulate_offline(self, device_code):
        """停止指定设备心跳来模拟离线"""
        target = find_device(device_code)
        if target is None:
            print(f"[ERR] 设备不存在: {device_code}")
            print(f"  可用设备: {list_device_codes()}")
            return

        # 检查是否已经离线
        with _status_lock:
            if device_code in _offline_devices:
                print(f"[WARN] 设备 {device_code} 已处于离线状态，无需重复操作")
                return

        print(f"\n[OFFLINE] 模拟 {device_label(target)} 离线")
        print(f"  停止发送心跳 {OFFLINE_TIMEOUT} 秒...")
        print(f"  预期: Redis Key 过期 → 键空间通知 → 生成离线告警\n")

        # 标记为离线，心跳线程将跳过此设备
        with _status_lock:
            _offline_devices.add(device_code)

        # 如果已连接，先发最后一次心跳（确保 Redis Key 存在）
        if self.connected or self._connect():
            topic_hb = f"smoke/{target['device_code']}/heartbeat"
            hb = heartbeat_data(target)
            self._publish(topic_hb, hb)
            time.sleep(1)
            self._disconnect()

        # 倒计时等待 Redis Key 过期
        for i in range(OFFLINE_TIMEOUT, 0, -5):
            print(f"  [{device_code}] 剩余 {i} 秒...")
            time.sleep(5)

        print(f"\n[DONE] {device_code} 已离线 {OFFLINE_TIMEOUT} 秒, 后端应已触发离线告警")

    # ==================== 心跳线程 ====================

    def _start_heartbeat(self):
        """后台线程定时发心跳（自动跳过离线设备）"""
        if self.heartbeat_thread and self.heartbeat_thread.is_alive():
            return
        self.heartbeat_running = True

        def _loop():
            while self.heartbeat_running and self.running:
                devices = self._get_active_devices()
                for dev in devices:
                    with _status_lock:
                        if dev["device_code"] in _offline_devices:
                            continue
                    topic = f"smoke/{dev['device_code']}/heartbeat"
                    hb = heartbeat_data(dev)
                    self._publish(topic, hb)
                time.sleep(HEARTBEAT_INTERVAL)

        self.heartbeat_thread = threading.Thread(target=_loop, daemon=True)
        self.heartbeat_thread.start()

    # ==================== 停止 ====================

    def stop(self):
        print("\n[STOP] 正在停止模拟器...")
        self.running = False
        self.heartbeat_running = False
        with _status_lock:
            _offline_devices.clear()
        self._disconnect()
        print("[STOP] 已停止")

    def _disconnect(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.client = None
            self.connected = False


# ====================== 设备管理 ======================

def add_device(device_code, building, floor, room):
    """动态添加设备到列表"""
    if find_device(device_code):
        print(f"[WARN] 设备 {device_code} 已存在，跳过")
        return False

    new_id = max(d["device_id"] for d in DEVICES) + 1 if DEVICES else 1
    DEVICES.append({
        "device_id": new_id,
        "device_code": device_code,
        "building": building,
        "floor": floor,
        "room": room,
    })
    print(f"[OK] 已添加设备: {device_label(DEVICES[-1])}")
    print(f"  当前设备总数: {len(DEVICES)}")
    return True


def remove_device(device_code):
    """从列表中移除设备"""
    target = find_device(device_code)
    if target is None:
        print(f"[WARN] 设备不存在: {device_code}")
        return False
    DEVICES.remove(target)
    print(f"[OK] 已移除设备: {device_code}")
    print(f"  当前设备总数: {len(DEVICES)}")
    return True


def show_devices():
    """显示所有设备"""
    print("\n  当前设备列表:")
    print(f"  {'编号':<10} {'楼栋':<8} {'楼层':<6} {'位置'}")
    print(f"  {'-' * 40}")
    for d in DEVICES:
        offline_mark = " [离线]" if d["device_code"] in _offline_devices else ""
        print(f"  {d['device_code']:<10} {d['building']:<8} {d['floor']:<6} {d['room']}{offline_mark}")
    print(f"\n  共 {len(DEVICES)} 台设备")


def add_device_interactive():
    """交互式添加设备"""
    print("\n  === 添加设备 ===")
    show_devices()
    code = input("  设备编号 (如 SDS-006): ").strip().upper()
    if not code:
        print("  已取消")
        return
    building = input("  楼栋 (如 5号楼): ").strip() or "未指定"
    floor = input("  楼层 (如 2F): ").strip() or "未知"
    room = input("  位置 (如 仓库): ").strip() or "未指定"
    add_device(code, building, floor, room)


def remove_device_interactive():
    """交互式移除设备"""
    if len(DEVICES) <= 1:
        print("[WARN] 至少保留一台设备")
        return
    print("\n  === 移除设备 ===")
    show_devices()
    code = input("  输入要移除的设备编号: ").strip().upper()
    if not code:
        print("  已取消")
        return
    remove_device(code)


# ====================== 交互式菜单 ======================

def interactive_menu():
    """命令行交互菜单"""
    sim = SmokeSimulator()

    while True:
        # 显示当前设备状态
        show_devices()

        print("=" * 50)
        print("  功能菜单")
        print("=" * 50)
        print("  1. 正常模式 — 持续发送正常数据 + 心跳（全设备）")
        print("  2. 告警模式 — 发送一次火警告警数据")
        print("  3. 离线模式 — 指定设备停止心跳，模拟掉线")
        print("  4. 指定设备告警 — 自定义烟雾浓度和温度")
        print("  5. 指定设备离线 — 选择一台设备模拟离线")
        print("  6. 添加设备")
        print("  7. 移除设备")
        print("  8. 选择设备正常模式 — 挑选设备持续发送数据")
        print("  9. 选择设备群发告警 — 挑选设备同时发送告警")
        print("  0. 退出")
        print("-" * 50)

        choice = input("  请选择 [0-9]: ").strip()

        if choice == "1":
            sim.run_normal()

        elif choice == "2":
            sim.send_alert()

        elif choice == "3":
            print(f"  可用设备: {list_device_codes()}")
            code = input("  输入设备编号: ").strip().upper()
            if code:
                sim.simulate_offline(code)
            else:
                print("  已取消")

        elif choice == "4":
            print(f"  可用设备: {list_device_codes()}")
            code = input("  输入设备编号: ").strip().upper()
            if not code:
                print("  已取消")
                continue
            try:
                smoke_val = float(input("  烟雾浓度 (默认 0.35): ").strip() or "0.35")
                temp_val = float(input("  温度 (默认 68.0): ").strip() or "68.0")
            except ValueError:
                print("  输入无效, 使用默认值")
                smoke_val, temp_val = 0.35, 68.0
            sim.send_alert(code, smoke_val, temp_val)

        elif choice == "5":
            print(f"  可用设备: {list_device_codes()}")
            code = input("  输入设备编号: ").strip().upper()
            if not code:
                print("  已取消")
                continue
            # 离线前检查状态
            with _status_lock:
                if code in _offline_devices:
                    print(f"  [WARN] {code} 已经处于离线状态")
                    continue
            sim.simulate_offline(code)

        elif choice == "6":
            add_device_interactive()

        elif choice == "7":
            remove_device_interactive()

        elif choice == "8":
            # 选择设备正常模式
            show_devices()
            raw = input("  输入要运行的设备编号 (逗号分隔, 回车=全选): ").strip().upper()
            if not raw:
                print("  已选择全部设备")
                sim.run_normal()
            else:
                codes = [c.strip() for c in raw.split(",") if c.strip()]
                sim.run_normal(codes)

        elif choice == "9":
            # 选择设备群发告警
            show_devices()
            raw = input("  输入要发送告警的设备编号 (逗号分隔): ").strip().upper()
            if not raw:
                print("  已取消")
                continue
            codes = [c.strip() for c in raw.split(",") if c.strip()]
            try:
                smoke_val = float(input("  烟雾浓度 (默认 0.35): ").strip() or "0.35")
                temp_val = float(input("  温度 (默认 68.0): ").strip() or "68.0")
            except ValueError:
                print("  输入无效, 使用默认值")
                smoke_val, temp_val = 0.35, 68.0
            for code in codes:
                print(f"\n  >>> 发送告警: {code}")
                sim.send_alert(code, smoke_val, temp_val)
                time.sleep(0.5)

        elif choice == "0":
            print("  再见!")
            break
        else:
            print("  无效选项, 请重新输入")


# ====================== 入口 ======================

def print_usage():
    print("用法: python smoke_simulator.py [选项]")
    print()
    print("无参数                        交互式菜单模式")
    print("--normal [device_codes]       正常模式 (可选: 指定设备, 逗号分隔)")
    print("--alert [device_code]         发送一次告警")
    print("--offline <device_code>       模拟指定设备离线")
    print("--add-device <code> <楼栋> <楼层> <位置>  动态添加设备")
    print("--remove-device <code>        移除设备")
    print("--list                        列出所有设备")
    print()
    print("示例:")
    print("  python smoke_simulator.py")
    print("  python smoke_simulator.py --normal")
    print("  python smoke_simulator.py --normal SDS-001,SDS-002")
    print("  python smoke_simulator.py --alert SDS-001")
    print("  python smoke_simulator.py --offline SDS-003")
    print("  python smoke_simulator.py --add-device SDS-006 5号楼 2F 仓库")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        sim = SmokeSimulator()
        arg = sys.argv[1]

        if arg == "--normal":
            codes = None
            if len(sys.argv) > 2:
                codes = [c.strip() for c in sys.argv[2].split(",")]
            sim.run_normal(codes)

        elif arg == "--alert":
            code = sys.argv[2] if len(sys.argv) > 2 else None
            sim.send_alert(code)

        elif arg == "--offline":
            if len(sys.argv) < 3:
                print("[ERR] --offline 需要指定设备编号")
                print(f"  可用设备: {list_device_codes()}")
                sys.exit(1)
            sim.simulate_offline(sys.argv[2])

        elif arg == "--add-device":
            if len(sys.argv) < 6:
                print("[ERR] --add-device 需要: <编号> <楼栋> <楼层> <位置>")
                sys.exit(1)
            add_device(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])

        elif arg == "--remove-device":
            if len(sys.argv) < 3:
                print("[ERR] --remove-device 需要指定设备编号")
                sys.exit(1)
            remove_device(sys.argv[2])

        elif arg == "--list":
            show_devices()

        elif arg in ("--help", "-h"):
            print_usage()

        else:
            print(f"未知参数: {arg}")
            print_usage()
    else:
        interactive_menu()
