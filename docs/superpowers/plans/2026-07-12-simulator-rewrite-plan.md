# 设备模拟器重写 & 三端同步 & AI 广播 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 3 个已知 Bug，重写设备模拟器为 Web 控制台，实现三端实时同步，完善 AI 自动广播流程。

**Architecture:** Web 端模拟器通过 REST API + WebSocket 与后端交互，心跳由前端 JS 定时器驱动后端写入 Redis Key。所有设备/阈值写操作通过 WebSocket `data_changed` 广播，三端自动刷新。

**Tech Stack:** Java 17, Spring Boot 3.2, MyBatis-Plus, Redis, MQTT (EMQX), Vanilla JS (no framework), Three.js 0.160

## Global Constraints

- 所有 API 路径在 `/api/v1/` 下
- Token 存储在 `localStorage.smoke_token`，请求头 `Authorization: Bearer <token>`
- WebSocket 端点 `/ws/alarm?token=<token>`
- 设备状态: ONLINE / OFFLINE / ERROR / INACTIVE (String, 非枚举)
- 告警状态流转: PENDING → CONFIRMED → RESOLVED → ARCHIVED (或任意→CLOSED)
- 阈值类型: SMOKE_CONCENTRATION, TEMPERATURE; 告警级别: LOW, MEDIUM, HIGH, CRITICAL
- 后端日志仅 WARN/ERROR 级别

---

### Task 1: Bug 修复 — 后台日志清理

**Files:**
- Modify: `src/main/resources/application.yml`

- [ ] **Step 1: 修改日志级别和移除 SQL 日志**

将 `com.smartsmoke` 的日志级别从 `debug` 改为 `warn`，删除 MyBatis SQL 日志实现。

`application.yml` 中找到:
```yaml
logging:
  level:
    com.smartsmoke: debug
```
替换为:
```yaml
logging:
  level:
    com.smartsmoke: warn
```

找到 `mybatis-plus.configuration.log-impl: org.apache.ibatis.logging.slf4j.Slf4jImpl` 并删除该行（保留其他 mybatis-plus 配置不变）。

- [ ] **Step 2: 验证**

启动后端，确认控制台不再打印 DEBUG 日志和 SQL 语句，仅保留 WARN/ERROR 级别输出。

- [ ] **Step 3: Commit**

```bash
git add src/main/resources/application.yml
git commit -m "fix: 关闭 DEBUG 日志和 MyBatis SQL 日志输出"
```

---

### Task 2: Bug 修复 — 居民端 WebSocket 消息处理

**Files:**
- Modify: `src/main/resources/static/user/user.js:242-268`

- [ ] **Step 1: 修复 `connectWebSocket()` 的消息分发逻辑**

找到 `connectWebSocket` 函数 (L242-268)，将 `socket.onmessage` 替换为:

```javascript
socket.onmessage = (event) => {
  try {
    const payload = JSON.parse(event.data);
    if (payload.kind === 'broadcast') {
      showBroadcastBanner(payload);
    } else if (payload.kind === 'alarm_update') {
      handleAlarmUpdate(payload);
    } else if (payload.kind === 'device_online') {
      showDeviceOnlineBanner(payload);
    } else if (payload.kind === 'alarm') {
      showRealtimeAlarmBanner(payload);
      refreshDashboardImmediately();
    } else if (payload.kind === 'data_changed') {
      refreshDashboardImmediately();
    }
    // 未知 kind 静默忽略，不再 fallthrough
  } catch (e) {
    console.error('WebSocket message error:', e);
  }
};
```

- [ ] **Step 2: 修复 `handleAlarmUpdate` — 移除多余刷新**

找到 `handleAlarmUpdate` 函数 (~L227-239)，将最后两行:
```javascript
renderAlarms();
renderDashboard();
```
替换为:
```javascript
renderAlarms();
// 不再调用 renderDashboard()，避免二次弹窗
```

- [ ] **Step 3: 修复 `renderDashboard` — 移除自动弹窗逻辑**

找到 `renderDashboard` 函数 (~L337-425)，移除末尾的活跃告警弹窗逻辑。找到这段代码块并删除:
```javascript
const activeAlarm = alarmRecords.find(a => a.alarmStatus === 'PENDING' || a.alarmStatus === 'CONFIRMING' || a.alarmStatus === 'CONFIRMED');
if (activeAlarm) {
  const device = deviceMap.get(String(activeAlarm.deviceId)) || {};
  showRealtimeAlarmBanner({
    ...device,
    ...activeAlarm,
    building: activeAlarm.building || device.locationBuilding,
    floor: activeAlarm.floor || device.locationFloor,
    room: activeAlarm.room || device.locationRoom,
    deviceName: activeAlarm.deviceName || device.deviceName || device.deviceId,
  });
} else {
  hideGlobalAlert();
}
```
替换为:
```javascript
if (!alarmRecords.some(a => a.alarmStatus === 'PENDING' || a.alarmStatus === 'CONFIRMING' || a.alarmStatus === 'CONFIRMED')) {
  hideGlobalAlert();
}
```

- [ ] **Step 4: Commit**

```bash
git add src/main/resources/static/user/user.js
git commit -m "fix: 居民端 WebSocket 消息处理 — 修复误弹提示和双重弹窗"
```

---

### Task 3: Bug 修复 — 3D 可视化设备点击限制

**Files:**
- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

- [ ] **Step 1: 移除 `clickable` 硬编码**

找到 `rebuildVizScene` 函数内创建设备球体处 (~L1839)，将:
```javascript
clickable: (bldName === '1栋'),
```
替换为:
```javascript
clickable: true,
```

找到 `renderVizBlds` 和 `selectVizBld` 函数，在 `selectVizBld` 中 (L1806)，`rebuildVizScene` 调用前，确保参数传入正确。确认 `rebuildVizScene` 函数签名接受 `devices` 数组，且调用处 `rebuildVizScene(devicesForFloor)` 传入正确的设备列表。

- [ ] **Step 2: 验证楼栋切换时设备列表更新**

在 `selectVizBld` 末尾确保: 每次选楼栋时 `renderVizDevicePanel()` 重新渲染左侧设备面板。

- [ ] **Step 3: Commit**

```bash
git add src/main/resources/static/fe2/dashboard-enhanced.js
git commit -m "fix: 3D 可视化所有楼栋设备可点击，楼栋切换时设备列表更新"
```

---

### Task 4: 后端 — 新增模拟器心跳 API

**Files:**
- Modify: `src/main/java/com/smartsmoke/controller/SimulationController.java`
- Modify: `src/main/java/com/smartsmoke/mqtt/MqttConsumer.java` (提取方法引用)

- [ ] **Step 1: 在 SimulationController 中新增心跳接口**

在 `SimulationController.java` 末尾、helper 方法之前，新增以下方法:

```java
private final MqttConsumer mqttConsumer;  // 添加到构造函数依赖

/**
 * 模拟器心跳 — Web 端定时调用，直接触发后端心跳处理逻辑
 */
@PostMapping("/heartbeat")
public Result<Map<String, Object>> heartbeat(@RequestBody Map<String, Object> body) {
    String code = str(body, "deviceCode");
    Integer bat = (Integer) body.getOrDefault("bat", 90);
    Integer rssi = (Integer) body.getOrDefault("rssi", -40);
    if (code == null || code.isEmpty()) return Result.error(400, "deviceCode 必填");

    SmokeDevice dev = resolveDevice(code);
    // 更新设备状态为 ONLINE
    SmokeDevice upd = new SmokeDevice();
    upd.setId(dev.getId());
    upd.setStatus("ONLINE");
    upd.setLastOnlineTime(LocalDateTime.now());
    upd.setLastHeartbeat(LocalDateTime.now());
    upd.setBattery(bat);
    upd.setSignalStrength(rssi);
    deviceMapper.updateById(upd);

    // 写入 Redis 心跳 Key
    stringRedisTemplate.opsForValue().set(
        "device:heartbeat:" + code,
        String.valueOf(System.currentTimeMillis()),
        dev.getHeartbeatTimeout() != null ? dev.getHeartbeatTimeout() : 30,
        TimeUnit.SECONDS
    );

    // 关闭该设备的离线告警
    closeOfflineAlarms(dev.getId());

    Map<String, Object> r = new HashMap<>();
    r.put("deviceCode", code);
    r.put("online", true);
    r.put("heartbeat", true);
    return Result.success(r);
}

private void closeOfflineAlarms(Long deviceId) {
    List<AlarmRecord> active = alarmRecordService.lambdaQuery()
            .eq(AlarmRecord::getDeviceId, deviceId)
            .eq(AlarmRecord::getAlarmType, "DEVICE_OFFLINE")
            .in(AlarmRecord::getAlarmStatus, List.of("PENDING", "CONFIRMING", "CONFIRMED"))
            .list();
    for (AlarmRecord a : active) {
        a.setAlarmStatus("CLOSED");
        a.setRemark("设备恢复在线，自动关闭离线告警");
        alarmRecordService.updateById(a);
    }
}
```

同时添加新的依赖字段:
```java
private final StringRedisTemplate stringRedisTemplate;
```
在构造函数参数中加入（`@RequiredArgsConstructor` 会自动处理）。

在文件头部添加 import:
```java
import org.springframework.data.redis.core.StringRedisTemplate;
import java.util.concurrent.TimeUnit;
```

- [ ] **Step 2: 新增心跳启动/停止标记接口**

```java
// 心跳状态存储（仅内存，重启后根据设备 DB 状态重新判断）
private final Set<String> heartbeatActiveDevices = ConcurrentHashMap.newKeySet();

@PostMapping("/heartbeat/start")
public Result<Map<String, Object>> startHeartbeat(@RequestBody Map<String, Object> body) {
    String code = str(body, "deviceCode");
    if (code == null || code.isEmpty()) return Result.error(400, "deviceCode 必填");
    heartbeatActiveDevices.add(code);
    // 恢复上线
    SmokeDevice dev = resolveDevice(code);
    SmokeDevice upd = new SmokeDevice();
    upd.setId(dev.getId());
    upd.setStatus("ONLINE");
    upd.setLastOnlineTime(LocalDateTime.now());
    deviceMapper.updateById(upd);
    log.info("模拟器心跳启动: {}", code);
    return Result.success(Map.of("deviceCode", code, "heartbeatActive", true));
}

@PostMapping("/heartbeat/stop")
public Result<Map<String, Object>> stopHeartbeat(@RequestBody Map<String, Object> body) {
    String code = str(body, "deviceCode");
    if (code == null || code.isEmpty()) return Result.error(400, "deviceCode 必填");
    heartbeatActiveDevices.remove(code);
    // 删除 Redis 心跳 Key，触发离线检测
    stringRedisTemplate.delete("device:heartbeat:" + code);
    log.info("模拟器心跳停止: {}", code);
    return Result.success(Map.of("deviceCode", code, "heartbeatActive", false));
}

@GetMapping("/heartbeat/status")
public Result<Map<String, Object>> heartbeatStatus(@RequestParam(defaultValue = "") String deviceCode) {
    if (deviceCode.isEmpty()) {
        // 返回所有设备心跳状态
        Map<String, Boolean> all = new LinkedHashMap<>();
        List<SmokeDevice> devices = deviceMapper.selectList(null);
        for (SmokeDevice d : devices) {
            all.put(d.getDeviceId(), heartbeatActiveDevices.contains(d.getDeviceId()));
        }
        return Result.success(Map.of("activeDevices", heartbeatActiveDevices, "deviceStatus", all));
    }
    return Result.success(Map.of("deviceCode", deviceCode, "active", heartbeatActiveDevices.contains(deviceCode)));
}
```

需要添加 import:
```java
import java.util.concurrent.ConcurrentHashMap;
import java.util.LinkedHashMap;
```

- [ ] **Step 3: 新增设备模拟状态查询接口**

```java
@GetMapping("/status")
public Result<List<Map<String, Object>>> status() {
    List<SmokeDevice> list = deviceMapper.selectList(null);
    List<Map<String, Object>> r = new ArrayList<>();
    for (SmokeDevice d : list) {
        r.add(Map.of(
            "id", d.getId(),
            "deviceCode", d.getDeviceId(),
            "name", d.getDeviceName() != null ? d.getDeviceName() : d.getDeviceId(),
            "status", d.getStatus() != null ? d.getStatus() : "OFFLINE",
            "building", d.getLocationBuilding() != null ? d.getLocationBuilding() : "",
            "floor", d.getLocationFloor() != null ? d.getLocationFloor() : "",
            "room", d.getLocationRoom() != null ? d.getLocationRoom() : "",
            "battery", d.getBattery() != null ? d.getBattery() : 0,
            "signalStrength", d.getSignalStrength() != null ? d.getSignalStrength() : 0,
            "heartbeatTimeout", d.getHeartbeatTimeout() != null ? d.getHeartbeatTimeout() : 30,
            "lastHeartbeat", d.getLastHeartbeat() != null ? d.getLastHeartbeat().toString() : null,
            "heartbeatActive", heartbeatActiveDevices.contains(d.getDeviceId())
        ));
    }
    return Result.success(r);
}
```

- [ ] **Step 4: 增加 WebSocket `data_changed` 通知方法**

在 `SimulationController` 中添加私有辅助方法:

```java
private void notifyDataChanged(String deviceCode, String action) {
    Map<String, Object> wsPayload = new HashMap<>();
    wsPayload.put("kind", "data_changed");
    wsPayload.put("source", "simulator");
    wsPayload.put("deviceId", deviceCode);
    wsPayload.put("action", action);
    wsPayload.put("ts", System.currentTimeMillis());
    // 广播给所有连接
    AlarmWebSocket.broadcastAll(JSONUtil.toJsonStr(wsPayload));
}
```

在 `AlarmWebSocket` 中添加 `broadcastAll` 静态方法（如果不存在）。

在心跳 start/stop、设备在线/离线、数据发送等操作后调用 `notifyDataChanged(code, action)`。

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/smartsmoke/controller/SimulationController.java
git add src/main/java/com/smartsmoke/websocket/AlarmWebSocket.java
git commit -m "feat: 新增模拟器心跳 API、设备状态查询、data_changed WebSocket 通知"
```

---

### Task 5: WebSocket 增加 `broadcastAll` 方法

**Files:**
- Modify: `src/main/java/com/smartsmoke/websocket/AlarmWebSocket.java`

- [ ] **Step 1: 添加 broadcastAll 静态方法**

在 `AlarmWebSocket` 类中添加:

```java
/**
 * 向所有已连接的客户端广播消息（不分角色/地址）
 */
public static void broadcastAll(String message) {
    for (Session session : SESSION_USER.keySet()) {
        if (session.isOpen()) {
            try {
                session.getBasicRemote().sendText(message);
            } catch (Exception e) {
                log.error("broadcastAll 发送失败: {}", e.getMessage());
            }
        }
    }
}
```

确保该类有 `@Slf4j` 注解（检查类头）。

- [ ] **Step 2: Commit**

```bash
git add src/main/java/com/smartsmoke/websocket/AlarmWebSocket.java
git commit -m "feat: AlarmWebSocket 新增 broadcastAll 全量广播方法"
```

---

### Task 6: 前端 — 完全重写 simulator.html

**Files:**
- Modify: `src/main/resources/static/simulator.html` (完全重写)

**Interfaces:**
- Consumes: `GET /api/v1/simulation/status` — `{id, deviceCode, name, status, building, floor, room, battery, signalStrength, heartbeatTimeout, lastHeartbeat, heartbeatActive}[]`
- Consumes: `POST /api/v1/simulation/heartbeat` — `{deviceCode, bat, rssi}` → `{deviceCode, online, heartbeat}`
- Consumes: `POST /api/v1/simulation/heartbeat/start` — `{deviceCode}` → `{deviceCode, heartbeatActive}`
- Consumes: `POST /api/v1/simulation/heartbeat/stop` — `{deviceCode}` → `{deviceCode, heartbeatActive}`
- Consumes: `POST /api/v1/simulation/send` — `{deviceCode, smoke, temp, humi}` → `{deviceCode, smoke, temp, sent}`
- Consumes: `POST /api/v1/simulation/batch` — `{devices, smoke, temp, humi}` → `[{deviceCode, smoke, temp, ok}]`
- Consumes: `POST /api/v1/simulation/offline` — `{deviceCode}` → `{deviceCode, offline}`
- Consumes: `POST /api/v1/simulation/online` — `{deviceCode}` → `{deviceCode, online}`
- Consumes: `GET /api/v1/devices` — 分页设备列表
- Consumes: `POST /api/v1/devices` / `PUT /api/v1/devices/{id}` / `DELETE /api/v1/devices/{id}` — CRUD
- Consumes: `GET /api/v1/thresholds` / `POST /api/v1/thresholds` / `DELETE /api/v1/thresholds/{id}` — 阈值管理
- Consumes: WebSocket `/ws/alarm` — 实时消息

- [ ] **Step 1: 写入完整的 simulator.html**

完全重写 `src/main/resources/static/simulator.html`，包含:

**布局**: 三栏式 (左: 设备清单 300px | 中: 独立控制面板 flex-1 | 右: 全局日志 260px)
**配色**: 深色主题 (`background: #0f172a`)
**无外部依赖**: 所有 CSS/JS 内联

完整代码如下（见文件）:

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>设备模拟器 — 智慧烟感预警系统</title>
<style>
/* === Reset & Base === */
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;overflow:hidden}
::-webkit-scrollbar{width:5px}
::-webkit-scrollbar-track{background:#1e293b}
::-webkit-scrollbar-thumb{background:#475569;border-radius:3px}

/* === Header === */
.header{background:#1e293b;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;height:48px}
.header h1{font-size:15px;font-weight:700;letter-spacing:0.5px}
.header-right{display:flex;gap:12px;align-items:center;font-size:11px}
.ws-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.ws-dot.on{background:#22c55e;box-shadow:0 0 6px #22c55e}
.ws-dot.off{background:#ef4444}

/* === Main Layout === */
.main{display:flex;height:calc(100vh - 76px)}
.panel-left{width:300px;min-width:260px;background:#1e293b;border-right:1px solid #334155;display:flex;flex-direction:column}
.panel-center{flex:1;overflow-y:auto;padding:16px;background:#0f172a}
.panel-right{width:260px;min-width:200px;background:#1e293b;border-left:1px solid #334155;display:flex;flex-direction:column}

/* === Section Headers === */
.sec-title{font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;padding:12px 14px 8px;letter-spacing:1px;border-bottom:1px solid #334155}

/* === Device List === */
.device-search{padding:8px 12px}
.device-search input{width:100%;padding:7px 10px;border:1px solid #475569;border-radius:6px;background:#0f172a;color:#e2e8f0;font-size:11px;outline:none}
.device-search input:focus{border-color:#2563eb}
.device-toolbar{display:flex;gap:6px;padding:0 12px 8px;font-size:10px}
.device-toolbar a{color:#64748b;cursor:pointer;text-decoration:none}
.device-toolbar a:hover{color:#e2e8f0}
.device-list{flex:1;overflow-y:auto}
.device-item{display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid #1e293b;cursor:pointer;gap:10px;transition:background .1s}
.device-item:hover{background:#1e3a5f30}
.device-item.active{background:#1e3a5f;border-left:3px solid #2563eb}
.device-item .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.device-item .dot.on{background:#22c55e;box-shadow:0 0 6px #22c55e}
.device-item .dot.off{background:#ef4444}
.device-item .info{flex:1;min-width:0}
.device-item .info .code{font-size:12px;font-weight:700}
.device-item .info .addr{font-size:10px;color:#64748b;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.device-item .hb{font-size:9px;padding:2px 6px;border-radius:10px;flex-shrink:0}
.device-item .hb.running{background:#05966920;color:#22c55e;border:1px solid #05966940}
.device-item .hb.stopped{background:#47556920;color:#64748b;border:1px solid #47556940}

/* === Buttons === */
.btn{padding:6px 12px;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap}
.btn-primary{background:#2563eb;color:#fff}
.btn-primary:hover{background:#1d4ed8}
.btn-danger{background:#dc2626;color:#fff}
.btn-danger:hover{background:#b91c1c}
.btn-success{background:#059669;color:#fff}
.btn-success:hover{background:#047857}
.btn-warn{background:#d97706;color:#fff}
.btn-outline{background:transparent;color:#94a3b8;border:1px solid #475569}
.btn-outline:hover{background:#334155;color:#e2e8f0}
.btn-sm{padding:4px 8px;font-size:10px;border-radius:4px}

/* === Form === */
.form-group{margin-bottom:10px}
.form-group label{display:block;font-size:10px;color:#94a3b8;margin-bottom:3px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
.form-group input,.form-group select{width:100%;padding:7px 10px;border:1px solid #475569;border-radius:6px;background:#0f172a;color:#e2e8f0;font-size:12px}
.form-group input:focus{border-color:#2563eb;outline:none}
.form-row{display:flex;gap:8px}
.form-row .form-group{flex:1}

/* === Cards === */
.card{background:#1e293b;border-radius:10px;padding:14px;margin-bottom:12px;border:1px solid #334155}
.card h3{font-size:12px;font-weight:700;margin-bottom:10px;color:#e2e8f0;border-bottom:1px solid #334155;padding-bottom:6px}

/* === Presets === */
.presets{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px}
.preset{padding:4px 10px;border-radius:20px;font-size:10px;cursor:pointer;border:1px solid #475569;background:#0f172a;color:#94a3b8;transition:all .1s}
.preset:hover{border-color:#2563eb;color:#e2e8f0}
.preset.sel{background:#2563eb;color:#fff;border-color:#2563eb}

/* === Slider === */
.param-row{display:flex;align-items:center;gap:8px;margin:8px 0}
.param-row label{font-size:10px;color:#94a3b8;min-width:40px;text-align:right}
.param-row input[type=range]{flex:1;accent-color:#2563eb}
.param-row .val{font-size:10px;color:#22c55e;font-weight:700;min-width:52px;text-align:right}

/* === Threshold Row === */
.thr-row{display:flex;align-items:center;gap:6px;margin:4px 0;font-size:10px}
.thr-row span{color:#94a3b8;min-width:55px}
.thr-row input{width:65px;padding:3px 6px;border:1px solid #475569;border-radius:4px;background:#0f172a;color:#e2e8f0;font-size:10px;text-align:center}

/* === Log Area === */
.log-list{flex:1;overflow-y:auto;font-size:10px;font-family:'Cascadia Code','Fira Code',monospace;padding:8px}
.log-item{padding:4px 8px;border-radius:4px;margin-bottom:2px;line-height:1.4}
.log-ok{border-left:2px solid #22c55e;color:#22c55e}
.log-warn{border-left:2px solid #f59e0b;color:#f59e0b}
.log-error{border-left:2px solid #ef4444;color:#ef4444}
.log-info{border-left:2px solid #60a5fa;color:#94a3b8}

/* === Status Bar === */
.statusbar{height:28px;background:#1e293b;border-top:1px solid #334155;display:flex;align-items:center;padding:0 16px;font-size:10px;color:#64748b;gap:16px}
.statusbar span strong{color:#e2e8f0}

/* === Modal === */
.modal-mask{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center}
.modal-panel{background:#1e293b;border-radius:12px;padding:20px;width:440px;max-height:85vh;overflow-y:auto;border:1px solid #475569}
.modal-panel h3{font-size:13px;margin-bottom:14px}
.hidden{display:none!important}

/* === Info Grid === */
.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:10px}
.info-grid .info-item{display:flex;justify-content:space-between;padding:3px 8px;background:#0f172a;border-radius:4px}
.info-grid .info-item .lbl{color:#64748b}
.info-grid .info-item .v{color:#e2e8f0;font-weight:600}

/* === Responsive === */
@media(max-width:1100px){
  .panel-right{display:none}
  .panel-left{width:240px;min-width:200px}
}
@media(max-width:700px){
  .panel-left{width:180px;min-width:150px}
}
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <h1>🛰 智慧烟感 — 设备模拟器 v3.0</h1>
  <div class="header-right">
    <span><span id="wsDot" class="ws-dot off"></span> <span id="wsLabel">未连接</span></span>
    <span id="clock">--:--:--</span>
  </div>
</div>

<!-- Main -->
<div class="main">

  <!-- LEFT: Device List -->
  <div class="panel-left">
    <div class="sec-title">📡 设备清单 <button class="btn btn-primary btn-sm" onclick="openAddDevice()" style="float:right;margin-top:-2px">+</button></div>
    <div class="device-search"><input id="devSearch" placeholder="搜索设备编号/名称..." oninput="renderDeviceList()"></div>
    <div class="device-toolbar">
      <a href="#" onclick="selectAll();return false">全选</a>
      <a href="#" onclick="clearSel();return false">清除</a>
      <span style="flex:1"></span>
      <span>已选 <strong id="selCount">0</strong></span>
    </div>
    <div class="device-list" id="deviceList"><div style="text-align:center;color:#475569;padding:30px;font-size:11px">加载中...</div></div>
  </div>

  <!-- CENTER: Device Control Panel -->
  <div class="panel-center" id="centerPanel">
    <div id="emptyState" style="text-align:center;padding:80px 20px;color:#475569">
      <div style="font-size:48px;margin-bottom:16px">📡</div>
      <div style="font-size:14px;font-weight:600;margin-bottom:6px">选择一台设备开始模拟</div>
      <div style="font-size:11px">点击左侧设备清单中的设备，查看独立控制面板</div>
    </div>
    <div id="devicePanel" class="hidden">
      <!-- Device Info Card -->
      <div class="card">
        <h3>📋 设备信息</h3>
        <div class="info-grid" id="devInfo"></div>
      </div>
      <!-- Simulation Card -->
      <div class="card">
        <h3>🎮 数据模拟</h3>
        <div class="presets" id="presets">
          <span class="preset" data-s="0.03" data-t="25" data-h="50">🟢 正常</span>
          <span class="preset" data-s="0.18" data-t="62" data-h="30">🟡 轻度</span>
          <span class="preset sel" data-s="0.35" data-t="68" data-h="20">🔴 火警</span>
          <span class="preset" data-s="0.60" data-t="85" data-h="15">🚨 严重</span>
        </div>
        <div class="param-row"><label>烟雾</label><input type="range" id="sRange" min="0" max="100" value="35" oninput="syncSlider()"><span class="val" id="sLabel">0.35 火警</span></div>
        <div class="param-row"><label>温度</label><input type="range" id="tRange" min="0" max="100" value="68" oninput="syncSlider()"><span class="val" id="tLabel">68°C</span></div>
        <div class="param-row"><label>湿度</label><input type="number" id="humiVal" value="20" min="0" max="100" style="width:70px;padding:4px 8px;border:1px solid #475569;border-radius:4px;background:#0f172a;color:#e2e8f0;font-size:11px;text-align:center"></div>
        <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="sendCurrent()">📤 发送数据</button>
          <button class="btn btn-danger" onclick="batchSendSelected()">📤 批量发送(<span id="batchCnt">0</span>)</button>
          <button class="btn btn-outline" onclick="sendContinuously()" id="contBtn">🔄 连续发送</button>
        </div>
      </div>
      <!-- Heartbeat Card -->
      <div class="card">
        <h3>💓 心跳控制</h3>
        <div class="info-grid" id="hbInfo" style="margin-bottom:10px"></div>
        <div class="form-row">
          <div class="form-group"><label>心跳间隔(秒)</label><input id="hbInterval" type="number" value="10" min="3" max="60"></div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-success" id="hbStartBtn" onclick="startHeartbeat()">▶ 启动心跳</button>
          <button class="btn btn-danger" id="hbStopBtn" onclick="stopHeartbeat()">⏹ 停止心跳</button>
          <span style="flex:1"></span>
          <span id="hbStatus" style="font-size:10px;color:#64748b;align-self:center"></span>
        </div>
      </div>
      <!-- Threshold Card -->
      <div class="card">
        <h3>⚙ 阈值配置</h3>
        <div class="thr-row"><span>烟雾 HIGH</span><input id="thrSmokeHigh" value="0.30"><span>mg/m³</span></div>
        <div class="thr-row"><span>烟雾 MEDIUM</span><input id="thrSmokeMed" value="0.15"><span>mg/m³</span></div>
        <div class="thr-row"><span>温度 HIGH</span><input id="thrTempHigh" value="65"><span>°C</span></div>
        <button class="btn btn-primary btn-sm" style="margin-top:8px;width:100%" onclick="saveCurrentThresholds()">💾 保存阈值到数据库</button>
      </div>
      <!-- Device Log Card -->
      <div class="card">
        <h3>📜 设备日志 <span style="font-size:9px;color:#475569;float:right" id="devLogCount">0</span></h3>
        <div class="log-list" id="devLog" style="max-height:200px"><div style="color:#475569;text-align:center;padding:10px">暂无日志</div></div>
      </div>
    </div>
  </div>

  <!-- RIGHT: Global Log -->
  <div class="panel-right">
    <div class="sec-title">📢 全局事件 <button class="btn btn-outline btn-sm" onclick="document.getElementById('globalLog').innerHTML='';globalLogLines=0" style="float:right;font-size:9px">清空</button></div>
    <div class="log-list" id="globalLog" style="flex:1"><div style="color:#475569;text-align:center;padding:10px">等待事件...</div></div>
  </div>
</div>

<!-- Status Bar -->
<div class="statusbar">
  <span>设备: <strong id="sbTotal">0</strong></span>
  <span>在线: <strong id="sbOnline" style="color:#22c55e">0</strong></span>
  <span>离线: <strong id="sbOffline" style="color:#ef4444">0</strong></span>
  <span>最后同步: <strong id="sbSync">--:--:--</strong></span>
  <span style="flex:1"></span>
  <span>接硬件后删除本页面</span>
</div>

<!-- Add/Edit Device Modal -->
<div class="modal-mask hidden" id="devModal" onclick="if(event.target===this)closeDevModal()">
  <div class="modal-panel">
    <h3 id="devModalTitle">新增设备</h3>
    <div class="form-row"><div class="form-group"><label>设备编号 *</label><input id="mCode" placeholder="SMOKE-007"></div><div class="form-group"><label>设备名称</label><input id="mName" placeholder="烟雾传感器"></div></div>
    <div class="form-row"><div class="form-group"><label>楼栋</label><input id="mBld" placeholder="1栋"></div><div class="form-group"><label>楼层</label><input id="mFlr" placeholder="3层"></div><div class="form-group"><label>房间</label><input id="mRoom" placeholder="301"></div></div>
    <div class="form-row"><div class="form-group"><label>烟雾阈值(HIGH)</label><input id="mSH" value="0.30"></div><div class="form-group"><label>烟雾阈值(MED)</label><input id="mSM" value="0.15"></div><div class="form-group"><label>温度阈值(HIGH)</label><input id="mTH" value="65"></div></div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-primary" onclick="saveDevice()">保存</button>
      <button class="btn btn-outline" onclick="closeDevModal()">取消</button>
    </div>
  </div>
</div>

<script>
// ==================== STATE ====================
const API = '/api/v1';
var devices = [], deviceMap = {}, thresholds = [];
var activeDevice = null;  // current device code for center panel
var selectedSet = new Set();
var heartbeatTimers = {}; // deviceCode -> intervalId
var deviceLogs = {};      // deviceCode -> string[]
var globalLogLines = 0;
var ws = null;
var continuousTimer = null;

// ==================== INIT ====================
async function init() {
  if (!localStorage.getItem('smoke_token')) {
    document.body.innerHTML = '<div style="text-align:center;padding:60px">请先<a href="/" style="color:#2563eb">登录</a></div>';
    return;
  }
  await loadAllData();
  connectWS();
  startClock();
  // Polling fallback: 5s
  setInterval(loadAllData, 5000);
  // Update heartbeat status every 1s
  setInterval(updateAllHbStatus, 1000);
}

async function api(p, o={}) {
  var t = localStorage.getItem('smoke_token');
  var h = {'Content-Type':'application/json'};
  if (t) h['Authorization'] = 'Bearer ' + t;
  try {
    var r = await fetch(API + p, {...o, headers:h});
    if (r.status === 401) { alert('登录已过期'); window.location.href = '/'; return null; }
    var b = await r.json();
    if (b && b.code && b.code !== 200) { addGlobalLog('warn', 'API: ' + (b.msg || b.message)); return null; }
    return b && b.data !== undefined ? b.data : b;
  } catch(e) { addGlobalLog('error', 'Network: ' + e.message); return null; }
}

// ==================== DATA LOADING ====================
async function loadAllData() {
  var status = await api('/simulation/status');
  if (status && Array.isArray(status)) {
    devices = status;
    deviceMap = {};
    devices.forEach(function(d) { deviceMap[d.deviceCode] = d; });
    renderDeviceList();
    updateStatusBar();
    if (activeDevice && deviceMap[activeDevice]) refreshDevicePanel();
  }
  // Load thresholds
  var t = await api('/thresholds?page=1&pageSize=500');
  thresholds = (t && t.records) ? t.records : (Array.isArray(t) ? t : []);
  if (activeDevice) refreshThresholdInputs();
  // Load heartbeat status
  var hbStatus = await api('/simulation/heartbeat/status');
  if (hbStatus && hbStatus.activeDevices) {
    // Update heartbeatActiveDevices from server
    if (hbStatus.activeDevices) {
      Object.keys(heartbeatTimers).forEach(function(code) {
        if (!hbStatus.activeDevices.includes(code)) {
          // server doesn't know about our timer, stop it
          clearInterval(heartbeatTimers[code]);
          delete heartbeatTimers[code];
        }
      });
    }
  }
}

// ==================== DEVICE LIST ====================
function renderDeviceList() {
  var q = (document.getElementById('devSearch').value || '').toLowerCase();
  var filtered = devices.filter(function(d) {
    return !q || (d.deviceCode||'').toLowerCase().includes(q) || (d.name||'').toLowerCase().includes(q);
  });
  var el = document.getElementById('deviceList');
  el.innerHTML = filtered.map(function(d) {
    var isActive = activeDevice === d.deviceCode;
    var hbRunning = !!heartbeatTimers[d.deviceCode];
    return '<div class="device-item' + (isActive ? ' active' : '') + '" onclick="selectDevice(\'' + d.deviceCode + '\')">' +
      '<span class="dot ' + (d.status === 'ONLINE' ? 'on' : 'off') + '"></span>' +
      '<div class="info"><div class="code">' + esc(d.deviceCode) + '</div><div class="addr">' + esc(d.name) + ' · ' + esc(d.building||'') + esc(d.floor||'') + '</div></div>' +
      '<span class="hb ' + (hbRunning ? 'running' : 'stopped') + '">' + (hbRunning ? '心跳中' : '') + '</span>' +
      '</div>';
  }).join('') || '<div style="text-align:center;color:#475569;padding:30px;font-size:11px">暂无设备 · <a href="#" onclick="openAddDevice()" style="color:#2563eb">新增</a></div>';
  document.getElementById('selCount').textContent = selectedSet.size;
  document.getElementById('batchCnt').textContent = selectedSet.size;
}

function selectDevice(code) {
  // Toggle selection with Ctrl/Cmd
  if (event.ctrlKey || event.metaKey) {
    selectedSet.has(code) ? selectedSet.delete(code) : selectedSet.add(code);
    renderDeviceList();
  } else {
    activeDevice = code;
    selectedSet.clear();
    refreshDevicePanel();
    refreshThresholdInputs();
    renderDeviceList();
  }
}

function selectAll() { devices.forEach(function(d) { selectedSet.add(d.deviceCode); }); renderDeviceList(); }
function clearSel() { selectedSet.clear(); renderDeviceList(); }

// ==================== DEVICE PANEL ====================
function refreshDevicePanel() {
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('devicePanel').classList.remove('hidden');
  var d = deviceMap[activeDevice];
  if (!d) return;
  document.getElementById('devInfo').innerHTML =
    '<div class="info-item"><span class="lbl">编号</span><span class="v">' + esc(d.deviceCode) + '</span></div>' +
    '<div class="info-item"><span class="lbl">名称</span><span class="v">' + esc(d.name) + '</span></div>' +
    '<div class="info-item"><span class="lbl">状态</span><span class="v" style="color:' + (d.status==='ONLINE'?'#22c55e':'#ef4444') + '">' + esc(d.status) + '</span></div>' +
    '<div class="info-item"><span class="lbl">位置</span><span class="v">' + esc(d.building||'') + esc(d.floor||'') + esc(d.room||'') + '</span></div>' +
    '<div class="info-item"><span class="lbl">电量</span><span class="v">' + (d.battery||0) + '%</span></div>' +
    '<div class="info-item"><span class="lbl">信号</span><span class="v">' + (d.signalStrength||0) + ' dBm</span></div>' +
    '<div class="info-item"><span class="lbl">最后心跳</span><span class="v">' + (d.lastHeartbeat||'--') + '</span></div>' +
    '<div class="info-item"><span class="lbl">心跳超时</span><span class="v">' + (d.heartbeatTimeout||30) + 's</span></div>';
  // Heartbeat info
  var running = !!heartbeatTimers[activeDevice];
  document.getElementById('hbInfo').innerHTML =
    '<div class="info-item"><span class="lbl">心跳状态</span><span class="v" style="color:' + (running ? '#22c55e' : '#ef4444') + '">' + (running ? '运行中' : '已停止') + '</span></div>' +
    '<div class="info-item"><span class="lbl">心跳间隔</span><span class="v">' + (document.getElementById('hbInterval').value || '10') + 's</span></div>';
  document.getElementById('hbStartBtn').style.display = running ? 'none' : '';
  document.getElementById('hbStopBtn').style.display = running ? '' : 'none';
  document.getElementById('hbStatus').textContent = running ? '● 每 ' + (document.getElementById('hbInterval').value||10) + 's 发送心跳' : '○ 心跳已停止';
}

function refreshThresholdInputs() {
  var d = deviceMap[activeDevice]; if (!d) return;
  var devThr = thresholds.filter(function(t) { return t.deviceId === d.id || t.deviceCode === activeDevice; });
  var sH = devThr.find(function(t) { return t.thresholdType === 'SMOKE_CONCENTRATION' && t.alarmLevel === 'HIGH'; });
  var sM = devThr.find(function(t) { return t.thresholdType === 'SMOKE_CONCENTRATION' && t.alarmLevel === 'MEDIUM'; });
  var tH = devThr.find(function(t) { return t.thresholdType === 'TEMPERATURE'; });
  document.getElementById('thrSmokeHigh').value = sH ? sH.thresholdMax : '0.30';
  document.getElementById('thrSmokeMed').value = sM ? sM.thresholdMax : '0.15';
  document.getElementById('thrTempHigh').value = tH ? tH.thresholdMax : '65';
}

// ==================== SIMULATION ====================
function getParams() {
  return {
    smoke: parseFloat(document.getElementById('sRange').value) / 100,
    temp: parseInt(document.getElementById('tRange').value),
    humi: parseInt(document.getElementById('humiVal').value) || 50
  };
}
function syncSlider() {
  var s = (document.getElementById('sRange').value / 100).toFixed(2);
  var t = document.getElementById('tRange').value;
  document.getElementById('sLabel').textContent = s + (s < 0.15 ? ' 正常' : s < 0.30 ? ' 轻度' : ' 火警');
  document.getElementById('tLabel').textContent = t + '°C';
}

async function sendCurrent() {
  if (!activeDevice) { alert('请先选择设备'); return; }
  var p = getParams();
  await api('/simulation/send', {method:'POST', body:JSON.stringify({deviceCode:activeDevice, smoke:p.smoke, temp:p.temp, humi:p.humi})});
  addDeviceLog(activeDevice, 'ok', '发送: smoke=' + p.smoke.toFixed(2) + ' temp=' + p.temp + '°C humi=' + p.humi + '%');
  addGlobalLog(p.smoke >= 0.3 ? 'warn' : 'ok', activeDevice + ' 发送数据 smoke=' + p.smoke.toFixed(2));
}

async function batchSendSelected() {
  if (selectedSet.size === 0) { alert('请先 Ctrl+点击 选择设备'); return; }
  var p = getParams();
  var devs = [];
  selectedSet.forEach(function(c) { devs.push({deviceCode:c, smoke:p.smoke, temp:p.temp}); });
  var r = await api('/simulation/batch', {method:'POST', body:JSON.stringify({devices:devs, smoke:p.smoke, temp:p.temp, humi:p.humi})});
  if (r) r.forEach(function(x) { addGlobalLog(p.smoke >= 0.3 ? 'warn' : 'ok', x.deviceCode + ' 已发送 smoke=' + (x.smoke||p.smoke)); });
}

async function sendContinuously() {
  if (continuousTimer) { clearInterval(continuousTimer); continuousTimer = null; document.getElementById('contBtn').textContent = '🔄 连续发送'; return; }
  if (!activeDevice) { alert('请先选择设备'); return; }
  document.getElementById('contBtn').textContent = '⏹ 停止连续';
  continuousTimer = setInterval(function() { sendCurrent(); }, 3000);
  addDeviceLog(activeDevice, 'info', '开始连续发送 (每3s)');
}

// ==================== HEARTBEAT ====================
async function startHeartbeat() {
  if (!activeDevice) return;
  var interval = parseInt(document.getElementById('hbInterval').value) || 10;
  if (interval < 3) interval = 3;
  document.getElementById('hbInterval').value = interval;
  await api('/simulation/heartbeat/start', {method:'POST', body:JSON.stringify({deviceCode:activeDevice})});
  // Send first heartbeat immediately
  await sendHeartbeat();
  // Schedule
  heartbeatTimers[activeDevice] = setInterval(function() { sendHeartbeat(); }, interval * 1000);
  refreshDevicePanel();
  addDeviceLog(activeDevice, 'ok', '心跳已启动 (间隔' + interval + 's)');
  addGlobalLog('ok', activeDevice + ' 心跳启动');
}

async function stopHeartbeat() {
  if (!activeDevice) return;
  if (heartbeatTimers[activeDevice]) { clearInterval(heartbeatTimers[activeDevice]); delete heartbeatTimers[activeDevice]; }
  await api('/simulation/heartbeat/stop', {method:'POST', body:JSON.stringify({deviceCode:activeDevice})});
  refreshDevicePanel();
  addDeviceLog(activeDevice, 'warn', '心跳已停止');
  addGlobalLog('warn', activeDevice + ' 心跳停止');
}

async function sendHeartbeat() {
  if (!activeDevice) return;
  var d = deviceMap[activeDevice];
  var bat = d ? (d.battery || 90) : 90;
  var rssi = d ? (d.signalStrength || -40) : -40;
  // Randomize slightly
  bat = Math.max(0, Math.min(100, bat + Math.floor(Math.random() * 5) - 2));
  rssi = Math.max(-90, Math.min(-20, rssi + Math.floor(Math.random() * 6) - 3));
  await api('/simulation/heartbeat', {method:'POST', body:JSON.stringify({deviceCode:activeDevice, bat:bat, rssi:rssi})});
  // Update locally
  if (deviceMap[activeDevice]) { deviceMap[activeDevice].lastHeartbeat = new Date().toISOString(); deviceMap[activeDevice].battery = bat; deviceMap[activeDevice].signalStrength = rssi; }
}

function updateAllHbStatus() {
  if (!activeDevice) return;
  var running = !!heartbeatTimers[activeDevice];
  document.getElementById('hbStatus').textContent = running ? '● 每 ' + (document.getElementById('hbInterval').value||10) + 's 发送心跳' : '○ 心跳已停止';
}

// Auto-start heartbeat for ONLINE devices on load
async function autoStartHeartbeats() {
  devices.forEach(function(d) {
    if (d.status === 'ONLINE' && !heartbeatTimers[d.deviceCode]) {
      // Only auto-start if device is ONLINE and no timer running
      // Default interval 10s
      heartbeatTimers[d.deviceCode] = setInterval(async function() {
        var bat = Math.max(0, Math.min(100, (d.battery || 90) + Math.floor(Math.random() * 5) - 2));
        var rssi = Math.max(-90, Math.min(-20, (d.signalStrength || -40) + Math.floor(Math.random() * 6) - 3));
        await api('/simulation/heartbeat', {method:'POST', body:JSON.stringify({deviceCode:d.deviceCode, bat:bat, rssi:rssi})});
        if (deviceMap[d.deviceCode]) { deviceMap[d.deviceCode].lastHeartbeat = new Date().toISOString(); }
      }, 10000);
      addGlobalLog('ok', d.deviceCode + ' 自动启动心跳 (ONLINE)');
    }
  });
}

// ==================== THRESHOLDS ====================
async function saveCurrentThresholds() {
  if (!activeDevice) return;
  var d = deviceMap[activeDevice]; if (!d) return;
  var sH = parseFloat(document.getElementById('thrSmokeHigh').value) || 0.30;
  var sM = parseFloat(document.getElementById('thrSmokeMed').value) || 0.15;
  var tH = parseFloat(document.getElementById('thrTempHigh').value) || 65;
  // Remove old thresholds for this device
  var old = thresholds.filter(function(t) { return t.deviceId === d.id || t.deviceCode === activeDevice; });
  for (var i = 0; i < old.length; i++) {
    await api('/thresholds/' + old[i].id, {method:'DELETE'});
  }
  // Insert new
  await api('/thresholds', {method:'POST', body:JSON.stringify({deviceId:d.id, thresholdType:'SMOKE_CONCENTRATION', thresholdMax:sH, alarmLevel:'HIGH', status:'ENABLED', sortOrder:1})});
  await api('/thresholds', {method:'POST', body:JSON.stringify({deviceId:d.id, thresholdType:'SMOKE_CONCENTRATION', thresholdMax:sM, alarmLevel:'MEDIUM', status:'ENABLED', sortOrder:2})});
  await api('/thresholds', {method:'POST', body:JSON.stringify({deviceId:d.id, thresholdType:'TEMPERATURE', thresholdMax:tH, alarmLevel:'HIGH', status:'ENABLED', sortOrder:1})});
  // Reload thresholds
  await loadAllData();
  addDeviceLog(activeDevice, 'ok', '阈值已保存: SMOKE_H=' + sH + ' SMOKE_M=' + sM + ' TEMP_H=' + tH);
  addGlobalLog('ok', activeDevice + ' 阈值已更新');
}

// ==================== DEVICE CRUD ====================
function openAddDevice() {
  document.getElementById('devModalTitle').textContent = '新增设备';
  ['mCode','mName','mBld','mFlr','mRoom'].forEach(function(id) { document.getElementById(id).value = ''; });
  document.getElementById('mSH').value = '0.30';
  document.getElementById('mSM').value = '0.15';
  document.getElementById('mTH').value = '65';
  document.getElementById('devModal').classList.remove('hidden');
}
function closeDevModal() { document.getElementById('devModal').classList.add('hidden'); }

async function saveDevice() {
  var code = document.getElementById('mCode').value.trim();
  if (!code) { alert('设备编号必填'); return; }
  var payload = {
    deviceId: code,
    deviceName: document.getElementById('mName').value.trim() || code,
    locationBuilding: document.getElementById('mBld').value.trim(),
    locationFloor: document.getElementById('mFlr').value.trim(),
    locationRoom: document.getElementById('mRoom').value.trim(),
    status: 'ONLINE',
    battery: 100,
    signalStrength: 90,
    heartbeatTimeout: 30
  };
  var exist = devices.find(function(d) { return d.deviceCode === code; });
  if (exist) {
    await api('/devices/' + exist.id, {method:'PUT', body:JSON.stringify(payload)});
  } else {
    await api('/devices', {method:'POST', body:JSON.stringify(payload)});
  }
  // Save thresholds
  var sH = parseFloat(document.getElementById('mSH').value) || 0.30;
  var sM = parseFloat(document.getElementById('mSM').value) || 0.15;
  var tH = parseFloat(document.getElementById('mTH').value) || 65;
  var dev = exist || (await api('/simulation/status')).find(function(x) { return x.deviceCode === code; });
  if (dev) {
    var oldThr = thresholds.filter(function(t) { return t.deviceId === dev.id; });
    for (var i = 0; i < oldThr.length; i++) { await api('/thresholds/' + oldThr[i].id, {method:'DELETE'}); }
    await api('/thresholds', {method:'POST', body:JSON.stringify({deviceId:dev.id, thresholdType:'SMOKE_CONCENTRATION', thresholdMax:sH, alarmLevel:'HIGH', status:'ENABLED', sortOrder:1})});
    await api('/thresholds', {method:'POST', body:JSON.stringify({deviceId:dev.id, thresholdType:'SMOKE_CONCENTRATION', thresholdMax:sM, alarmLevel:'MEDIUM', status:'ENABLED', sortOrder:2})});
    await api('/thresholds', {method:'POST', body:JSON.stringify({deviceId:dev.id, thresholdType:'TEMPERATURE', thresholdMax:tH, alarmLevel:'HIGH', status:'ENABLED', sortOrder:1})});
  }
  closeDevModal();
  await loadAllData();
  addGlobalLog('ok', '设备 ' + code + ' 已保存');
}

// ==================== WEBSOCKET ====================
function connectWS() {
  var token = localStorage.getItem('smoke_token');
  if (!token) return;
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/alarm?token=' + encodeURIComponent(token));
  ws.onopen = function() {
    document.getElementById('wsDot').className = 'ws-dot on';
    document.getElementById('wsLabel').textContent = '已连接';
    addGlobalLog('ok', 'WebSocket 已连接');
  };
  ws.onclose = function() {
    document.getElementById('wsDot').className = 'ws-dot off';
    document.getElementById('wsLabel').textContent = '断开';
    addGlobalLog('warn', 'WebSocket 断开, 5s 后重连');
    setTimeout(connectWS, 5000);
  };
  ws.onmessage = function(e) {
    try {
      var p = JSON.parse(e.data);
      if (p.kind === 'data_changed') {
        loadAllData();
        addGlobalLog('info', '数据变更 [' + (p.source||'') + '] ' + (p.deviceId||'') + ' ' + (p.action||''));
      } else if (p.kind === 'broadcast') {
        addGlobalLog('warn', '广播: ' + (p.area||'') + ' - ' + (p.message||'').substring(0, 50));
      } else if (p.kind === 'device_online') {
        addGlobalLog('ok', (p.deviceName||p.deviceId) + ' 恢复在线');
        loadAllData();
      } else if (p.alarmType === 'DEVICE_OFFLINE') {
        addGlobalLog('warn', (p.deviceName||p.deviceId) + ' 离线告警');
        loadAllData();
      } else if (p.kind === 'alarm') {
        addGlobalLog('warn', '告警: ' + (p.deviceName||p.deviceId) + ' ' + (p.alarmType||''));
        loadAllData();
      }
    } catch(err) {}
  };
}

// ==================== LOGGING ====================
function addDeviceLog(code, type, msg) {
  if (!deviceLogs[code]) deviceLogs[code] = [];
  deviceLogs[code].unshift({type:type, msg:msg, time:new Date().toLocaleTimeString('zh-CN')});
  if (deviceLogs[code].length > 200) deviceLogs[code].pop();
  if (activeDevice === code) renderDeviceLog();
}

function renderDeviceLog() {
  var logs = deviceLogs[activeDevice] || [];
  var el = document.getElementById('devLog');
  el.innerHTML = logs.slice(0, 50).map(function(l) {
    return '<div class="log-item log-' + l.type + '">[' + l.time + '] ' + esc(l.msg) + '</div>';
  }).join('') || '<div style="color:#475569;text-align:center;padding:10px">暂无日志</div>';
  document.getElementById('devLogCount').textContent = logs.length;
}

function addGlobalLog(type, msg) {
  var el = document.getElementById('globalLog');
  var time = new Date().toLocaleTimeString('zh-CN');
  el.innerHTML = '<div class="log-item log-' + type + '">[' + time + '] ' + esc(msg) + '</div>' + el.innerHTML;
  globalLogLines++;
  if (globalLogLines > 200) { el.removeChild(el.lastChild); globalLogLines--; }
}

// ==================== UTILS ====================
function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}
function updateStatusBar() {
  var total = devices.length;
  var online = devices.filter(function(d) { return d.status === 'ONLINE'; }).length;
  var offline = total - online;
  document.getElementById('sbTotal').textContent = total;
  document.getElementById('sbOnline').textContent = online;
  document.getElementById('sbOffline').textContent = offline;
  document.getElementById('sbSync').textContent = new Date().toLocaleTimeString('zh-CN');
}
function startClock() {
  setInterval(function() {
    document.getElementById('clock').textContent = new Date().toLocaleTimeString('zh-CN');
  }, 1000);
}

// Preset clicks
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('preset')) {
    document.querySelectorAll('#presets .preset').forEach(function(p) { p.classList.remove('sel'); });
    e.target.classList.add('sel');
    document.getElementById('sRange').value = Math.round(parseFloat(e.target.dataset.s) * 100);
    document.getElementById('tRange').value = e.target.dataset.t;
    document.getElementById('humiVal').value = e.target.dataset.h;
    syncSlider();
  }
});

// Init
init();
// Auto-start heartbeats for ONLINE devices after first data load
setTimeout(autoStartHeartbeats, 2000);
</script>
</body>
</html>
```

- [ ] **Step 2: 验证 simulator.html**

在浏览器中访问 `http://localhost:8080/simulator.html`:
- 确认左侧设备清单正常加载
- 点击设备 → 中间切换为独立控制面板
- 心跳启动/停止正常工作
- 数据发送正常
- 阈值保存正常
- 全局日志显示 WebSocket 事件

- [ ] **Step 3: Commit**

```bash
git add src/main/resources/static/simulator.html
git commit -m "feat: 完全重写 simulator.html — 独立设备监测、心跳模拟、三栏布局"
```

---

### Task 7: 设备管理页面 — 编辑弹窗集成阈值配置

**Files:**
- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

- [ ] **Step 1: 修改设备编辑弹窗，集成阈值输入**

找到 `openDeviceFormModal` 函数 (~L575)，在表单中添加阈值字段。找到表单 HTML 的构建位置，在 `heartbeatTimeout` 字段之后、提交按钮之前，插入阈值区域:

```javascript
// 在 modal body 构建中添加阈值区域
var thresholdHtml = '';
if (mode === 'edit' && item) {
  // 加载该设备的阈值（异步，在 openDeviceFormModal 中处理）
}
thresholdHtml = `
  <div class="form-row" style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
    <div class="form-group"><label>烟雾阈值 HIGH (mg/m³)</label><input id="devFormSmokeHigh" value="${thresholds.smokeHigh || '0.30'}"></div>
    <div class="form-group"><label>烟雾阈值 MEDIUM (mg/m³)</label><input id="devFormSmokeMed" value="${thresholds.smokeMed || '0.15'}"></div>
    <div class="form-group"><label>温度阈值 HIGH (°C)</label><input id="devFormTempHigh" value="${thresholds.tempHigh || '65'}"></div>
  </div>`;
```

- [ ] **Step 2: 修改 `submitDeviceForm`，提交时同时保存阈值**

在 `submitDeviceForm` (~L844) 的设备保存成功后，添加阈值保存逻辑:

```javascript
// 设备保存成功后:
var devId = resp.data.id || state.editingDeviceId;
var sH = parseFloat(document.getElementById('devFormSmokeHigh')?.value) || 0.30;
var sM = parseFloat(document.getElementById('devFormSmokeMed')?.value) || 0.15;
var tH = parseFloat(document.getElementById('devFormTempHigh')?.value) || 65;

// 先删旧阈值，再插入新阈值
await saveDevThrSilent(devId, sH, sM, tH);
```

新增辅助函数 `saveDevThrSilent`:
```javascript
async function saveDevThrSilent(devId, sH, sM, tH) {
  // 获取旧阈值
  var old = await apiRequest('/thresholds?page=1&pageSize=200&deviceId=' + devId);
  var records = (old && old.records) || [];
  for (var i = 0; i < records.length; i++) {
    await fetch(API_BASE + '/thresholds/' + records[i].id, {method:'DELETE', headers:authHeaders()});
  }
  // 插入新阈值
  await apiRequest('/thresholds', {method:'POST', body:JSON.stringify({deviceId:devId, thresholdType:'SMOKE_CONCENTRATION', thresholdMax:sH, alarmLevel:'HIGH', status:'ENABLED', sortOrder:1})});
  await apiRequest('/thresholds', {method:'POST', body:JSON.stringify({deviceId:devId, thresholdType:'SMOKE_CONCENTRATION', thresholdMax:sM, alarmLevel:'MEDIUM', status:'ENABLED', sortOrder:2})});
  await apiRequest('/thresholds', {method:'POST', body:JSON.stringify({deviceId:devId, thresholdType:'TEMPERATURE', thresholdMax:tH, alarmLevel:'HIGH', status:'ENABLED', sortOrder:1})});
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/resources/static/fe2/dashboard-enhanced.js
git commit -m "feat: 设备编辑弹窗集成阈值配置，一键保存设备和阈值"
```

---

### Task 8: 3D 可视化 — 设备点击阈值编辑

**Files:**
- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js` (viz 相关函数)

- [ ] **Step 1: 修复 `renderVizDetail` 中的阈值保存**

找到 `renderVizDetail` 函数 (~L1905) 和 `saveVizThr` 函数。确保:
1. 点击设备球体后右侧面板显示阈值输入
2. 阈值输入框默认值从数据库加载
3. 保存按钮正确调用阈值 API

当前已有雏形，检查并修复以下问题:
- `saveVizThr` 函数应使用 `apiRequest` 而非直接 `fetch`
- 保存后需要重新加载全局阈值数据
- 添加保存成功提示

修改 `saveVizThr`:
```javascript
async function saveVizThr(devId) {
  var sH = parseFloat(document.getElementById('vizSmokeHigh').value) || 0.30;
  var sM = parseFloat(document.getElementById('vizSmokeMed').value) || 0.15;
  var tH = parseFloat(document.getElementById('vizTempHigh').value) || 65;
  
  // 删除旧阈值
  var resp = await apiRequest('/thresholds?page=1&pageSize=200&deviceId=' + devId);
  var records = (resp && resp.records) || [];
  for (var i = 0; i < records.length; i++) {
    await fetch(API_BASE + '/thresholds/' + records[i].id, {method:'DELETE', headers:authHeaders()});
  }
  // 插入新阈值
  await apiRequest('/thresholds', {method:'POST', body:JSON.stringify({deviceId:devId, thresholdType:'SMOKE_CONCENTRATION', thresholdMax:sH, alarmLevel:'HIGH', status:'ENABLED', sortOrder:1})});
  await apiRequest('/thresholds', {method:'POST', body:JSON.stringify({deviceId:devId, thresholdType:'SMOKE_CONCENTRATION', thresholdMax:sM, alarmLevel:'MEDIUM', status:'ENABLED', sortOrder:2})});
  await apiRequest('/thresholds', {method:'POST', body:JSON.stringify({deviceId:devId, thresholdType:'TEMPERATURE', thresholdMax:tH, alarmLevel:'HIGH', status:'ENABLED', sortOrder:1})});
  
  alert('阈值已保存');
  window._vizThr = (await apiRequest('/thresholds?page=1&pageSize=200'))?.records || [];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/resources/static/fe2/dashboard-enhanced.js
git commit -m "fix: 3D 可视化设备阈值编辑功能完善"
```

---

### Task 9: AI 自动广播完善 — 确认告警弹窗广播

**Files:**
- Modify: `src/main/java/com/smartsmoke/controller/AlarmController.java`
- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

- [ ] **Step 1: 修改 AlarmController.confirm，响应增加 shouldBroadcast 标记**

找到 `confirm` 方法。在告警状态变更成功后，检查是否需要建议广播:

```java
@PutMapping("/{id}/confirm")
public Result<Map<String, Object>> confirm(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
    AlarmRecord alarm = requireAlarmForUpdate(id, "PENDING", "CONFIRMING");
    // ... existing confirm logic ...
    
    // 判断是否需要建议广播
    boolean shouldBroadcast = "FIRE_RISK".equals(alarm.getAlarmType()) 
        || "SMOKE_OVERFLOW".equals(alarm.getAlarmType())
        || ("HIGH".equals(alarm.getAlarmLevel()) || "CRITICAL".equals(alarm.getAlarmLevel()));
    boolean alreadyBroadcast = alarm.getIsBroadcastSent() != null && alarm.getIsBroadcastSent() == 1;
    
    Map<String, Object> result = new HashMap<>();
    result.put("alarmId", alarm.getId());
    result.put("alarmStatus", alarm.getAlarmStatus());
    result.put("shouldBroadcast", shouldBroadcast && !alreadyBroadcast);
    result.put("deviceId", alarm.getDeviceId());
    
    return Result.success(result);
}
```

- [ ] **Step 2: 管理端前端 — confirm 后弹窗询问是否广播**

在 `dashboard-enhanced.js` 中找到确认告警的处理函数。在确认成功后检查 `shouldBroadcast`:

```javascript
async function confirmAlarm(id) {
  var resp = await apiRequest('/alarms/' + id + '/confirm', {method:'PUT'});
  if (resp && resp.shouldBroadcast) {
    var ok = confirm('告警已确认。\n\n检测到火情告警，是否立即向该设备所在区域发送紧急广播？');
    if (ok) {
      // 获取设备信息并发送广播
      var alarm = await apiRequest('/alarms/' + id);
      if (alarm) {
        showBroadcastConfirmModal(alarm);
      }
    }
  }
  loadAlarmRows(state.alarmsPage.page);
}

function showBroadcastConfirmModal(alarm) {
  // 显示广播内容编辑弹窗，预填紧急广播内容
  var building = alarm.building || '';
  var floor = alarm.floor || '';
  var content = '【火警紧急通知】' + building + floor + '区域检测到火情，请立即按照疏散通道有序撤离！';
  var area = building + (floor ? ' ' + floor : '');
  
  var html = '<div class="modal-mask" id="broadcastModal" onclick="if(event.target===this)this.remove()">' +
    '<div class="modal-panel" style="width:500px">' +
    '<h3>📢 发送紧急广播</h3>' +
    '<div class="form-group"><label>广播区域</label><input id="bcArea" value="' + area + '"></div>' +
    '<div class="form-group"><label>广播内容</label><textarea id="bcContent" rows="4" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px">' + content + '</textarea></div>' +
    '<div style="display:flex;gap:8px;margin-top:10px">' +
    '<button class="btn btn-main" onclick="sendBroadcastFromAlarm(' + alarm.id + ')">发送广播</button>' +
    '<button class="btn" onclick="document.getElementById(\'broadcastModal\').remove()">取消</button></div>' +
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/java/com/smartsmoke/controller/AlarmController.java
git add src/main/resources/static/fe2/dashboard-enhanced.js
git commit -m "feat: 确认告警时弹出广播确认弹窗，完善 AI 自动广播流程"
```

---

### Task 10: 集成验证 & 端到端测试

- [ ] **Step 1: 启动后端并验证所有 API**

```bash
# 启动 Spring Boot 后端
# 验证 API:
curl -X GET http://localhost:8080/api/v1/simulation/status
curl -X POST http://localhost:8080/api/v1/simulation/heartbeat -H "Content-Type: application/json" -d '{"deviceCode":"SDS-001","bat":95,"rssi":-35}'
curl -X GET "http://localhost:8080/api/v1/simulation/heartbeat/status?deviceCode=SDS-001"
```

- [ ] **Step 2: 验证三端同步**

1. 打开模拟器 `http://localhost:8080/simulator.html`
2. 打开管理端 `http://localhost:8080/fe2/dashboard-enhanced.html`
3. 在模拟器中修改设备阈值 → 管理端 3D 页面应自动刷新
4. 在管理端编辑设备 → 模拟器应自动刷新
5. 触发告警 → 管理端收到告警 + AI 复核 + 自动广播

- [ ] **Step 3: 验证居民端不再误弹**

1. 登录居民端 `http://localhost:8080/user/index.html`
2. 触发非本地址设备的告警 → 居民端不应弹出提示
3. 发送广播到居民所在地址 → 居民端仅显示广播卡片

- [ ] **Step 4: Commit final adjustments**

```bash
git add -A
git commit -m "chore: 端到端验证通过，修复残余问题"
```
