const API_BASE = "/api/v1";
const state = {
  currentView: "screen",
  aiSessionId: "",
  selectedDeviceId: "",
  selectedDeviceIds: [],
  selectedAlarmIds: [],
  screen: { stats: {}, realtime: {}, alarmSample: [] },
  analysis: { alarmTrend: [], alarmSample: [], deviceStats: [] },
  devicesPage: { page: 1, pageSize: 10, total: 0, pages: 1, records: [] },
  alarmsPage: { page: 1, pageSize: 10, total: 0, pages: 1, records: [] },
};

const charts = {
  screenRealtime: null,
  screenDeviceStatus: null,
  screenAlarmType: null,
  screenHeatmap: null,
  screenTrend: null,
  screenBuilding: null,
  analysisTrend: null,
  analysisAlarmType: null,
  analysisDeviceStatus: null,
  analysisBuilding: null,
};

function el(id) { return document.getElementById(id); }
function safeText(value, fallback = "--") { return value === null || value === undefined || value === "" ? fallback : String(value); }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;"); }
function buildSessionId() { return "sess-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8); }
function getToken() { return localStorage.getItem("smartSmokeToken") || localStorage.getItem("token") || ""; }

async function apiRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(API_BASE + path, { ...options, headers });
  if (!response.ok) throw new Error("HTTP " + response.status + " " + path);
  const body = await response.json();
  if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "code")) {
    if (body.code !== 200) throw new Error(body.msg || body.message || "接口返回失败");
    return body.data;
  }
  return body;
}

function setClock() {
  const node = el("clock");
  if (node) node.textContent = new Date().toLocaleString("zh-CN", { hour12: false });
}
function setChip(id, text, level) {
  const node = el(id);
  if (!node) return;
  node.textContent = text;
  node.classList.remove("ok", "warn", "danger");
  if (level) node.classList.add(level);
}
function setSyncTime() {
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  setChip("systemLastSync", "最近同步: " + now);
  const footer = el("footerSyncTime");
  if (footer) footer.textContent = "最后同步: " + now;
}

function normalizePageResult(payload, fallbackPage = 1, fallbackPageSize = 10) {
  const source = payload && typeof payload === "object" ? payload : {};
  const records = Array.isArray(source.records) ? source.records : Array.isArray(source.list) ? source.list : Array.isArray(source) ? source : [];
  const page = Number(source.page || source.current || fallbackPage || 1);
  const pageSize = Number(source.pageSize || fallbackPageSize || records.length || 10);
  const total = Number(source.total || records.length || 0);
  const pages = Number(source.pages || Math.max(1, Math.ceil(total / Math.max(pageSize, 1))));
  return { page, pageSize, total, pages, records };
}
function alarmStatusClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "PENDING" || s === "CONFIRMING") return "warn";
  if (s === "RESOLVED" || s === "ARCHIVED" || s === "CLOSED") return "ok";
  if (s === "CONFIRMED") return "info";
  return "info";
}
function alarmLevelClass(level) {
  const s = String(level || "").toUpperCase();
  if (s === "HIGH" || s === "CRITICAL") return "danger";
  if (s === "MEDIUM") return "warn";
  return "info";
}
function deviceStatusClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "ONLINE") return "ok";
  if (s === "OFFLINE") return "warn";
  if (s === "ERROR") return "danger";
  return "info";
}
function renderEmptyState(node, title, desc) {
  if (!node) return;
  node.innerHTML = '<div class="empty-state"><strong>' + escapeHtml(title) + '</strong><p>' + escapeHtml(desc) + '</p></div>';
}
function disposeChart(key) { if (charts[key]) { charts[key].dispose(); charts[key] = null; } }
function ensureChart(key, nodeId) {
  const node = el(nodeId);
  if (!node || typeof echarts === "undefined") return null;
  if (!charts[key]) charts[key] = echarts.init(node);
  return charts[key];
}
function renderChart(key, nodeId, option, hasData, emptyTitle, emptyDesc) {
  const node = el(nodeId);
  if (!node) return;
  if (!hasData) { disposeChart(key); renderEmptyState(node, emptyTitle, emptyDesc); return; }
  node.innerHTML = "";
  const chart = ensureChart(key, nodeId);
  if (chart) chart.setOption(option, true);
}
function resizeVisibleCharts() { Object.values(charts).forEach((chart) => { if (chart && typeof chart.resize === "function") chart.resize(); }); }
function getActiveAlarm() {
  const realtime = state.screen.realtime || {};
  const active = Array.isArray(realtime.activeAlarms) ? realtime.activeAlarms[0] : null;
  if (active) return active;
  return state.analysis.alarmSample.find((item) => String(item.alarmStatus || "").toUpperCase() === "PENDING") || state.screen.alarmSample[0] || null;
}

function setNavState(view) { document.querySelectorAll(".nav-btn").forEach((item) => item.classList.toggle("active", item.dataset.view === view)); }
function switchView(view) {
  state.currentView = view;
  document.querySelectorAll(".view").forEach((node) => node.classList.remove("active"));
  const target = el("view-" + view);
  if (target) target.classList.add("active");
  setNavState(view);
  const map = {
    screen: ["首页 / 数据大屏", "设备态势、实时监测、告警联动"],
    devices: ["设备管理", "设备状态、关键参数与运行信息"],
    analysis: ["数据分析", "趋势分析、类型占比与楼栋分布"],
    ai: ["AI 智能问答", "知识问答与火情研判"],
    alarms: ["告警日志", "告警记录、确认和处置流程"],
  };
  const pair = map[view] || map.screen;
  const title = el("viewTitle");
  const subtitle = el("viewSubTitle");
  const banner = el("bannerTitle");
  if (title) title.textContent = pair[0];
  if (subtitle) subtitle.textContent = pair[1];
  if (banner) banner.textContent = pair[0];
  setTimeout(resizeVisibleCharts, 80);
}
function initMenus() {
  document.querySelectorAll(".nav-btn").forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));
  const openAlarms = el("btnOpenAlarms");
  if (openAlarms) openAlarms.addEventListener("click", () => switchView("alarms"));
}

function renderScreenKpi() {
  const stats = state.screen.stats || {};
  const total = Number(stats.totalDevices || 0);
  const online = Number(stats.onlineDevices || 0);
  const today = Number(stats.todayAlarms || 0);
  const pending = Number(stats.pendingAlarms || 0);
  const onlineRate = total > 0 ? ((online / total) * 100).toFixed(1) : "0.0";
  el("kpiTotalDevices").textContent = String(total);
  el("kpiOnlineDevices").textContent = String(online);
  el("kpiTodayAlarms").textContent = String(today);
  el("kpiPendingAlarms").textContent = String(pending);
  const onlineRateNode = el("screenOnlineRate");
  if (onlineRateNode) onlineRateNode.textContent = onlineRate;
  setChip("activeAlarmStatus", "活跃告警: " + String(pending), pending > 0 ? "warn" : "ok");
}
function renderLatestMetrics() {
  const realtime = state.screen.realtime || {};
  const latestList = Array.isArray(realtime.latestData) ? realtime.latestData : [];
  const latest = latestList.length ? latestList[latestList.length - 1] : null;
  const smoke = Number(latest && (latest.smoke || latest.smokeValue || latest.smokeConcentration) || 0);
  const temp = Number(latest && (latest.temperature || latest.tempValue) || 0);
  const signal = Number(latest && (latest.signalStrength || latest.rssi) || 0);
  const smokeNode = el("screenSmokeValue");
  const tempNode = el("screenTempValue");
  const signalNode = el("screenSignalValue");
  if (smokeNode) smokeNode.textContent = latest ? smoke.toFixed(1) : "--";
  if (tempNode) tempNode.textContent = latest ? temp.toFixed(1) : "--";
  if (signalNode) signalNode.textContent = latest && Number.isFinite(signal) ? String(signal) : "--";
}
function getScreenDeviceStatusData() {
  const realtime = state.screen.realtime || {};
  const map = realtime.deviceStatusMap || {};
  const stats = state.screen.stats || {};
  const source = {
    ONLINE: Number(map.ONLINE || stats.onlineDevices || 0),
    OFFLINE: Number(map.OFFLINE || stats.offlineDevices || 0),
    ERROR: Number(map.ERROR || stats.errorDevices || 0),
    INACTIVE: Number(map.INACTIVE || 0),
  };
  return Object.keys(source).map((name) => ({ name, value: source[name] }));
}
function buildAlarmTypeSeries(rows) {
  const counts = {};
  (rows || []).forEach((item) => { const name = safeText(item.alarmType || item.type || item.alarmName || "未分类"); counts[name] = (counts[name] || 0) + 1; });
  return Object.keys(counts).map((name) => ({ name, value: counts[name] }));
}
function buildHeatmapData(points, alarms) {
  const buildingMap = new Map();
  const floorMap = new Map();
  const matrix = new Map();
  const add = (building, floor, weight) => {
    const b = safeText(building, "未分类楼栋");
    const f = safeText(floor, "未分类楼层");
    if (!buildingMap.has(b)) buildingMap.set(b, buildingMap.size);
    if (!floorMap.has(f)) floorMap.set(f, floorMap.size);
    const key = b + "::" + f;
    matrix.set(key, (matrix.get(key) || 0) + Number(weight || 1));
  };
  (points || []).forEach((item) => add(item.locationBuilding || item.building, item.locationFloor || item.floor, 1));
  (alarms || []).forEach((item) => add(item.locationBuilding || item.building, item.locationFloor || item.floor, 2));
  const buildings = Array.from(buildingMap.keys());
  const floors = Array.from(floorMap.keys());
  const data = [];
  matrix.forEach((value, key) => { const pair = key.split("::"); data.push([buildingMap.get(pair[0]), floorMap.get(pair[1]), value]); });
  return { buildings, floors, data };
}
function renderScreenAlarmList() {
  const list = el("screenAlarmList");
  const rows = (state.screen.alarmSample || []).slice(0, 8);
  if (!rows.length) { renderEmptyState(list, "暂无告警", "当前没有可展示的活跃告警数据。请稍后刷新或检查后端数据。"); return; }
  list.innerHTML = rows.map((item) => {
    const levelClass = alarmLevelClass(item.alarmLevel);
    return '<li class="list-item alarm-card ' + levelClass + '"><div class="card-row"><strong>' + escapeHtml(safeText(item.alarmType, "告警")) + '</strong><span class="status-badge ' + alarmStatusClass(item.alarmStatus) + '">' + escapeHtml(safeText(item.alarmStatus, "--")) + '</span></div><div style="margin-top:6px;color:#64748b;">设备: ' + escapeHtml(safeText(item.deviceId, "--")) + ' · 楼栋: ' + escapeHtml(safeText(item.locationBuilding || item.building, "--")) + '</div></li>';
  }).join("");
}
function renderScreenCharts() {
  const realtime = state.screen.realtime || {};
  const latestData = Array.isArray(realtime.latestData) ? realtime.latestData : [];
  const xAxis = latestData.map((item, index) => safeText(item.createTime || item.time || item.timestamp || index + 1, ""));
  const smokeSeries = latestData.map((item) => Number(item.smoke || item.smokeValue || item.smokeConcentration || 0));
  const tempSeries = latestData.map((item) => Number(item.temperature || item.tempValue || 0));
  renderChart("screenRealtime", "chartRealtime", {
    tooltip: { trigger: "axis" }, legend: { top: 0, textStyle: { color: "#475569" } }, grid: { left: 44, right: 20, top: 34, bottom: 30 },
    xAxis: { type: "category", data: xAxis, axisLabel: { color: "#64748b" }, axisLine: { lineStyle: { color: "#cbd5e1" } } },
    yAxis: { type: "value", axisLabel: { color: "#64748b" }, splitLine: { lineStyle: { color: "rgba(148,163,184,0.18)" } } },
    series: [
      { name: "烟雾", type: "line", smooth: true, data: smokeSeries, itemStyle: { color: "#2563eb" }, areaStyle: { color: "rgba(37,99,235,0.12)" } },
      { name: "温度", type: "line", smooth: true, data: tempSeries, itemStyle: { color: "#f97316" }, areaStyle: { color: "rgba(249,115,22,0.08)" } },
    ],
  }, latestData.length > 0, "暂无趋势数据", "当前没有可用的实时传感器数据，稍后刷新或检查设备在线状态。");

  const deviceStatusData = getScreenDeviceStatusData();
  renderChart("screenDeviceStatus", "chartScreenDeviceStatus", {
    tooltip: { trigger: "item" }, legend: { bottom: 0, textStyle: { color: "#475569" } },
    series: [{ type: "pie", radius: ["45%", "72%"], center: ["50%", "48%"], avoidLabelOverlap: false, label: { color: "#334155" }, data: deviceStatusData, itemStyle: { borderColor: "#fff", borderWidth: 2 } }],
  }, deviceStatusData.some((item) => Number(item.value) > 0), "暂无设备状态", "设备在线状态暂无统计数据，请先刷新后端接口或检查设备统计是否返回。");

  const alarmTypeData = buildAlarmTypeSeries(state.screen.alarmSample);
  renderChart("screenAlarmType", "chartScreenAlarmType", {
    tooltip: { trigger: "item" }, legend: { bottom: 0, textStyle: { color: "#475569" } },
    series: [{ type: "pie", radius: ["42%", "70%"], center: ["50%", "48%"], data: alarmTypeData, itemStyle: { borderColor: "#fff", borderWidth: 2 }, label: { color: "#334155" } }],
  }, alarmTypeData.some((item) => Number(item.value) > 0), "暂无类型占比", "当前没有足够的告警样本用于生成告警类型占比图。");

  const heatmap = buildHeatmapData(latestData, state.screen.alarmSample);
  renderChart("screenHeatmap", "chartHeatmap", {
    tooltip: { trigger: "item", formatter: (params) => {
      const value = params.value || [];
      return escapeHtml(safeText(heatmap.buildings[value[0]], "未知楼栋")) + " / " + escapeHtml(safeText(heatmap.floors[value[1]], "未知楼层")) + "<br/>热度: " + escapeHtml(safeText(value[2], 0));
    } },
    grid: { left: 48, right: 18, top: 20, bottom: 52 },
    xAxis: { type: "category", data: heatmap.buildings, axisLabel: { color: "#64748b" }, axisLine: { lineStyle: { color: "#cbd5e1" } } },
    yAxis: { type: "category", data: heatmap.floors, axisLabel: { color: "#64748b" }, axisLine: { lineStyle: { color: "#cbd5e1" } } },
    visualMap: { min: 0, max: Math.max(5, ...heatmap.data.map((item) => Number(item[2] || 0))), orient: "horizontal", left: "center", bottom: 4, textStyle: { color: "#64748b" }, inRange: { color: ["#eff6ff", "#bfdbfe", "#60a5fa", "#f97316", "#ef4444"] } },
    series: [{ type: "heatmap", data: heatmap.data, label: { show: false } }],
  }, heatmap.data.length > 0, "暂无热力分布", "当前没有可用的楼栋与楼层维度数据。");

  const sevenDayTrend = Array.isArray(state.analysis.alarmTrend) ? state.analysis.alarmTrend : [];
  renderChart("screenTrend", "chartScreenTrend", {
    tooltip: { trigger: "axis" }, grid: { left: 42, right: 18, top: 28, bottom: 34 },
    xAxis: { type: "category", data: sevenDayTrend.map((item) => item.date), axisLabel: { color: "#64748b" }, axisLine: { lineStyle: { color: "#cbd5e1" } } },
    yAxis: { type: "value", axisLabel: { color: "#64748b" }, splitLine: { lineStyle: { color: "rgba(148,163,184,0.18)" } } },
    series: [{ type: "bar", data: sevenDayTrend.map((item) => Number(item.total || 0)), itemStyle: { color: "#2563eb" } }],
  }, sevenDayTrend.length > 0, "暂无七日趋势", "告警趋势数据暂不可用，请先加载数据分析接口。");

  const buildingData = Array.isArray(state.analysis.deviceStats) ? state.analysis.deviceStats.map((item) => ({ name: safeText(item.building, "未分类"), value: Number(item.total || 0) })) : [];
  renderChart("screenBuilding", "chartScreenBuilding", {
    tooltip: { trigger: "axis" }, grid: { left: 42, right: 18, top: 28, bottom: 36 },
    xAxis: { type: "category", data: buildingData.map((item) => item.name), axisLabel: { color: "#64748b" }, axisLine: { lineStyle: { color: "#cbd5e1" } } },
    yAxis: { type: "value", axisLabel: { color: "#64748b" }, splitLine: { lineStyle: { color: "rgba(148,163,184,0.18)" } } },
    series: [{ type: "bar", data: buildingData.map((item) => item.value), itemStyle: { color: "#f97316" } }],
  }, buildingData.some((item) => Number(item.value) > 0), "暂无楼栋分布", "设备楼栋分布暂不可用，请先加载数据分析接口。");
}
function renderAnalysisCharts() {
  const trend = state.analysis.alarmTrend || [];
  renderChart("analysisTrend", "chartAlarmTrend", {
    tooltip: { trigger: "axis" }, legend: { top: 0, textStyle: { color: "#475569" } }, grid: { left: 44, right: 20, top: 34, bottom: 32 },
    xAxis: { type: "category", data: trend.map((item) => item.date), axisLabel: { color: "#64748b" }, axisLine: { lineStyle: { color: "#cbd5e1" } } },
    yAxis: { type: "value", axisLabel: { color: "#64748b" }, splitLine: { lineStyle: { color: "rgba(148,163,184,0.18)" } } },
    series: [
      { name: "总告警", type: "bar", data: trend.map((item) => Number(item.total || 0)), itemStyle: { color: "#2563eb" } },
      { name: "烟雾超标", type: "line", smooth: true, data: trend.map((item) => Number(item.smokeOverflow || 0)), itemStyle: { color: "#f97316" } },
      { name: "设备离线", type: "line", smooth: true, data: trend.map((item) => Number(item.deviceOffline || 0)), itemStyle: { color: "#ef4444" } },
    ],
  }, trend.length > 0, "暂无趋势数据", "告警趋势接口尚未返回有效数据，请检查 dashboard/alarm-stats。");
  const alarmTypes = buildAlarmTypeSeries(state.analysis.alarmSample);
  renderChart("analysisAlarmType", "chartAlarmType", {
    tooltip: { trigger: "item" }, legend: { bottom: 0, textStyle: { color: "#475569" } },
    series: [{ type: "pie", radius: ["42%", "70%"], center: ["50%", "48%"], data: alarmTypes, label: { color: "#334155" }, itemStyle: { borderColor: "#fff", borderWidth: 2 } }],
  }, alarmTypes.some((item) => Number(item.value) > 0), "暂无类型占比", "告警样本不足，无法生成类型占比图。");
  const deviceTotals = { ONLINE: 0, OFFLINE: 0, ERROR: 0, INACTIVE: 0 };
  (state.analysis.deviceStats || []).forEach((item) => { deviceTotals.ONLINE += Number(item.online || 0); deviceTotals.OFFLINE += Number(item.offline || 0); deviceTotals.ERROR += Number(item.error || 0); deviceTotals.INACTIVE += Number(item.inactive || 0); });
  const deviceStatusData = Object.keys(deviceTotals).map((name) => ({ name, value: deviceTotals[name] }));
  renderChart("analysisDeviceStatus", "chartDeviceStatus", {
    tooltip: { trigger: "item" }, legend: { bottom: 0, textStyle: { color: "#475569" } },
    series: [{ type: "pie", radius: ["42%", "70%"], center: ["50%", "48%"], data: deviceStatusData, label: { color: "#334155" }, itemStyle: { borderColor: "#fff", borderWidth: 2 } }],
  }, deviceStatusData.some((item) => Number(item.value) > 0), "暂无设备状态", "设备状态统计为空，请检查 dashboard/device-stats。");
  const buildingData = (state.analysis.deviceStats || []).map((item) => ({ name: safeText(item.building, "未分类"), value: Number(item.total || 0) }));
  renderChart("analysisBuilding", "chartDeviceBuilding", {
    tooltip: { trigger: "axis" }, grid: { left: 42, right: 20, top: 32, bottom: 36 },
    xAxis: { type: "category", data: buildingData.map((item) => item.name), axisLabel: { color: "#64748b" }, axisLine: { lineStyle: { color: "#cbd5e1" } } },
    yAxis: { type: "value", axisLabel: { color: "#64748b" }, splitLine: { lineStyle: { color: "rgba(148,163,184,0.18)" } } },
    series: [{ type: "bar", data: buildingData.map((item) => item.value), itemStyle: { color: "#0ea5e9" } }],
  }, buildingData.some((item) => Number(item.value) > 0), "暂无楼栋分布", "设备楼栋分布为空，请检查 dashboard/device-stats。");
}

function updateScreenDeviceSelect() {
  const select = el("screenDeviceSelect");
  if (!select) return;
  const records = state.devicesPage.records || [];
  select.innerHTML = records.map((item) => '<option value="' + escapeHtml(safeText(item.id, "")) + '">' + escapeHtml(safeText(item.deviceName, item.deviceCode || "设备")) + '</option>').join("") || '<option value="">暂无设备</option>';
  if (!state.selectedDeviceId && records.length) state.selectedDeviceId = String(records[0].id || "");
  if (state.selectedDeviceId) select.value = state.selectedDeviceId;
}
function updateDeviceBatchHint() {
  const node = el("deviceBatchHint"); if (node) node.textContent = "已选择 " + state.selectedDeviceIds.length + " 台设备";
  const selectAll = el("deviceSelectAll"); if (selectAll) selectAll.checked = state.devicesPage.records.length > 0 && state.selectedDeviceIds.length === state.devicesPage.records.length;
}
function updateAlarmBatchHint() {
  const node = el("alarmBatchHint"); if (node) node.textContent = "已选择 " + state.selectedAlarmIds.length + " 条告警";
  const selectAll = el("alarmSelectAll"); if (selectAll) selectAll.checked = state.alarmsPage.records.length > 0 && state.selectedAlarmIds.length === state.alarmsPage.records.length;
}
function toggleDeviceSelection(id, checked) {
  const value = String(id);
  state.selectedDeviceIds = checked ? Array.from(new Set([...state.selectedDeviceIds, value])) : state.selectedDeviceIds.filter((item) => item !== value);
  updateDeviceBatchHint();
}
function toggleAlarmSelection(id, checked) {
  const value = String(id);
  state.selectedAlarmIds = checked ? Array.from(new Set([...state.selectedAlarmIds, value])) : state.selectedAlarmIds.filter((item) => item !== value);
  updateAlarmBatchHint();
}

function openDetailModal(title, rows) {
  const modal = el("detailModal");
  const heading = el("detailModalTitle");
  const body = el("detailModalBody");
  if (!modal || !heading || !body) return;
  heading.textContent = title;
  body.innerHTML = '<div class="detail-grid">' + rows.map((item) => item.full ? '<div class="detail-item detail-full"><span>' + escapeHtml(item.label) + '</span><strong>' + escapeHtml(item.value) + '</strong></div>' : '<div class="detail-item"><span>' + escapeHtml(item.label) + '</span><strong>' + escapeHtml(item.value) + '</strong></div>').join("") + '</div>';
  modal.classList.remove("hidden");
}
function closeDetailModal() { const modal = el("detailModal"); if (modal) modal.classList.add("hidden"); }
function showDeviceDetail(id) {
  const item = (state.devicesPage.records || []).find((row) => String(row.id) === String(id));
  if (!item) return;
  openDetailModal("设备详情", [
    { label: "设备名称", value: safeText(item.deviceName, "--") },
    { label: "设备编号", value: safeText(item.deviceCode || item.deviceId, "--") },
    { label: "楼栋", value: safeText(item.locationBuilding || item.building, "--") },
    { label: "楼层", value: safeText(item.locationFloor || item.floor, "--") },
    { label: "状态", value: safeText(item.status, "--") },
    { label: "烟雾", value: safeText(item.latestSmoke, "--") },
    { label: "温度", value: safeText(item.latestTemp, "--") },
    { label: "湿度", value: safeText(item.latestHumidity, "--") },
    { label: "备注", value: safeText(item.remark || item.description, "--"), full: true },
  ]);
}
function showAlarmDetail(id) {
  const item = (state.alarmsPage.records || []).find((row) => String(row.id) === String(id));
  if (!item) return;
  openDetailModal("告警详情", [
    { label: "告警类型", value: safeText(item.alarmType, "--") },
    { label: "告警等级", value: safeText(item.alarmLevel, "--") },
    { label: "告警状态", value: safeText(item.alarmStatus, "--") },
    { label: "设备", value: safeText(item.deviceId, "--") },
    { label: "楼栋", value: safeText(item.locationBuilding || item.building, "--") },
    { label: "时间", value: safeText(item.createTime || item.alarmTime || item.time, "--") },
    { label: "告警内容", value: safeText(item.alarmContent || item.content || item.remark, "--"), full: true },
  ]);
}

function renderDevicesTable() {
  const body = el("deviceTableBody");
  if (!body) return;
  const rows = state.devicesPage.records || [];
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="10"><div class="empty-state"><strong>暂无设备</strong><p>当前筛选条件下没有设备记录，请调整筛选条件后重试。</p></div></td></tr>';
    updateDeviceBatchHint();
    return;
  }
  body.innerHTML = rows.map((item) => {
    const status = String(item.status || "UNKNOWN").toUpperCase();
    const checked = state.selectedDeviceIds.includes(String(item.id)) ? 'checked' : '';
    return '<tr>' +
      '<td class="row-select"><input type="checkbox" data-device-check="true" data-id="' + escapeHtml(safeText(item.id, "")) + '" ' + checked + ' /></td>' +
      '<td>' + escapeHtml(safeText(item.deviceName, item.deviceCode || "设备")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.deviceCode || item.deviceId, "--")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.locationBuilding || item.building, "--")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.locationFloor || item.floor, "--")) + '</td>' +
      '<td><span class="status-badge ' + deviceStatusClass(status) + '">' + escapeHtml(status) + '</span></td>' +
      '<td>' + escapeHtml(safeText(item.latestSmoke, "--")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.latestTemp, "--")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.latestHumidity, "--")) + '</td>' +
      '<td><button class="btn" data-device-detail="true" data-id="' + escapeHtml(safeText(item.id, "")) + '">详情</button></td>' +
      '</tr>';
  }).join("");
  body.querySelectorAll("input[data-device-check]").forEach((input) => input.addEventListener("change", () => toggleDeviceSelection(input.dataset.id, input.checked)));
  body.querySelectorAll("button[data-device-detail]").forEach((button) => button.addEventListener("click", () => showDeviceDetail(button.dataset.id)));
  updateDeviceBatchHint();
}
function renderDevicePagination() {
  const node = el("devicePagination");
  if (!node) return;
  const page = state.devicesPage.page || 1;
  const pages = state.devicesPage.pages || 1;
  const total = state.devicesPage.total || 0;
  node.innerHTML = '<span class="page-info">第 ' + page + ' / ' + pages + ' 页，共 ' + total + ' 条</span><div class="page-actions"><button class="btn" data-page="prev" ' + (page <= 1 ? 'disabled' : '') + '>上一页</button><button class="btn" data-page="next" ' + (page >= pages ? 'disabled' : '') + '>下一页</button></div>';
  node.querySelectorAll("button[data-page]").forEach((btn) => btn.addEventListener("click", () => { const targetPage = btn.dataset.page === "next" ? page + 1 : page - 1; loadDevices(targetPage); }));
}
function buildAlarmActions(item) {
  const id = safeText(item.id, "");
  const status = String(item.alarmStatus || "").toUpperCase();
  const actions = [];
  if (status === "PENDING" || status === "CONFIRMING") {
    actions.push('<button class="btn btn-main" data-action="confirm" data-id="' + escapeHtml(id) + '">确认</button>');
    actions.push('<button class="btn" data-action="resolve" data-id="' + escapeHtml(id) + '">处置</button>');
  } else if (status === "CONFIRMED") {
    actions.push('<button class="btn btn-main" data-action="resolve" data-id="' + escapeHtml(id) + '">处置</button>');
    actions.push('<button class="btn" data-action="archive" data-id="' + escapeHtml(id) + '">归档</button>');
  } else if (status === "RESOLVED") {
    actions.push('<button class="btn" data-action="archive" data-id="' + escapeHtml(id) + '">归档</button>');
  } else if (status !== "ARCHIVED" && status !== "CLOSED") {
    actions.push('<button class="btn" data-action="close" data-id="' + escapeHtml(id) + '">关闭</button>');
  }
  return actions.length ? actions.join("") : '<span class="chip">无可用操作</span>';
}
function renderAlarmTable() {
  const body = el("alarmTableBody");
  if (!body) return;
  const rows = state.alarmsPage.records || [];
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="9"><div class="empty-state"><strong>暂无告警</strong><p>当前筛选条件下没有告警记录，请更换条件后重试。</p></div></td></tr>';
    updateAlarmBatchHint();
    return;
  }
  body.innerHTML = rows.map((item) => {
    const status = String(item.alarmStatus || "--");
    const level = String(item.alarmLevel || "--");
    const actions = buildAlarmActions(item);
    const checked = state.selectedAlarmIds.includes(String(item.id)) ? 'checked' : '';
    return '<tr>' +
      '<td class="row-select"><input type="checkbox" data-alarm-check="true" data-id="' + escapeHtml(safeText(item.id, "")) + '" ' + checked + ' /></td>' +
      '<td>' + escapeHtml(safeText(item.createTime || item.alarmTime || item.time, "--")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.alarmType, "--")) + '</td>' +
      '<td><span class="status-badge ' + alarmLevelClass(level) + '">' + escapeHtml(level) + '</span></td>' +
      '<td><span class="status-badge ' + alarmStatusClass(status) + '">' + escapeHtml(status) + '</span></td>' +
      '<td>' + escapeHtml(safeText(item.deviceId, "--")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.locationBuilding || item.building, "--")) + '</td>' +
      '<td><div class="table-actions">' + actions + '</div></td>' +
      '<td><button class="btn" data-alarm-detail="true" data-id="' + escapeHtml(safeText(item.id, "")) + '">详情</button></td>' +
      '</tr>';
  }).join("");
  body.querySelectorAll("button[data-action]").forEach((btn) => btn.addEventListener("click", async () => {
    try {
      await handleAlarmAction(btn.dataset.action, btn.dataset.id);
      await loadAlarmRows(state.alarmsPage.page);
      await loadScreenData();
      await loadAnalysisData();
    } catch (error) {
      showGlobalAlert("告警操作失败: " + error.message);
    }
  }));
  body.querySelectorAll("input[data-alarm-check]").forEach((input) => input.addEventListener("change", () => toggleAlarmSelection(input.dataset.id, input.checked)));
  body.querySelectorAll("button[data-alarm-detail]").forEach((button) => button.addEventListener("click", () => showAlarmDetail(button.dataset.id)));
  updateAlarmBatchHint();
}
function renderAlarmPagination() {
  const node = el("alarmPagination");
  if (!node) return;
  const page = state.alarmsPage.page || 1;
  const pages = state.alarmsPage.pages || 1;
  const total = state.alarmsPage.total || 0;
  node.innerHTML = '<span class="page-info">第 ' + page + ' / ' + pages + ' 页，共 ' + total + ' 条</span><div class="page-actions"><button class="btn" data-page="prev" ' + (page <= 1 ? 'disabled' : '') + '>上一页</button><button class="btn" data-page="next" ' + (page >= pages ? 'disabled' : '') + '>下一页</button></div>';
  node.querySelectorAll("button[data-page]").forEach((btn) => btn.addEventListener("click", () => { const targetPage = btn.dataset.page === "next" ? page + 1 : page - 1; loadAlarmRows(targetPage); }));
}

async function batchDeleteDevices() {
  if (!state.selectedDeviceIds.length) return showGlobalAlert("请先选择要批量删除的设备");
  showGlobalAlert("当前页面只做前端演示批量选择，未调用删除接口以避免越界");
}
async function batchHandleAlarms(action) {
  if (!state.selectedAlarmIds.length) return showGlobalAlert("请先选择要批量处理的告警");
  await Promise.allSettled(state.selectedAlarmIds.map((id) => handleAlarmAction(action, id)));
  state.selectedAlarmIds = [];
  await loadAlarmRows(state.alarmsPage.page);
  await loadScreenData();
  await loadAnalysisData();
}
async function handleAlarmAction(action, id) {
  if (action === "confirm") await apiRequest("/alarms/" + id + "/confirm", { method: "PUT", body: JSON.stringify({ confirmMethod: "MANUAL" }) });
  else if (action === "resolve") await apiRequest("/alarms/" + id + "/resolve", { method: "PUT", body: JSON.stringify({ resolveMethod: "ON_SITE", resolveDetail: "由前端快速处置" }) });
  else if (action === "archive") await apiRequest("/alarms/" + id + "/archive", { method: "PUT" });
  else if (action === "close") await apiRequest("/alarms/" + id + "/close", { method: "PUT", body: JSON.stringify({ remark: "由前端关闭" }) });
}

function appendChat(role, text) {
  const log = el("chatLog");
  if (!log) return;
  const bubble = document.createElement("div");
  bubble.className = "bubble " + (role === "user" ? "user" : "ai");
  bubble.textContent = text;
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
}
function renderAiJudgement() {
  const target = el("aiJudgement");
  if (!target) return;
  const active = getActiveAlarm();
  if (!active) { target.textContent = "暂无活跃告警，请等待新的烟感事件。"; return; }
  target.textContent = "当前存在告警：" + safeText(active.alarmType, "告警") + "，等级 " + safeText(active.alarmLevel, "--") + "，状态 " + safeText(active.alarmStatus, "--") + "，设备 " + safeText(active.deviceId, "--") + "，位置 " + safeText(active.locationBuilding || active.building, "未知楼栋") + "。建议先确认现场，再下发广播。";
}
async function sendQuestion() {
  const input = el("chatInput");
  if (!input) return;
  const question = input.value.trim();
  if (!question) return;
  if (!state.aiSessionId) state.aiSessionId = buildSessionId();
  const active = getActiveAlarm();
  appendChat("user", question);
  input.value = "";
  try {
    const response = await apiRequest("/conversations", { method: "POST", body: JSON.stringify({ sessionId: state.aiSessionId, alarmId: active && active.id ? active.id : undefined, question }) });
    const answer = safeText(response && (response.answer || response.content || response.reply), "暂无回复");
    appendChat("ai", answer);
    const judgement = el("aiJudgement");
    if (judgement) judgement.textContent = answer;
  } catch (error) {
    appendChat("ai", "调用失败: " + error.message);
  }
}
async function sendBroadcast() {
  const active = getActiveAlarm();
  const selectedDevice = (state.devicesPage.records || []).find((item) => String(item.id) === String(state.selectedDeviceId));
  if (!active || !active.id) { showGlobalAlert("当前没有可广播的活跃告警"); return; }
  const deviceId = active.deviceId || (selectedDevice && selectedDevice.id);
  if (!deviceId) { showGlobalAlert("请先选择设备或等待告警关联设备加载完成"); return; }
  const area = safeText(active.locationBuilding || active.building || (selectedDevice && (selectedDevice.locationBuilding || selectedDevice.building)), "当前区域");
  try {
    await apiRequest("/broadcasts", { method: "POST", body: JSON.stringify({ alarmId: active.id, deviceId, broadcastArea: area, broadcastContent: "【紧急疏散】检测到告警，请相关区域人员立即按照消防预案有序撤离。", broadcastType: "EMERGENCY", triggerMode: "MANUAL" }) });
    showGlobalAlert("广播指令已下发");
    await loadScreenData();
  } catch (error) {
    showGlobalAlert("广播失败: " + error.message);
  }
}
function showGlobalAlert(text) {
  const node = el("globalAlert");
  if (!node) return;
  node.textContent = text;
  node.classList.remove("hidden");
  clearTimeout(showGlobalAlert.timer);
  showGlobalAlert.timer = setTimeout(() => node.classList.add("hidden"), 4000);
}

async function loadHealthStatus() {
  try {
    const health = await apiRequest("/health");
    const status = String(health.status || "UNKNOWN").toUpperCase();
    setChip("healthStatus", "服务: " + status, status === "UP" ? "ok" : "danger");
    const components = health.components || {};
    setChip("mqttStatus", "MQTT: " + safeText(components.mqtt, "--"), String(components.mqtt || "").toUpperCase() === "UP" ? "ok" : "warn");
    setChip("redisStatus", "Redis: " + safeText(components.redis, "--"), String(components.redis || "").toUpperCase() === "UP" ? "ok" : "warn");
  } catch (error) {
    setChip("healthStatus", "服务: 获取失败", "danger");
    setChip("mqttStatus", "MQTT: --", "warn");
    setChip("redisStatus", "Redis: --", "warn");
  }
}
async function loadScreenData() {
  try {
    const [stats, realtime, alarmPage] = await Promise.all([
      apiRequest("/dashboard/stats"),
      apiRequest("/dashboard/realtime?count=24"),
      apiRequest("/alarms?page=1&pageSize=50"),
    ]);
    state.screen.stats = stats || {};
    state.screen.realtime = realtime || {};
    state.screen.alarmSample = normalizePageResult(alarmPage, 1, 50).records;
    renderScreenKpi();
    renderLatestMetrics();
    renderScreenAlarmList();
    renderScreenCharts();
    renderAiJudgement();
    setSyncTime();
  } catch (error) {
    console.error(error);
    showGlobalAlert("大屏数据加载失败: " + error.message);
  }
}
async function loadAnalysisData() {
  try {
    const [alarmTrend, deviceStats, alarmPage] = await Promise.all([
      apiRequest("/dashboard/alarm-stats?period=7"),
      apiRequest("/dashboard/device-stats"),
      apiRequest("/alarms?page=1&pageSize=100"),
    ]);
    state.analysis.alarmTrend = Array.isArray(alarmTrend) ? alarmTrend : [];
    state.analysis.deviceStats = Array.isArray(deviceStats) ? deviceStats : [];
    state.analysis.alarmSample = normalizePageResult(alarmPage, 1, 100).records;
    renderAnalysisCharts();
  } catch (error) {
    console.error(error);
    showGlobalAlert("数据分析加载失败: " + error.message);
  }
}
async function loadDevices(page = state.devicesPage.page || 1) {
  const keyword = safeText(el("deviceKeyword") && el("deviceKeyword").value, "").trim();
  const status = safeText(el("deviceStatusFilter") && el("deviceStatusFilter").value, "").trim();
  let query = "?page=" + page + "&pageSize=" + state.devicesPage.pageSize;
  if (keyword) query += "&keyword=" + encodeURIComponent(keyword);
  if (status) query += "&status=" + encodeURIComponent(status);
  try {
    const data = await apiRequest("/devices" + query);
    state.devicesPage = normalizePageResult(data, page, state.devicesPage.pageSize);
    renderDevicesTable();
    renderDevicePagination();
    updateScreenDeviceSelect();
  } catch (error) {
    console.error(error);
    showGlobalAlert("设备数据加载失败: " + error.message);
  }
}
async function loadAlarmRows(page = state.alarmsPage.page || 1) {
  const status = safeText(el("alarmStatusFilter") && el("alarmStatusFilter").value, "").trim();
  let query = "?page=" + page + "&pageSize=" + state.alarmsPage.pageSize;
  if (status) query += "&status=" + encodeURIComponent(status);
  try {
    const data = await apiRequest("/alarms" + query);
    state.alarmsPage = normalizePageResult(data, page, state.alarmsPage.pageSize);
    renderAlarmTable();
    renderAlarmPagination();
  } catch (error) {
    showGlobalAlert("告警数据加载失败: " + error.message);
  }
}
function connectWebSocket() {
  try {
    if (!location.host) { setChip("wsStatus", "WebSocket: 已断开", "warn"); return; }
    const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/alarm";
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => setChip("wsStatus", "WebSocket: 已连接", "ok");
    socket.onclose = () => setChip("wsStatus", "WebSocket: 已断开", "warn");
    socket.onmessage = (event) => showGlobalAlert("实时告警: " + event.data);
  } catch (error) {
    setChip("wsStatus", "WebSocket: 不可用", "warn");
  }
}

function bindEvents() {
  const screenRefresh = el("btnRefreshScreen");
  const analysisRefresh = el("btnRefreshAnalysis");
  const devicesRefresh = el("btnRefreshDevices");
  const aiRefresh = el("btnRefreshAi");
  const alarmsRefresh = el("btnRefreshAlarms");
  const btnSearchDevices = el("btnSearchDevices");
  const btnLoadAlarms = el("btnLoadAlarms");
  const btnSendQuestion = el("btnSendQuestion");
  const btnBroadcast = el("btnBroadcast");
  const btnSelectAllDevices = el("btnSelectAllDevices");
  const btnClearDevices = el("btnClearDevices");
  const btnBatchDeleteDevices = el("btnBatchDeleteDevices");
  const btnSelectAllAlarms = el("btnSelectAllAlarms");
  const btnClearAlarms = el("btnClearAlarms");
  const btnBatchConfirmAlarms = el("btnBatchConfirmAlarms");
  const btnBatchResolveAlarms = el("btnBatchResolveAlarms");
  const btnBatchArchiveAlarms = el("btnBatchArchiveAlarms");
  const btnBatchCloseAlarms = el("btnBatchCloseAlarms");
  const deviceSelectAll = el("deviceSelectAll");
  const alarmSelectAll = el("alarmSelectAll");
  const screenDeviceSelect = el("screenDeviceSelect");
  const chatInput = el("chatInput");

  if (screenRefresh) screenRefresh.addEventListener("click", async () => { await loadScreenData(); await loadDevices(); });
  if (analysisRefresh) analysisRefresh.addEventListener("click", loadAnalysisData);
  if (devicesRefresh) devicesRefresh.addEventListener("click", () => loadDevices(1));
  if (aiRefresh) aiRefresh.addEventListener("click", async () => { await loadHealthStatus(); await loadScreenData(); });
  if (alarmsRefresh) alarmsRefresh.addEventListener("click", () => loadAlarmRows(1));
  if (btnSearchDevices) btnSearchDevices.addEventListener("click", () => loadDevices(1));
  if (btnLoadAlarms) btnLoadAlarms.addEventListener("click", () => loadAlarmRows(1));
  if (btnSendQuestion) btnSendQuestion.addEventListener("click", sendQuestion);
  if (btnBroadcast) btnBroadcast.addEventListener("click", sendBroadcast);
  if (btnSelectAllDevices) btnSelectAllDevices.addEventListener("click", () => { state.selectedDeviceIds = (state.devicesPage.records || []).map((item) => String(item.id)); renderDevicesTable(); });
  if (btnClearDevices) btnClearDevices.addEventListener("click", () => { state.selectedDeviceIds = []; renderDevicesTable(); });
  if (btnBatchDeleteDevices) btnBatchDeleteDevices.addEventListener("click", batchDeleteDevices);
  if (btnSelectAllAlarms) btnSelectAllAlarms.addEventListener("click", () => { state.selectedAlarmIds = (state.alarmsPage.records || []).map((item) => String(item.id)); renderAlarmTable(); });
  if (btnClearAlarms) btnClearAlarms.addEventListener("click", () => { state.selectedAlarmIds = []; renderAlarmTable(); });
  if (btnBatchConfirmAlarms) btnBatchConfirmAlarms.addEventListener("click", () => batchHandleAlarms("confirm"));
  if (btnBatchResolveAlarms) btnBatchResolveAlarms.addEventListener("click", () => batchHandleAlarms("resolve"));
  if (btnBatchArchiveAlarms) btnBatchArchiveAlarms.addEventListener("click", () => batchHandleAlarms("archive"));
  if (btnBatchCloseAlarms) btnBatchCloseAlarms.addEventListener("click", () => batchHandleAlarms("close"));
  if (deviceSelectAll) deviceSelectAll.addEventListener("change", () => { state.selectedDeviceIds = deviceSelectAll.checked ? (state.devicesPage.records || []).map((item) => String(item.id)) : []; renderDevicesTable(); });
  if (alarmSelectAll) alarmSelectAll.addEventListener("change", () => { state.selectedAlarmIds = alarmSelectAll.checked ? (state.alarmsPage.records || []).map((item) => String(item.id)) : []; renderAlarmTable(); });
  if (chatInput) chatInput.addEventListener("keydown", (event) => { if (event.key === "Enter") sendQuestion(); });
  if (screenDeviceSelect) screenDeviceSelect.addEventListener("change", () => { state.selectedDeviceId = screenDeviceSelect.value; });
  document.addEventListener("click", (event) => {
    const modal = el("detailModal");
    if (modal && !modal.classList.contains("hidden") && event.target === modal.querySelector(".modal-mask")) closeDetailModal();
  });
}

async function bootstrap() {
  state.aiSessionId = buildSessionId();
  initMenus();
  bindEvents();
  setClock();
  setInterval(setClock, 1000);
  connectWebSocket();
  await loadHealthStatus();
  await Promise.all([loadDevices(1), loadScreenData(), loadAnalysisData(), loadAlarmRows(1)]);
  renderAiJudgement();
  setInterval(async () => { await loadHealthStatus(); await loadScreenData(); }, 20000);
}

bootstrap();
