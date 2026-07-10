# AI视觉复核前端功能修复 实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在管理端前端（`fe2/dashboard-enhanced.html` + `dashboard-enhanced.js`）中补齐 AI 视觉复核的完整 UI，使后端已有的 `/api/v1/ai-reviews` 三个端点可在前端正常使用。

**Architecture:** 纯前端改动，不修改后端代码。在管理端新增"AI视觉复核"导航页，包含复核记录列表（分页+筛选）、复核详情弹窗（含 imageUrl、confidence、aiRawResponse）、人工确认/驳回操作按钮。同时修复管理端告警详情弹窗，使其像住户端一样展示 AI 复核结果。

**Tech Stack:** Vanilla JS + HTML + CSS（复用现有 dashboard-enhanced.css 样式体系）

## 根因分析

后端 `AiReviewController`（`/api/v1/ai-reviews`）已完整实现 3 个端点（列表、详情、人工确认），`AlarmController.getById()` 也在告警详情中嵌套返回 `aiReview` 数据。但管理端前端 `dashboard-enhanced.js` 对 AI 复核功能**零引用**——没有导航标签、没有列表页、没有详情弹窗、没有确认/驳回按钮。管理端 `showAlarmDetail()` 也忽略了 `aiReview` 字段。住户端 `user/user.js` 仅在告警详情弹窗中显示了 `aiReview.reviewResult` 文本。

## Global Constraints

- 不修改后端 Java 代码
- 复用现有 CSS class（`panel`, `data-table`, `modal`, `pagination-bar`, `status-badge`, `chip` 等）
- 遵循现有 JS 代码风格（`state` 对象管理状态、`el()` 快捷函数、`apiRequest()` 封装、`escapeHtml()` / `safeText()` 工具函数）
- 所有新增文案使用中文

---

### Task 1: HTML — 添加导航按钮和 AI 视觉复核视图区域

**Files:**
- Modify: `src/main/resources/static/fe2/dashboard-enhanced.html`

**Interfaces:**
- Produces: 导航按钮 `data-view="reviews"`，视图区域 `#view-reviews`，表格 `#reviewTableBody`，分页 `#reviewPagination`，筛选控件 `#reviewFilterAlarmId` / `#reviewFilterDeviceId` / `#reviewFilterResult`

- [ ] **Step 1: 在侧边栏导航中添加"AI视觉复核"按钮**

在 `dashboard-enhanced.html` 第 25 行（告警日志按钮之后）插入新按钮：

```html
<button class="nav-btn" data-view="reviews" title="AI视觉复核"><span class="nav-icon">视</span><span class="nav-text">AI视觉复核</span></button>
```

- [ ] **Step 2: 在最后一个 `</section>` 之后、`<div id="detailModal">` 之前添加 AI 复核视图区域**

在 `</section>`（告警日志 section 结束标签，约第 178 行）之后插入：

```html
<section id="view-reviews" class="view">
  <div class="module-heading">
    <div><h3>AI 视觉复核</h3><p>查看 AI 火焰/烟雾识别结果，支持人工复核确认</p></div>
    <button id="btnRefreshReviews" class="btn">刷新</button>
  </div>
  <div class="panel">
    <div class="panel-header">
      <h3>复核记录列表</h3>
      <div class="toolbar">
        <input id="reviewFilterAlarmId" type="text" placeholder="告警ID" style="width:100px;" />
        <input id="reviewFilterDeviceId" type="text" placeholder="设备ID" style="width:100px;" />
        <select id="reviewFilterResult">
          <option value="">全部结果</option>
          <option value="FIRE_CONFIRMED">AI确认火情</option>
          <option value="NO_FIRE">AI排除火情</option>
          <option value="UNCERTAIN">不确定</option>
        </select>
        <button id="btnSearchReviews" class="btn btn-main">查询</button>
        <button id="btnResetReviews" class="btn">重置</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>告警ID</th>
            <th>设备ID</th>
            <th>复核类型</th>
            <th>AI 判定结果</th>
            <th>置信度</th>
            <th>人工复核</th>
            <th>人工结果</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="reviewTableBody"></tbody>
      </table>
    </div>
    <div id="reviewPagination" class="pagination-bar"></div>
  </div>
</section>
```

- [ ] **Step 3: 验证 HTML 结构**

在浏览器中打开 `index.html` 登录后应看到侧边栏多出"AI视觉复核"按钮，点击后切换到复核记录页面（暂无数据）。

---

### Task 2: JS — 添加状态管理、格式化函数和数据加载

**Files:**
- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

**Interfaces:**
- Consumes: `API_BASE`, `state`, `apiRequest()`, `normalizePageResult()`, `safeText()`, `escapeHtml()`, `el()`, `renderEmptyState()`, `openDetailModal()`, `showGlobalAlert()`
- Produces: `state.reviewsPage`, `formatReviewResult()`, `formatManualReview()`, `loadReviewRows()`, `renderReviewTable()`, `renderReviewPagination()`

- [ ] **Step 1: 在 `state` 对象中添加复核页面状态**

找到 `state` 对象定义（约第 1-19 行），在 `bindingsPage` 之后添加：

```javascript
reviewsPage: { page: 1, pageSize: 10, total: 0, pages: 1, records: [] },
```

- [ ] **Step 2: 添加 AI 复核格式化辅助函数**

在 `alarmLevelClass()` 函数之后（约第 175 行）添加：

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

- [ ] **Step 3: 添加 `loadReviewRows()` 数据加载函数**

在 `loadAlarmRows()` 函数之后（约第 1299 行）添加：

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

- [ ] **Step 4: 测试数据加载**

打开浏览器 DevTools Console，手动调用 `loadReviewRows(1)`，确认能成功请求 `/api/v1/ai-reviews?page=1&pageSize=10` 并返回数据。

---

### Task 3: JS — 渲染复核列表表格和分页

**Files:**
- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

**Interfaces:**
- Consumes: `state.reviewsPage`, `loadReviewRows()`, DOM元素 `#reviewTableBody`, `#reviewPagination`
- Produces: `renderReviewTable()`, `renderReviewPagination()`

- [ ] **Step 1: 添加 `renderReviewTable()` 函数**

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

- [ ] **Step 2: 添加 `renderReviewPagination()` 函数**

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

- [ ] **Step 3: 测试表格渲染**

在浏览器中进入 AI 视觉复核页面，确认表格正确渲染复核记录，分页功能正常。

---

### Task 4: JS — AI 复核详情弹窗和人工确认/驳回

**Files:**
- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

**Interfaces:**
- Consumes: `apiRequest()`, `openDetailModal()`, `showGlobalAlert()`, `loadReviewRows()`, `safeText()`, `escapeHtml()`
- Produces: `showReviewDetail()`, `handleManualConfirm()`

- [ ] **Step 1: 添加 `showReviewDetail()` 函数**

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

- [ ] **Step 2: 添加 `handleManualConfirm()` 函数**

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

- [ ] **Step 3: 测试详情和确认功能**

在浏览器中点击某条复核记录的"详情"按钮，确认弹窗展示完整数据。点击"确认"或"驳回"按钮，确认操作成功后列表刷新、状态更新。

---

### Task 5: JS — 修复管理端告警详情显示 AI 复核数据

**Files:**
- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

**Interfaces:**
- Consumes: `apiRequest()`, `openDetailModal()`, `formatReviewResult()`, `safeText()`
- Modifies: `showAlarmDetail()` 函数

- [ ] **Step 1: 重写 `showAlarmDetail()` 为异步函数，从后端获取完整告警详情（含 AI 复核）**

找到原 `showAlarmDetail()` 函数（约第 631-643 行），替换为：

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

- [ ] **Step 2: 测试告警详情中的 AI 复核展示**

在告警日志页面点击某条告警的"详情"按钮，确认弹窗中显示 AI 复核结果区域。

---

### Task 6: JS — 导航和事件绑定

**Files:**
- Modify: `src/main/resources/static/fe2/dashboard-enhanced.js`

**Interfaces:**
- Consumes: `switchView()`, `bindEvents()`, `loadReviewRows()`
- Modifies: `switchView()` 中的视图映射，`bindEvents()` 中添加复核页面事件

- [ ] **Step 1: 在 `switchView()` 中添加 "reviews" 视图映射**

找到 `switchView()` 函数中的 `map` 定义（约第 262-268 行），在其中添加：

```javascript
reviews: ["AI 视觉复核", "查看 AI 火焰/烟雾识别结果，支持人工复核确认"],
```

- [ ] **Step 2: 在 `switchView()` 中添加切换到复核页时自动加载数据**

在 `switchView()` 函数末尾（`setTimeout(resizeVisibleCharts, 80);` 之前），添加：

```javascript
if (view === "reviews") { loadReviewRows(1); }
```

- [ ] **Step 3: 在 `bindEvents()` 中添加复核页面按钮事件绑定**

找到 `bindEvents()` 函数（约第 1324 行），在其中添加以下事件绑定（放在其他按钮绑定附近）：

```javascript
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
```

同时在筛选输入框上绑定回车键：

```javascript
[el("reviewFilterAlarmId"), el("reviewFilterDeviceId")].forEach(function(node) {
  if (node) node.addEventListener("keydown", function(event) { if (event.key === "Enter") loadReviewRows(1); });
});
```

- [ ] **Step 4: 端到端测试**

1. 登录管理端 → 侧边栏可见"AI视觉复核"按钮
2. 点击 → 进入复核列表页 → 标题显示"AI 视觉复核"
3. 列表正常加载数据 → 分页正常
4. 筛选条件（告警ID、设备ID、结果）生效
5. 点击"详情" → 弹窗展示完整复核信息（含置信度、AI原始响应）
6. 点击"确认"/"驳回" → 操作成功 → 列表刷新
7. 切换到"告警日志" → 点击告警详情 → 弹窗底部展示 AI 复核结果

---

### Task 7: 验证与提交

**Files:**
- 无需修改，纯验证步骤

- [ ] **Step 1: 本地启动验证**

```bash
# 确保后端在 IDEA 中运行
# 浏览器访问 http://localhost:8080/index.html
# 使用 admin / admin123 登录
```

- [ ] **Step 2: 功能检查清单**

- [ ] 侧边栏有"AI视觉复核"按钮（图标"视"）
- [ ] 点击后正确切换视图，标题显示"AI 视觉复核"
- [ ] 复核列表正确分页展示数据
- [ ] 按告警ID筛选生效
- [ ] 按设备ID筛选生效
- [ ] 按复核结果（FIRE_CONFIRMED / NO_FIRE）筛选生效
- [ ] 重置按钮清空筛选条件
- [ ] 详情弹窗展示所有字段（含 aiRawResponse）
- [ ] 确认按钮弹出确认框，操作后状态更新
- [ ] 驳回按钮弹出确认框，操作后状态更新
- [ ] 已复核的记录不再显示确认/驳回按钮
- [ ] 告警日志详情弹窗展示 AI 复核数据
- [ ] 无数据时显示空状态提示

- [ ] **Step 3: 浏览器 DevTools 检查**

- Network 面板：确认 `/api/v1/ai-reviews` 请求正常（200）
- Console 面板：无 JS 报错

- [ ] **Step 4: 提交代码**

```bash
git add src/main/resources/static/fe2/dashboard-enhanced.html
git add src/main/resources/static/fe2/dashboard-enhanced.js
git commit -m "feat: 管理端新增AI视觉复核页面，支持列表/详情/人工确认/驳回"
```
