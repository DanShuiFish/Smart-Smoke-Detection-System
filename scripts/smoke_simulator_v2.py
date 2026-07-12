"""
智慧烟感预警系统 — 烟感设备模拟器 v2.0
=============================================
功能:
  1. 从数据库读取设备列表和状态（通过后端 REST API）
  2. 每台设备独立线程控制（心跳 + 数据发送）
  3. ONLINE 设备自动启动心跳，OFFLINE 设备等待管理员手动启动
  4. 所有状态变更实时通过 API 写入数据库
  5. 内嵌 Web 控制台（端口 9090），提供设备独立监控界面

依赖: pip install paho-mqtt requests
MQTT Broker: 默认连接 tcp://192.168.130.101:1883 (EMQX)

用法:
  python smoke_simulator_v2.py                          # 交互式菜单 + Web 控制台
  python smoke_simulator_v2.py --no-web                 # 仅交互式菜单
  python smoke_simulator_v2.py --web-port 9090          # 指定 Web 控制台端口
"""

import json
import os
import sys
import time
import random
import threading
import http.server
import socketserver
from datetime import datetime
from urllib.parse import urlparse, parse_qs

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("[ERR] 请先安装 paho-mqtt: pip install paho-mqtt")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("[ERR] 请先安装 requests: pip install requests")
    sys.exit(1)

# ====================== 配置区 ======================
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8080")
MQTT_BROKER = os.getenv("MQTT_BROKER", "10.100.42.60")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME", "fasong")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "fasong123")
SIMULATOR_USERNAME = os.getenv("SIMULATOR_USERNAME", "admin")
SIMULATOR_PASSWORD = os.getenv("SIMULATOR_PASSWORD", "admin123")
WEB_PORT = int(os.getenv("WEB_PORT", "9090"))

NORMAL_INTERVAL = 5         # 正常数据发送间隔 (秒)
HEARTBEAT_INTERVAL = 10     # 心跳发送间隔 (秒)
DB_POLL_INTERVAL = 15       # 数据库轮询间隔 (秒)

# ====================== 工具函数 ======================
def now_ts():
    return int(datetime.now().timestamp() * 1000)

def now_str():
    return datetime.now().strftime("%H:%M:%S")


# ====================== HTTP API 客户端 ======================
class ApiClient:
    """与后端 REST API 交互"""

    def __init__(self, base_url, username, password):
        self.base_url = base_url.rstrip("/")
        self.token = None
        self.username = username
        self.password = password

    def _headers(self):
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = "Bearer " + self.token
        return h

    def login(self):
        """登录获取 token"""
        try:
            resp = requests.post(
                f"{self.base_url}/api/v1/auth/login",
                json={"username": self.username, "password": self.password},
                headers={"Content-Type": "application/json"},
                timeout=5
            )
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == 200 and data.get("data"):
                    self.token = data["data"].get("token") or data["data"].get("tokenValue") or data["data"].get("satoken")
                    if self.token:
                        print(f"[OK] 已登录后端 (用户: {self.username})")
                        return True
            print(f"[WARN] 登录失败: {resp.status_code} {resp.text[:100]}")
            return False
        except Exception as e:
            print(f"[WARN] 登录异常: {e}")
            return False

    def get(self, path):
        try:
            resp = requests.get(f"{self.base_url}{path}", headers=self._headers(), timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == 200:
                    return data.get("data")
            return None
        except Exception:
            return None

    def put(self, path, body):
        try:
            resp = requests.put(f"{self.base_url}{path}", json=body, headers=self._headers(), timeout=10)
            return resp.status_code == 200
        except Exception:
            return False

    def post(self, path, body):
        try:
            resp = requests.post(f"{self.base_url}{path}", json=body, headers=self._headers(), timeout=10)
            return resp.status_code == 200
        except Exception:
            return False

    def fetch_devices(self):
        """从数据库获取所有设备列表（通过 SimulationController 的 status 接口）"""
        data = self.get("/simulation/status")
        if data and isinstance(data, list):
            return data
        return []

    def fetch_device_detail(self, device_db_id):
        """获取单个设备详情"""
        return self.get(f"/api/v1/devices/{device_db_id}")

    def update_device_status(self, device_db_id, status):
        """更新设备状态到数据库"""
        return self.put(f"/api/v1/devices/{device_db_id}", {"status": status})

    def fetch_thresholds(self, device_db_id=None):
        """获取阈值配置"""
        path = "/api/v1/thresholds"
        if device_db_id:
            path += f"?deviceId={device_db_id}"
        return self.get(path) or []


# ====================== 单设备模拟器 ======================
class DeviceWorker:
    """每台设备独立的模拟器实例"""

    def __init__(self, device_info, mqtt_client, api_client):
        self.device_code = device_info.get("deviceId") or device_info.get("device_code", "")
        self.device_name = device_info.get("deviceName") or device_info.get("device_name", self.device_code)
        self.device_db_id = device_info.get("id")
        self.building = device_info.get("locationBuilding") or device_info.get("building", "")
        self.floor = device_info.get("locationFloor") or device_info.get("floor", "")
        self.room = device_info.get("locationRoom") or device_info.get("room", "")
        self.status = (device_info.get("status") or "OFFLINE").upper()
        self.battery = device_info.get("battery") or 100
        self.heartbeat_timeout = device_info.get("heartbeatTimeout") or 30

        self.mqtt = mqtt_client
        self.api = api_client

        # 独立线程控制
        self._heartbeat_running = False
        self._heartbeat_thread = None
        self._data_running = False
        self._data_thread = None
        self._lock = threading.Lock()

        # 最新读数
        self.latest_smoke = 0.0
        self.latest_temp = 0.0
        self.latest_humi = 0.0
        self.latest_battery = self.battery

    def start_heartbeat(self):
        """启动心跳线程"""
        with self._lock:
            if self._heartbeat_running:
                return False
            self._heartbeat_running = True
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()
        # 更新数据库状态为 ONLINE
        if self.device_db_id:
            self.api.update_device_status(self.device_db_id, "ONLINE")
        self.status = "ONLINE"
        print(f"  [{now_str()}] ♥ {self.device_code} 心跳已启动")
        return True

    def stop_heartbeat(self):
        """停止心跳线程"""
        with self._lock:
            if not self._heartbeat_running:
                return False
            self._heartbeat_running = False
        if self._heartbeat_thread:
            self._heartbeat_thread.join(timeout=2)
        # 更新数据库状态为 OFFLINE
        if self.device_db_id:
            self.api.update_device_status(self.device_db_id, "OFFLINE")
        self.status = "OFFLINE"
        print(f"  [{now_str()}] ♥ {self.device_code} 心跳已停止 (设备标记为 OFFLINE)")
        return True

    def start_data(self):
        """启动数据发送线程"""
        with self._lock:
            if self._data_running:
                return False
            self._data_running = True
        self._data_thread = threading.Thread(target=self._data_loop, daemon=True)
        self._data_thread.start()
        print(f"  [{now_str()}] 📡 {self.device_code} 数据上报已启动")
        return True

    def stop_data(self):
        """停止数据发送线程"""
        with self._lock:
            if not self._data_running:
                return False
            self._data_running = False
        if self._data_thread:
            self._data_thread.join(timeout=2)
        print(f"  [{now_str()}] 📡 {self.device_code} 数据上报已停止")
        return True

    def send_alert(self, smoke_val=0.35, temp_val=68.0):
        """发送一次告警数据"""
        data = {
            "deviceId": self.device_code,
            "smoke": round(smoke_val, 4),
            "temp": round(temp_val, 2),
            "humi": round(random.uniform(15.0, 25.0), 2),
            "bat": self.latest_battery,
            "ts": now_ts(),
        }
        self._publish(f"smoke/{self.device_code}/data", data)
        self.latest_smoke = smoke_val
        self.latest_temp = temp_val
        print(f"  [{now_str()}] 🚨 {self.device_code} 告警数据已发送: smoke={smoke_val}, temp={temp_val}")

    def _heartbeat_loop(self):
        """心跳发送循环"""
        while self._heartbeat_running:
            hb = {
                "deviceId": self.device_code,
                "bat": self.latest_battery,
                "rssi": random.randint(-55, -30),
                "ts": now_ts(),
            }
            self._publish(f"smoke/{self.device_code}/heartbeat", hb)
            time.sleep(HEARTBEAT_INTERVAL)

    def _data_loop(self):
        """正常数据发送循环"""
        while self._data_running:
            smoke = round(random.uniform(0.01, 0.03), 4)
            temp = round(random.uniform(22.0, 28.0), 2)
            humi = round(random.uniform(40.0, 55.0), 2)
            bat = max(1, self.latest_battery - random.randint(0, 1))

            data = {
                "deviceId": self.device_code,
                "smoke": smoke,
                "temp": temp,
                "humi": humi,
                "bat": bat,
                "ts": now_ts(),
            }
            self._publish(f"smoke/{self.device_code}/data", data)
            self.latest_smoke = smoke
            self.latest_temp = temp
            self.latest_humi = humi
            self.latest_battery = bat
            time.sleep(NORMAL_INTERVAL)

    def _publish(self, topic, payload_dict):
        """发送 MQTT 消息"""
        if self.mqtt and self.mqtt.connected:
            try:
                payload_str = json.dumps(payload_dict, ensure_ascii=False)
                self.mqtt.publish(topic, payload_str, qos=1)
            except Exception as e:
                pass  # 静默处理

    def is_heartbeat_running(self):
        return self._heartbeat_running

    def is_data_running(self):
        return self._data_running

    def to_dict(self):
        return {
            "deviceCode": self.device_code,
            "deviceName": self.device_name,
            "dbId": self.device_db_id,
            "building": self.building,
            "floor": self.floor,
            "room": self.room,
            "status": self.status,
            "heartbeatRunning": self._heartbeat_running,
            "dataRunning": self._data_running,
            "latestSmoke": self.latest_smoke,
            "latestTemp": self.latest_temp,
            "latestHumi": self.latest_humi,
            "latestBattery": self.latest_battery,
        }


# ====================== 模拟器主控制器 ======================
class SimulatorController:
    """管理所有设备模拟器实例"""

    def __init__(self, api_client):
        self.api = api_client
        self.workers = {}       # device_code -> DeviceWorker
        self.mqtt_client = None
        self.mqtt_connected = False
        self._lock = threading.Lock()
        self._poll_thread = None
        self._poll_running = False

    def connect_mqtt(self):
        """连接 MQTT Broker"""
        try:
            client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="smoke-simulator-v2")
            client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
            client.on_connect = self._on_mqtt_connect
            client.on_disconnect = self._on_mqtt_disconnect
            client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
            client.loop_start()
            # 等待连接
            waited = 0
            while not self.mqtt_connected and waited < 5:
                time.sleep(0.5)
                waited += 0.5
            if self.mqtt_connected:
                self.mqtt_client = client
                print(f"[OK] MQTT 已连接: {MQTT_BROKER}:{MQTT_PORT}")
                return True
            else:
                print(f"[WARN] MQTT 连接超时")
                client.loop_stop()
                return False
        except Exception as e:
            print(f"[ERR] MQTT 连接异常: {e}")
            return False

    def _on_mqtt_connect(self, client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            self.mqtt_connected = True
        else:
            self.mqtt_connected = False
            print(f"[WARN] MQTT 连接被拒绝: reason_code={reason_code}")

    def _on_mqtt_disconnect(self, client, userdata, flags, reason_code, properties):
        self.mqtt_connected = False
        print(f"[WARN] MQTT 断开连接")

    def load_devices_from_db(self):
        """从数据库加载所有设备，为每台设备创建 Worker"""
        print("\n[...] 正在从数据库加载设备列表...")
        devices = self.api.fetch_devices()
        if not devices:
            print("[WARN] 未获取到设备列表，请检查后端是否启动")
            return 0

        with self._lock:
            for dev in devices:
                code = dev.get("deviceId") or dev.get("device_code", "")
                if not code:
                    continue
                if code in self.workers:
                    # 已存在：更新状态
                    existing = self.workers[code]
                    existing.device_name = dev.get("deviceName") or dev.get("device_name", code)
                    existing.building = dev.get("locationBuilding") or dev.get("building", "")
                    existing.floor = dev.get("locationFloor") or dev.get("floor", "")
                    existing.room = dev.get("locationRoom") or dev.get("room", "")
                    existing.device_db_id = dev.get("id")
                else:
                    worker = DeviceWorker(dev, self.mqtt_client, self.api)
                    self.workers[code] = worker

            # 自动启动 ONLINE 设备的心跳
            online_count = 0
            for code, w in self.workers.items():
                db_dev = next((d for d in devices if (d.get("deviceCode") or d.get("device_code", "")) == code), None)
                if db_dev and (db_dev.get("status") or "").upper() == "ONLINE":
                    if not w.is_heartbeat_running():
                        w.start_heartbeat()
                        w.start_data()
                        online_count += 1

            total = len(self.workers)
            print(f"[OK] 已加载 {total} 台设备，其中 {online_count} 台自动上线")
            return total

    def start_polling(self):
        """启动数据库轮询（定期检查新增/删除设备）"""
        self._poll_running = True
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()

    def _poll_loop(self):
        while self._poll_running:
            time.sleep(DB_POLL_INTERVAL)
            try:
                self.load_devices_from_db()
            except Exception as e:
                print(f"[WARN] 轮询失败: {e}")

    def start_device_heartbeat(self, device_code):
        """管理员手动启动设备心跳"""
        with self._lock:
            w = self.workers.get(device_code)
        if w:
            if w.start_heartbeat():
                w.start_data()
                return True
        return False

    def stop_device_heartbeat(self, device_code):
        """管理员手动停止设备心跳"""
        with self._lock:
            w = self.workers.get(device_code)
        if w:
            w.stop_data()
            return w.stop_heartbeat()
        return False

    def send_device_alert(self, device_code, smoke_val=0.35, temp_val=68.0):
        """发送告警数据"""
        with self._lock:
            w = self.workers.get(device_code)
        if w:
            w.send_alert(smoke_val, temp_val)
            return True
        return False

    def get_all_status(self):
        """获取所有设备状态（供 Web 控制台使用）"""
        result = []
        with self._lock:
            for code, w in self.workers.items():
                result.append(w.to_dict())
        return result

    def get_device_status(self, device_code):
        """获取单设备状态"""
        with self._lock:
            w = self.workers.get(device_code)
        return w.to_dict() if w else None

    def start_all(self):
        """启动所有设备心跳"""
        count = 0
        with self._lock:
            for code, w in self.workers.items():
                if not w.is_heartbeat_running():
                    if w.start_heartbeat():
                        w.start_data()
                        count += 1
        return count

    def stop_all(self):
        """停止所有设备心跳"""
        count = 0
        with self._lock:
            for code, w in self.workers.items():
                if w.is_heartbeat_running():
                    w.stop_data()
                    if w.stop_heartbeat():
                        count += 1
        return count

    def shutdown(self):
        """关闭所有设备和连接"""
        print("\n[STOP] 正在关闭所有设备...")
        self._poll_running = False
        self.stop_all()
        if self.mqtt_client:
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()
            self.mqtt_client = None
        print("[STOP] 模拟器已关闭")


# ====================== Web 控制台 ======================
WEB_HTML = r"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>烟感模拟器控制台</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height:100vh; }
.header { background: #1e293b; padding: 16px 24px; display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #334155; }
.header h1 { font-size: 18px; color: #38bdf8; }
.header .actions { display:flex; gap:8px; }
.btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; transition: all .15s; }
.btn-start { background: #22c55e; color: #fff; }
.btn-start:hover { background: #16a34a; }
.btn-stop { background: #ef4444; color: #fff; }
.btn-stop:hover { background: #dc2626; }
.btn-alert { background: #f59e0b; color: #fff; }
.btn-alert:hover { background: #d97706; }
.container { max-width: 1400px; margin: 0 auto; padding: 24px; }
.device-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.device-card { background: #1e293b; border-radius: 10px; padding: 16px; border: 1px solid #334155; transition: border-color .2s; }
.device-card:hover { border-color: #475569; }
.device-card.online { border-left: 3px solid #22c55e; }
.device-card.offline { border-left: 3px solid #f59e0b; }
.device-card.error { border-left: 3px solid #ef4444; }
.device-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.device-name { font-size: 14px; font-weight: 700; }
.device-code { font-size: 10px; color: #94a3b8; }
.status-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.status-badge.online { background: #22c55e22; color: #22c55e; }
.status-badge.offline { background: #f59e0b22; color: #f59e0b; }
.device-info { font-size: 11px; color: #94a3b8; margin-bottom: 8px; }
.device-readings { display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.reading { background: #0f172a; padding: 8px; border-radius: 6px; text-align: center; }
.reading .label { font-size: 10px; color: #64748b; }
.reading .value { font-size: 16px; font-weight: 700; color: #e2e8f0; }
.device-actions { display:flex; gap: 6px; flex-wrap: wrap; }
.device-actions .btn { flex:1; min-width: 60px; font-size: 11px; padding: 6px 8px; }
.refresh-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; }
.refresh-bar .info { font-size: 12px; color: #64748b; }
</style>
</head>
<body>
<div class="header">
  <h1>🔥 烟感设备模拟器控制台</h1>
  <div class="actions">
    <button class="btn btn-start" onclick="action('start-all')">▶ 全部上线</button>
    <button class="btn btn-stop" onclick="action('stop-all')">⏹ 全部下线</button>
    <button class="btn btn-alert" onclick="action('alert-all')">🚨 群发告警</button>
  </div>
</div>
<div class="container">
  <div class="refresh-bar">
    <span class="info" id="statusInfo">加载中...</span>
    <button class="btn btn-start" style="background:#475569;" onclick="refresh()">🔄 刷新</button>
  </div>
  <div class="device-grid" id="deviceGrid"></div>
</div>
<script>
var BASE = window.location.origin;
function refresh() {
  fetch(BASE + '/api/status')
    .then(r => r.json())
    .then(data => {
      document.getElementById('statusInfo').textContent =
        '共 ' + data.length + ' 台设备 | ' + new Date().toLocaleTimeString();
      renderDevices(data);
    })
    .catch(e => { document.getElementById('statusInfo').textContent = '连接失败'; });
}
function renderDevices(devices) {
  var grid = document.getElementById('deviceGrid');
  grid.innerHTML = devices.map(function(d) {
    var cls = d.status.toLowerCase();
    var hbRunning = d.heartbeatRunning;
    var dataRunning = d.dataRunning;
    return '<div class="device-card ' + cls + '">' +
      '<div class="device-header">' +
        '<div><div class="device-name">' + esc(d.deviceName) + '</div>' +
        '<div class="device-code">' + esc(d.deviceCode) + '</div></div>' +
        '<span class="status-badge ' + cls + '">' + d.status + '</span>' +
      '</div>' +
      '<div class="device-info">📍 ' + esc(d.building || '-') + ' ' + esc(d.floor || '') + ' ' + esc(d.room || '') + '</div>' +
      '<div class="device-readings">' +
        '<div class="reading"><div class="label">烟雾 mg/m³</div><div class="value">' + d.latestSmoke.toFixed(3) + '</div></div>' +
        '<div class="reading"><div class="label">温度 °C</div><div class="value">' + d.latestTemp.toFixed(1) + '</div></div>' +
        '<div class="reading"><div class="label">湿度 %</div><div class="value">' + d.latestHumi.toFixed(1) + '</div></div>' +
        '<div class="reading"><div class="label">电量 %</div><div class="value">' + d.latestBattery + '</div></div>' +
      '</div>' +
      '<div class="device-actions">' +
        (hbRunning
          ? '<button class="btn btn-stop" onclick="action(\'stop-hb\',\'' + d.deviceCode + '\')">⏹ 停止心跳</button>'
          : '<button class="btn btn-start" onclick="action(\'start-hb\',\'' + d.deviceCode + '\')">▶ 启动心跳</button>') +
        (dataRunning
          ? '<button class="btn btn-stop" onclick="action(\'stop-data\',\'' + d.deviceCode + '\')">⏸ 停止数据</button>'
          : '<button class="btn btn-start" onclick="action(\'start-data\',\'' + d.deviceCode + '\')">📡 开始上报</button>') +
        '<button class="btn btn-alert" onclick="action(\'alert\',\'' + d.deviceCode + '\')">🚨 告警</button>' +
      '</div></div>';
  }).join('');
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function action(cmd, code) {
  var smoke = 0.35, temp = 68.0;
  if (cmd === 'alert' || cmd === 'alert-all') {
    smoke = parseFloat(prompt('烟雾浓度 (默认 0.35):', '0.35')) || 0.35;
    temp = parseFloat(prompt('温度 (默认 68.0):', '68.0')) || 68.0;
  }
  var url = BASE + '/api/' + cmd;
  if (code) url += '?device=' + encodeURIComponent(code);
  if (cmd === 'alert' || cmd === 'alert-all') url += (code ? '&' : '?') + 'smoke=' + smoke + '&temp=' + temp;
  fetch(url, {method:'POST'}).then(r => r.json()).then(d => {
    if (d.ok) refresh();
  }).catch(function(){ refresh(); });
  setTimeout(refresh, 500);
}
setInterval(refresh, 5000);
refresh();
</script>
</body>
</html>
"""


class SimWebHandler(http.server.BaseHTTPRequestHandler):
    """Web 控制台 HTTP 处理器"""
    controller = None  # 由外部注入

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/" or path == "/index.html":
            self._respond_html(WEB_HTML)
        elif path == "/api/status":
            devices = self.controller.get_all_status() if self.controller else []
            self._respond_json(devices)
        elif path.startswith("/api/device/"):
            code = path.split("/")[-1]
            dev = self.controller.get_device_status(code) if self.controller else None
            self._respond_json(dev or {"error": "not found"})
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        qs = parse_qs(urlparse(self.path).query)
        device_code = qs.get("device", [None])[0]

        ok = False
        if path == "/api/start-all":
            count = self.controller.start_all() if self.controller else 0
            ok = count > 0
        elif path == "/api/stop-all":
            count = self.controller.stop_all() if self.controller else 0
            ok = count > 0
        elif path == "/api/alert-all":
            if self.controller:
                for code in list(self.controller.workers.keys()):
                    self.controller.send_device_alert(code)
            ok = True
        elif path == "/api/start-hb" and device_code:
            ok = self.controller.start_device_heartbeat(device_code) if self.controller else False
        elif path == "/api/stop-hb" and device_code:
            ok = self.controller.stop_device_heartbeat(device_code) if self.controller else False
        elif path == "/api/start-data" and device_code:
            if self.controller:
                w = self.controller.workers.get(device_code)
                ok = w.start_data() if w else False
        elif path == "/api/stop-data" and device_code:
            if self.controller:
                w = self.controller.workers.get(device_code)
                ok = w.stop_data() if w else False
        elif path == "/api/alert" and device_code:
            smoke = float(qs.get("smoke", [0.35])[0])
            temp = float(qs.get("temp", [68.0])[0])
            ok = self.controller.send_device_alert(device_code, smoke, temp) if self.controller else False

        self._respond_json({"ok": ok})

    def _respond_html(self, html):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode("utf-8"))

    def _respond_json(self, data):
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format, *args):
        pass  # 关闭 HTTP 请求日志


def start_web_server(controller, port):
    """启动 Web 控制台"""
    SimWebHandler.controller = controller
    server = socketserver.ThreadingTCPServer(("0.0.0.0", port), SimWebHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"[OK] Web 控制台已启动: http://localhost:{port}")
    return server


# ====================== 交互式菜单 ======================
def interactive_menu(controller):
    """命令行交互菜单"""
    while True:
        devices = controller.get_all_status()
        online = sum(1 for d in devices if d["status"] == "ONLINE")
        offline = sum(1 for d in devices if d["status"] == "OFFLINE")

        print("\n" + "=" * 55)
        print(f"  烟感模拟器 v2.0 | 设备: {len(devices)} 台 | 在线: {online} | 离线: {offline}")
        print("=" * 55)
        print("  1. 查看所有设备状态")
        print("  2. 启动指定设备心跳（上线）")
        print("  3. 停止指定设备心跳（下线）")
        print("  4. 发送指定设备告警")
        print("  5. 全部设备上线")
        print("  6. 全部设备下线")
        print("  7. 重新从数据库加载设备")
        print("  8. 群发告警（所有设备）")
        print("  0. 退出")
        print("-" * 55)

        choice = input("  请选择 [0-8]: ").strip()

        if choice == "1":
            print("\n  设备列表:")
            print(f"  {'设备编号':<14} {'名称':<16} {'楼栋':<10} {'状态':<8} {'心跳':<8} {'数据':<8}")
            print(f"  {'-' * 70}")
            for d in devices:
                hb = "✓" if d["heartbeatRunning"] else "✗"
                dt = "✓" if d["dataRunning"] else "✗"
                print(f"  {d['deviceCode']:<14} {d['deviceName']:<16} {(d['building'] or '-'):<10} {d['status']:<8} {hb:<8} {dt:<8}")

        elif choice == "2":
            code = input("  设备编号: ").strip().upper()
            if code:
                if controller.start_device_heartbeat(code):
                    print(f"  [OK] {code} 心跳已启动")
                else:
                    print(f"  [FAIL] 设备不存在或已在运行")

        elif choice == "3":
            code = input("  设备编号: ").strip().upper()
            if code:
                if controller.stop_device_heartbeat(code):
                    print(f"  [OK] {code} 心跳已停止")
                else:
                    print(f"  [FAIL] 设备不存在或未运行")

        elif choice == "4":
            code = input("  设备编号: ").strip().upper()
            if code:
                try:
                    sv = float(input("  烟雾浓度 (默认 0.35): ").strip() or "0.35")
                    tv = float(input("  温度 (默认 68.0): ").strip() or "68.0")
                except ValueError:
                    sv, tv = 0.35, 68.0
                if controller.send_device_alert(code, sv, tv):
                    print(f"  [OK] 告警已发送")
                else:
                    print(f"  [FAIL] 设备不存在")

        elif choice == "5":
            count = controller.start_all()
            print(f"  [OK] 已启动 {count} 台设备")

        elif choice == "6":
            count = controller.stop_all()
            print(f"  [OK] 已停止 {count} 台设备")

        elif choice == "7":
            controller.load_devices_from_db()
            print(f"  [OK] 已重新加载")

        elif choice == "8":
            try:
                sv = float(input("  烟雾浓度 (默认 0.35): ").strip() or "0.35")
                tv = float(input("  温度 (默认 68.0): ").strip() or "68.0")
            except ValueError:
                sv, tv = 0.35, 68.0
            count = 0
            for d in devices:
                if controller.send_device_alert(d["deviceCode"], sv, tv):
                    count += 1
                    time.sleep(0.3)
            print(f"  [OK] 已向 {count} 台设备发送告警")

        elif choice == "0":
            controller.shutdown()
            print("  再见!")
            break
        else:
            print("  无效选项")


# ====================== 入口 ======================
if __name__ == "__main__":
    no_web = "--no-web" in sys.argv
    web_port = WEB_PORT
    for i, arg in enumerate(sys.argv):
        if arg == "--web-port" and i + 1 < len(sys.argv):
            web_port = int(sys.argv[i + 1])

    print("=" * 55)
    print("  智慧烟感预警系统 - 设备模拟器 v2.0")
    print("=" * 55)

    # 1. 连接后端 API
    api = ApiClient(BACKEND_URL, SIMULATOR_USERNAME, SIMULATOR_PASSWORD)
    if not api.login():
        print("[WARN] 后端登录失败，部分功能不可用")
        # 不退出，允许离线模式

    # 2. 创建控制器并连接 MQTT
    controller = SimulatorController(api)
    if not controller.connect_mqtt():
        print("[ERR] MQTT 连接失败，模拟器无法工作")
        sys.exit(1)

    # 3. 从数据库加载设备
    controller.load_devices_from_db()
    controller.start_polling()

    # 4. 启动 Web 控制台
    web_server = None
    if not no_web:
        web_server = start_web_server(controller, web_port)

    # 5. 启动交互式菜单
    try:
        interactive_menu(controller)
    except KeyboardInterrupt:
        controller.shutdown()
        if web_server:
            web_server.shutdown()
        print("\n[STOP] 已退出")