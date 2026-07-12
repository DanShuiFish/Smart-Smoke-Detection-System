# 设备模拟器重写 & 三端实时同步 & AI 自动广播 — 设计文档

日期: 2026-07-12 | 分支: Huy6

## 一、Bug 修复 (3项)

### 1.1 3D 可视化设备清单修复
- **文件**: `dashboard-enhanced.js` ~L1839
- **问题**: `clickable` 硬编码仅 `1栋` 设备可点击，切换楼栋时设备列表不更新
- **修复**: 移除硬编码，所有楼栋设备均可点击；楼栋切换时重新加载设备树

### 1.2 后台日志清理
- **文件**: `application.yml`
- `logging.level.com.smartsmoke`: `debug` → `warn`
- 删除 `mybatis-plus.configuration.log-impl: org.apache.ibatis.logging.slf4j.Slf4jImpl`

### 1.3 居民端误弹提示
- **文件**: `user.js` `connectWebSocket()` ~L253-267
- **修复**:
  - 增加 `kind === 'alarm'` 显式分支
  - 未知 `kind` 静默忽略，不再 fallthrough
  - `renderDashboard()` 移除告警弹窗逻辑
  - `handleAlarmUpdate` 移除 `renderDashboard()` 调用

## 二、设备模拟器重写

### 2.1 架构
完全重写 `simulator.html` 为 Web 设备模拟控制台。心跳模拟由前端 JS 定时器驱动，通过后端 API 写入 Redis 心跳 Key。

### 2.2 核心数据流
```
模拟器页面 → POST /api/v1/simulation/heartbeat → MqttConsumer.handleHeartbeat() → Redis Key + DB
模拟器页面 → POST /api/v1/simulation/send → MqttConsumer.handleDataReport() → AlarmRuleEngine
管理端修改 → PUT /api/v1/devices/{id} → DB → WebSocket "data_changed" → 所有端刷新
3D页面修改 → PUT /api/v1/thresholds → DB → WebSocket "data_changed" → 所有端刷新
```

### 2.3 新增/修改后端 API
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/simulation/heartbeat` | 模拟器发送心跳（直接调用 handleHeartbeat 逻辑） |
| POST | `/simulation/heartbeat/start` | 启动设备心跳标记 |
| POST | `/simulation/heartbeat/stop` | 停止设备心跳标记 |
| GET | `/simulation/status` | 获取所有设备模拟状态 |
| POST | `/simulation/send` | 发送单设备模拟数据（已有，可能需要调整） |
| POST | `/simulation/batch` | 批量发送（已有） |

### 2.4 前端布局 (simulator.html)
```
┌─────────────────────────────────────────────────┐
│ Header: 模拟器 | WS状态 | 时钟                    │
├──────────┬──────────────────────┬───────────────┤
│ 设备清单  │  独立设备控制面板      │ 全局事件日志   │
│ (左侧)   │  (中间，可滚动)       │ (右侧)        │
│          │                      │               │
│ 搜索框   │ ┌ 设备信息栏 ──────┐  │ 最近50条       │
│ 全选/清除 │ │编号/名称/位置/状态 │  │ WebSocket     │
│          │ └────────────────┘  │ 事件 +        │
│ 设备列表  │ ┌ 数据模拟区 ──────┐  │ 发送记录       │
│ (可滚动)  │ │预设/滑块/发送按钮 │  │               │
│ 每项显示: │ └────────────────┘  │               │
│ 状态灯    │ ┌ 心跳控制区 ──────┐  │               │
│ 编号      │ │启停/间隔/状态    │  │               │
│ 位置      │ └────────────────┘  │               │
│ 操作按钮  │ ┌ 阈值配置区 ──────┐  │               │
│          │ │烟雾HIGH/MED/温度  │  │               │
│          │ │保存按钮          │  │               │
│          │ └────────────────┘  │               │
│          │ ┌ 设备日志区 ──────┐  │               │
│          │ │仅该设备的操作记录  │  │               │
│          │ └────────────────┘  │               │
├──────────┴──────────────────────┴───────────────┤
│ 底部状态栏: 设备总数 | ONLINE | OFFLINE | 最后同步  │
└─────────────────────────────────────────────────┘
```

## 三、三端实时同步

### 3.1 同步机制
- 所有写操作 → REST API → 数据库写入 → WebSocket 推送 `kind:"data_changed"` 
- 所有连接的客户端（管理端、居民端、模拟器）收到后刷新对应数据
- 辅助：5 秒轮询作为降级兜底

### 3.2 设备管理页面改动
- 设备编辑弹窗增加阈值配置区（替代当前独立的阈值弹窗）
- 阈值保存合并到设备编辑提交中

### 3.3 3D 可视化改动
- 点击设备球体 → 右侧面板显示设备详情 + 可编辑阈值
- 保存阈值时通过 API 写入数据库 + WebSocket 通知

### 3.4 WebSocket 新增消息类型
```json
{"kind": "data_changed", "source": "simulator|admin|viz", "deviceId": "SDS-001", "action": "device_updated|threshold_updated|device_created|device_deleted"}
```

## 四、AI 自动广播

### 4.1 流程
```
告警生成 → AI 视觉复核 → 确认火情 → tryAutoBroadcast()
  → 创建 BroadcastRecord (triggerMode=AUTO)
  → MQTT 下发广播指令到设备地址
  → WebSocket kind="broadcast" 推送给对应地址的居民端
  → 管理员可在广播页查看
```

### 4.2 管理员确认告警弹窗
- `PUT /alarms/{id}/confirm` 响应增加 `shouldBroadcast: true`
- 前端收到后弹出 "是否发送广播?" 确认弹窗
- 确认 → POST `/broadcasts` 创建手动广播

### 4.3 手动广播
- 已有 `POST /broadcasts/area`，需完善 UI 交互

## 五、独立设备监测

每台设备在模拟器中点击后，中间面板完全切换为该设备的独立控制区，包含:
- 设备信息（只读）
- 数据模拟（独立滑块值，不同设备互不影响）
- 心跳控制（独立启停，互不干扰）
- 阈值配置（读写数据库）
- 专属日志（仅记录该设备事件）

## 六、实现优先级

| 优先级 | 模块 | 估时 |
|--------|------|------|
| P0 | Bug 修复（3项） | 小 |
| P0 | 模拟器重写（simulator.html） | 大 |
| P1 | 三端同步机制 | 中 |
| P1 | 设备管理 + 3D 阈值编辑 | 中 |
| P1 | AI 自动广播完善 | 中 |
| P2 | 管理员确认告警弹窗 | 小 |
