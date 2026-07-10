# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概要

智慧烟感预警系统 — Spring Boot 3.2 + Vue 3 全栈 AIoT 项目。模拟烟感设备通过 MQTT 上报数据，后端规则引擎判定火情，触发 AI 视觉复核 + WebSocket 告警推送 + 广播疏散指令。

## 架构拓扑

```
Python 模拟器 ──MQTT──→ EMQX (192.168.130.101:1883)
                              │
                MqttConsumer 订阅 smoke/+/data, smoke/+/heartbeat
                              │
              ┌───────────────┴───────────────┐
              ↓                               ↓
     handleHeartbeat()              handleDataReport()
     → Redis 心跳续期               → AlarmRuleEngine.processData()
     → 更新设备状态                   → 存库 sensor_data
                                     → 阈值判定 → 超标则触发告警
```

- **虚拟机**：VMware Ubuntu `192.168.130.101`，运行 EMQX/MySQL/Redis（Docker）
- **后端**：Spring Boot 3.2.5，端口 8080，Java 17
- **前端**：Vue 3 + Element Plus + ECharts（仅构建产物在 `src/main/resources/static/`，无源码）
- **模拟器**：`scripts/smoke_simulator.py`，Python 脚本，5 种工作模式

## 启动步骤

```bash
# 1. 虚拟机启动 Docker 服务
docker start smoke-emqx smoke-mysql smoke-redis

# 2. MySQL 时区修正（虚拟机内执行）
docker exec -i smoke-mysql mysql -uroot -p123456 -e "SET GLOBAL time_zone = '+08:00';"

# 3. IDEA 启动后端：运行 SmartSmokeApplication.java

# 4. 启动模拟器（另开终端）
E:\Anaconda\python.exe D:\Smart-Smoke-Detection-System\scripts\smoke_simulator.py

# 5. 访问
# 后端 API:  http://localhost:8080
# 前端页面:  http://localhost:8080/index.html
# EMQX 控制台: http://192.168.130.101:18083
```

## 关键账号

| 组件 | 地址 | 用户名 | 密码 |
|---|---|---|---|
| MySQL | 192.168.130.101:3306 | root | 123456 |
| Redis | 192.168.130.101:6379 | - | 无密码 |
| EMQX MQTT | 192.168.130.101:1883 | fasong | fasong123 |
| 后端登录 | localhost:8080 | admin | admin123 |

## 技术栈

- **后端**：Spring Boot 3.2.5, MyBatis-Plus 3.5.6, Sa-Token 1.37, Hutool 5.8, Eclipse Paho MQTT
- **数据库**：MySQL 8.0（11 张表，逻辑删除），Redis 7.2（心跳续期 + Keyspace 离线告警）
- **消息**：MQTT (EMQX 5.3), WebSocket (`/ws/alarm`)
- **前端**：Vue 3 + Element Plus + ECharts（构建产物）

## 项目结构（仅关键路径）

```
src/main/java/com/smartsmoke/
├── SmartSmokeApplication.java    # 启动类
├── common/          # Result, PageResult, GlobalExceptionHandler
├── config/          # MqttConfig, RedisConfig, SaTokenConfig, WebSocketConfig, MyBatisPlusConfig
├── controller/      # 14 个 Controller（见下方）
├── entity/          # 12 个实体 + VO（见下方）
├── mapper/          # 12 个 Mapper 接口
├── service/         # 8 个 Service 接口 + impl
├── mqtt/            # MqttConsumer（订阅+分流）, MqttPublisher（下发指令）
├── rule/            # AlarmRuleEngine（告警判定核心）
├── websocket/       # AlarmWebSocket（大屏实时推送）
├── dto/             # DeviceReportDTO, HeartbeatDTO, LoginRequest, RegisterRequest
└── config/          # RedisKeyspaceListener（Redis 键过期 → 离线告警）
```

## Controller 清单（14个，路径统一 `/api/v1/`）

| Controller | 端点 | 状态 |
|---|---|---|
| AuthController | login, logout, me, register | ✅ |
| DashboardController | stats, realtime, alarm-stats, device-stats | ✅ |
| DeviceController | CRUD + stats (6个) | ✅ |
| AlarmController | 列表(分页+过滤), 详情(含AI复核), confirm/resolve/archive/close | ✅ |
| AlertThresholdController | CRUD (5个) | ✅ |
| UserController | CRUD + 改密 + 重置密码 (7个) | ✅ |
| SystemConfigController | 列表, 更新 | ✅ |
| HealthController | 健康检查 | ✅ |
| DataController | latest, history | ⚠️ history缺分页/interval |
| DeviceBindingController | 我的设备 + 管理端CRUD | ✅ |
| BroadcastController | 创建, 列表, 详情 | ✅ |
| ConversationController | 提问, 列表 | ⚠️ AI为stub, 缺评分/分页 |
| AiReviewController | 列表(分页+过滤), 详情, 人工确认 | ✅ |
| OperationLogController | 分页查询(多条件过滤) | ✅ |

## Entity 清单（12个）

SysUser, SmokeDevice, SensorData, AlarmRecord, AiReviewRecord, BroadcastRecord, ConversationLog, DeviceBinding, AlertThreshold, SystemConfig, OperationLog + VO 类（DashboardStatsVO, RealtimeVO, AlarmTrendVO, DeviceLocationStatsVO, DeviceStatusStatsVO, LoginVO）

## 核心数据流

1. 模拟器/设备 → MQTT Topic `smoke/{deviceId}/data`
2. `MqttConsumer.handleDataReport()` → 解析 JSON → `AlarmRuleEngine.processData()`
3. 规则引擎：存 sensor_data → 加载阈值表 → 判定超标 → 生成 alarm_record → 调 AiService → WebSocket 推送 → 调 MqttPublisher 下发广播

## 当前待完成（按优先级）

### 高优先级
1. ~~新建 AiReviewController~~ ✅ (2026-07-09)
2. ~~新建 OperationLogController~~ ✅ (2026-07-09)
3. ~~补齐 DeviceBindingController 管理端接口~~ ✅ (已实现, 仅文档滞后)

### 中优先级
4. ~~BroadcastController~~ ✅ (MqttPublisher已集成, 分页/详情已实现)
5. DataController.history 加分页 + interval 聚合
6. ConversationController 补评分端点 + 分页过滤 + MaxKB 接入
7. **FIREFIGHTER 角色** — SysUser 支持但 Controller 未实现独立逻辑

### 低优先级
8. SaToken 鉴权恢复（当前被注释）
9. WebSocket 加 30 秒心跳 + type 字段
10. 操作日志 AOP 切面自动记录

### 已完成的改进 (2026-07-09)
- ✅ 角色体系简化: ADMIN/RESIDENT 两种角色，地址自动匹配设备
- ✅ PermissionService 提取 + 地址匹配逻辑
- ✅ DashboardController 按角色过滤 stats/realtime
- ✅ DataController @DateTimeFormat 注解
- ✅ AlarmController 状态流转模板方法 + @Transactional
- ✅ WebSocket broadcastByDevice 集成
- ✅ GlobalExceptionHandler 细化（BusinessException + 5 类异常）
- ✅ application.yml 死配置清理
- ✅ JacksonConfig 全局 LocalDateTime 序列化
- ✅ 前端 AI 复核完整页面
- ✅ OperationLogController 新建
- ✅ DeviceBindingController 管理端接口确认（已有 list/create/unbind）

## 重要参考文档

- `docs/api.md` v2.0 — 完整 API 规范（14 模块，含数据模型、状态机、权限矩阵）
- `docs/项目进度总览.md` — 进度总览（⚠️ 部分过时，AlertThreshold/User/Alarm 实际已完成）
- `docs/BE1-工作交接.md` — 物联侧详细说明
- `框架说明.md` — 团队分工与类归属
- `需求.md` — 原始需求文档
- `src/main/resources/schema.sql` — 11 张表 DDL
