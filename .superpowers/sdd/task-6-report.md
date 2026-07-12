# Task 6 Report: 完全重写 simulator.html

## Status: DONE

## Commits Created
- `0df75a1` — feat: 完全重写 simulator.html — 独立设备监测、心跳模拟、三栏布局

## Summary

Completely rewrote `src/main/resources/static/simulator.html` as specified in the task brief.

**Key changes from old version:**
- **Layout**: Changed from two-column grid to three-panel flex layout (left: 300px device list, center: flexible control panel, right: 260px global event log)
- **Deep color theme**: Background `#0f172a`, panels `#1e293b`, consistent with dashboard aesthetic
- **Independent device control**: Clicking a device switches the center panel to show info, simulation controls, heartbeat controls, threshold config, and device-specific log
- **Select/Ctrl-click multi-select**: Ctrl+click to toggle multi-device selection, with batch send support
- **Heartbeat simulation**: Start/stop heartbeat loop per-device, with auto-start for ONLINE devices on load
- **Continuous send**: Toggle button to send data every 3s
- **Preset scenarios**: Normal/Mild/Fire/Severe with automatic slider sync
- **WS integration**: WebSocket events displayed in right-side global log
- **Status bar**: Device count, online/offline counts, last sync time
- **Polling fallback**: 5s polling for data refresh
- **Responsive**: Right panel hidden below 1100px, left panel shrinks below 700px
- **No external dependencies**: All CSS and JS inline
- **Modal for device CRUD**: Add/edit device with threshold configuration in one dialog

---

## Post-Review Fixes (Commit `ad18e5b`)

**Status:** DONE

**Commit:** `ad18e5b569714a577ef4f85dbbbfad06451861ad`

**Fixed 4 critical issues found in code review:**

### Issue 1: autoStartHeartbeats killed by 5s polling race
- **File:** `src/main/resources/static/simulator.html`
- **Fix 1a:** In `autoStartHeartbeats()`, added `POST /simulation/heartbeat/start` call BEFORE starting each timer, so the server-side `heartbeatActiveDevices` set includes the device.
- **Fix 1b:** Removed the reconciliation code in `loadAllData()` that previously checked `hbStatus.activeDevices` and killed timers the server didn't know about.

### Issue 2: saveDevThrSilent may delete all thresholds
- **File:** `src/main/resources/static/fe2/dashboard-enhanced.js`
- **Fix:** Added a safety filter in `saveDevThrSilent()` before the delete loop: `records = records.filter(function(t) { return String(t.deviceId) === String(devId); })`. This guards against the backend ignoring the `deviceId` query parameter.

### Issue 3: Unsafe Integer cast in heartbeat endpoint
- **File:** `src/main/java/com/smartsmoke/controller/SimulationController.java`
- **Fix:** Replaced `(Integer) body.getOrDefault("bat", 90)` with `(int) dbl(body, "bat", 90)`, and same for `rssi`. This prevents `ClassCastException` when JSON values arrive as non-Integer types.

### Issue 4: broadcastArea vs area API mismatch
- **File:** `src/main/resources/static/fe2/dashboard-enhanced.js`
- **Fix:** Updated `showBroadcastConfirmModal()` to pass `deviceId` alongside `alarmId` to `sendBroadcastFromAlarm()`, and updated `sendBroadcastFromAlarm()` to accept and include `deviceId` in the POST body. The `createManualBroadcast()` service requires a non-null `deviceId` to look up the broadcast target device.
