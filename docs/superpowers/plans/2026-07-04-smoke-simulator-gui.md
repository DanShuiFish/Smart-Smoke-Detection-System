# Smoke Simulator GUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个独立于现有 Spring Boot/前端代码的 Python Tkinter 烟感模拟器桌面工具，支持默认设备、设备管理、三种模式、随机值/自定义值切换和日志输出。

**Architecture:** 在 `tools/smoke-simulator-gui/` 下拆分为“界面层 + 核心模拟层 + JSON 配置层”。`app.py` 负责 Tkinter 界面、配置加载保存和事件绑定；`simulator_core.py` 负责 MQTT 连接、数据生成、持续发送和离线模拟；`config.json`、`devices.json` 负责持久化默认配置和设备列表。

**Tech Stack:** Python 3、Tkinter、paho-mqtt、JSON、threading

---

## File Structure

- Create: `tools/smoke-simulator-gui/app.py`
- Create: `tools/smoke-simulator-gui/simulator_core.py`
- Create: `tools/smoke-simulator-gui/config.json`
- Create: `tools/smoke-simulator-gui/devices.json`
- Create: `tools/smoke-simulator-gui/requirements.txt`
- Create: `tools/smoke-simulator-gui/README.md`

责任划分：

- `app.py`：主窗口、布局、设备管理弹窗、日志区、状态显示、调用核心层
- `simulator_core.py`：MQTT 客户端、正常/告警/离线模式、线程控制、数据生成
- `config.json`：Broker、端口、用户名密码、默认参数、最近选择
- `devices.json`：默认设备 + 用户增删改后的设备
- `README.md`：运行步骤、依赖安装、常见问题

### Task 1: 创建工具目录与基础静态文件

**Files:**
- Create: `tools/smoke-simulator-gui/config.json`
- Create: `tools/smoke-simulator-gui/devices.json`
- Create: `tools/smoke-simulator-gui/requirements.txt`
- Create: `tools/smoke-simulator-gui/README.md`

- [ ] **Step 1: 写入默认配置文件**

```json
{
  "mqtt": {
    "broker": "192.168.130.101",
    "port": 1883,
    "client_id": "smoke-simulator-gui",
    "username": "fasong",
    "password": "fasong123"
  },
  "defaults": {
    "use_random": true,
    "smoke": 0.02,
    "temp": 25.0,
    "humi": 45.0,
    "bat": 95,
    "rssi": -40,
    "normal_interval": 5,
    "heartbeat_interval": 10,
    "offline_timeout": 35
  },
  "ui": {
    "last_device_code": "SDS-001",
    "last_mode": "normal"
  }
}
```

- [ ] **Step 2: 写入默认设备文件**

```json
[
  {
    "device_id": 1,
    "device_code": "SDS-001",
    "device_name": "1号楼1层101烟感",
    "building": "1号楼",
    "floor": "1F",
    "room": "101室"
  },
  {
    "device_id": 2,
    "device_code": "SDS-002",
    "device_name": "1号楼3层301烟感",
    "building": "1号楼",
    "floor": "3F",
    "room": "301室"
  },
  {
    "device_id": 3,
    "device_code": "SDS-003",
    "device_name": "2号楼食堂烟感",
    "building": "2号楼",
    "floor": "1F",
    "room": "食堂"
  }
]
```

- [ ] **Step 3: 写入依赖说明**

```text
paho-mqtt>=2.1.0
```

- [ ] **Step 4: 写入 README 初稿**

```markdown
# Smoke Simulator GUI

## 安装依赖

```bash
python -m pip install -r requirements.txt
```

## 运行

```bash
python app.py
```

## 功能

- MQTT 连接测试
- 默认设备与设备管理
- 正常模式、告警模式、离线模式
- 随机值与自定义值切换
- 日志输出
```

- [ ] **Step 5: 提交**

```bash
git add tools/smoke-simulator-gui/config.json tools/smoke-simulator-gui/devices.json tools/smoke-simulator-gui/requirements.txt tools/smoke-simulator-gui/README.md
git commit -m "feat: add smoke simulator gui scaffold files"
```

### Task 2: 实现核心模拟层骨架

**Files:**
- Create: `tools/smoke-simulator-gui/simulator_core.py`

- [ ] **Step 1: 写出核心类骨架**

```python
from __future__ import annotations

import json
import random
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Optional

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
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        self.running = False
        self.heartbeat_running = False
        self.worker_thread: Optional[threading.Thread] = None
        self.heartbeat_thread: Optional[threading.Thread] = None
```

- [ ] **Step 2: 添加基础日志与时间工具**

```python
    def _log(self, message: str) -> None:
        self.logger(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

    @staticmethod
    def _now_ts() -> int:
        return int(datetime.now().timestamp() * 1000)
```

- [ ] **Step 3: 添加连接回调骨架**

```python
    def _on_connect(self, client, userdata, flags, reason_code, properties):
        self.connected = reason_code == 0
        if self.connected:
            self._log(f"MQTT 已连接: {reason_code}")
        else:
            self._log(f"MQTT 连接失败: {reason_code}")

    def _on_disconnect(self, client, userdata, flags, reason_code, properties):
        self.connected = False
        self._log(f"MQTT 已断开: {reason_code}")
```

- [ ] **Step 4: 添加数据生成函数**

```python
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
        return {
            "deviceId": device["device_code"],
            "smoke": round(config.smoke, 4),
            "temp": round(config.temp, 2),
            "humi": round(config.humi, 2),
            "bat": int(config.bat),
            "ts": self._now_ts(),
        }

    def build_heartbeat_payload(self, device: dict, config: SimulatorConfig) -> dict:
        return {
            "deviceId": device["device_code"],
            "bat": int(config.bat) if not config.use_random else random.randint(85, 100),
            "rssi": int(config.rssi) if not config.use_random else random.randint(-50, -30),
            "ts": self._now_ts(),
        }
```

- [ ] **Step 5: 提交**

```bash
git add tools/smoke-simulator-gui/simulator_core.py
git commit -m "feat: add smoke simulator core skeleton"
```

### Task 3: 实现 MQTT 连接与单次发送

**Files:**
- Modify: `tools/smoke-simulator-gui/simulator_core.py`

- [ ] **Step 1: 实现 connect 方法**

```python
    def connect(self, config: SimulatorConfig, timeout: int = 5) -> bool:
        try:
            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=config.client_id)
            if config.username:
                self.client.username_pw_set(config.username, config.password)
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self._log(f"正在连接 {config.broker}:{config.port}")
            self.client.connect(config.broker, config.port, keepalive=60)
            self.client.loop_start()
            waited = 0.0
            while not self.connected and waited < timeout:
                time.sleep(0.2)
                waited += 0.2
            return self.connected
        except Exception as exc:
            self._log(f"连接异常: {exc}")
            return False
```

- [ ] **Step 2: 实现 disconnect 方法**

```python
    def disconnect(self) -> None:
        self.running = False
        self.heartbeat_running = False
        if self.client:
            try:
                self.client.loop_stop()
                self.client.disconnect()
            except Exception as exc:
                self._log(f"断开连接异常: {exc}")
        self.client = None
        self.connected = False
```

- [ ] **Step 3: 实现 publish 方法**

```python
    def publish(self, topic: str, payload: dict) -> bool:
        if not self.client or not self.connected:
            self._log("MQTT 未连接，无法发送")
            return False
        try:
            payload_str = json.dumps(payload, ensure_ascii=False)
            info = self.client.publish(topic, payload_str, qos=1)
            self._log(f"发送 {topic}: rc={info.rc}")
            self._log(payload_str)
            return info.rc == 0
        except Exception as exc:
            self._log(f"发送异常: {exc}")
            return False
```

- [ ] **Step 4: 实现单次正常/告警发送**

```python
    def send_normal_once(self, device: dict, config: SimulatorConfig) -> bool:
        payload = self.build_normal_payload(device, config)
        return self.publish(f"smoke/{device['device_code']}/data", payload)

    def send_alert_once(self, device: dict, config: SimulatorConfig) -> bool:
        payload = self.build_alert_payload(device, config)
        return self.publish(f"smoke/{device['device_code']}/data", payload)
```

- [ ] **Step 5: 提交**

```bash
git add tools/smoke-simulator-gui/simulator_core.py
git commit -m "feat: add mqtt connect and send actions"
```

### Task 4: 实现持续正常模式与心跳线程

**Files:**
- Modify: `tools/smoke-simulator-gui/simulator_core.py`

- [ ] **Step 1: 实现心跳循环**

```python
    def _heartbeat_loop(self, device: dict, config: SimulatorConfig) -> None:
        while self.heartbeat_running and self.running:
            payload = self.build_heartbeat_payload(device, config)
            self.publish(f"smoke/{device['device_code']}/heartbeat", payload)
            time.sleep(config.heartbeat_interval)
```

- [ ] **Step 2: 实现正常模式循环**

```python
    def _normal_loop(self, device: dict, config: SimulatorConfig) -> None:
        while self.running:
            self.send_normal_once(device, config)
            time.sleep(config.normal_interval)
```

- [ ] **Step 3: 实现 start_normal**

```python
    def start_normal(self, device: dict, config: SimulatorConfig) -> bool:
        if not self.connected and not self.connect(config):
            return False
        self.running = True
        self.heartbeat_running = True
        self.worker_thread = threading.Thread(target=self._normal_loop, args=(device, config), daemon=True)
        self.heartbeat_thread = threading.Thread(target=self._heartbeat_loop, args=(device, config), daemon=True)
        self.worker_thread.start()
        self.heartbeat_thread.start()
        self._log(f"正常模式启动: {device['device_code']}")
        return True
```

- [ ] **Step 4: 实现 stop_running**

```python
    def stop_running(self) -> None:
        self.running = False
        self.heartbeat_running = False
        self._log("模拟已停止")
```

- [ ] **Step 5: 提交**

```bash
git add tools/smoke-simulator-gui/simulator_core.py
git commit -m "feat: add normal mode loop and heartbeat"
```

### Task 5: 实现离线模拟逻辑

**Files:**
- Modify: `tools/smoke-simulator-gui/simulator_core.py`

- [ ] **Step 1: 实现离线模拟线程**

```python
    def _offline_loop(self, device: dict, config: SimulatorConfig) -> None:
        self._log(f"开始模拟离线: {device['device_code']}")
        countdown = config.offline_timeout
        while self.running and countdown > 0:
            self._log(f"离线倒计时: {countdown}s")
            time.sleep(5)
            countdown -= 5
        self._log(f"离线模拟完成: {device['device_code']}")
        self.running = False
```

- [ ] **Step 2: 实现 start_offline**

```python
    def start_offline(self, device: dict, config: SimulatorConfig) -> bool:
        if not self.connected and not self.connect(config):
            return False
        self.running = True
        self.heartbeat_running = False
        self.worker_thread = threading.Thread(target=self._offline_loop, args=(device, config), daemon=True)
        self.worker_thread.start()
        return True
```

- [ ] **Step 3: 提交**

```bash
git add tools/smoke-simulator-gui/simulator_core.py
git commit -m "feat: add offline simulation mode"
```

### Task 6: 创建 GUI 主窗口与配置加载

**Files:**
- Create: `tools/smoke-simulator-gui/app.py`

- [ ] **Step 1: 创建应用骨架**

```python
import json
from pathlib import Path
import tkinter as tk
from tkinter import ttk, messagebox

from simulator_core import SimulatorConfig, SmokeSimulatorCore


BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
DEVICES_PATH = BASE_DIR / "devices.json"


class SmokeSimulatorApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("智慧烟感模拟器 GUI")
        self.root.geometry("1180x760")
        self.root.minsize(1080, 700)
        self.core = SmokeSimulatorCore(self.append_log)
        self.config_data = self.load_json(CONFIG_PATH)
        self.devices = self.load_json(DEVICES_PATH)
```

- [ ] **Step 2: 添加 JSON 读写工具**

```python
    def load_json(self, path: Path):
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def save_json(self, path: Path, data) -> None:
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
```

- [ ] **Step 3: 创建程序入口**

```python
def main() -> None:
    root = tk.Tk()
    app = SmokeSimulatorApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 提交**

```bash
git add tools/smoke-simulator-gui/app.py
git commit -m "feat: add gui app skeleton"
```

### Task 7: 实现主界面布局

**Files:**
- Modify: `tools/smoke-simulator-gui/app.py`

- [ ] **Step 1: 创建变量绑定**

```python
        mqtt_cfg = self.config_data["mqtt"]
        defaults = self.config_data["defaults"]
        self.broker_var = tk.StringVar(value=mqtt_cfg["broker"])
        self.port_var = tk.StringVar(value=str(mqtt_cfg["port"]))
        self.client_id_var = tk.StringVar(value=mqtt_cfg["client_id"])
        self.username_var = tk.StringVar(value=mqtt_cfg["username"])
        self.password_var = tk.StringVar(value=mqtt_cfg["password"])
        self.use_random_var = tk.BooleanVar(value=defaults["use_random"])
        self.mode_var = tk.StringVar(value=self.config_data["ui"]["last_mode"])
        self.device_var = tk.StringVar(value=self.config_data["ui"]["last_device_code"])
```

- [ ] **Step 2: 创建参数变量**

```python
        self.smoke_var = tk.StringVar(value=str(defaults["smoke"]))
        self.temp_var = tk.StringVar(value=str(defaults["temp"]))
        self.humi_var = tk.StringVar(value=str(defaults["humi"]))
        self.bat_var = tk.StringVar(value=str(defaults["bat"]))
        self.rssi_var = tk.StringVar(value=str(defaults["rssi"]))
        self.normal_interval_var = tk.StringVar(value=str(defaults["normal_interval"]))
        self.heartbeat_interval_var = tk.StringVar(value=str(defaults["heartbeat_interval"]))
        self.offline_timeout_var = tk.StringVar(value=str(defaults["offline_timeout"]))
```

- [ ] **Step 3: 搭主界面分区**

```python
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(1, weight=1)

        header = ttk.LabelFrame(self.root, text="连接配置")
        header.grid(row=0, column=0, sticky="ew", padx=12, pady=8)

        content = ttk.Frame(self.root)
        content.grid(row=1, column=0, sticky="nsew", padx=12, pady=8)
        content.columnconfigure(0, weight=1)
        content.columnconfigure(1, weight=1)
        content.columnconfigure(2, weight=1)
        content.rowconfigure(1, weight=1)

        left = ttk.LabelFrame(content, text="设备管理")
        left.grid(row=0, column=0, rowspan=2, sticky="nsew", padx=6, pady=6)

        middle = ttk.LabelFrame(content, text="模式控制")
        middle.grid(row=0, column=1, sticky="nsew", padx=6, pady=6)

        right = ttk.LabelFrame(content, text="参数设置")
        right.grid(row=0, column=2, sticky="nsew", padx=6, pady=6)

        log_frame = ttk.LabelFrame(content, text="运行日志")
        log_frame.grid(row=1, column=1, columnspan=2, sticky="nsew", padx=6, pady=6)
```

- [ ] **Step 4: 添加日志框**

```python
        self.log_text = tk.Text(log_frame, height=18, wrap="word", state="disabled")
        self.log_text.pack(fill="both", expand=True, padx=8, pady=8)
```

- [ ] **Step 5: 提交**

```bash
git add tools/smoke-simulator-gui/app.py
git commit -m "feat: add gui layout sections"
```

### Task 8: 实现连接区、设备区和参数区控件

**Files:**
- Modify: `tools/smoke-simulator-gui/app.py`

- [ ] **Step 1: 填充连接控件**

```python
        ttk.Label(header, text="Broker").grid(row=0, column=0, padx=6, pady=6, sticky="w")
        ttk.Entry(header, textvariable=self.broker_var, width=20).grid(row=0, column=1, padx=6, pady=6)
        ttk.Label(header, text="Port").grid(row=0, column=2, padx=6, pady=6, sticky="w")
        ttk.Entry(header, textvariable=self.port_var, width=8).grid(row=0, column=3, padx=6, pady=6)
        ttk.Label(header, text="Client ID").grid(row=0, column=4, padx=6, pady=6, sticky="w")
        ttk.Entry(header, textvariable=self.client_id_var, width=22).grid(row=0, column=5, padx=6, pady=6)
        ttk.Label(header, text="用户名").grid(row=0, column=6, padx=6, pady=6, sticky="w")
        ttk.Entry(header, textvariable=self.username_var, width=14).grid(row=0, column=7, padx=6, pady=6)
        ttk.Label(header, text="密码").grid(row=0, column=8, padx=6, pady=6, sticky="w")
        ttk.Entry(header, textvariable=self.password_var, width=14, show="*").grid(row=0, column=9, padx=6, pady=6)
        ttk.Button(header, text="测试连接", command=self.test_connection).grid(row=0, column=10, padx=8, pady=6)
```

- [ ] **Step 2: 填充设备区**

```python
        ttk.Label(left, text="当前设备").pack(anchor="w", padx=8, pady=(10, 4))
        self.device_combo = ttk.Combobox(left, textvariable=self.device_var, state="readonly")
        self.device_combo.pack(fill="x", padx=8, pady=4)
        ttk.Button(left, text="新增设备", command=self.open_add_device).pack(fill="x", padx=8, pady=4)
        ttk.Button(left, text="编辑设备", command=self.open_edit_device).pack(fill="x", padx=8, pady=4)
        ttk.Button(left, text="删除设备", command=self.delete_device).pack(fill="x", padx=8, pady=4)
```

- [ ] **Step 3: 填充模式区**

```python
        ttk.Radiobutton(middle, text="正常模式", variable=self.mode_var, value="normal").pack(anchor="w", padx=8, pady=4)
        ttk.Radiobutton(middle, text="告警模式", variable=self.mode_var, value="alert").pack(anchor="w", padx=8, pady=4)
        ttk.Radiobutton(middle, text="离线模式", variable=self.mode_var, value="offline").pack(anchor="w", padx=8, pady=4)
        ttk.Button(middle, text="启动", command=self.start_mode).pack(fill="x", padx=8, pady=6)
        ttk.Button(middle, text="单次发送", command=self.send_once).pack(fill="x", padx=8, pady=6)
        ttk.Button(middle, text="停止", command=self.stop_mode).pack(fill="x", padx=8, pady=6)
```

- [ ] **Step 4: 填充参数区**

```python
        ttk.Checkbutton(right, text="使用随机值", variable=self.use_random_var, command=self.toggle_random_inputs).grid(row=0, column=0, columnspan=2, sticky="w", padx=8, pady=8)
        fields = [
            ("烟雾", self.smoke_var),
            ("温度", self.temp_var),
            ("湿度", self.humi_var),
            ("电量", self.bat_var),
            ("RSSI", self.rssi_var),
            ("发送间隔", self.normal_interval_var),
            ("心跳间隔", self.heartbeat_interval_var),
            ("离线超时", self.offline_timeout_var),
        ]
        self.param_entries = []
        for row_index, (label, variable) in enumerate(fields, start=1):
            ttk.Label(right, text=label).grid(row=row_index, column=0, sticky="w", padx=8, pady=6)
            entry = ttk.Entry(right, textvariable=variable, width=16)
            entry.grid(row=row_index, column=1, sticky="ew", padx=8, pady=6)
            self.param_entries.append(entry)
```

- [ ] **Step 5: 提交**

```bash
git add tools/smoke-simulator-gui/app.py
git commit -m "feat: add gui controls"
```

### Task 9: 实现配置转换、日志和主流程绑定

**Files:**
- Modify: `tools/smoke-simulator-gui/app.py`

- [ ] **Step 1: 实现日志追加**

```python
    def append_log(self, message: str) -> None:
        self.log_text.configure(state="normal")
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")
```

- [ ] **Step 2: 实现当前设备查找**

```python
    def get_selected_device(self) -> dict | None:
        for device in self.devices:
            if device["device_code"] == self.device_var.get():
                return device
        return None
```

- [ ] **Step 3: 实现配置对象构造**

```python
    def build_runtime_config(self) -> SimulatorConfig:
        return SimulatorConfig(
            broker=self.broker_var.get().strip(),
            port=int(self.port_var.get().strip()),
            client_id=self.client_id_var.get().strip(),
            username=self.username_var.get().strip(),
            password=self.password_var.get(),
            use_random=self.use_random_var.get(),
            smoke=float(self.smoke_var.get().strip()),
            temp=float(self.temp_var.get().strip()),
            humi=float(self.humi_var.get().strip()),
            bat=int(self.bat_var.get().strip()),
            rssi=int(self.rssi_var.get().strip()),
            normal_interval=int(self.normal_interval_var.get().strip()),
            heartbeat_interval=int(self.heartbeat_interval_var.get().strip()),
            offline_timeout=int(self.offline_timeout_var.get().strip()),
        )
```

- [ ] **Step 4: 实现测试连接**

```python
    def test_connection(self) -> None:
        try:
            config = self.build_runtime_config()
            ok = self.core.connect(config)
            if ok:
                messagebox.showinfo("连接测试", "MQTT 连接成功")
                self.core.disconnect()
            else:
                messagebox.showerror("连接测试", "MQTT 连接失败，请查看日志")
        except Exception as exc:
            messagebox.showerror("连接测试", str(exc))
```

- [ ] **Step 5: 提交**

```bash
git add tools/smoke-simulator-gui/app.py
git commit -m "feat: wire config and logging"
```

### Task 10: 实现模式启动、单次发送和停止

**Files:**
- Modify: `tools/smoke-simulator-gui/app.py`

- [ ] **Step 1: 实现启动逻辑**

```python
    def start_mode(self) -> None:
        device = self.get_selected_device()
        if not device:
            messagebox.showwarning("设备未选择", "请先选择一个设备")
            return
        config = self.build_runtime_config()
        mode = self.mode_var.get()
        if mode == "normal":
            ok = self.core.start_normal(device, config)
        elif mode == "offline":
            ok = self.core.start_offline(device, config)
        else:
            ok = self.core.connect(config)
            if ok:
                self.core.send_alert_once(device, config)
        if not ok:
            messagebox.showerror("启动失败", "操作未成功，请查看日志")
```

- [ ] **Step 2: 实现单次发送逻辑**

```python
    def send_once(self) -> None:
        device = self.get_selected_device()
        if not device:
            messagebox.showwarning("设备未选择", "请先选择一个设备")
            return
        config = self.build_runtime_config()
        if not self.core.connect(config):
            messagebox.showerror("连接失败", "MQTT 未连接成功")
            return
        if self.mode_var.get() == "alert":
            self.core.send_alert_once(device, config)
        else:
            self.core.send_normal_once(device, config)
        self.core.disconnect()
```

- [ ] **Step 3: 实现停止逻辑**

```python
    def stop_mode(self) -> None:
        self.core.stop_running()
        self.core.disconnect()
```

- [ ] **Step 4: 提交**

```bash
git add tools/smoke-simulator-gui/app.py
git commit -m "feat: add gui mode actions"
```

### Task 11: 实现随机值切换与设备管理弹窗

**Files:**
- Modify: `tools/smoke-simulator-gui/app.py`

- [ ] **Step 1: 实现参数禁用/启用**

```python
    def toggle_random_inputs(self) -> None:
        state = "disabled" if self.use_random_var.get() else "normal"
        for entry in self.param_entries[:5]:
            entry.configure(state=state)
```

- [ ] **Step 2: 实现设备下拉框刷新**

```python
    def refresh_device_combo(self) -> None:
        values = [f"{item['device_code']} - {item['device_name']}" for item in self.devices]
        self.device_combo["values"] = [item["device_code"] for item in self.devices]
        if self.devices and self.device_var.get() not in self.device_combo["values"]:
            self.device_var.set(self.devices[0]["device_code"])
```

- [ ] **Step 3: 实现新增设备弹窗**

```python
    def open_add_device(self) -> None:
        self.open_device_editor("新增设备")
```

- [ ] **Step 4: 实现编辑设备弹窗骨架**

```python
    def open_edit_device(self) -> None:
        device = self.get_selected_device()
        if not device:
            messagebox.showwarning("设备未选择", "请先选择一个设备")
            return
        self.open_device_editor("编辑设备", device)
```

- [ ] **Step 5: 实现删除设备**

```python
    def delete_device(self) -> None:
        device = self.get_selected_device()
        if not device:
            messagebox.showwarning("设备未选择", "请先选择一个设备")
            return
        if not messagebox.askyesno("删除设备", f"确定删除 {device['device_code']} 吗？"):
            return
        self.devices = [item for item in self.devices if item["device_code"] != device["device_code"]]
        self.save_json(DEVICES_PATH, self.devices)
        self.refresh_device_combo()
```

- [ ] **Step 6: 提交**

```bash
git add tools/smoke-simulator-gui/app.py
git commit -m "feat: add random toggle and device management"
```

### Task 12: 实现配置持久化与启动初始化

**Files:**
- Modify: `tools/smoke-simulator-gui/app.py`
- Modify: `tools/smoke-simulator-gui/README.md`

- [ ] **Step 1: 实现配置保存**

```python
    def save_runtime_config(self) -> None:
        self.config_data["mqtt"] = {
            "broker": self.broker_var.get().strip(),
            "port": int(self.port_var.get().strip()),
            "client_id": self.client_id_var.get().strip(),
            "username": self.username_var.get().strip(),
            "password": self.password_var.get(),
        }
        self.config_data["defaults"] = {
            "use_random": self.use_random_var.get(),
            "smoke": float(self.smoke_var.get().strip()),
            "temp": float(self.temp_var.get().strip()),
            "humi": float(self.humi_var.get().strip()),
            "bat": int(self.bat_var.get().strip()),
            "rssi": int(self.rssi_var.get().strip()),
            "normal_interval": int(self.normal_interval_var.get().strip()),
            "heartbeat_interval": int(self.heartbeat_interval_var.get().strip()),
            "offline_timeout": int(self.offline_timeout_var.get().strip()),
        }
        self.config_data["ui"] = {
            "last_device_code": self.device_var.get(),
            "last_mode": self.mode_var.get(),
        }
        self.save_json(CONFIG_PATH, self.config_data)
```

- [ ] **Step 2: 在关闭窗口前保存**

```python
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def on_close(self) -> None:
        try:
            self.save_runtime_config()
            self.core.stop_running()
            self.core.disconnect()
        finally:
            self.root.destroy()
```

- [ ] **Step 3: 在初始化中刷新设备和随机态**

```python
        self.refresh_device_combo()
        self.toggle_random_inputs()
        self.append_log("GUI 已启动")
```

- [ ] **Step 4: 更新 README 运行说明**

```markdown
## 文件说明

- `app.py`：图形界面入口
- `simulator_core.py`：模拟逻辑和 MQTT 通信
- `config.json`：保存最近连接配置和参数
- `devices.json`：保存设备列表

## 常见问题

### 缺少 paho

```bash
python -m pip install -r requirements.txt
```
```

- [ ] **Step 5: 提交**

```bash
git add tools/smoke-simulator-gui/app.py tools/smoke-simulator-gui/README.md
git commit -m "feat: persist gui config and finalize startup flow"
```

## Self-Review

- 规格覆盖���
  - 独立目录：Task 1
  - Tkinter GUI：Task 6-12
  - 默认设备与可增删改：Task 1、Task 11
  - 随机值与自定义值切换：Task 2、Task 8、Task 11
  - 正常/告警/离线三模式：Task 3-5、Task 10
  - 日志输出：Task 6、Task 9
  - 配置持久化：Task 1、Task 12
- 占位符扫描：未使用 TBD/TODO，所有文件路径已明确
- 类型一致性：
  - `SimulatorConfig` 作为界面到核心层统一配置对象
  - 设备结构统一使用 `device_code/device_name/building/floor/room`

Plan complete and saved to `docs/superpowers/plans/2026-07-04-smoke-simulator-gui.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
