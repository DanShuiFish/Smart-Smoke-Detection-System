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

