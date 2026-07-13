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

