# Task 4 Report: 后端 — 新增模拟器心跳 API

## Status: DONE

## Summary

Implemented 5 new API endpoints in `SimulationController.java`:

1. **POST /api/v1/simulation/heartbeat** — Web-based heartbeat that writes Redis `device:heartbeat:{code}` key, updates device status/fields, closes offline alarms, and broadcasts `data_changed` via WebSocket.
2. **POST /api/v1/simulation/heartbeat/start** — Marks heartbeat as active for a device (in-memory set), sets device ONLINE.
3. **POST /api/v1/simulation/heartbeat/stop** — Removes heartbeat active flag and deletes Redis heartbeat key to trigger offline detection.
4. **GET /api/v1/simulation/heartbeat/status** — Queries heartbeat active state for one or all devices.
5. **GET /api/v1/simulation/status** — Enhanced device status list (superset of existing `/devices`), adding battery, signalStrength, heartbeatTimeout, lastHeartbeat, and heartbeatActive fields.

### New private helpers
- `closeOfflineAlarms(Long deviceId)` — Closes PENDING/CONFIRMING/CONFIRMED DEVICE_OFFLINE alarms for a device.
- `notifyDataChanged(String deviceCode, String action)` — Broadcasts `data_changed` via `AlarmWebSocket.broadcastAll()`.

### Dependencies added
- `StringRedisTemplate` — Redis key write/delete for heartbeat.
- `MqttConsumer` — Import added for future MQTT interaction.
- `ConcurrentHashMap.newKeySet()` — In-memory heartbeat active state tracking.

### Verification
- `AlarmWebSocket.broadcastAll()` already existed (confirmed).
- All imports verified (StringRedisTemplate, TimeUnit, ConcurrentHashMap, LinkedHashMap).
- `@RequiredArgsConstructor` handles constructor injection for new `final` fields.

## Files Modified
- `src/main/java/com/smartsmoke/controller/SimulationController.java`
