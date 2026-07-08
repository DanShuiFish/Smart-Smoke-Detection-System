# Task 5: JS — 修复管理端告警详情显示 AI 复核数据

## 目标

重写 `showAlarmDetail()` 函数，从同步读取本地数据改为异步调用后端 API 获取完整告警详情（含 `aiReview` 嵌套字段），在弹窗中展示 AI 复核结果。

## 前置依赖

Tasks 2-4 已完成。以下函数可供使用:
- `apiRequest()`, `openDetailModal()`, `showGlobalAlert()`
- `formatReviewResult()`, `formatManualReview()`, `formatAlarmType()`, `formatAlarmLevel()`, `formatAlarmStatus()`
- `safeText()`, `escapeHtml()`

## 改动文件

- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

## 具体步骤

### Step 1: 找到并替换 `showAlarmDetail()` 函数

找到现有的 `showAlarmDetail()` 函数（当前实现约在第 631-643 行，仅从本地 `state.alarmsPage.records` 读取数据，显示 7 个基础字段），**完整替换**为：

```javascript
async function showAlarmDetail(id) {
  try {
    var item = await apiRequest("/alarms/" + id);
    var aiReview = item.aiReview || null;
    var rows = [
      { label: "告警ID", value: safeText(item.id, "--") },
      { label: "告警编号", value: safeText(item.alarmCode, "--") },
      { label: "告警类型", value: formatAlarmType(item.alarmType) },
      { label: "告警等级", value: formatAlarmLevel(item.alarmLevel) },
      { label: "告警状态", value: formatAlarmStatus(item.alarmStatus) },
      { label: "设备ID", value: safeText(item.deviceId, "--") },
      { label: "传感器数据ID", value: safeText(item.sensorDataId, "--") },
      { label: "烟雾浓度", value: item.smokeConcentration != null ? Number(item.smokeConcentration).toFixed(2) + " mg/m³" : "--" },
      { label: "阈值", value: item.thresholdValue != null ? Number(item.thresholdValue).toFixed(2) + " mg/m³" : "--" },
      { label: "确认方式", value: safeText(item.confirmMethod, "--") },
      { label: "告警时间", value: safeText(item.alarmTime, "--") },
      { label: "确认时间", value: safeText(item.confirmTime, "--") },
      { label: "处置时间", value: safeText(item.resolveTime, "--") },
      { label: "处置详情", value: safeText(item.resolveDetail, "--") },
      { label: "是否已视觉复核", value: Number(item.isVisionReviewed) === 1 ? "是" : "否" },
      { label: "是否已广播", value: Number(item.isBroadcastSent) === 1 ? "是" : "否" },
      { label: "备注", value: safeText(item.remark, "--"), full: true },
    ];
    // 追加 AI 复核信息
    if (aiReview) {
      rows.push(
        { label: "── AI复核结果 ──", value: "", full: true },
        { label: "AI判定", value: formatReviewResult(aiReview.reviewResult) },
        { label: "AI置信度", value: aiReview.confidence != null ? Number(aiReview.confidence).toFixed(1) + "%" : "--" },
        { label: "人工复核", value: formatManualReview(aiReview.isManualReview, aiReview.manualReviewResult) },
        { label: "人工结果", value: safeText(aiReview.manualReviewResult, "--") },
        { label: "图像路径", value: safeText(aiReview.imageUrl, "--") }
      );
    } else {
      rows.push({ label: "── AI复核 ──", value: "未触发视觉复核", full: true });
    }
    openDetailModal("告警详情 #" + id, rows);
  } catch (error) {
    showGlobalAlert("告警详情加载失败: " + error.message);
  }
}
```

### 重要注意事项

- 原函数是同步的（从 `state.alarmsPage.records` 查找数据），新函数是异步的（调用 `/api/v1/alarms/{id}` API）
- 原函数只显示 7 个字段，新函数显示 17+ 个字段（含 AI 复核区域）
- 告警详情按钮的点击处理在 `renderAlarmTable()` 中，已经绑定了 `button[data-alarm-detail]` 的事件，无需修改
- 告警操作按钮（`button[data-action]`）的 `async` 处理已经在 Task 4 中兼容（`loadAlarmRows` 同理）

## 验证

在浏览器中：
1. 进入"告警日志"页面
2. 点击某条告警的"详情"按钮
3. 弹窗应显示完整的告警信息（17+ 条字段）
4. 弹窗底部应有"── AI复核结果 ──"分隔区域，显示 AI 判定、置信度等信息
5. 对于没有 AI 复核的告警，显示"── AI复核 ── 未触发视觉复核"
