# BE1 模拟数据工作交接文档

> 整理时间: 2026-07-03 | 当前状态: 全链路已跑通 ✅

---

## 一、BE1 职责概述

你是 **BE1（后端-物联侧）**，代号"感知与连接"。核心职责：

1. 搭建并维护 MQTT Broker (EMQX)
2. 编写 Python 烟感模拟器脚本（Mock Server）
3. 编写 Java 侧 MQTT 收发代码（`MqttConsumer` / `MqttPublisher`）

你是整个系统的**数据入口**，没有你的模拟数据，后面所有人的工作都无法联调。

---

## 二、当前架构拓扑

```
Windows (你的开发机)
├── Spring Boot 后端 (IDEA跑, 端口 8080)
├── Python 模拟器 (scripts/smoke_simulator.py)
└── DataGrip → 连虚拟机 MySQL

VMware Ubuntu (192.168.130.101)
├── EMQX (Docker, 端口 1883/18083)
├── MySQL (端口 3306, root/123456)
└── Redis (端口 6379, 无密码)
```

---

## 三、已完成的文件清单

### BE1 领地 (你负责的文件)

| 文件 | 路径 | 状态 |
|---|---|---|
| 烟感模拟器 | `scripts/smoke_simulator.py` | ✅ 正常运行 |
| MQTT 消费者 | `src/main/java/com/smartsmoke/mqtt/MqttConsumer.java` | ✅ 已重构 |
| MQTT 发布者 | `src/main/java/com/smartsmoke/mqtt/MqttPublisher.java` | ✅ 无需改动 |
| 心跳 DTO | `src/main/java/com/smartsmoke/dto/HeartbeatDTO.java` | ✅ 新建 |
| MQTT 配置 | `src/main/java/com/smartsmoke/config/MqttConfig.java` | ✅ 已加认证 |
| 应用配置 | `src/main/resources/application.yml` | ✅ 已配好 |

### 修改过的非 BE1 领地文件（需要和对应负责人沟通）

| 文件 | 所属 | 改动内容 |
|---|---|---|
| `dto/DeviceReportDTO.java` | PM | 无改动（方案一不涉及） |
| `mqtt/MqttConsumer.java` | BE1(你) | 重构为心跳/数据分流处理 |

---

## 四、MQTT 协议规范（API 文档 3.1~3.3 节）

### 4.1 Topic 约定

| 方向 | Topic 模板 | QoS |
|---|---|---|
| 设备→云端（数据上报） | `smoke/{deviceId}/data` | 1 |
| 设备→云端（心跳） | `smoke/{deviceId}/heartbeat` | 0 |
| 云端→设备（指令下发） | `smoke/{deviceId}/cmd` | 1 |

> `{deviceId}` 为设备唯一编号，格式 `SDS-001`、`SDS-002`...

### 4.2 数据上报报文格式

```json
{
  "deviceId": "SDS-001",
  "smoke": 0.0521,
  "temp": 23.50,
  "humi": 45.20,
  "bat": 85,
  "ts": 1720000000000
}
```

| 字段 | 类型 | 含义 |
|---|---|---|
| deviceId | String | 设备编号 |
| smoke | BigDecimal | 烟雾浓度 mg/m³ |
| temp | BigDecimal | 温度 ℃ |
| humi | BigDecimal | 湿度 %RH |
| bat | Integer | 电池电量 0~100 |
| ts | Long | Unix 毫秒时间戳 |

### 4.3 心跳报文格式

```json
{
  "deviceId": "SDS-001",
  "bat": 85,
  "rssi": -45,
  "ts": 1720000000000
}
```

| 字段 | 类型 | 含义 |
|---|---|---|
| deviceId | String | 设备编号 |
| bat | Integer | 电池电量 0~100 |
| rssi | Integer | 信号强度 dBm（负值，越大越好） |
| ts | Long | Unix 毫秒时间戳 |

---

## 五、模拟器脚本说明 (`scripts/smoke_simulator.py`)

### 5.1 配置

```python
MQTT_BROKER = "192.168.130.101"
MQTT_PORT = 1883
MQTT_USERNAME = "fasong"
MQTT_PASSWORD = "fasong123"

DEVICES = [
    {"device_code": "SDS-001", ...},  # 1栋大厅烟感
    {"device_code": "SDS-002", ...},  # 1栋走廊烟感
    {"device_code": "SDS-003", ...},  # 2栋电梯前室
]
```

### 5.2 运行方式

```bash
E:\Anaconda\python.exe D:\Smart-Smoke-Detection-System\scripts\smoke_simulator.py
```

### 5.3 功能菜单

| 选项 | 功能 | 说明 |
|---|---|---|
| 1 | 正常模式 | 每5秒发数据, 每10秒发心跳 |
| 2 | 告警模式 | 一键发送超标数据 (smoke=0.35, temp=68) |
| 3 | 离线模式 | 停发心跳35秒, 模拟设备掉线 |
| 4 | 指定设备告警 | 自定义烟雾浓度和温度 |
| 5 | 指定设备离线 | 指定设备停止心跳 |

### 5.4 依赖

```bash
pip install paho-mqtt
```

---

## 六、数据链路流程

```
模拟器 (Python) ──MQTT──→ EMQX (192.168.130.101:1883)
                              │
                  MqttConsumer 订阅 smoke/+/data
                               smoke/+/heartbeat
                              │
              ┌───────────────┴───────────────┐
              ↓                               ↓
     topic含/heartbeat                 topic含/data
              ↓                               ↓
     handleHeartbeat()              handleDataReport()
     用 HeartbeatDTO 解析           用 DeviceReportDTO 解析
              ↓                               ↓
     更新 smoke_device:              DTO → SensorData
     - status=ONLINE                 → AlarmRuleEngine.processData()
     - battery                        → 存库 sensor_data
     - signal_strength                → 阈值判定
     - last_heartbeat                 → 超标则触发告警
     - last_online_time
```

---

## 七、数据库中的设备

| id | device_id | device_name | location_building | location_floor |
|---|---|---|---|---|
| 1 | SDS-001 | 1栋大厅烟感 | 1栋 | 1F |
| 2 | SDS-002 | 1栋走廊烟感 | 1栋 | 3F |
| 3 | SDS-003 | 2栋电梯前室 | 2栋 | 5F |

---

## 八、待完成/待优化

1. **告警模式联调** — 跑模拟器选 `2`，验证 `AlarmRuleEngine` 是否正确触发告警（需要 PM 配合）
2. **离线告警** — 模拟器选 `3`，需要 BE2 的 Redis 心跳过期机制就绪后才能验证
3. **MqttPublisher 联调** — 当 PM 触发广播时，`sendCommand()` 下发疏散指令到 `smoke/{deviceId}/cmd`
4. **多设备扩展** — 目前只有 3 台设备，可扩展到更多
5. **模拟器环境变量化** — 把用户名密码改为从环境变量读取，方便团队成员使用
6. **`MqttConsumer` 改动通知 PM** — 原来是一个 `handleMessage()` 统一处理，现在拆成了心跳/数据两个方法

---

## 九、关键账号信息

| 组件 | 地址 | 端口 | 用户名 | 密码 |
|---|---|---|---|---|
| EMQX Dashboard | 192.168.130.101 | 18083 | admin | (EMQX默认) |
| EMQX MQTT | 192.168.130.101 | 1883 | fasong | fasong123 |
| MySQL | 192.168.130.101 | 3306 | root | 123456 |
| Redis | 192.168.130.101 | 6379 | - | 无密码 |

---

## 十、新会话启动检查清单

告诉新会话窗口这些信息：

1. 项目路径: `D:\Smart-Smoke-Detection-System`
2. Python 解释器: `E:\Anaconda\python.exe`
3. 虚拟机 IP: `192.168.130.101`
4. 先启动 EMQX: `docker start emqx` (在 Ubuntu 虚拟机里)
5. 确保 MySQL 和 Redis 在虚拟机里运行
6. 后端在 IDEA 里启动 `SmartSmokeApplication`
7. 模拟器在终端运行: `python smoke_simulator.py`
8. 参考文档: `需求.md`、`框架说明.md`、`docs/api.md`
