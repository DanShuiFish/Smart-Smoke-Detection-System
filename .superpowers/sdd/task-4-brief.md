# Task 4: JS — AI 复核详情弹窗和人工确认/驳回

## 目标

添加两个关键交互函数：详情弹窗（展示所有 AI 复核字段）和人工确认/驳回操作。

## 前置依赖

Tasks 2-3 已完成，以下函数和状态已存在:
- 状态: `state.reviewsPage`
- 格式化: `formatReviewResult()`, `formatManualReview()`, `reviewResultClass()`, `manualReviewClass()`
- 数据加载: `loadReviewRows(page)`, `loadAlarmRows(page)`
- 表格渲染: `renderReviewTable()`, `renderReviewPagination()`
- 已有工具函数: `apiRequest()`, `openDetailModal(title, rows)`, `showGlobalAlert()`, `safeText()`, `escapeHtml()`

## 改动文件

- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

## 项目约定

- `openDetailModal(title, rows)` — rows 是对象数组 `[{label, value, full}]`，`full: true` 表示占整行
- `apiRequest(path, options)` — options 可选 `method` 和 `body`
- `confirm(message)` — 浏览器原生确认框

## 具体步骤

### Step 1: 添加 `showReviewDetail()` 函数

在 `renderReviewPagination()` 之后添加：

```javascript
async function showReviewDetail(id) {
  try {
    var item = await apiRequest("/ai-reviews/" + id);
    openDetailModal("AI复核详情 #" + id, [
      { label: "复核ID", value: safeText(item.id, "--") },
      { label: "关联告警ID", value: safeText(item.alarmId, "--") },
      { label: "设备ID", value: safeText(item.deviceId, "--") },
      { label: "摄像头ID", value: safeText(item.cameraId, "--") },
      { label: "复核类型", value: safeText(item.reviewType, "--") },
      { label: "AI判定结果", value: formatReviewResult(item.reviewResult) },
      { label: "置信度", value: item.confidence != null ? Number(item.confidence).toFixed(1) + "%" : "--" },
      { label: "图像路径", value: safeText(item.imageUrl, "--") },
      { label: "处理耗时", value: item.processingTimeMs != null ? item.processingTimeMs + " ms" : "--" },
      { label: "人工复核状态", value: formatManualReview(item.isManualReview, item.manualReviewResult) },
      { label: "人工复核人ID", value: safeText(item.manualReviewUserId, "--") },
      { label: "人工复核结果", value: safeText(item.manualReviewResult, "--") },
      { label: "备注", value: safeText(item.remark, "--") },
      { label: "AI原始响应", value: safeText(item.aiRawResponse || "无", "无"), full: true },
      { label: "创建时间", value: safeText(item.createTime, "--") },
    ]);
  } catch (error) {
    showGlobalAlert("AI复核详情加载失败: " + error.message);
  }
}
```

### Step 2: 添加 `handleManualConfirm()` 函数

在 `showReviewDetail()` 之后添加：

```javascript
async function handleManualConfirm(id, result) {
  var label = result === "CONFIRMED" ? "确认" : "驳回";
  if (!confirm("确定要" + label + "该AI复核结果吗？")) return;
  try {
    await apiRequest("/ai-reviews/" + id + "/manual-confirm", {
      method: "PUT",
      body: JSON.stringify({ manualReviewResult: result, remark: "管理端人工" + label })
    });
    showGlobalAlert("人工" + label + "成功");
    await loadReviewRows(state.reviewsPage.page);
    await loadAlarmRows(state.alarmsPage.page);
  } catch (error) {
    showGlobalAlert("人工" + label + "失败: " + error.message);
  }
}
```

## 验证

在浏览器中：
1. 点击复核记录的"详情"按钮 → 弹窗展示完整数据（15 个字段含 AI原始响应）
2. 点击"确认"按钮 → 浏览器弹出确认框 → 确认后显示"人工确认成功" → 列表刷新
3. 点击"驳回"按钮 → 浏览器弹出确认框 → 确认后显示"人工驳回成功" → 列表刷新
4. 已复核的记录不再显示"确认"/"驳回"按钮
