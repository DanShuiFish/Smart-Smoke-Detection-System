# Task 6 实施报告

## 改动文件

`src/main/resources/static/fe2/dashboard-enhanced.js`

## 改动内容

### 1. switchView() — map 对象添加 reviews 视图映射

在 `map` 对象中 `alarms` 条目之后添加了：
```javascript
reviews: ["AI 视觉复核", "查看 AI 火焰/烟雾识别结果，支持人工复核确认"],
```

### 2. switchView() — 自动加载复核数据

在 `setTimeout(resizeVisibleCharts, 80);` 之前添加了：
```javascript
if (view === "reviews") { loadReviewRows(1); }
```

### 3. bindEvents() — 复核页面按钮事件绑定

在 `bindEvents()` 函数末尾、`bindQuickQs()` 调用之前，新增了以下绑定：

- **btnRefreshReviews** — 点击时调用 `loadReviewRows(1)` 刷新数据
- **btnSearchReviews** — 点击时调用 `loadReviewRows(1)` 按筛选条件查询
- **btnResetReviews** — 点击时清空三个筛选框（`reviewFilterAlarmId`, `reviewFilterDeviceId`, `reviewFilterResult`）并重新加载
- **reviewFilterAlarmId / reviewFilterDeviceId** — 回车键触发 `loadReviewRows(1)`

所有变量使用 `var` 声明，回调使用 `function` 表达式，严格遵循任务规范。

## 验证要点

1. 侧边栏"AI视觉复核"按钮点击后，标题显示"AI 视觉复核"，自动加载第一页数据
2. 刷新按钮重新加载数据
3. 输入告警ID/设备ID后点击查询或回车，按条件筛选
4. 重置按钮清空条件并重新加载全部数据
5. 已有的事件绑定未受影响
