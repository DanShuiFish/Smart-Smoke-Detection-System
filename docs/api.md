# Smart Smoke Detection System - API 规范

> **版本**: v1.0 | **最后更新**: 2026-07-02
> **Base URL**: `http://localhost:8080`
> **适用角色**: FE1 (后台管理)、FE2 (数据大屏)

---

## 1. 通用约定

### 1.1 响应格式

所有接口统一返回 ${bt}Result<T>${bt} 结构：

```json
{
  "code": 200,
  "msg": "success",
  "data": { ... },
  "timestamp": 1720000000000
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| code | Integer | 200 成功，4xx 客户端错误，5xx 服务端错误 |
| msg | String | 提示信息 |
| data | T | 响应数据体 |
| timestamp | Long | 服务器时间戳（ms） |

### 1.2 分页格式

分页接口返回 ${bt}Result<PageResult<T>>${bt}：

```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "page": 1,
    "pageSize": 20,
    "total": 42,
    "pages": 3,
    "records": [ ... ]
  }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| page | long | 当前页码 |
| pageSize | long | 每页条数 |
| total | long | 总记录数 |
| pages | long | 总页数 |
| records | List | 当前页数据列表 |

### 1.3 认证

使用 Sa-Token，请求头需携带：

```
Authorization: Bearer {token}
```

登录接口 ${bt}/api/auth/login${bt} 为白名单，无需 token。

---

## 2. 设备管理 API

**Base**: `/api/devices`

### 2.1 获取设备列表

```
GET /api/devices?page=1&size=20&status=ONLINE&building=1号楼
```

| 参数 | 位置 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|---|
| page | query | int | 否 | 1 | 页码 |
| size | query | int | 否 | 20 | 每页条数 |
| status | query | String | 否 | -- | ONLINE/OFFLINE/ERROR/INACTIVE |
| building | query | String | 否 | -- | 按楼栋过滤 |

**响应**: ${bt}Result<PageResult<SmokeDevice>>${bt}

### 2.2 获取设备详情

```
GET /api/devices/{id}
```

| 参数 | 类型 | 说明 |
|---|---|---|
| id | Long | 设备主键 ID |

**响应**: ${bt}Result<SmokeDevice>${bt}

### 2.3 新增设备

```
POST /api/devices
Content-Type: application/json

{
  "deviceId": "SDS-006",
  "deviceName": "5号楼食堂烟感",
  "status": "ONLINE",
  "locationBuilding": "5号楼",
  "locationFloor": "1F"
}
```

**响应**: ${bt}Result<SmokeDevice>${bt}（含生成的 id）

### 2.4 更新设备

```
PUT /api/devices/{id}
Content-Type: application/json

{
  "deviceName": "新名称",
  "status": "OFFLINE"
}
```

**响应**: ${bt}Result<SmokeDevice>${bt}

### 2.5 删除设备

```
DELETE /api/devices/{id}
```

**响应**: ${bt}Result<Void>${bt}（逻辑删除）

---

## 3. 告警管理 API

**Base**: `/api/alarms`

### 3.1 获取告警列表

```
GET /api/alarms?page=1&size=20&status=PENDING
```

| 参数 | 位置 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|---|
| page | query | int | 否 | 1 | 页码 |
| size | query | int | 否 | 20 | 每页条数 |
| status | query | String | 否 | -- | PENDING/CONFIRMING/CONFIRMED/RESOLVED |
| type | query | String | 否 | -- | SMOKE_OVERFLOW/DEVICE_OFFLINE |
| start | query | String | 否 | -- | 起始时间 ISO-8601 |
| end | query | String | 否 | -- | 结束时间 ISO-8601 |

**响应**: ${bt}Result<PageResult<AlarmRecord>>${bt}

### 3.2 获取告警详情

```
GET /api/alarms/{id}
```

**响应**: ${bt}Result<AlarmRecord>${bt}

### 3.3 确认告警

```
PUT /api/alarms/{id}/confirm?userId=1&method=AUTO_VISION
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| userId | query | Long | 是 | 确认人 ID |
| method | query | String | 是 | MANUAL/AUTO_VISION |

**响应**: ${bt}Result<Void>${bt}

### 3.4 处置告警

```
PUT /api/alarms/{id}/resolve
Content-Type: application/json

{
  "resolveUserId": 1,
  "resolveMethod": "ON_SITE",
  "resolveDetail": "现场确认无明火，误报。"
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| resolveUserId | Long | 是 | 处置人 ID |
| resolveMethod | String | 是 | ON_SITE/REMOTE/IGNORE |
| resolveDetail | String | 否 | 处置详情 |

**响应**: ${bt}Result<Void>${bt}

---

## 4. 传感器数据 API

**Base**: `/api/data`

### 4.1 获取设备最新数据

```
GET /api/data/latest/{deviceId}
```

| 参数 | 类型 | 说明 |
|---|---|---|
| deviceId | Long | 设备主键 ID |

**响应**: ${bt}Result<SensorData>${bt}

### 4.2 获取历史数据（折线图）

```
GET /api/data/history/{deviceId}?start=2026-06-01T00:00:00&end=2026-07-02T23:59:59
```

| 参数 | 位置 | 类型 | 必填 | 说明 |
|---|---|---|---|---|
| deviceId | path | Long | 是 | 设备主键 ID |
| start | query | String | 是 | 起始时间 ISO-8601 |
| end | query | String | 是 | 结束时间 ISO-8601 |

**响应**: ${bt}Result<List<SensorData>>${bt}（按 collectTime 升序）

---

## 5. 用户管理 API

**Base**: `/api/users`

### 5.1 获取用户列表

```
GET /api/users?page=1&size=20&role=SYSTEM_ADMIN
```

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| page | int | 否 | 1 | 页码 |
| size | int | 否 | 20 | 每页条数 |
| role | String | 否 | -- | RESIDENT/COMMUNITY_ADMIN/SYSTEM_ADMIN/FIREFIGHTER |

**响应**: ${bt}Result<PageResult<SysUser>>${bt}

### 5.2 获取用户详情

```
GET /api/users/{id}
```

**响应**: ${bt}Result<SysUser>${bt}

### 5.3 新增用户

```
POST /api/users
Content-Type: application/json

{
  "username": "zhangsan",
  "password": "admin123",
  "realName": "张三",
  "phone": "13800138000",
  "role": "RESIDENT"
}
```

**响应**: ${bt}Result<SysUser>${bt}

> password 传明文即可，后端自动 BCrypt 加密。

---

## 6. 数据模型

### 6.1 SmokeDevice

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键自动生成 |
| deviceId | String | 是 | 设备唯一编号 |
| deviceName | String | 否 | 设备名称 |
| deviceModel | String | 否 | 设备型号 |
| status | String | 否 | ONLINE/OFFLINE/ERROR/INACTIVE |
| battery | Integer | 否 | 电量 0~100 |
| locationBuilding | String | 否 | 所在楼栋 |
| locationFloor | String | 否 | 所在楼层 |
| locationRoom | String | 否 | 具体位置 |
| lastHeartbeat | String | 否 | 最后心跳时间 |
| remark | String | 否 | 备注 |

### 6.2 AlarmRecord

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键 |
| deviceId | Long | 是 | 设备ID |
| alarmCode | String | 是 | 告警编号 |
| alarmType | String | 是 | SMOKE_OVERFLOW/DEVICE_OFFLINE |
| alarmLevel | String | 是 | LOW/MEDIUM/HIGH/CRITICAL |
| alarmStatus | String | 否 | 状态机流转 |
| smokeConcentration | BigDecimal | 否 | 触发时浓度 |
| alarmTime | String | 是 | 告警触发时间 |

### 6.3 SensorData

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键 |
| deviceId | Long | 是 | 设备ID |
| smokeConcentration | BigDecimal | 是 | 烟雾浓度 mg/m3 |
| temperature | BigDecimal | 否 | 温度 C |
| humidity | BigDecimal | 否 | 湿度 %RH |
| isAlert | Integer | 否 | 是否触发告警 |
| collectTime | String | 是 | 采集时间 |

### 6.4 SysUser

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | Long | 否 | 主键 |
| username | String | 是 | 登录用户名 |
| password | String | 是 | 登录密码 |
| realName | String | 否 | 真实姓名 |
| phone | String | 否 | 手机号码 |
| role | String | 否 | RESIDENT/COMMUNITY_ADMIN/SYSTEM_ADMIN/FIREFIGHTER |
| status | String | 否 | ENABLED/DISABLED/LOCKED |

---

## 7. 错误码

| code | 含义 | 说明 |
|---|---|---|
| 200 | 成功 | 正常处理 |
| 400 | 参数错误 | 请求参数不合法 |
| 401 | 未认证 | 需登录或 token 过期 |
| 403 | 无权限 | 角色无操作权限 |
| 404 | 资源不存在 | 未找到 |
| 500 | 服务端错误 | 系统内部异常 |

---

## 8. 缺失接口（待实现）

| 资源 | 建议路径 | 优先级 | 说明 |
|---|---|---|---|
| 登录 | POST /api/auth/login | P0 | SaToken 已配置放行 |
| 设备绑定 | GET/POST/DELETE /api/bindings | P1 | device_binding 表已有 |
| 告警阈值配置 | GET/PUT /api/thresholds | P1 | alert_threshold 表已有 |
| AI 复核记录 | GET /api/ai-reviews | P2 | ai_review_record 表已有 |
| 广播记录 | GET /api/broadcasts | P2 | broadcast_record 表已有 |
| 智能问答日志 | GET/POST /api/conversations | P2 | conversation_log 表已有 |

---

> 2026-07-02 v1.0 初始版本
