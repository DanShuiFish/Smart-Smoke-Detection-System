# Smart Smoke Detection System - API 规范

> **版本**: v2.0 | **最后更新**: 2026-07-02
> **Base URL**: `http://localhost:8080`
> **适用角色**: FE1 (后台管理)、FE2 (数据大屏)、BE1 (物联侧)、BE2 (业务侧)、BE3 (AI侧)、PM (技术经理)

---

## 目录

- [1. 通用约定](#1-通用约定)
- [2. WebSocket 实时推送](#2-websocket-实时推送)
- [3. MQTT 物联协议](#3-mqtt-物联协议)
- [4. 认证 API](#4-认证-api)
- [5. 仪表盘 API](#5-仪表盘-api)
- [6. 设备管理 API](#6-设备管理-api)
- [7. 设备绑定 API](#7-设备绑定-api)
- [8. 传感器数据 API](#8-传感器数据-api)
- [9. 告警管理 API](#9-告警管理-api)
- [10. 告警阈值 API](#10-告警阈值-api)
- [11. 用户管理 API](#11-用户管理-api)
- [12. AI 视觉复核 API](#12-ai-视觉复核-api)
- [13. 广播指令 API](#13-广播指令-api)
- [14. 智能问答 API (MaxKB)](#14-智能问答-api-maxkb)
- [15. 系统配置 API](#15-系统配置-api)
- [16. 操作日志 API](#16-操作日志-api)
- [17. 健康检查 API](#17-健康检查-api)
- [18. 完整数据模型](#18-完整数据模型)
- [19. 错误码参考](#19-错误码参考)
- [20. 告警状态机](#20-告警状态机)

---

## 1. 通用约定

### 1.1 API 版本

所有接口路径以 `/api/v1/` 为前缀，为后续真实硬件接入后的接口升级预留空间。

> 当前实现阶段，Controller 中暂用 `/api/` 前缀亦可，但**本文档以后续正式版本 `/api/v1/` 为准**，前端请求时请统一使用 `/api/v1/`。

### 1.2 响应格式

所有接口统一返回 `Result<T>` 结构：

```json
{
  "code": 200,
  "msg": "success",
  "data": {},
  "timestamp": 1720000000000
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| code | Integer | 200 成功，4xx 客户端错误，5xx 服务端错误 |
| msg | String | 提示信息 |
| data | T | 响应数据体（可能为 null） |
| timestamp | Long | 服务器时间戳（ms） |

> **注意**：`data` 中的实体对象**不包含** `password`、`isDeleted` 等敏感/内部字段，后端已通过 `@JsonIgnore` 或 DTO 过滤。

### 1.3 分页格式

分页接口返回 `Result<PageResult<T>>`：

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "page": 1,
    "pageSize": 20,
    "total": 42,
    "pages": 3,
    "records": []
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| page | long | 当前页码（从 1 开始） |
| pageSize | long | 每页条数 |
| total | long | 总记录数 |
| pages | long | 总页数 |
| records | List\<T\> | 当前页数据列表 |

**分页接口通用参数规范**：

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|---|---|---|---|---|
| page | int | 否 | 1 | 页码 |
| pageSize | int | 否 | 20 | 每页条数（最大 100） |

### 1.4 认证

使用 Sa-Token 进行会话管理，除白名单接口外，所有请求需携带 token：

```
Authorization: Bearer {token}
```

**白名单接口（无需登录）**：
- `POST /api/v1/auth/login`

**权限校验**：后端通过 Sa-Token 的 `StpUtil.checkRole()` 或注解 `@SaCheckRole` 进行角色级权限控制。前端应根据当前登录用户的 `role` 字段控制 UI 可见性。

### 1.5 时间格式

所有时间字段统一使用 ISO-8601 格式：`yyyy-MM-dd HH:mm:ss`，时区为 `Asia/Shanghai`。

请求参数中的时间也使用此格式，如：
```
GET /api/v1/alarms?start=2026-06-01 00:00:00&end=2026-07-02 23:59:59
```

### 1.6 HTTP 方法语义

| 方法 | 语义 | 幂等 |
|---|---|---|
| GET | 查询 | ✅ |
| POST | 新增 | ❌ |
| PUT | 全量更新 / 状态变更 | ✅ |
| DELETE | 删除（逻辑删除） | ✅ |

> 项目中统一使用逻辑删除（`is_deleted = 1`），不做物理删除。

---

## 2. WebSocket 实时推送

### 2.1 连接信息

```
URL: ws://localhost:8080/ws/alarm
```

> 模拟期暂不做连接鉴权。正式环境应在连接时携带 `?token=xxx` 并在 `onOpen` 中校验。

### 2.2 推送消息格式

当告警引擎判定火情后，服务端主动向所有已连接的大屏客户端广播 JSON：

```json
{
  "type": "ALARM",
  "alarmId": 1001,
  "deviceId": "SDS-001",
  "deviceName": "1栋大厅烟感",
  "alarmLevel": "CRITICAL",
  "alarmType": "SMOKE_OVERFLOW",
  "smokeConcentration": 5.2000,
  "temperature": 85.50,
  "locationBuilding": "1栋",
  "locationFloor": "1F",
  "locationRoom": "入户大厅",
  "alarmTime": "2026-07-02 14:30:00",
  "message": "⚠️ 严重火警：1栋1F入户大厅检测到烟雾超标！"
}
```

**FE2 收到此消息后应**：大屏对应位置闪烁红色警报，同时播放告警音效。

### 2.3 心跳消息

服务端每 30 秒对所有连接发送心跳：

```json
{ "type": "HEARTBEAT", "timestamp": 1720000000000 }
```

前端若 60 秒内未收到任何消息，应判定连接断开并自动重连。

---

## 3. MQTT 物联协议

> 本节供 BE1 和 PM 参考，定义了设备 ↔ 云端通信的消息格式。线上 Topic 定义在 `application.yml` 中，严禁硬编码。

### 3.1 Topic 约定

| 方向 | Topic 模板 | QoS | 说明 |
|---|---|---|---|
| 设备→云端（数据上报） | `smoke/{deviceId}/data` | 1 | 传感器数据 JSON |
| 设备→云端（心跳） | `smoke/{deviceId}/heartbeat` | 0 | 心跳包 |
| 云端→设备（指令下发） | `smoke/{deviceId}/cmd` | 1 | 广播/疏散指令 |

> `{deviceId}` 为设备唯一编号，如 `SDS-001`。

### 3.2 数据上报报文格式

模拟脚本（BE1）按以下 JSON 格式向 `smoke/{deviceId}/data` 发送：

```json
{
  "deviceId": "SDS-001",
  "smokeConcentration": 0.0521,
  "temperature": 23.50,
  "humidity": 45.20,
  "collectTime": "2026-07-02 14:30:00"
}
```

### 3.3 心跳报文格式

向 `smoke/{deviceId}/heartbeat` 发送：

```json
{
  "deviceId": "SDS-001",
  "battery": 85,
  "signalStrength": -45,
  "timestamp": "2026-07-02 14:30:00"
}
```

### 3.4 指令下发报文格式

后端向 `smoke/{deviceId}/cmd` 下发：

```json
{
  "cmd": "BROADCAST",
  "alarmId": 1001,
  "content": "【紧急疏散】1栋检测到火情，请所有人员立即从安全通道撤离！",
  "timestamp": "2026-07-02 14:30:05"
}
```

---

## 4. 认证 API

**Base**: `/api/v1/auth`

### 4.1 登录

```
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| username | String | 是 | 登录用户名 |
| password | String | 是 | 明文密码（后端 BCrypt 比对） |

**响应**: `Result<LoginVO>`

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "token": "satoken-xxxx-xxxx-xxxx",
    "user": {
      "id": 1,
      "username": "admin",
      "realName": "系统管理员",
      "role": "SYSTEM_ADMIN",
      "phone": "13800138000",
      "email": "admin@smartsmoke.com",
      "avatar": null
    }
  }
}
```

### 4.2 登出

```
POST /api/v1/auth/logout
Authorization: Bearer {token}
```

**响应**: `Result<Void>`

### 4.3 获取当前用户信息

```
GET /api/v1/auth/me
Authorization: Bearer {token}
```

**响应**: `Result<SysUser>`（不含 password 字段）

> 用于前端判断登录态、获取当前用户角色以控制页面权限。

---

## 5. 仪表盘 API

**Base**: `/api/v1/dashboard`

### 5.1 获取首页统计卡片

```
GET /api/v1/dashboard/stats
Authorization: Bearer {token}
```

**响应**: `Result<DashboardStatsVO>`

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "totalDevices": 5,
    "onlineDevices": 4,
    "offlineDevices": 1,
    "errorDevices": 0,
    "todayAlarms": 3,
    "pendingAlarms": 1,
    "confirmedAlarms": 2,
    "resolvedAlarms": 0
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| totalDevices | int | 设备总数 |
| onlineDevices | int | 在线设备数 |
| offlineDevices | int | 离线设备数 |
| errorDevices | int | 故障设备数 |
| todayAlarms | int | 今日告警数 |
| pendingAlarms | int | 待处理告警数 |
| confirmedAlarms | int | 已确认告警数 |
| resolvedAlarms | int | 已处置告警数 |

### 5.2 获取实时大屏数据

```
GET /api/v1/dashboard/realtime?count=10
Authorization: Bearer {token}
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| count | int | 否 | 10 | 获取最新 N 条传感器数据 |

**响应**: `Result<RealtimeVO>`

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "latestData": [ /* SensorData 数组 */ ],
    "activeAlarms": [ /* 当前未解决的 AlarmRecord 数组 */ ],
    "deviceStatusMap": {
      "ONLINE": 4,
      "OFFLINE": 1,
      "ERROR": 0,
      "INACTIVE": 0
    }
  }
}
```

### 5.3 获取告警趋势统计

```
GET /api/v1/dashboard/alarm-stats?period=7
Authorization: Bearer {token}
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| period | int | 否 | 7 | 统计最近 N 天 |

**响应**: `Result<List<AlarmTrendVO>>`

```json
{
  "code": 200,
  "msg": "success",
  "data": [
    { "date": "2026-06-26", "total": 0, "smokeOverflow": 0, "deviceOffline": 0 },
    { "date": "2026-06-27", "total": 1, "smokeOverflow": 1, "deviceOffline": 0 },
    { "date": "2026-07-02", "total": 2, "smokeOverflow": 1, "deviceOffline": 1 }
  ]
}
```

> FE2 大屏使用此接口渲染告警趋势折线图/柱状图。

### 5.4 获取设备位置分布统计

```
GET /api/v1/dashboard/device-stats
Authorization: Bearer {token}
```

**响应**: `Result<List<DeviceStatsVO>>`

```json
{
  "code": 200,
  "msg": "success",
  "data": [
    { "building": "1栋", "total": 3, "online": 3, "offline": 0 },
    { "building": "2栋", "total": 1, "online": 1, "offline": 0 },
    { "building": "3栋", "total": 1, "online": 0, "offline": 1 }
  ]
}
```

---

## 6. 设备管理 API

**Base**: `/api/v1/devices`

### 6.1 获取设备列表

```
GET /api/v1/devices?page=1&pageSize=20&status=ONLINE&building=1栋
```

| 参数 | 位置 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|---|
| page | query | int | 否 | 1 | 页码 |
| pageSize | query | int | 否 | 20 | 每页条数 |
| status | query | String | 否 | -- | ONLINE / OFFLINE / ERROR / INACTIVE |
| building | query | String | 否 | -- | 按楼栋过滤 |
| keyword | query | String | 否 | -- | 设备名称/编号模糊搜索 |

**响应**: `Result<PageResult<SmokeDevice>>`

### 6.2 获取设备详情

```
GET /api/v1/devices/{id}
```

| 参数 | 类型 | 说明 |
|---|---|---|
| id | Long | 设备主键 ID |

**响应**: `Result<SmokeDevice>`

### 6.3 新增设备

```
POST /api/v1/devices
Content-Type: application/json

{
  "deviceId": "SDS-006",
  "deviceName": "5号楼食堂烟感",
  "deviceModel": "Hi3861V100",
  "status": "OFFLINE",
  "locationBuilding": "5号楼",
  "locationFloor": "1F",
  "locationRoom": "食堂后厨",
  "remark": "模拟期测试设备"
}
```

**必填字段**: `deviceId`

**响应**: `Result<SmokeDevice>`（含自动生成的 id 和 createTime）

### 6.4 更新设备

```
PUT /api/v1/devices/{id}
Content-Type: application/json

{
  "deviceName": "新名称",
  "locationRoom": "新位置",
  "status": "OFFLINE",
  "remark": "更新备注"
}
```

> 仅更新传入的非 null 字段。`deviceId` 不可修改。

**响应**: `Result<SmokeDevice>`

### 6.5 删除设备

```
DELETE /api/v1/devices/{id}
```

**响应**: `Result<Void>`（逻辑删除，`is_deleted = 1`）

### 6.6 设备统计

```
GET /api/v1/devices/stats
Authorization: Bearer {token}
```

**响应**: `Result<DeviceStatsVO>`

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "total": 5,
    "online": 4,
    "offline": 1,
    "error": 0,
    "inactive": 0,
    "avgBattery": 76
  }
}
```

---

## 7. 设备绑定 API

**Base**: `/api/v1/bindings`

### 7.1 获取绑定列表

```
GET /api/v1/bindings?userId=1&deviceId=1&status=BOUND&page=1&pageSize=20
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| userId | Long | 否 | -- | 按用户过滤 |
| deviceId | Long | 否 | -- | 按设备过滤 |
| status | String | 否 | -- | BOUND / UNBOUND |
| page | int | 否 | 1 | 页码 |
| pageSize | int | 否 | 20 | 每页条数 |

**响应**: `Result<PageResult<DeviceBindingVO>>`

> `DeviceBindingVO` 中包含关联的 `deviceName` 和 `userRealName`（JOIN 查询结果）。

### 7.2 新增绑定

```
POST /api/v1/bindings
Content-Type: application/json

{
  "deviceId": 1,
  "userId": 3,
  "bindType": "ADMIN",
  "remark": "小区管理员负责此设备"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| deviceId | Long | 是 | 设备主键 ID |
| userId | Long | 是 | 用户主键 ID |
| bindType | String | 否 | OWNER(默认) / ADMIN / VIEWER |
| remark | String | 否 | 备注 |

**响应**: `Result<DeviceBinding>`

### 7.3 解绑

```
PUT /api/v1/bindings/{id}/unbind
Content-Type: application/json

{
  "remark": "用户已搬离"
}
```

**响应**: `Result<Void>`（设置 `status = UNBOUND`，记录 `unbindTime`，保留历史）

---

## 8. 传感器数据 API

**Base**: `/api/v1/data`

### 8.1 获取设备最新数据

```
GET /api/v1/data/latest/{deviceId}
```

| 参数 | 类型 | 说明 |
|---|---|---|
| deviceId | Long | 设备主键 ID |

**响应**: `Result<SensorData>`

### 8.2 获取历史数据（折线图）

```
GET /api/v1/data/history/{deviceId}?start=2026-06-01 00:00:00&end=2026-07-02 23:59:59&page=1&pageSize=500&interval=5m
```

| 参数 | 位置 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|---|
| deviceId | path | Long | 是 | -- | 设备主键 ID |
| start | query | String | 是 | -- | 起始时间 ISO-8601 |
| end | query | String | 是 | -- | 结束时间 ISO-8601 |
| page | query | int | 否 | 1 | 页码 |
| pageSize | query | int | 否 | 500 | 每页条数（最大 2000） |
| interval | query | String | 否 | -- | 聚合间隔：`1m`/`5m`/`15m`/`1h`/`1d`，为空则返回原始数据 |

> 当指定 `interval` 时，后端按间隔聚合（计算该时间段内的平均值），减少前端渲染压力。

**响应**: `Result<PageResult<SensorData>>`

---

## 9. 告警管理 API

**Base**: `/api/v1/alarms`

### 9.1 获取告警列表

```
GET /api/v1/alarms?page=1&pageSize=20&status=PENDING&type=SMOKE_OVERFLOW&level=HIGH&start=2026-06-01 00:00:00&end=2026-07-02 23:59:59
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| page | int | 否 | 1 | 页码 |
| pageSize | int | 否 | 20 | 每页条数 |
| status | String | 否 | -- | PENDING / CONFIRMING / CONFIRMED / RESOLVED / ARCHIVED / CLOSED |
| type | String | 否 | -- | SMOKE_OVERFLOW / DEVICE_OFFLINE / DEVICE_ERROR |
| level | String | 否 | -- | LOW / MEDIUM / HIGH / CRITICAL |
| deviceId | Long | 否 | -- | 按设备过滤 |
| start | String | 否 | -- | 起始时间 |
| end | String | 否 | -- | 结束时间 |

**响应**: `Result<PageResult<AlarmRecord>>`

### 9.2 获取告警详情

```
GET /api/v1/alarms/{id}
```

**响应**: `Result<AlarmRecord>`（包含所有状态字段和关联的 AI 复核记录）

> 响应中额外包含 `aiReview: AiReviewRecord` 字段（如已进行 AI 复核）。

### 9.3 确认告警

```
PUT /api/v1/alarms/{id}/confirm
Content-Type: application/json

{
  "confirmMethod": "AUTO_VISION"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| confirmMethod | String | 是 | MANUAL(人工确认) / AUTO_VISION(AI视觉自动确认) |

> 确认人 ID 从当前登录 Session 中获取，无需前端传递。

**状态流转**: `PENDING` / `CONFIRMING` → `CONFIRMED`

**响应**: `Result<Void>`

### 9.4 处置告警

```
PUT /api/v1/alarms/{id}/resolve
Content-Type: application/json

{
  "resolveMethod": "ON_SITE",
  "resolveDetail": "现场确认无明火，厨房油烟导致误报。已复位设备。"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| resolveMethod | String | 是 | ON_SITE(现场处置) / REMOTE(远程处置) / IGNORE(确认误报) |
| resolveDetail | String | 否 | 处置详情描述 |

> 处置人 ID 从当前登录 Session 中获取。

**状态流转**: `CONFIRMED` → `RESOLVED`

**响应**: `Result<Void>`

### 9.5 归档告警

```
PUT /api/v1/alarms/{id}/archive
```

**状态流转**: `RESOLVED` → `ARCHIVED`

**响应**: `Result<Void>`

### 9.6 关闭告警

```
PUT /api/v1/alarms/{id}/close
Content-Type: application/json

{
  "remark": "过期告警关闭"
}
```

**状态流转**: 任意非终态 → `CLOSED`

**响应**: `Result<Void>`

---

## 10. 告警阈值 API

**Base**: `/api/v1/thresholds`

### 10.1 获取阈值列表

```
GET /api/v1/thresholds?deviceId=1&type=SMOKE_CONCENTRATION&status=ENABLED
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| deviceId | Long | 否 | -- | NULL 查全局默认，指定值查设备个性化阈值 |
| type | String | 否 | -- | SMOKE_CONCENTRATION / TEMPERATURE |
| status | String | 否 | ENABLED | ENABLED / DISABLED |

**响应**: `Result<List<AlertThreshold>>`

### 10.2 新增阈值（全局默认）

```
POST /api/v1/thresholds
Content-Type: application/json

{
  "thresholdType": "SMOKE_CONCENTRATION",
  "alarmLevel": "LOW",
  "thresholdMin": 0.5,
  "thresholdMax": 1.0,
  "durationSeconds": 10,
  "isDefault": true,
  "status": "ENABLED",
  "remark": "轻度烟雾阈值"
}
```

> 当 `deviceId` 为 null 且 `isDefault` 为 true，表示为全局默认阈值。

**响应**: `Result<AlertThreshold>`

### 10.3 新增阈值（设备个性化）

```
POST /api/v1/thresholds
Content-Type: application/json

{
  "deviceId": 1,
  "thresholdType": "SMOKE_CONCENTRATION",
  "alarmLevel": "HIGH",
  "thresholdMin": 1.5,
  "thresholdMax": 3.0,
  "durationSeconds": 3,
  "isDefault": false,
  "status": "ENABLED",
  "remark": "1栋大厅烟感专用阈值——厨房附近，放宽标准"
}
```

> 设备个性化阈值优先级高于全局默认阈值。规则引擎判定时优先匹配 `device_id` 非 NULL 的规则。

**响应**: `Result<AlertThreshold>`

### 10.4 更新阈值

```
PUT /api/v1/thresholds/{id}
Content-Type: application/json

{
  "thresholdMax": 1.2000,
  "durationSeconds": 8,
  "status": "ENABLED"
}
```

> 仅更新传入的非 null 字段。

**响应**: `Result<AlertThreshold>`

### 10.5 删除阈值

```
DELETE /api/v1/thresholds/{id}
```

**响应**: `Result<Void>`（逻辑删除）

---

## 11. 用户管理 API

**Base**: `/api/v1/users`

### 11.1 获取用户列表

```
GET /api/v1/users?page=1&pageSize=20&role=RESIDENT&status=ENABLED&keyword=张三
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| page | int | 否 | 1 | 页码 |
| pageSize | int | 否 | 20 | 每页条数 |
| role | String | 否 | -- | RESIDENT / COMMUNITY_ADMIN / SYSTEM_ADMIN / FIREFIGHTER |
| status | String | 否 | -- | ENABLED / DISABLED / LOCKED |
| keyword | String | 否 | -- | 用户名/姓名/手机号模糊搜索 |

**响应**: `Result<PageResult<SysUser>>`（password 字段已脱敏，不返回）

### 11.2 获取用户详情

```
GET /api/v1/users/{id}
```

**响应**: `Result<SysUser>`（password 字段已脱敏）

### 11.3 新增用户

```
POST /api/v1/users
Content-Type: application/json

{
  "username": "zhangsan",
  "password": "admin123",
  "realName": "张三",
  "phone": "13800138000",
  "email": "zhangsan@example.com",
  "role": "RESIDENT",
  "status": "ENABLED"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| username | String | 是 | 登录用户名（唯一） |
| password | String | 是 | 明文密码（后端自动 BCrypt 加密存储） |
| realName | String | 否 | 真实姓名 |
| phone | String | 否 | 手机号码 |
| email | String | 否 | 电子邮箱 |
| role | String | 否 | RESIDENT(默认) / COMMUNITY_ADMIN / SYSTEM_ADMIN / FIREFIGHTER |
| status | String | 否 | ENABLED(默认) / DISABLED |

**响应**: `Result<SysUser>`（含生成的 id）

### 11.4 更新用户

```
PUT /api/v1/users/{id}
Content-Type: application/json

{
  "realName": "张三（更新）",
  "phone": "13900139000",
  "role": "COMMUNITY_ADMIN",
  "status": "DISABLED"
}
```

> 仅更新传入的非 null 字段。`username` 不可修改。

**响应**: `Result<SysUser>`

### 11.5 删除用户

```
DELETE /api/v1/users/{id}
```

**响应**: `Result<Void>`（逻辑删除）

### 11.6 修改密码

```
PUT /api/v1/users/{id}/password
Content-Type: application/json

{
  "oldPassword": "admin123",
  "newPassword": "newPassword456"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| oldPassword | String | 是 | 旧密码（用于验证身份） |
| newPassword | String | 是 | 新密码（至少 6 位） |

**响应**: `Result<Void>`

> 管理员重置他人密码时 `oldPassword` 为空或不校验。具体行为由 `role` 权限决定。

### 11.7 重置密码（管理员专用）

```
PUT /api/v1/users/{id}/reset-password
Content-Type: application/json

{
  "newPassword": "reset123"
}
```

> 仅 SYSTEM_ADMIN / COMMUNITY_ADMIN 角色可调用。无需旧密码。

**响应**: `Result<Void>`

---

## 12. AI 视觉复核 API

**Base**: `/api/v1/ai-reviews`

### 12.1 获取 AI 复核记录列表

```
GET /api/v1/ai-reviews?alarmId=1&deviceId=1&result=FIRE_CONFIRMED&page=1&pageSize=20
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| alarmId | Long | 否 | -- | 按告警 ID 过滤 |
| deviceId | Long | 否 | -- | 按设备 ID 过滤 |
| result | String | 否 | -- | FIRE_CONFIRMED / NO_FIRE / UNCERTAIN |
| page | int | 否 | 1 | 页码 |
| pageSize | int | 否 | 20 | 每页条数 |

**响应**: `Result<PageResult<AiReviewRecord>>`

### 12.2 获取 AI 复核详情

```
GET /api/v1/ai-reviews/{id}
```

**响应**: `Result<AiReviewRecord>`（包含 `aiRawResponse` 原始 AI 返回）

### 12.3 人工复核确认

```
PUT /api/v1/ai-reviews/{id}/manual-confirm
Content-Type: application/json

{
  "manualReviewResult": "CONFIRMED",
  "remark": "人工看监控确认是明火"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| manualReviewResult | String | 是 | CONFIRMED(确认AI判断正确) / DISMISSED(驳回AI判断) |
| remark | String | 否 | 人工复核备注 |

> 复核人从当前登录 Session 中获取。

**响应**: `Result<Void>`

---

## 13. 广播指令 API

**Base**: `/api/v1/broadcasts`

### 13.1 获取广播记录列表

```
GET /api/v1/broadcasts?alarmId=1&deviceId=1&status=SENT&page=1&pageSize=20
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| alarmId | Long | 否 | -- | 按告警 ID 过滤 |
| deviceId | Long | 否 | -- | 按设备 ID 过滤 |
| status | String | 否 | -- | PENDING / SENDING / SENT / DELIVERED / FAILED |
| type | String | 否 | -- | EMERGENCY / NOTIFICATION / TEST |
| page | int | 否 | 1 | 页码 |
| pageSize | int | 否 | 20 | 每页条数 |

**响应**: `Result<PageResult<BroadcastRecord>>`

### 13.2 获取广播详情

```
GET /api/v1/broadcasts/{id}
```

**响应**: `Result<BroadcastRecord>`

### 13.3 手动触发广播（发送疏散指令）

```
POST /api/v1/broadcasts
Content-Type: application/json

{
  "alarmId": 1,
  "deviceId": 1,
  "broadcastArea": "1栋所有楼层",
  "broadcastContent": "【紧急疏散】1栋检测到火情，请所有人员立即从安全通道撤离！",
  "broadcastType": "EMERGENCY",
  "triggerMode": "MANUAL"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| alarmId | Long | 是 | 关联告警 ID |
| deviceId | Long | 是 | 触发设备 ID |
| broadcastArea | String | 否 | 广播区域描述（如 "1栋所有楼层"） |
| broadcastContent | String | 是 | 广播内容文本 |
| broadcastType | String | 否 | EMERGENCY(默认) / NOTIFICATION / TEST |
| triggerMode | String | 否 | MANUAL(手动, 默认) / AUTO(自动, 规则引擎触发) |

> 后端收到请求后：1) 写入 broadcast_record 表；2) 调用 `MqttPublisher.sendCommand()` 下发指令到对应设备 Topic。

**响应**: `Result<BroadcastRecord>`（含 sendStatus 和 mqttTopic）

---

## 14. 智能问答 API (MaxKB)

**Base**: `/api/v1/conversations`

> 本节是 BE3 的核心接口。后端封装 MaxKB 对话 API，前端无需直接调用 MaxKB。

### 14.1 发起对话（提问）

```
POST /api/v1/conversations
Content-Type: application/json

{
  "sessionId": "sess-abc-123",
  "alarmId": 1,
  "question": "1栋大厅烟雾超标了，请告诉我该区域的消防预案是什么？"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| sessionId | String | 是 | 会话 ID（前端用 UUID 生成，同一轮对话保持一致） |
| alarmId | Long | 否 | 关联告警 ID（可选，用于关联告警上下文） |
| question | String | 是 | 用户提问内容 |

**响应**: `Result<ConversationVO>`

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "id": 1,
    "sessionId": "sess-abc-123",
    "question": "1栋大厅烟雾超标了，请告诉我该区域的消防预案是什么？",
    "answer": "根据消防应急知识库，1栋大厅区域属于A类防火分区。预案如下：\n1. 立即通知值班保安确认现场\n2. 如确认火情，启动楼层声光报警\n3. 通过广播引导人员从1号、2号安全通道疏散\n4. 拨打119并报告具体位置和火势情况",
    "sourceType": "RAG",
    "knowledgeRefs": [
      { "docName": "1栋消防应急预案.pdf", "chunk": "第3章-大厅区域处置流程" }
    ],
    "aiProcessingMs": 1250,
    "createTime": "2026-07-02 14:35:00"
  }
}
```

> 后端调用 MaxKB 的 `/api/application/chat` 接口，传入消防知识库 ID 和用户问题，获取 RAG 回答后返回。

### 14.2 获取对话历史

```
GET /api/v1/conversations?sessionId=sess-abc-123&userId=1&alarmId=1&page=1&pageSize=20
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| sessionId | String | 否 | -- | 按会话过滤（查某轮对话的全部 Q&A） |
| userId | Long | 否 | -- | 按用户过滤 |
| alarmId | Long | 否 | -- | 按关联告警过滤 |
| page | int | 否 | 1 | 页码 |
| pageSize | int | 否 | 20 | 每页条数 |

**响应**: `Result<PageResult<ConversationLog>>`

### 14.3 评价回答

```
PUT /api/v1/conversations/{id}/rate
Content-Type: application/json

{
  "userRating": 5
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| userRating | int | 是 | 评分 1~5，5 为最佳 |

**响应**: `Result<Void>`

---

## 15. 系统配置 API

**Base**: `/api/v1/configs`

### 15.1 获取配置列表

```
GET /api/v1/configs?group=ALERT
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| group | String | 否 | -- | 配置分组：DEVICE / ALERT / DATA / MOCK / MQTT / SYSTEM |

**响应**: `Result<List<SystemConfig>>`

### 15.2 更新配置值

```
PUT /api/v1/configs/{id}
Content-Type: application/json

{
  "configValue": "60",
  "description": "心跳超时改为60秒"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| configValue | String | 是 | 新的配置值 |
| description | String | 否 | 更新配置说明 |

**响应**: `Result<SystemConfig>`

---

## 16. 操作日志 API

**Base**: `/api/v1/operation-logs`

### 16.1 查询操作日志

```
GET /api/v1/operation-logs?userId=1&type=LOGIN&target=SDS-001&start=2026-06-01 00:00:00&end=2026-07-02 23:59:59&page=1&pageSize=20
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| userId | Long | 否 | -- | 按操作用户过滤 |
| type | String | 否 | -- | 操作类型：LOGIN / DEVICE_BIND / ALARM_CONFIRM / ALARM_RESOLVE / BROADCAST_SEND / THRESHOLD_CONFIG / SYSTEM_CONFIG |
| target | String | 否 | -- | 操作对象标识 |
| start | String | 否 | -- | 起始时间 |
| end | String | 否 | -- | 结束时间 |
| page | int | 否 | 1 | 页码 |
| pageSize | int | 否 | 20 | 每页条数 |

**响应**: `Result<PageResult<OperationLog>>`

> 操作日志为只读，由后端在关键操作时自动写入。不需要手动新增 API。

---

## 17. 健康检查 API

### 17.1 服务健康检查

```
GET /api/v1/health
```

> 白名单接口，无需登录。

**响应**: `Result<HealthVO>`

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "status": "UP",
    "timestamp": "2026-07-02 14:30:00",
    "components": {
      "mysql": "UP",
      "redis": "UP",
      "mqtt": "UP"
    }
  }
}
```

> FE 可在应用启动时调用此接口确认后端可用。大屏可定时调用检测连接状态。

---

## 18. 完整数据模型

### 18.1 SmokeDevice（烟感设备）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键，自动生成 |
| deviceId | String | 是 | 设备唯一编号（与硬件烧录 ID 一致，如 SDS-001） |
| deviceName | String | 否 | 设备名称 |
| deviceModel | String | 否 | 设备型号（如 Hi3861V100） |
| deviceSecret | String | 否 | 设备密钥（接入认证用，**不返回给前端**） |
| firmwareVersion | String | 否 | 固件版本号 |
| status | String | 否 | ONLINE / OFFLINE / ERROR / INACTIVE |
| battery | Integer | 否 | 电池电量 0~100 |
| signalStrength | Integer | 否 | 信号强度 RSSI (dBm) |
| locationBuilding | String | 否 | 所在楼栋 |
| locationFloor | String | 否 | 所在楼层 |
| locationRoom | String | 否 | 具体位置描述 |
| locationLat | BigDecimal | 否 | GPS 纬度 |
| locationLng | BigDecimal | 否 | GPS 经度 |
| extraAttrs | JSON | 否 | 扩展属性 |
| installDate | String | 否 | 安装日期 |
| lastOnlineTime | String | 否 | 最后上线时间 |
| lastOfflineTime | String | 否 | 最后离线时间 |
| lastHeartbeat | String | 否 | 最后心跳时间 |
| heartbeatTimeout | Integer | 否 | 心跳超时阈值（秒），默认 30 |
| remark | String | 否 | 备注 |

### 18.2 AlarmRecord（告警记录）— 完整字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键 |
| deviceId | Long | 是 | 设备 ID（关联 smoke_device.id） |
| sensorDataId | Long | 否 | 触发告警的传感器数据 ID |
| alarmCode | String | 是 | 告警编号（业务唯一标识，如 ALG-20260702-001） |
| alarmType | String | 是 | SMOKE_OVERFLOW / DEVICE_OFFLINE / DEVICE_ERROR |
| alarmLevel | String | 是 | LOW / MEDIUM / HIGH / CRITICAL |
| alarmStatus | String | 否 | PENDING → CONFIRMING → CONFIRMED → RESOLVED → ARCHIVED ─→ CLOSED |
| smokeConcentration | BigDecimal | 否 | 触发时的烟雾浓度 mg/m³ |
| thresholdValue | BigDecimal | 否 | 触发时的阈值 |
| alarmTime | String | 是 | 告警触发时间 |
| confirmTime | String | 否 | 确认时间 |
| confirmUserId | Long | 否 | 确认人 ID |
| confirmMethod | String | 否 | MANUAL / AUTO_VISION |
| resolveTime | String | 否 | 处置时间 |
| resolveUserId | Long | 否 | 处置人 ID |
| resolveMethod | String | 否 | ON_SITE / REMOTE / IGNORE |
| resolveDetail | String | 否 | 处置详情 |
| isVisionReviewed | Integer | 否 | 是否已 AI 视觉复核（0/1） |
| isBroadcastSent | Integer | 否 | 是否已下发广播（0/1） |
| alarmExt | JSON | 否 | 扩展字段 |
| remark | String | 否 | 备注 |
| createTime | String | 否 | 创建时间 |

### 18.3 SensorData（传感器数据）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键 |
| deviceId | Long | 是 | 设备 ID |
| smokeConcentration | BigDecimal | 是 | 烟雾浓度 mg/m³ |
| temperature | BigDecimal | 否 | 温度 ℃ |
| humidity | BigDecimal | 否 | 湿度 %RH |
| unit | String | 否 | 浓度单位（默认 mg/m³） |
| isAlert | Integer | 否 | 是否触发告警（0/1） |
| extraData | JSON | 否 | 扩展数据 |
| collectTime | String | 是 | 数据采集时间（设备端时间） |
| createTime | String | 否 | 入库时间（服务端时间） |

### 18.4 SysUser（系统用户）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键 |
| username | String | 是 | 登录用户名 |
| password | String | 是 | 登录密码（BCrypt 加密，**API 响应中永远不返回**） |
| realName | String | 否 | 真实姓名 |
| phone | String | 否 | 手机号码 |
| email | String | 否 | 电子邮箱 |
| avatar | String | 否 | 头像 URL |
| role | String | 否 | RESIDENT / COMMUNITY_ADMIN / SYSTEM_ADMIN / FIREFIGHTER |
| status | String | 否 | ENABLED / DISABLED / LOCKED |
| userExt | JSON | 否 | 扩展字段 |
| lastLoginIp | String | 否 | 最后登录 IP |
| lastLoginTime | String | 否 | 最后登录时间 |
| loginCount | Integer | 否 | 累计登录次数 |
| createTime | String | 否 | 创建时间 |

### 18.5 AlertThreshold（告警阈值）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键 |
| deviceId | Long | 否 | 设备 ID（NULL=全局默认，非NULL=设备个性化） |
| thresholdType | String | 是 | SMOKE_CONCENTRATION / TEMPERATURE |
| alarmLevel | String | 否 | LOW / MEDIUM / HIGH / CRITICAL |
| thresholdMin | BigDecimal | 否 | 阈值下限 |
| thresholdMax | BigDecimal | 是 | 阈值上限 |
| durationSeconds | Integer | 否 | 持续秒数（防抖，0 为立即触发） |
| effectiveStart | String | 否 | 生效时段-开始（HH:mm:ss） |
| effectiveEnd | String | 否 | 生效时段-结束（HH:mm:ss） |
| silentPeriod | Integer | 否 | 告警静默期（秒），默认 300 |
| isDefault | Integer | 否 | 是否为全局默认（0/1） |
| status | String | 否 | ENABLED / DISABLED |
| sortOrder | Integer | 否 | 排序号 |
| remark | String | 否 | 备注 |

### 18.6 DeviceBinding（设备绑定）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键 |
| deviceId | Long | 是 | 设备 ID |
| userId | Long | 是 | 用户 ID |
| bindType | String | 否 | OWNER / ADMIN / VIEWER |
| bindTime | String | 否 | 绑定时间 |
| unbindTime | String | 否 | 解绑时间 |
| status | String | 否 | BOUND / UNBOUND |
| remark | String | 否 | 备注 |

### 18.7 AiReviewRecord（AI 视觉复核记录）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键 |
| alarmId | Long | 是 | 关联告警 ID |
| deviceId | Long | 是 | 设备 ID（冗余） |
| imageUrl | String | 否 | 摄像头画面/图片 URL |
| cameraId | String | 否 | 摄像头编号 |
| reviewType | String | 否 | SMOKE_FIRE（烟雾明火检测） |
| reviewResult | String | 否 | FIRE_CONFIRMED / NO_FIRE / UNCERTAIN |
| confidence | BigDecimal | 否 | AI 置信度 0.00~100.00 |
| isManualReview | Integer | 否 | 是否人工复核确认（0/1） |
| manualReviewUserId | Long | 否 | 人工复核人 ID |
| manualReviewResult | String | 否 | CONFIRMED / DISMISSED |
| aiRawResponse | String | 否 | AI 原始返回 JSON |
| processingTimeMs | Integer | 否 | AI 处理耗时（毫秒） |
| createTime | String | 否 | 创建时间 |

### 18.8 BroadcastRecord（广播指令记录）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键 |
| alarmId | Long | 是 | 关联告警 ID |
| deviceId | Long | 是 | 设备 ID（冗余） |
| broadcastArea | String | 否 | 广播区域描述 |
| broadcastContent | String | 是 | 广播内容 |
| broadcastType | String | 否 | EMERGENCY / NOTIFICATION / TEST |
| sendStatus | String | 否 | PENDING / SENDING / SENT / DELIVERED / FAILED |
| sendTime | String | 否 | 发送时间 |
| deliverTime | String | 否 | 送达时间 |
| failureReason | String | 否 | 失败原因 |
| mqttTopic | String | 否 | MQTT 下发 Topic |
| mqttMessageId | String | 否 | MQTT 消息 ID |
| retryCount | Integer | 否 | 重试次数 |
| triggerMode | String | 否 | AUTO / MANUAL |
| triggerUserId | Long | 否 | 触发人 ID |
| createTime | String | 否 | 创建时间 |

### 18.9 ConversationLog（智能问答日志）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键 |
| userId | Long | 是 | 提问用户 ID |
| alarmId | Long | 否 | 关联告警 ID |
| sessionId | String | 是 | 会话 ID（同一轮对话共享） |
| question | String | 是 | 用户提问 |
| answer | String | 否 | AI 回答 |
| sourceType | String | 否 | RAG / LLM / HYBRID |
| knowledgeRefs | JSON | 否 | 引用的知识片段列表 |
| aiProcessingMs | Integer | 否 | AI 处理耗时（毫秒） |
| userRating | Integer | 否 | 用户评分 1~5（NULL=未评） |
| createTime | String | 否 | 提问时间 |

### 18.10 SystemConfig（系统配置）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键 |
| configKey | String | 是 | 配置键（唯一标识） |
| configValue | String | 否 | 配置值（全部以字符串存储） |
| configGroup | String | 否 | 配置分组：DEVICE / ALERT / DATA / MOCK / MQTT / SYSTEM |
| description | String | 否 | 配置说明 |
| sortOrder | Integer | 否 | 排序号 |
| createTime | String | 否 | 创建时间 |
| updateTime | String | 否 | 更新时间 |

### 18.11 OperationLog（操作审计日志）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键 |
| userId | Long | 否 | 操作用户 ID |
| username | String | 否 | 用户名（冗余，用户删除后仍可追溯） |
| operationType | String | 是 | LOGIN / DEVICE_BIND / ALARM_CONFIRM / ALARM_RESOLVE / BROADCAST_SEND / THRESHOLD_CONFIG / SYSTEM_CONFIG |
| operationTarget | String | 否 | 操作对象标识 |
| operationDetail | String | 否 | 操作详情 |
| requestIp | String | 否 | 请求 IP |
| requestUrl | String | 否 | 请求 URL |
| requestMethod | String | 否 | HTTP 方法 |
| resultCode | String | 否 | SUCCESS / FAILED |
| errorMessage | String | 否 | 错误信息 |
| executionTimeMs | Integer | 否 | 执行耗时（毫秒） |
| userAgent | String | 否 | 用户代理 |
| createTime | String | 否 | 操作时间 |

---

## 19. 错误码参考

| code | 含义 | 说明 | 前端处理建议 |
|---|---|---|---|
| 200 | 成功 | 正常处理 | 正常展示 |
| 400 | 参数错误 | 请求参数不合法（如必填字段缺失、格式错误） | 提示用户检查输入 |
| 401 | 未认证 | 未登录或 token 已过期 | 跳转登录页 |
| 403 | 无权限 | 当前角色无此操作权限 | 提示"无权限" |
| 404 | 资源不存在 | 目标数据未找到或已删除 | 提示"资源不存在" |
| 409 | 冲突 | 数据已存在（如用户名重复、设备编号重复） | 提示用户修改 |
| 500 | 服务端错误 | 系统内部异常 | 提示"系统繁忙，请稍后重试" |

**通用错误响应格式**：

```json
{
  "code": 400,
  "msg": "设备编号已存在: SDS-001",
  "data": null,
  "timestamp": 1720000000000
}
```

---

## 20. 告警状态机

```
                         ┌─────────┐
                         │ PENDING │  ← 规则引擎判定触发
                         └────┬────┘
                              │ 确认告警 (confirm)
                              ▼
                      ┌──────────────┐
                      │  CONFIRMING  │  ← (可选中间态，AI 复核中)
                      └──────┬───────┘
                             │ AI 复核完成 / 人工确认
                             ▼
                      ┌──────────────┐
                      │  CONFIRMED   │  ← 火情已确认
                      └──────┬───────┘
                             │ 处置完成 (resolve)
                             ▼
                      ┌──────────────┐
                      │  RESOLVED    │  ← 火情已处置
                      └──────┬───────┘
                             │ 归档 (archive)
                             ▼
                      ┌──────────────┐
                      │  ARCHIVED    │  ← 已归档（终态）
                      └──────────────┘

    任意非终态 ── (close) ──→  CLOSED  ← 直接关闭（终态）
```

| 状态 | 含义 | 可流转至 |
|---|---|---|
| PENDING | 待处理（刚触发，未确认） | CONFIRMING, CONFIRMED, CLOSED |
| CONFIRMING | 确认中（AI 视觉复核进行中） | CONFIRMED, CLOSED |
| CONFIRMED | 已确认（火情确认属实） | RESOLVED, CLOSED |
| RESOLVED | 已处置（现场处理完毕） | ARCHIVED, CLOSED |
| ARCHIVED | 已归档（终态，历史追溯） | (不可流转) |
| CLOSED | 已关闭（终态，可直接从任意非终态关闭） | (不可流转) |

---

## 附录 A. 角色与权限矩阵

| API 模块 | RESIDENT (居民) | COMMUNITY_ADMIN (小区管理员) | SYSTEM_ADMIN (系统管理员) | FIREFIGHTER (消防员) |
|---|---|---|---|---|
| 仪表盘 | 仅看自己绑定的设备 | 看管辖范围内所有 | 看全部 | 看全部 |
| 设备管理 | 查看已绑定 | 增删改查管辖范围 | 全量增删改查 | 查看全部 |
| 设备绑定 | 仅自己 | 管辖范围内 | 全部 | 查看 |
| 传感器数据 | 已绑定设备 | 管辖范围 | 全部 | 全部 |
| 告警管理 | 仅已绑定 | 管辖范围确认/处置 | 全部操作 | 确认/处置 |
| 告警阈值 | 不可见 | 查看 | 全局配置 | 查看 |
| 用户管理 | 仅自己 | 管辖范围 | 全量管理 | 查看 |
| AI 复核 | 查看 | 查看 + 人工确认 | 查看 + 人工确认 | 查看 |
| 广播指令 | 不可见 | 手动触发 + 查看 | 手动触发 + 查看 | 手动触发 |
| 智能问答 | ✅ | ✅ | ✅ | ✅ |
| 系统配置 | 不可见 | 查看 | 全量管理 | 不可见 |
| 操作日志 | 不可见 | 查看管辖范围 | 全量查看 | 不可见 |

---

## 附录 B. 前端 API 对接速查表

| 前端页面 | 调用的 API |
|---|---|
| 登录页 | `POST /api/v1/auth/login` |
| 首页/仪表盘 | `GET /api/v1/dashboard/stats` |
| 大屏总览 | `GET /api/v1/dashboard/realtime` + `WebSocket /ws/alarm` |
| 大屏趋势图 | `GET /api/v1/dashboard/alarm-stats` |
| 大屏设备分布 | `GET /api/v1/dashboard/device-stats` |
| 设备管理页 | `GET/POST/PUT/DELETE /api/v1/devices` |
| 设备绑定页 | `GET/POST /api/v1/bindings` |
| 数据历史折线图 | `GET /api/v1/data/history/{deviceId}` |
| 告警日志列表 | `GET /api/v1/alarms` |
| 告警详情/处置 | `GET/PUT /api/v1/alarms/{id}/resolve` |
| 阈值配置页 | `GET/POST/PUT/DELETE /api/v1/thresholds` |
| 用户管理页 | `GET/POST/PUT/DELETE /api/v1/users` |
| AI复核记录 | `GET /api/v1/ai-reviews` + `PUT .../manual-confirm` |
| 广播管理 | `GET/POST /api/v1/broadcasts` |
| 智能问答聊天框 | `POST/GET /api/v1/conversations` |
| 系统配置页 | `GET/PUT /api/v1/configs` |
| 操作审计日志 | `GET /api/v1/operation-logs` |

---

## 附录 C. 修订记录

| 版本 | 日期 | 修订内容 |
|---|---|---|
| v1.0 | 2026-07-02 | 初始版本，覆盖设备/告警/数据/用户基础 CRUD |
| v2.0 | 2026-07-02 | **全面重构**：补全认证、仪表盘、绑定、阈值、AI复核、广播、智能问答、系统配置、操作日志、健康检查等全部接口；完善全部 11 张数据模型定义；新增告警状态机、角色权限矩阵、前端对接速查表、WebSocket 协议、MQTT 物联协议；修复数据模型字段遗漏问题 |

---

> **本文档为前端 (FE1/FE2) 和后端 (BE1/BE2/BE3/PM) 之间的唯一 API 契约。**
> 任何接口的增删改必须同步更新本文档，并经 PM 确认。
> 模拟期阶段，Controller 中暂可沿用 `/api/` 前缀，但前端统一按本文档的 `/api/v1/` 调用。
