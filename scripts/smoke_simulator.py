"""
智慧烟感预警系统 - 烟感设备模拟器 (BE1)
=============================================
功能:
  1. 正常模式: 每5秒发送一次正常环境数据 (烟雾0.02, 温度25°C)
  2. 告警模式: 一键发送超标数据触发整个告警链路
  3. 离线模式: 停止心跳30秒以上模拟设备掉线

依赖: pip install paho-mqtt
MQTT Broker: 默认连接 tcp://192.168.130.101:1883 (EMQX on VMware Ubuntu)

用法:
  python smoke_simulator.py                # 交互式菜单模式
  python smoke_simulator.py --normal       # 直接启动正常模式
  python smoke_simulator.py --alert        # 发送一次告警数据后退出
  python smoke_simulator.py --offline      # 模拟离线: 停发心跳
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
    {"device_id": 1, "device_code": "SDS-001", "building": "1号楼", "floor": "1F", "room": "101室"},
    {"device_id": 2, "device_code": "SDS-002", "building": "1号楼", "floor": "3F", "room": "301室"},
    {"device_id": 3, "device_code": "SDS-003", "building": "2号楼", "floor": "1F", "room": "食堂"},
]

# 模拟参数
NORMAL_INTERVAL = 5        # 正常数据发送间隔 (秒)
HEARTBEAT_INTERVAL = 10    # 心跳发送间隔 (秒)
OFFLINE_TIMEOUT = 35       # 离线判定: 超过此秒数不发心跳

# ====================== 数据生成 ======================

def now_ts():
    """返回当前毫秒级时间戳，匹配 DeviceReportDTO.ts"""
    return int(datetime.now().timestamp() * 1000)


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

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        """连接成功回调"""
        if reason_code == 0:
            self.connected = True
            print(f"[OK] 已成功连接 MQTT Broker: {MQTT_BROKER}:{MQTT_PORT} (reason_code={reason_code})")
        else:
            self.connected = False
            print(f"[FAIL] 连接被拒绝, reason_code={reason_code}")
            print("  可能原因: 1)EMQX未启动 2)认证被拒 3)ClientID冲突")

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        """断开回调"""
        self.connected = False
        print(f"[WARN] MQTT 连接断开, reason_code={reason_code}")

    def _on_publish(self, client, userdata, mid, reason_code, properties):
        """发布确认回调"""
        print(f"  [PUB确认] mid={mid}, rc={reason_code}")

    def _connect(self, timeout=5):
        """阻塞式连接 MQTT Broker，确认连上才返回"""
        try:
            import paho.mqtt.client as mqtt

            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=CLIENT_ID)
            self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect

            print(f"[...] 正在连接 {MQTT_BROKER}:{MQTT_PORT} ...")
            self.client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
            self.client.loop_start()

            # 阻塞等待连接确认
            waited = 0
            while not self.connected and waited < timeout:
                time.sleep(0.5)
                waited += 0.5

            if self.connected:
                return True
            else:
                print(f"[FAIL] 连接超时 ({timeout}秒), 请检查:")
                print(f"  1. Ubuntu虚拟机是否已启动")
                print(f"  2. EMQX容器是否运行: docker ps | grep emqx")
                print(f"  3. 防火墙是否放行1883端口: sudo ufw status")
                print(f"  4. EMQX Dashboard: http://{MQTT_BROKER}:18083")
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
            return
        payload_str = json.dumps(payload_dict, ensure_ascii=False)
        info = self.client.publish(topic, payload_str, qos=1)
        status = "已送达" if info.rc == 0 else f"失败(rc={info.rc})"
        print(f"  [{datetime.now().strftime('%H:%M:%S')}] → {topic} [{status}]")
        print(f"    {payload_str}")

    # ---- 正常模式 ----
    def run_normal(self):
        """持续发送正常数据 + 心跳"""
        if not self._connect():
            return
        self.running = True
        self._start_heartbeat()

        print("\n[RUN] 正常模式启动 — 每5秒发数据, 每10秒发心跳")
        print("  打开 MQTTX 订阅 smoke/# 查看消息")
        print("  或访问 http://192.168.130.101:18083 主题监控")
        print("  按 Ctrl+C 停止...\n")

        try:
            while self.running:
                for dev in DEVICES:
                    topic_data = f"smoke/{dev['device_code']}/data"
                    data = normal_sensor_data(dev)
                    self._publish(topic_data, data)
                time.sleep(NORMAL_INTERVAL)
        except KeyboardInterrupt:
            self.stop()

    # ---- 告警模式 ----
    def send_alert(self, device_code=None, smoke_val=0.35, temp_val=68.0):
        """发送一次告警数据 (一键触发全链路)"""
        if not self._connect():
            return

        target = DEVICES[0]
        if device_code:
            for d in DEVICES:
                if d["device_code"] == device_code:
                    target = d
                    break
            else:
                print(f"[WARN] 未找到设备 {device_code}, 使用默认设备")

        print(f"\n[ALERT!] 向 {target['device_code']} ({target['building']}{target['floor']}{target['room']}) 发送火警告警!")
        print(f"  烟雾: {smoke_val} mg/m³ (阈值 0.1)")
        print(f"  温度: {temp_val}°C (阈值 60°C)\n")

        topic = f"smoke/{target['device_code']}/data"
        data = alert_sensor_data(target, smoke_val, temp_val)
        self._publish(topic, data)

        # 等一小会确保消息发出
        time.sleep(1)
        print("\n[DONE] 告警数据已发出, 预期链路:")
        print("  模拟器 → MQTT → MqttConsumer → AlarmRuleEngine → 告警 → WebSocket推送大屏")
        self._disconnect()

    # ---- 离线模式 ----
    def simulate_offline(self, device_code=None):
        """停止心跳来模拟设备离线"""
        target = DEVICES[0]
        if device_code:
            for d in DEVICES:
                if d["device_code"] == device_code:
                    target = d
                    break

        print(f"\n[OFFLINE] 模拟 {target['device_code']} 离线")
        print(f"  停止发送心跳 {OFFLINE_TIMEOUT} 秒...")
        print(f"  预期: Redis Key 过期 → 键空间通知 → 生成离线告警\n")

        if self._connect():
            topic_hb = f"smoke/{target['device_code']}/heartbeat"
            hb = heartbeat_data(target)
            self._publish(topic_hb, hb)
            time.sleep(1)
            self._disconnect()

        for i in range(OFFLINE_TIMEOUT, 0, -5):
            print(f"  剩余 {i} 秒...")
            time.sleep(5)

        print(f"\n[DONE] 已离线 {OFFLINE_TIMEOUT} 秒, 后端应已触发离线告警")

    # ---- 心跳线程 ----
    def _start_heartbeat(self):
        """后台线程定时发心跳"""
        self.heartbeat_running = True

        def _loop():
            while self.heartbeat_running and self.running:
                for dev in DEVICES:
                    topic = f"smoke/{dev['device_code']}/heartbeat"
                    hb = heartbeat_data(dev)
                    self._publish(topic, hb)
                time.sleep(HEARTBEAT_INTERVAL)

        self.heartbeat_thread = threading.Thread(target=_loop, daemon=True)
        self.heartbeat_thread.start()

    # ---- 停止 ----
    def stop(self):
        print("\n[STOP] 正在停止模拟器...")
        self.running = False
        self.heartbeat_running = False
        self._disconnect()
        print("[STOP] 已停止")

    def _disconnect(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.client = None
            self.connected = False


# ====================== 交互式菜单 ======================

def interactive_menu():
    """命令行交互菜单"""
    sim = SmokeSimulator()

    while True:
        print("\n" + "=" * 50)
        print("  智慧烟感模拟器 - 主菜单 (BE1)")
        print("=" * 50)
        print("  1. 正常模式 — 持续发送正常数据 + 心跳")
        print("  2. 告警模式 — 发送一次火警告警数据")
        print("  3. 离线模式 — 停止心跳, 模拟设备掉线")
        print("  4. 指定设备告警")
        print("  5. 指定设备离线")
        print("  0. 退出")
        print("-" * 50)

        choice = input("  请选择 [0-5]: ").strip()

        if choice == "1":
            sim.run_normal()

        elif choice == "2":
            sim.send_alert()

        elif choice == "3":
            sim.simulate_offline()

        elif choice == "4":
            print(f"  可用设备: {[d['device_code'] for d in DEVICES]}")
            code = input("  输入设备编号: ").strip()
            try:
                smoke_val = float(input("  烟雾浓度 (默认 0.35): ").strip() or "0.35")
                temp_val = float(input("  温度 (默认 68.0): ").strip() or "68.0")
            except ValueError:
                print("  输入无效, 使用默认值")
                smoke_val, temp_val = 0.35, 68.0
            sim.send_alert(code, smoke_val, temp_val)

        elif choice == "5":
            print(f"  可用设备: {[d['device_code'] for d in DEVICES]}")
            code = input("  输入设备编号: ").strip()
            sim.simulate_offline(code)

        elif choice == "0":
            print("  再见!")
            break
        else:
            print("  无效选项, 请重新输入")


# ====================== 入口 ======================

if __name__ == "__main__":
    if len(sys.argv) > 1:
        sim = SmokeSimulator()
        arg = sys.argv[1]
        if arg == "--normal":
            sim.run_normal()
        elif arg == "--alert":
            code = sys.argv[2] if len(sys.argv) > 2 else None
            sim.send_alert(code)
        elif arg == "--offline":
            code = sys.argv[2] if len(sys.argv) > 2 else None
            sim.simulate_offline(code)
        else:
            print(f"未知参数: {arg}")
            print("用法: python smoke_simulator.py [--normal|--alert|--offline] [device_code]")
    else:
        interactive_menu()
