# Task 6: JS — 导航和事件绑定

## 目标

将所有新增的 AI 复核功能接入导航系统和事件系统，确保用户可通过侧边栏切换视图、点击按钮触发操作、回车键筛选。

## 前置依赖

Tasks 2-5 已完成。所有核心函数已存在:
- `loadReviewRows()`, `renderReviewTable()`, `renderReviewPagination()`
- `showReviewDetail()`, `handleManualConfirm()`
- `showAlarmDetail()` (已重写)
- `switchView()`, `bindEvents()`, `state`

## 改动文件

- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

## 具体步骤

### Step 1: 在 `switchView()` 中添加 "reviews" 视图映射

找到 `switchView()` 函数（约第 256 行），在其中的 `map` 对象中添加一行：

```javascript
reviews: ["AI 视觉复核", "查看 AI 火焰/烟雾识别结果，支持人工复核确认"],
```

`map` 对象当前结构参考：
```javascript
var map = {
  screen: ["首页 / 数据大屏", "设备态势、实时监测、告警联动"],
  devices: ["设备管理", "设备状态、关键参数与运行信息"],
  analysis: ["数据分析", "趋势分析、类型占比与楼栋分布"],
  ai: ["AI 智能问答", "知识问答与火情研判"],
  alarms: ["告警日志", "告警记录、确认和处置流程"],
  // 添加在这里:
  reviews: ["AI 视觉复核", "查看 AI 火焰/烟雾识别结果，支持人工复核确认"],
};
```

### Step 2: 在 `switchView()` 中添加切换到复核页时自动加载数据

在 `switchView()` 函数内部的 `setTimeout(resizeVisibleCharts, 80);` 之前，添加：

```javascript
if (view === "reviews") { loadReviewRows(1); }
```

这确保切换到 AI 复核页面时自动加载第一页数据。

### Step 3: 在 `bindEvents()` 中添加复核页面按钮事件绑定

在 `bindEvents()` 函数中（约第 1324 行），在其他按钮事件绑定附近添加以下代码块。

需要绑定的按钮和功能:

```javascript
// ------ AI复核页面事件 ------
var btnRefreshReviews = el("btnRefreshReviews");
var btnSearchReviews = el("btnSearchReviews");
var btnResetReviews = el("btnResetReviews");
if (btnRefreshReviews) btnRefreshReviews.addEventListener("click", function() { loadReviewRows(1); });
if (btnSearchReviews) btnSearchReviews.addEventListener("click", function() { loadReviewRows(1); });
if (btnResetReviews) btnResetReviews.addEventListener("click", function() {
  if (el("reviewFilterAlarmId")) el("reviewFilterAlarmId").value = "";
  if (el("reviewFilterDeviceId")) el("reviewFilterDeviceId").value = "";
  if (el("reviewFilterResult")) el("reviewFilterResult").value = "";
  loadReviewRows(1);
});

// 筛选输入框回车键支持
[el("reviewFilterAlarmId"), el("reviewFilterDeviceId")].forEach(function(node) {
  if (node) node.addEventListener("keydown", function(event) { if (event.key === "Enter") loadReviewRows(1); });
});
```

### 注意事项

- 所有按钮元素在 Task 1 的 HTML 中已创建，此处只需绑定事件
- 导航按钮 (`data-view="reviews"`) 在 `initMenus()` 中已通过 `document.querySelectorAll(".nav-btn")` 自动绑定，无需额外处理
- 表格中的详情/确认/驳回按钮事件在 Task 3 的 `renderReviewTable()` 中已绑定，无需重复
- 告警详情按钮的事件绑定保持不变（已在 `renderAlarmTable()` 中绑定 `data-alarm-detail`）

## 验证

在浏览器中：
1. 点击侧边栏"AI视觉复核"按钮 → 标题显示"AI 视觉复核" → 自动加载数据
2. 点击"刷新"按钮 → 重新加载数据
3. 输入告警ID/设备ID后点击"查询" → 按条件筛选
4. 输入告警ID/设备ID后按回车 → 按条件筛选
5. 点击"重置" → 清空筛选条件 → 重新加载全部数据
6. 切换到其他视图再切回 → 页面状态正确
