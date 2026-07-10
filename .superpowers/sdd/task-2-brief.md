# Task 2: JS — 状态管理、格式化函数和数据加载

## 目标

在 `dashboard-enhanced.js` 中添加 AI 视觉复核所需的状态变量、格式化辅助函数和数据加载函数。

## 改动文件

- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

## 项目约定

- 变量命名风格: camelCase，现有代码使用 `var` 和 `function` 声明
- API 调用统一使用已有的 `apiRequest(path, options)` 封装函数
- 分页数据统一使用已有的 `normalizePageResult(payload, fallbackPage, fallbackPageSize)` 函数
- 文本安全处理使用已有的 `safeText(value, fallback)` 和 `escapeHtml(value)` 函数
- DOM 快捷获取使用已有的 `el(id)` 函数
- 空状态渲染使用已有的 `renderEmptyState(node, title, desc)` 函数
- 全局提示使用已有的 `showGlobalAlert(text)` 函数

## 具体步骤

### Step 1: 在 `state` 对象中添加复核页面状态

找到 `state` 对象定义（在 `bindingsPage` 字段之后），添加:
```javascript
reviewsPage: { page: 1, pageSize: 10, total: 0, pages: 1, records: [] },
```

### Step 2: 添加 AI 复核格式化辅助函数

在 `alarmLevelClass()` 函数之后添加以下四个辅助函数：

```javascript
function formatReviewResult(result) {
  var s = String(result || "").toUpperCase();
  if (s === "FIRE_CONFIRMED") return "AI确认火情";
  if (s === "NO_FIRE") return "AI排除火情";
  if (s === "UNCERTAIN") return "不确定";
  return safeText(result, "未复核");
}
function formatManualReview(isManual, manualResult) {
  if (Number(isManual) === 1) {
    var r = String(manualResult || "").toUpperCase();
    return r === "CONFIRMED" ? "人工确认" : (r === "DISMISSED" ? "人工驳回" : "已复核");
  }
  return "待复核";
}
function reviewResultClass(result) {
  var s = String(result || "").toUpperCase();
  if (s === "FIRE_CONFIRMED") return "danger";
  if (s === "NO_FIRE") return "ok";
  return "warn";
}
function manualReviewClass(isManual, manualResult) {
  if (Number(isManual) !== 1) return "warn";
  var r = String(manualResult || "").toUpperCase();
  return r === "CONFIRMED" ? "ok" : "info";
}
```

### Step 3: 添加 `loadReviewRows()` 数据加载函数

在 `loadAlarmRows()` 函数之后添加：

```javascript
async function loadReviewRows(page) {
  if (!page) page = state.reviewsPage.page || 1;
  var alarmId = safeText(el("reviewFilterAlarmId") && el("reviewFilterAlarmId").value, "").trim();
  var deviceId = safeText(el("reviewFilterDeviceId") && el("reviewFilterDeviceId").value, "").trim();
  var result = safeText(el("reviewFilterResult") && el("reviewFilterResult").value, "").trim();
  var query = "?page=" + page + "&pageSize=" + state.reviewsPage.pageSize;
  if (alarmId) query += "&alarmId=" + encodeURIComponent(alarmId);
  if (deviceId) query += "&deviceId=" + encodeURIComponent(deviceId);
  if (result) query += "&result=" + encodeURIComponent(result);
  try {
    var data = await apiRequest("/ai-reviews" + query);
    state.reviewsPage = normalizePageResult(data, page, state.reviewsPage.pageSize);
    renderReviewTable();
    renderReviewPagination();
  } catch (error) {
    showGlobalAlert("AI复核记录加载失败: " + error.message);
  }
}
```

## 验证

在浏览器 DevTools Console 中手动调用 `loadReviewRows(1)`，确认能成功请求 `/api/v1/ai-reviews` 并返回数据（此时表格渲染会报错因为 renderReviewTable 尚未实现，这是预期的——Task 3 会实现）。
