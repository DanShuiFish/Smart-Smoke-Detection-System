# Task 3: JS — 渲染复核列表表格和分页

## 目标

在 `dashboard-enhanced.js` 中添加表格渲染和分页渲染函数，使 Task 2 的 `loadReviewRows()` 能正确刷新 UI。

## 前置依赖

Task 2 已完成，以下函数已存在: `loadReviewRows()`, `formatReviewResult()`, `formatManualReview()`, `reviewResultClass()`, `manualReviewClass()`
状态变量 `state.reviewsPage` 已添加。

## 改动文件

- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

## 项目约定

同 Task 2。复用已有的 `safeText()`, `escapeHtml()`, `el()` 函数。

## 具体步骤

### Step 1: 添加 `renderReviewTable()` 函数

在 `loadReviewRows()` 之后添加：

```javascript
function renderReviewTable() {
  var body = el("reviewTableBody");
  if (!body) return;
  var rows = state.reviewsPage.records || [];
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="10"><div class="empty-state"><strong>暂无AI复核记录</strong><p>当前筛选条件下没有复核记录，请调整筛选条件后重试。</p></div></td></tr>';
    return;
  }
  body.innerHTML = rows.map(function(item) {
    var reviewClass = reviewResultClass(item.reviewResult);
    var manualClass = manualReviewClass(item.isManualReview, item.manualReviewResult);
    var manualText = formatManualReview(item.isManualReview, item.manualReviewResult);
    var confidenceText = item.confidence != null ? (Number(item.confidence)).toFixed(1) + "%" : "--";
    var canManualReview = Number(item.isManualReview) !== 1;
    var actions = '<button class="btn" data-review-detail="true" data-id="' + escapeHtml(safeText(item.id, "")) + '">详情</button>';
    if (canManualReview) {
      actions += '<button class="btn btn-main" data-review-confirm="true" data-id="' + escapeHtml(safeText(item.id, "")) + '" style="margin-left:4px;">确认</button>';
      actions += '<button class="btn danger" data-review-dismiss="true" data-id="' + escapeHtml(safeText(item.id, "")) + '" style="margin-left:4px;">驳回</button>';
    }
    return '<tr>' +
      '<td>' + escapeHtml(safeText(item.id, "--")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.alarmId, "--")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.deviceId, "--")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.reviewType, "SMOKE_FIRE")) + '</td>' +
      '<td><span class="status-badge ' + reviewClass + '">' + escapeHtml(formatReviewResult(item.reviewResult)) + '</span></td>' +
      '<td>' + escapeHtml(confidenceText) + '</td>' +
      '<td><span class="status-badge ' + manualClass + '">' + escapeHtml(manualText) + '</span></td>' +
      '<td>' + escapeHtml(safeText(item.manualReviewResult, "--")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.createTime, "--")) + '</td>' +
      '<td><div class="table-actions">' + actions + '</div></td>' +
      '</tr>';
  }).join("");
  // 绑定事件
  body.querySelectorAll("button[data-review-detail]").forEach(function(btn) {
    btn.addEventListener("click", function() { showReviewDetail(btn.dataset.id); });
  });
  body.querySelectorAll("button[data-review-confirm]").forEach(function(btn) {
    btn.addEventListener("click", function() { handleManualConfirm(btn.dataset.id, "CONFIRMED"); });
  });
  body.querySelectorAll("button[data-review-dismiss]").forEach(function(btn) {
    btn.addEventListener("click", function() { handleManualConfirm(btn.dataset.id, "DISMISSED"); });
  });
}
```

### Step 2: 添加 `renderReviewPagination()` 函数

在 `renderReviewTable()` 之后添加：

```javascript
function renderReviewPagination() {
  var node = el("reviewPagination");
  if (!node) return;
  var page = state.reviewsPage.page || 1;
  var pages = state.reviewsPage.pages || 1;
  var total = state.reviewsPage.total || 0;
  node.innerHTML = '<span class="page-info">第 ' + page + ' / ' + pages + ' 页，共 ' + total + ' 条</span><div class="page-actions"><button class="btn" data-page="prev" ' + (page <= 1 ? 'disabled' : '') + '>上一页</button><button class="btn" data-page="next" ' + (page >= pages ? 'disabled' : '') + '>下一页</button></div>';
  node.querySelectorAll("button[data-page]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var targetPage = btn.dataset.page === "next" ? page + 1 : page - 1;
      loadReviewRows(targetPage);
    });
  });
}
```

## 验证

在浏览器中进入 AI 视觉复核页面，确认表格正确渲染复核记录，分页按钮正常。但"详情"/"确认"/"驳回"按钮点击会报错（因为 `showReviewDetail` 和 `handleManualConfirm` 尚未实现——Task 4 会实现）。
