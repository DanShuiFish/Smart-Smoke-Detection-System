# Task 1: HTML — 添加导航按钮和 AI 视觉复核视图区域

## 目标

在 `src/main/resources/static/fe2/dashboard-enhanced.html` 中添加 AI 视觉复核的导航按钮和完整视图区域。

## 改动文件

- Modify: `src/main/resources/static/fe2/dashboard-enhanced.html`

## 具体步骤

### Step 1: 添加导航按钮

在侧边栏 `#view-alarms` 的按钮（第25行，`data-view="alarms"`）之后，添加新按钮：

```html
<button class="nav-btn" data-view="reviews" title="AI视觉复核"><span class="nav-icon">视</span><span class="nav-text">AI视觉复核</span></button>
```

### Step 2: 添加 AI 复核视图区域

在第178行 `</section>`（告警日志 section `#view-alarms` 结束标签）之后、`<div id="detailModal">` 之前，插入以下完整视图区域：

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

## 验证

在浏览器中打开应用，登录后应看到侧边栏多出"AI视觉复核"按钮（图标"视"），点击后切换到 AI 视觉复核页面（表格暂无数据）。
