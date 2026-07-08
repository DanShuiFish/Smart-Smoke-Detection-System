const API_BASE = "/api/v1";
const state = {
  currentView: "screen",
  aiSessionId: "",
  selectedDeviceId: "",
  selectedDeviceIds: [],
  selectedAlarmIds: [],
  deviceStatusQuickFilter: "",
  deviceFilterAvgBattery: false,
  deviceStats: { total: 0, online: 0, offline: 0, error: 0, inactive: 0, avgBattery: 0 },
  deviceFormMode: "create",
  editingDeviceId: "",
  screen: { stats: {}, realtime: {}, alarmSample: [], deviceTrend: [] },
  analysis: { alarmTrend: [], alarmSample: [], deviceStats: [] },
  devicesPage: { page: 1, pageSize: 10, total: 0, pages: 1, records: [] },
  alarmsPage: { page: 1, pageSize: 10, total: 0, pages: 1, records: [] },
  bindingsPage: { page: 1, pageSize: 10, total: 0, pages: 1, records: [] },
  reviewsPage: { page: 1, pageSize: 10, total: 0, pages: 1, records: [] },
  currentBindDeviceId: "",
};
const DEVICE_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{3,31}$/;

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
function getToken() { return localStorage.getItem("smoke_token") || localStorage.getItem("smartSmokeToken") || localStorage.getItem("token") || ""; }
function clearAuthAndBackToLogin() {
  localStorage.removeItem("smoke_token");
  localStorage.removeItem("smartSmokeToken");
  localStorage.removeItem("token");
  localStorage.removeItem("smoke_user");
  if (!location.pathname.endsWith("/index.html") && location.pathname !== "/") {
    location.replace("/");
  }
}

async function logout() {
  try {
    await apiRequest("/auth/logout", { method: "POST" });
  } catch (error) {
    console.warn("logout failed:", error);
  } finally {
    clearAuthAndBackToLogin();
  }
}

async function apiRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(API_BASE + path, { ...options, headers });
  if (response.status === 401) {
    clearAuthAndBackToLogin();
    throw new Error("未登录或登录已失效");
  }
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

function formatLocalDateTimeParam(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return date.getFullYear() + "-"
    + pad(date.getMonth() + 1) + "-"
    + pad(date.getDate()) + "T"
    + pad(date.getHours()) + ":"
    + pad(date.getMinutes()) + ":"
    + pad(date.getSeconds());
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
function formatAlarmType(type) {
  const s = String(type || "").toUpperCase();
  if (s === "SMOKE_OVERFLOW") return "烟雾超标";
  if (s === "TEMP_OVERFLOW") return "温度异常";
  if (s === "FIRE_RISK") return "复合火情";
  if (s === "DEVICE_OFFLINE") return "设备离线";
  if (s === "DEVICE_ERROR") return "设备故障";
  return safeText(type, "告警");
}
function formatAlarmLevel(level) {
  const s = String(level || "").toUpperCase();
  if (s === "LOW") return "低";
  if (s === "MEDIUM") return "中";
  if (s === "HIGH") return "高";
  if (s === "CRITICAL") return "紧急";
  return safeText(level, "--");
}
function formatAlarmStatus(status) {
  const s = String(status || "").toUpperCase();
  if (s === "PENDING") return "待处理";
  if (s === "CONFIRMING") return "确认中";
  if (s === "CONFIRMED") return "已确认";
  if (s === "RESOLVED") return "已处置";
  if (s === "ARCHIVED") return "已归档";
  if (s === "CLOSED") return "已关闭";
  return safeText(status, "--");
}
function buildAlarmLocation(item) {
  return [item.locationBuilding || item.building, item.locationFloor || item.floor, item.locationRoom || item.room]
    .filter(Boolean)
    .join("");
}
function formatAlarmMetric(item) {
  const type = String(item.alarmType || "").toUpperCase();
  const smoke = Number(item.smokeConcentration || item.smoke || 0);
  const temp = Number(item.temperature || 0);
  const threshold = Number(item.thresholdValue || 0);
  if (type === "TEMP_OVERFLOW") {
    return Number.isFinite(temp) && temp > 0 ? ("温度 " + temp.toFixed(1) + " C") : "温度异常";
  }
  if (Number.isFinite(smoke) && smoke > 0 && Number.isFinite(threshold) && threshold > 0) {
    return "当前 " + smoke.toFixed(2) + " / 阈值 " + threshold.toFixed(2) + " mg/m3";
  }
  if (Number.isFinite(smoke) && smoke > 0) {
    return "当前 " + smoke.toFixed(2) + " mg/m3";
  }
  return "等待更多数据";
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
  if (!charts[key]) {
    node.innerHTML = "";
  }
  const chart = ensureChart(key, nodeId);
  if (chart) {
    chart.clear();
    chart.setOption(option, true);
  }
}
function resizeVisibleCharts() { Object.values(charts).forEach((chart) => { if (chart && typeof chart.resize === "function") chart.resize(); }); }
function getActiveAlarm() {
  const realtime = state.screen.realtime || {};
  const active = Array.isArray(realtime.activeAlarms) ? realtime.activeAlarms[0] : null;
  if (active) return active;
  return state.analysis.alarmSample.find((item) => String(item.alarmStatus || "").toUpperCase() === "PENDING") || state.screen.alarmSample[0] || null;
}

function buildBroadcastDraft() {
  const activeAlarm = getActiveAlarm();
  if (activeAlarm) {
    const area = buildAlarmLocation(activeAlarm) || "当前区域";
    const levelText = formatAlarmLevel(activeAlarm.alarmLevel || "");
    const typeText = formatAlarmType(activeAlarm.alarmType || "");
    const metricText = formatAlarmMetric(activeAlarm);
    return {
      source: "alarm",
      alarmId: activeAlarm.id != null ? Number(activeAlarm.id) : null,
      deviceId: activeAlarm.deviceId != null ? Number(activeAlarm.deviceId) : null,
      broadcastArea: area,
      broadcastType: "EMERGENCY",
      triggerMode: "ALARM_LINKAGE",
      content: "【" + levelText + typeText + "通知】" + area + "发生" + typeText + "，" + metricText + "。请立即关注现场情况，必要时按疏散预案有序撤离。"
    };
  }
  if (lastAiAnswer) {
    return {
      source: "ai",
      alarmId: null,
      deviceId: null,
      broadcastArea: "",
      broadcastType: "EMERGENCY",
      triggerMode: "AI_MANUAL",
      content: lastAiAnswer
    };
  }
  return null;
}

function updateBroadcastButtonState() {
  const btn = document.getElementById("btnBroadcast");
  if (!btn) return;
  const draft = buildBroadcastDraft();
  btn.disabled = !draft;
  btn.title = draft ? (draft.source === "alarm" ? "将基于当前活跃告警下发广播" : "将基于 AI 分析结论下发广播") : "暂无可下发的活跃告警或 AI 分析结论";
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
    reviews: ["AI 视觉复核", "查看 AI 火焰/烟雾识别结果，支持人工复核确认"],
  };
  const pair = map[view] || map.screen;
  const title = el("viewTitle");
  const subtitle = el("viewSubTitle");
  const banner = el("bannerTitle");
  if (title) title.textContent = pair[0];
  if (subtitle) subtitle.textContent = pair[1];
  if (banner) banner.textContent = pair[0];
  if (view === "reviews") { loadReviewRows(1); }
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
  const trendList = Array.isArray(state.screen.deviceTrend) ? state.screen.deviceTrend : [];
  const latestList = trendList.length ? trendList : (Array.isArray(realtime.latestData) ? realtime.latestData : []);
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
  (rows || []).forEach((item) => {
    const name = formatAlarmType(item.alarmType || item.type || item.alarmName || "告警");
    counts[name] = (counts[name] || 0) + 1;
  });
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
    const location = buildAlarmLocation(item);
    return '<li class="list-item alarm-card ' + levelClass + '">' +
      '<div class="card-row"><strong>' + escapeHtml(formatAlarmType(item.alarmType)) + '</strong><span class="status-badge ' + alarmStatusClass(item.alarmStatus) + '">' + escapeHtml(formatAlarmStatus(item.alarmStatus)) + '</span></div>' +
      '<div style="margin-top:6px;color:#64748b;">设备: ' + escapeHtml(safeText(item.deviceName || item.deviceId, "--")) + (location ? ' · 位置: ' + escapeHtml(location) : '') + '</div>' +
      '<div style="margin-top:4px;color:#94a3b8;">' + escapeHtml(formatAlarmMetric(item)) + '</div></li>';
  }).join("");
}
function renderScreenCharts() {
  const realtime = state.screen.realtime || {};
  const deviceTrend = Array.isArray(state.screen.deviceTrend) ? state.screen.deviceTrend : [];
  const latestData = deviceTrend.length ? deviceTrend : (Array.isArray(realtime.latestData) ? realtime.latestData : []);
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
  select.innerHTML = records.map((item) => '<option value="' + escapeHtml(safeText(item.id, "")) + '">' + escapeHtml(safeText(item.deviceName, item.deviceId || "设备")) + '</option>').join("") || '<option value="">暂无设备</option>';
  if (!state.selectedDeviceId && records.length) state.selectedDeviceId = String(records[0].id || "");
  if (state.selectedDeviceId) select.value = state.selectedDeviceId;
}
function getVisibleDeviceRecords() {
  return (state.devicesPage.records || []).filter((item) => !state.deviceFilterAvgBattery || Number(item.battery || 0) <= Number(state.deviceStats.avgBattery || 0));
}
function updateDeviceBatchHint() {
  const node = el("deviceBatchHint"); if (node) node.textContent = "已选择 " + state.selectedDeviceIds.length + " 台设备";
  const visibleRows = getVisibleDeviceRecords();
  const visibleIds = visibleRows.map((item) => String(item.id));
  const selectAll = el("deviceSelectAll");
  if (selectAll) selectAll.checked = visibleRows.length > 0 && visibleIds.every((id) => state.selectedDeviceIds.includes(id));
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
  body.innerHTML = '<div class="detail-grid">' + rows.map((item) => {
    var valueHtml = item.raw ? item.value : escapeHtml(item.value);
    return item.full ? '<div class="detail-item detail-full"><span>' + escapeHtml(item.label) + '</span><strong>' + valueHtml + '</strong></div>' : '<div class="detail-item"><span>' + escapeHtml(item.label) + '</span><strong>' + valueHtml + '</strong></div>';
  }).join("") + '</div>';
  modal.classList.remove("hidden");
}
function closeDetailModal() { const modal = el("detailModal"); if (modal) modal.classList.add("hidden"); }
function getDeviceStatusLabel(status) {
  const map = { ONLINE: "在线", OFFLINE: "离线", ERROR: "故障", INACTIVE: "未激活" };
  return map[String(status || "").toUpperCase()] || safeText(status, "--");
}
function getDevicePayloadFromForm() {
  return {
    deviceName: safeText(el("formDeviceName") && el("formDeviceName").value, "").trim(),
    deviceId: safeText(el("formDeviceId") && el("formDeviceId").value, "").trim(),
    deviceModel: safeText(el("formDeviceModel") && el("formDeviceModel").value, "").trim(),
    firmwareVersion: safeText(el("formFirmwareVersion") && el("formFirmwareVersion").value, "").trim(),
    status: safeText(el("formStatus") && el("formStatus").value, "OFFLINE").trim(),
    battery: Number(safeText(el("formBattery") && el("formBattery").value, "0")),
    signalStrength: Number(safeText(el("formSignalStrength") && el("formSignalStrength").value, "0")),
    heartbeatTimeout: Number(safeText(el("formHeartbeatTimeout") && el("formHeartbeatTimeout").value, "30")),
    locationBuilding: safeText(el("formLocationBuilding") && el("formLocationBuilding").value, "").trim(),
    locationFloor: safeText(el("formLocationFloor") && el("formLocationFloor").value, "").trim(),
    locationRoom: safeText(el("formLocationRoom") && el("formLocationRoom").value, "").trim(),
    remark: safeText(el("formRemark") && el("formRemark").value, "").trim(),
  };
}
function setDeviceIdValidation(message, level) {
  const node = el("deviceIdValidationMsg");
  if (!node) return;
  node.textContent = message || "";
  node.classList.remove("error", "ok");
  if (level) node.classList.add(level);
}
function fillDeviceForm(item) {
  if (el("formDeviceName")) el("formDeviceName").value = safeText(item && item.deviceName, "");
  if (el("formDeviceId")) el("formDeviceId").value = safeText(item && item.deviceId, "");
  if (el("formDeviceModel")) el("formDeviceModel").value = safeText(item && item.deviceModel, "");
  if (el("formFirmwareVersion")) el("formFirmwareVersion").value = safeText(item && item.firmwareVersion, "");
  if (el("formStatus")) el("formStatus").value = safeText(item && item.status, "OFFLINE");
  if (el("formBattery")) el("formBattery").value = safeText(item && item.battery, 100);
  if (el("formSignalStrength")) el("formSignalStrength").value = safeText(item && item.signalStrength, 100);
  if (el("formHeartbeatTimeout")) el("formHeartbeatTimeout").value = safeText(item && item.heartbeatTimeout, 30);
  if (el("formLocationBuilding")) el("formLocationBuilding").value = safeText(item && item.locationBuilding, "");
  if (el("formLocationFloor")) el("formLocationFloor").value = safeText(item && item.locationFloor, "");
  if (el("formLocationRoom")) el("formLocationRoom").value = safeText(item && item.locationRoom, "");
  if (el("formRemark")) el("formRemark").value = safeText(item && item.remark, "");
}
function openDeviceFormModal(mode, item) {
  state.deviceFormMode = mode;
  state.editingDeviceId = item && item.id ? String(item.id) : "";
  const modal = el("deviceFormModal");
  const title = el("deviceFormTitle");
  const form = el("deviceForm");
  if (!modal || !title || !form) return;
  title.textContent = mode === "edit" ? "编辑设备" : "新增设备";
  form.reset();
  fillDeviceForm(item || {});
  setDeviceIdValidation("", "");
  modal.classList.remove("hidden");
}
function closeDeviceFormModal() {
  const modal = el("deviceFormModal");
  if (modal) modal.classList.add("hidden");
  state.editingDeviceId = "";
}
async function validateDeviceForm(checkUnique) {
  const payload = getDevicePayloadFromForm();
  if (!payload.deviceName) throw new Error("请输入设备名称");
  if (!payload.deviceId) throw new Error("请输入设备编号");
  if (!DEVICE_ID_REGEX.test(payload.deviceId)) throw new Error("设备编号仅支持 4-32 位字母、数字、下划线或中划线");
  if (!Number.isFinite(payload.battery) || payload.battery < 0 || payload.battery > 100) throw new Error("电量范围应为 0-100");
  if (!Number.isFinite(payload.signalStrength) || payload.signalStrength < 0 || payload.signalStrength > 100) throw new Error("信号强度范围应为 0-100");
  if (!Number.isFinite(payload.heartbeatTimeout) || payload.heartbeatTimeout < 10 || payload.heartbeatTimeout > 3600) throw new Error("心跳超时范围应为 10-3600 秒");
  if (checkUnique) {
    const duplicated = await checkDeviceIdUnique(payload.deviceId, state.editingDeviceId);
    if (duplicated) throw new Error("设备编号已存在: " + payload.deviceId);
  }
  return payload;
}
async function checkDeviceIdUnique(deviceId, editingId) {
  const current = (state.devicesPage.records || []).find((item) => String(item.deviceId || "") === String(deviceId));
  if (current && String(current.id) !== String(editingId || "")) return true;
  try {
    const data = await apiRequest("/devices?page=1&pageSize=200&keyword=" + encodeURIComponent(deviceId));
    const records = normalizePageResult(data, 1, 200).records || [];
    return records.some((item) => String(item.deviceId || "") === String(deviceId) && String(item.id) !== String(editingId || ""));
  } catch (error) {
    console.error(error);
    return false;
  }
}
function renderDeviceStatsCards() {
  const stats = state.deviceStats || {};
  if (el("deviceStatTotal")) el("deviceStatTotal").textContent = String(stats.total || 0);
  if (el("deviceStatOnline")) el("deviceStatOnline").textContent = String(stats.online || 0);
  if (el("deviceStatOffline")) el("deviceStatOffline").textContent = String(stats.offline || 0);
  if (el("deviceStatError")) el("deviceStatError").textContent = String(stats.error || 0);
  if (el("deviceStatInactive")) el("deviceStatInactive").textContent = String(stats.inactive || 0);
  if (el("deviceStatAvgBattery")) el("deviceStatAvgBattery").textContent = String(stats.avgBattery || 0) + "%";
  document.querySelectorAll("[data-device-stat-filter]").forEach((node) => {
    const filter = node.getAttribute("data-device-stat-filter") || "";
    const active = filter === "AVG_BATTERY" ? state.deviceFilterAvgBattery : filter === state.deviceStatusQuickFilter;
    node.classList.toggle("active", active || (!filter && !state.deviceStatusQuickFilter && !state.deviceFilterAvgBattery));
  });
}
async function loadDeviceStats() {
  try {
    const stats = await apiRequest("/devices/stats");
    state.deviceStats = stats || state.deviceStats;
    renderDeviceStatsCards();
  } catch (error) {
    console.error(error);
    showGlobalAlert("设备统计加载失败: " + error.message);
  }
}
async function showDeviceDetail(id) {
  try {
    const item = await apiRequest("/devices/" + id);
    openDetailModal("设备详情", [
      { label: "设备名称", value: safeText(item.deviceName, "--") },
      { label: "设备编号", value: safeText(item.deviceId, "--") },
      { label: "设备型号", value: safeText(item.deviceModel, "--") },
      { label: "固件版本", value: safeText(item.firmwareVersion, "--") },
      { label: "设备状态", value: getDeviceStatusLabel(item.status) },
      { label: "电量", value: safeText(item.battery, "--") + "%" },
      { label: "信号强度", value: safeText(item.signalStrength, "--") + "%" },
      { label: "楼栋", value: safeText(item.locationBuilding, "--") },
      { label: "楼层", value: safeText(item.locationFloor, "--") },
      { label: "房间", value: safeText(item.locationRoom, "--") },
      { label: "心跳超时", value: safeText(item.heartbeatTimeout, "--") + " 秒" },
      { label: "备注", value: safeText(item.remark, "--"), full: true },
    ]);
  } catch (error) {
    showGlobalAlert("设备详情加载失败: " + error.message);
  }
}
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

function renderDevicesTable() {
  const body = el("deviceTableBody");
  if (!body) return;
  const rows = getVisibleDeviceRecords();
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
      '<td>' + escapeHtml(safeText(item.deviceName, item.deviceId || "设备")) + '</td>' +
      '<td><button type="button" class="device-code-link" data-device-detail="true" data-id="' + escapeHtml(safeText(item.id, "")) + '">' + escapeHtml(safeText(item.deviceId, "--")) + '</button></td>' +
      '<td>' + escapeHtml(safeText(item.locationBuilding || item.building, "--")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.locationFloor || item.floor, "--")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.locationRoom, "--")) + '</td>' +
      '<td><span class="status-badge ' + deviceStatusClass(status) + '">' + escapeHtml(getDeviceStatusLabel(status)) + '</span></td>' +
      '<td>' + escapeHtml(safeText(item.battery, "--")) + '%</td>' +
      '<td>' + escapeHtml(safeText(item.signalStrength, "--")) + '%</td>' +
      '<td><div class="table-actions"><button class="btn" data-device-edit="true" data-id="' + escapeHtml(safeText(item.id, "")) + '">编辑</button><button class="btn danger" data-device-delete="true" data-id="' + escapeHtml(safeText(item.id, "")) + '">删除</button><button class="btn" data-device-detail="true" data-id="' + escapeHtml(safeText(item.id, "")) + '">详情</button><button class="btn" data-device-bind="true" data-id="' + escapeHtml(safeText(item.id, "")) + '">绑定</button></div></td>' +
      '</tr>';
  }).join("");
  body.querySelectorAll("input[data-device-check]").forEach((input) => input.addEventListener("change", () => toggleDeviceSelection(input.dataset.id, input.checked)));
  body.querySelectorAll("button[data-device-detail]").forEach((button) => button.addEventListener("click", () => showDeviceDetail(button.dataset.id)));
  body.querySelectorAll("button[data-device-edit]").forEach((button) => button.addEventListener("click", async () => {
    try {
      const item = await apiRequest("/devices/" + button.dataset.id);
      openDeviceFormModal("edit", item);
    } catch (error) {
      showGlobalAlert("设备信息加载失败: " + error.message);
    }
  }));
  body.querySelectorAll("button[data-device-delete]").forEach((button) => button.addEventListener("click", async () => {
    await deleteDevice(button.dataset.id);
  }));
  body.querySelectorAll("button[data-device-bind]").forEach((button) => button.addEventListener("click", () => {
    openBindModal(button.dataset.id);
  }));
  body.querySelectorAll("tr").forEach((row, index) => row.addEventListener("dblclick", () => showDeviceDetail(rows[index].id)));
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
      '<td>' + escapeHtml(safeText(item.alarmTime || item.createTime || item.time, "--")) + '</td>' +
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
  if (!window.confirm("确认批量删除选中的 " + state.selectedDeviceIds.length + " 台设备吗？")) return;
  await apiRequest("/devices/batch", {
    method: "DELETE",
    body: JSON.stringify({ ids: state.selectedDeviceIds.map((id) => Number(id)) }),
  });
  state.selectedDeviceIds = [];
  await Promise.all([loadDeviceStats(), loadDevices(1), loadScreenData(), loadAnalysisData()]);
  showGlobalAlert("批量删除成功");
}
async function deleteDevice(id) {
  if (!window.confirm("确认删除这台设备吗？")) return;
  await apiRequest("/devices/" + id, { method: "DELETE" });
  state.selectedDeviceIds = state.selectedDeviceIds.filter((item) => item !== String(id));
  await Promise.all([loadDeviceStats(), loadDevices(state.devicesPage.page || 1), loadScreenData(), loadAnalysisData()]);
  showGlobalAlert("设备删除成功");
}
async function submitDeviceForm(event) {
  event.preventDefault();
  try {
    const payload = await validateDeviceForm(true);
    const isEdit = state.deviceFormMode === "edit" && state.editingDeviceId;
    await apiRequest(isEdit ? "/devices/" + state.editingDeviceId : "/devices", {
      method: isEdit ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    closeDeviceFormModal();
    await Promise.all([loadDeviceStats(), loadDevices(isEdit ? state.devicesPage.page : 1), loadScreenData(), loadAnalysisData()]);
    showGlobalAlert(isEdit ? "设备更新成功" : "设备新增成功");
  } catch (error) {
    // 弹窗内展示错误
    const errMsg = error.message || "";
    if (errMsg.includes("设备编号") || errMsg.includes("已存在") || errMsg.includes("409")) {
      setDeviceIdValidation(errMsg.includes("409") ? "设备编号已存在" : errMsg, "error");
    }
    showGlobalAlert(error.message);
  }
}
function downloadDevicesCsv() {
  const rows = (state.devicesPage.records || []).filter((item) => !state.deviceFilterAvgBattery || Number(item.battery || 0) <= Number(state.deviceStats.avgBattery || 0));
  if (!rows.length) {
    showGlobalAlert("当前没有可导出的设备数据");
    return;
  }
  const header = ["设备名称", "设备编号", "设备型号", "设备状态", "楼栋", "楼层", "房间", "电量", "信号强度", "心跳超时", "备注"];
  const lines = rows.map((item) => [
    safeText(item.deviceName, ""),
    safeText(item.deviceId, ""),
    safeText(item.deviceModel, ""),
    getDeviceStatusLabel(item.status),
    safeText(item.locationBuilding, ""),
    safeText(item.locationFloor, ""),
    safeText(item.locationRoom, ""),
    safeText(item.battery, ""),
    safeText(item.signalStrength, ""),
    safeText(item.heartbeatTimeout, ""),
    safeText(item.remark, ""),
  ]);
  const csv = [header].concat(lines).map((cols) => cols.map((value) => '"' + String(value).replace(/"/g, '""') + '"').join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "devices-" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}
// ===== 设备绑定管理 =====
async function openBindModal(deviceId) {
  state.currentBindDeviceId = String(deviceId);
  const modal = el("bindModal");
  const title = el("bindModalTitle");
  if (!modal || !title) return;
  const dev = (state.devicesPage.records || []).find((item) => String(item.id) === String(deviceId));
  title.textContent = "设备绑定 — " + (dev ? safeText(dev.deviceName || dev.deviceId, "设备") : deviceId);
  modal.classList.remove("hidden");
  // 加载用户下拉框
  const userSelect = el("bindUserId");
  if (userSelect) {
    userSelect.innerHTML = '<option value="">加载中...</option>';
    try {
      const users = await apiRequest("/users/simple");
      userSelect.innerHTML = '<option value="">-- 请选择用户 --</option>' +
        (users || []).map((u) => '<option value="' + escapeHtml(safeText(u.id, "")) + '">' + escapeHtml(safeText(u.realName || u.username, "用户")) + ' (' + escapeHtml(safeText(u.role, "--")) + ')</option>').join("");
    } catch (err) {
      userSelect.innerHTML = '<option value="">加载失败，请重试</option>';
    }
  }
  await loadBindings(1);
}
function closeBindModal() {
  const modal = el("bindModal");
  if (modal) modal.classList.add("hidden");
  state.currentBindDeviceId = "";
}
async function loadBindings(page) {
  const body = el("bindTableBody");
  const pagination = el("bindPagination");
  if (!body) return;
  try {
    const data = await apiRequest("/bindings?deviceId=" + state.currentBindDeviceId + "&page=" + page + "&pageSize=" + state.bindingsPage.pageSize);
    state.bindingsPage = normalizePageResult(data, page, state.bindingsPage.pageSize);
    renderBindTable();
    // 分页
    if (pagination) {
      const pg = state.bindingsPage;
      pagination.innerHTML = '<span class="page-info">第 ' + pg.page + ' / ' + pg.pages + ' 页，共 ' + pg.total + ' 条</span><div class="page-actions"><button class="btn" data-bind-page="prev" ' + (pg.page <= 1 ? 'disabled' : '') + '>上一页</button><button class="btn" data-bind-page="next" ' + (pg.page >= pg.pages ? 'disabled' : '') + '>下一页</button></div>';
      pagination.querySelectorAll("button[data-bind-page]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const targetPage = btn.dataset.bindPage === "next" ? pg.page + 1 : pg.page - 1;
          loadBindings(targetPage);
        });
      });
    }
  } catch (error) {
    body.innerHTML = '<tr><td colspan="6"><div class="empty-state"><strong>加载失败</strong><p>' + escapeHtml(error.message) + '</p></div></td></tr>';
  }
}
function renderBindTable() {
  const body = el("bindTableBody");
  if (!body) return;
  const rows = state.bindingsPage.records || [];
  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="6"><div class="empty-state"><strong>暂无绑定记录</strong><p>该设备尚未绑定任何用户，请通过下方表单新增绑定。</p></div></td></tr>';
    return;
  }
  var bindTypeLabel = { OWNER: "管理者", VIEWER: "使用者", ADMIN: "管理员" };
  body.innerHTML = rows.map(function(item) {
    var status = String(item.status || "--");
    var statusClass = status === "BOUND" ? "ok" : "warn";
    var unbindBtn = status === "BOUND"
      ? '<button class="btn danger" data-bind-unbind="true" data-id="' + escapeHtml(safeText(item.id, "")) + '">解绑</button>'
      : '';
    return '<tr>' +
      '<td>' + escapeHtml(safeText(item.userRealName, "--")) + '</td>' +
      '<td>' + escapeHtml(safeText(item.deviceName, "--")) + '</td>' +
      '<td>' + escapeHtml(bindTypeLabel[item.bindType] || safeText(item.bindType, "--")) + '</td>' +
      '<td><span class="status-badge ' + statusClass + '">' + escapeHtml(status) + '</span></td>' +
      '<td>' + escapeHtml(safeText(item.bindTime, "--")) + '</td>' +
      '<td><div class="table-actions">' + unbindBtn + '</div></td>' +
      '</tr>';
  }).join("");
  body.querySelectorAll("button[data-bind-unbind]").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm("确认解绑该绑定关系？")) return;
    try {
      await apiRequest("/bindings/" + btn.dataset.id + "/unbind", { method: "PUT", body: JSON.stringify({ remark: "管理端解绑" }) });
      showGlobalAlert("解绑成功");
      await loadBindings(state.bindingsPage.page);
    } catch (error) {
      showGlobalAlert("解绑失败: " + error.message);
    }
  }));
}
async function submitBindForm(event) {
  event.preventDefault();
  const userIdInput = el("bindUserId");
  const bindTypeInput = el("bindBindType");
  const remarkInput = el("bindRemark");
  const userIdVal = userIdInput ? userIdInput.value : "";
  if (!userIdVal) {
    showGlobalAlert("请选择用户");
    return;
  }
  const userId = Number(userIdVal);
  try {
    await apiRequest("/bindings", {
      method: "POST",
      body: JSON.stringify({
        deviceId: Number(state.currentBindDeviceId),
        userId: userId,
        bindType: bindTypeInput ? bindTypeInput.value : "OWNER",
        remark: remarkInput ? remarkInput.value.trim() : "",
      }),
    });
    if (userIdInput) userIdInput.value = "";
    if (remarkInput) remarkInput.value = "";
    showGlobalAlert("绑定成功");
    await loadBindings(1);
  } catch (error) {
    showGlobalAlert("绑定失败: " + error.message);
  }
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

// ===== AI 聊天（增强版） =====
let aiRound = 0;
let lastAiAnswer = "";
function nowTimeStr() { return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); }

function appendChat(role, text, isError) {
  const log = el("chatLog");
  if (!log) return;
  // 隐藏空状态
  const empty = el("chatEmpty");
  if (empty) empty.style.display = "none";

  const row = document.createElement("div");
  row.className = "msg-row " + (role === "user" ? "user" : "ai");

  const avatar = document.createElement("div");
  avatar.className = "msg-avatar " + (role === "user" ? "user-av" : "ai-av");
  avatar.textContent = role === "user" ? "我" : "AI";

  const body = document.createElement("div");
  body.className = "msg-body";

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  const sender = document.createElement("span");
  sender.className = "msg-sender";
  sender.textContent = role === "user" ? "我" : "AI 助手";
  const time = document.createElement("span");
  time.className = "msg-time";
  time.textContent = nowTimeStr();
  meta.appendChild(sender);
  meta.appendChild(time);

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  if (isError) { bubble.style.color = "#dc2626"; bubble.style.borderColor = "rgba(220,38,38,0.4)"; bubble.style.background = "#fef2f2"; }
  bubble.textContent = text;

  body.appendChild(meta);
  body.appendChild(bubble);
  row.appendChild(avatar);
  row.appendChild(body);
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function renderAiJudgement() {
  const target = el("aiJudgement");
  if (!target) return;
  target.innerHTML = '<div class="model-empty-state"><strong>暂无活跃告警</strong><p>请等待模型响应事件</p></div>';
}

async function sendQuestion() {
  const input = el("chatInput");
  if (!input) return;
  const question = input.value.trim();
  if (!question) return;
  if (!state.aiSessionId) state.aiSessionId = buildSessionId();
  appendChat("user", question);
  input.value = "";
  const startTime = Date.now();

  try {
    const response = await apiRequest("/conversations", { method: "POST", body: JSON.stringify({ sessionId: state.aiSessionId, question }) });
    const answer = safeText(response && (response.answer || response.content || response.reply), "暂无回复");
    appendChat("ai", answer);
    lastAiAnswer = answer;
    aiRound++;
    // 更新右侧模型状态
    const latency = Date.now() - startTime;
    const latEl = el("modelLatency"); if (latEl) latEl.textContent = latency + " ms";
    const rndEl = el("modelRounds"); if (rndEl) rndEl.textContent = aiRound;
    const tokEl = el("modelTokens"); if (tokEl) tokEl.textContent = answer.length ? Math.floor(answer.length * 1.5) : "—";
    // 启用广播按钮
    updateBroadcastButtonState();
    addLog("success", "/api/v1/conversations", JSON.stringify({ question: question, answer: answer.substring(0, 100) + "..." }), 200, latency);
  } catch (error) {
    appendChat("ai", "大模型回复异常：" + error.message, true);
    const latEl = el("modelLatency"); if (latEl) latEl.textContent = "— ms";
    addLog("error", "/api/v1/conversations", "ERR: " + error.message, 0, Date.now() - startTime);
  }
}

async function sendBroadcast() {
  const draft = buildBroadcastDraft();
  if (!draft) { showGlobalAlert("当前没有活跃告警且没有 AI 对话结论，暂无可下发的广播内容"); return; }
  const preview = draft.content.length > 100 ? draft.content.substring(0, 100) + "..." : draft.content;
  const prompt = draft.source === "alarm"
    ? "确认将当前活跃告警联动为广播指令？\n\n广播区域：" + (draft.broadcastArea || "当前区域") + "\n广播内容：" + preview
    : "确认将 AI 分析结论作为广播指令下发？\n\n分析摘要：" + preview;
  if (!confirm(prompt)) return;
  try {
    const payload = {
      alarmId: draft.alarmId,
      deviceId: draft.deviceId,
      broadcastArea: draft.broadcastArea,
      broadcastContent: draft.content,
      broadcastType: draft.broadcastType,
      triggerMode: draft.triggerMode
    };
    await apiRequest("/broadcasts", { method: "POST", body: JSON.stringify(payload) });
    showGlobalAlert(draft.source === "alarm" ? "已按当前活跃告警下发广播" : "已按 AI 分析结论下发广播");
    addLog("success", "/api/v1/broadcasts", "广播指令已下发", 200, 0);
  } catch (error) {
    showGlobalAlert("广播失败: " + error.message);
    addLog("error", "/api/v1/broadcasts", "广播失败: " + error.message, 0, 0);
  }
}

function clearChat() {
  if (!confirm("确定要清除所有聊天记录吗？")) return;
  const log = el("chatLog");
  if (log) log.innerHTML = '<div class="chat-empty-state" id="chatEmpty"><span class="empty-icon">💬</span><strong>您好！我是智慧烟感智能助手</strong><p>您可以问我关于火灾预防、设备使用、灾情研判等方面的问题</p><div class="quick-qs"><span data-q="发生火灾如何逃生？">发生火灾如何逃生？</span><span data-q="附近有哪些消防设备可用？">附近有哪些消防设备可用？</span><span data-q="如何进行火灾隐患排查？">如何进行火灾隐患排查？</span><span data-q="当前区域风险等级是多少？">当前区域风险等级是多少？</span></div></div>';
  bindQuickQs();
  lastAiAnswer = "";
  aiRound = 0;
  state.aiSessionId = buildSessionId();
  const latEl = el("modelLatency"); if (latEl) latEl.textContent = "— ms";
  const rndEl = el("modelRounds"); if (rndEl) rndEl.textContent = "0";
  const tokEl = el("modelTokens"); if (tokEl) tokEl.textContent = "—";
  renderAiJudgement();
  updateBroadcastButtonState();
}

function bindQuickQs() {
  document.querySelectorAll(".quick-qs span[data-q]").forEach(function(sp) {
    sp.addEventListener("click", function() {
      const input = el("chatInput"); if (input) input.value = this.dataset.q;
      sendQuestion();
    });
  });
}

// ===== 调试日志 =====
var _requestLogs = [];
function addLog(type, url, detail, status, duration) {
  _requestLogs.unshift({ type: type, url: url, detail: String(detail || ""), status: status, duration: duration, time: new Date().toLocaleTimeString("zh-CN") });
  if (_requestLogs.length > 50) _requestLogs.length = 50;
  var badge = el("logBadge"); if (badge) { badge.textContent = _requestLogs.length; badge.classList.toggle("hidden", _requestLogs.length === 0); }
}
function openLogDrawer() { el("logDrawerMask").classList.add("open"); el("logDrawer").classList.add("open"); renderLogDrawer(); }
function closeLogDrawer() { el("logDrawerMask").classList.remove("open"); el("logDrawer").classList.remove("open"); }
function renderLogDrawer() {
  var body = el("logDrawerBody");
  if (!body) return;
  if (!_requestLogs.length) { body.innerHTML = '<div class="empty-state"><strong>暂无请求日志</strong><p>发送消息后将在此显示请求详情</p></div>'; return; }
  body.innerHTML = _requestLogs.map(function(l) {
    var tagCls = l.type === "error" ? "error" : (l.type === "success" ? "success" : "info");
    var tagText = l.type === "error" ? "ERROR" : (l.type === "success" ? "OK" : l.type);
    return '<div class="log-item ' + l.type + '">' +
      '<div class="log-item-header"><span class="log-tag ' + tagCls + '">' + tagText + '</span><span class="log-url-text">' + safeText(l.url) + '</span><span class="log-time-text">' + safeText(l.time) + '</span></div>' +
      (l.detail ? '<div class="log-detail-box"><pre>' + safeText(l.detail) + '</pre></div>' : '') +
      '<div class="log-meta-row">' + (l.status ? '<span>状态码: ' + l.status + '</span>' : '') + (l.duration ? '<span>耗时: ' + l.duration + 'ms</span>' : '') + '</div></div>';
  }).join("");
}

// Fetch 拦截器
var _origFetch = window.fetch;
window.fetch = function(url, opts) {
  var start = Date.now();
  var urlStr = typeof url === "string" ? url : (url.url || "");
  return _origFetch.apply(this, arguments).then(function(res) {
    var dur = Date.now() - start;
    if (urlStr.indexOf("/api/") >= 0 && urlStr.indexOf("size=1") < 0 && urlStr.indexOf("page=") < 0) {
      addLog(res.ok ? "success" : "error", urlStr, "status: " + res.status + " " + res.statusText, res.status, dur);
    }
    return res;
  }).catch(function(err) {
    addLog("error", urlStr, "请求失败: " + err.message, 0, Date.now() - start);
    throw err;
  });
};
function showGlobalAlert(text) {
  const node = el("globalAlert");
  if (!node) return;
  node.textContent = text;
  node.classList.remove("hidden");
  clearTimeout(showGlobalAlert.timer);
  showGlobalAlert.timer = setTimeout(() => node.classList.add("hidden"), 4000);
}

function showRealtimeAlarmBanner(payload) {
  const node = el("globalAlert");
  if (!node) return;
  const levelClass = alarmLevelClass(payload.alarmLevel);
  const title = formatAlarmLevel(payload.alarmLevel) + "级" + formatAlarmType(payload.alarmType || payload.alarmTypeText);
  const deviceName = safeText(payload.deviceName || payload.deviceId, "未知设备");
  const location = [payload.building, payload.floor, payload.room].filter(Boolean).join("");
  const metric = formatAlarmMetric(payload);
  const summary = safeText(payload.message, metric);
  node.innerHTML = '<div class="alert-banner ' + levelClass + '">' +
    '<div class="alert-banner-title">' + escapeHtml(title) + ' | ' + escapeHtml(deviceName) + '</div>' +
    '<div class="alert-banner-meta">' + (location ? ('位置: ' + escapeHtml(location) + ' · ') : '') + '状态: ' + escapeHtml(formatAlarmStatus(payload.alarmStatus)) + ' · ' + escapeHtml(metric) + '</div>' +
    '<div class="alert-banner-desc">' + escapeHtml(summary) + '</div></div>';
  node.classList.remove("hidden");
  clearTimeout(showRealtimeAlarmBanner.timer);
  showRealtimeAlarmBanner.timer = setTimeout(() => node.classList.add("hidden"), 10000);
}

function showBroadcastBanner(payload) {
  const node = el("globalAlert");
  if (!node) return;
  const area = safeText(payload.area || payload.broadcastArea, "当前区域");
  const mode = payload.triggerMode === "AUTO" ? "自动" : (payload.triggerMode === "MANUAL" ? "手动" : "联动");
  const typeLabel = payload.broadcastType === "EMERGENCY" ? "紧急广播" : (payload.broadcastType === "NOTIFICATION" ? "通知" : "广播");
  const deviceName = safeText(payload.deviceName, "");
  const summary = safeText(payload.message || payload.broadcastContent, "");
  const timeStr = payload.time ? payload.time.substring(11, 19) : "";
  node.innerHTML = '<div class="alert-banner danger">' +
    '<div class="alert-banner-title">[广播] ' + escapeHtml(typeLabel) + ' | ' + escapeHtml(area) + (deviceName ? ' | ' + escapeHtml(deviceName) : '') + '</div>' +
    '<div class="alert-banner-meta">触发方式: ' + escapeHtml(mode) + ' · 时间: ' + escapeHtml(timeStr) + '</div>' +
    '<div class="alert-banner-desc">' + escapeHtml(summary) + '</div></div>';
  node.classList.remove("hidden");
  clearTimeout(showBroadcastBanner.timer);
  showBroadcastBanner.timer = setTimeout(() => node.classList.add("hidden"), 15000);
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
    updateBroadcastButtonState();
  } catch (error) {
    console.error(error);
    showGlobalAlert("大屏数据加载失败: " + error.message);
  }
}

async function loadSelectedDeviceTrend() {
  const deviceId = String(state.selectedDeviceId || "").trim();
  if (!deviceId) {
    state.screen.deviceTrend = [];
    renderLatestMetrics();
    renderScreenCharts();
    return;
  }

  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const query = "/data/history/" + encodeURIComponent(deviceId)
    + "?start=" + encodeURIComponent(formatLocalDateTimeParam(start))
    + "&end=" + encodeURIComponent(formatLocalDateTimeParam(end))
    + "&page=1&pageSize=500";

  try {
    const data = await apiRequest(query);
    state.screen.deviceTrend = normalizePageResult(data, 1, 500).records || [];
  } catch (error) {
    console.error(error);
    state.screen.deviceTrend = [];
    showGlobalAlert("设备趋势加载失败: " + error.message);
  }

  renderLatestMetrics();
  renderScreenCharts();
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
    updateBroadcastButtonState();
  } catch (error) {
    console.error(error);
    showGlobalAlert("数据分析加载失败: " + error.message);
  }
}
async function loadDevices(page = state.devicesPage.page || 1) {
  const keyword = safeText(el("deviceKeyword") && el("deviceKeyword").value, "").trim();
  const building = safeText(el("deviceBuildingFilter") && el("deviceBuildingFilter").value, "").trim();
  const status = state.deviceStatusQuickFilter || safeText(el("deviceStatusFilter") && el("deviceStatusFilter").value, "").trim();
  if (el("deviceStatusFilter")) el("deviceStatusFilter").value = status;
  let query = "?page=" + page + "&pageSize=" + state.devicesPage.pageSize;
  if (keyword) query += "&keyword=" + encodeURIComponent(keyword);
  if (building) query += "&building=" + encodeURIComponent(building);
  if (status) query += "&status=" + encodeURIComponent(status);
  try {
    const data = await apiRequest("/devices" + query);
    state.devicesPage = normalizePageResult(data, page, state.devicesPage.pageSize);
    renderDevicesTable();
    renderDevicePagination();
    renderDeviceStatsCards();
    updateScreenDeviceSelect();
    if (state.selectedDeviceId) {
      await loadSelectedDeviceTrend();
    }
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
async function loadReviewRows(page) {
  if (!page) page = state.reviewsPage.page || 1;
  var alarmInput = el("reviewFilterAlarmId");
  var deviceInput = el("reviewFilterDeviceId");
  var resultSelect = el("reviewFilterResult");
  var alarmId = alarmInput ? safeText(alarmInput.value, "").trim() : "";
  var deviceId = deviceInput ? safeText(deviceInput.value, "").trim() : "";
  var result = resultSelect ? safeText(resultSelect.value, "").trim() : "";
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
async function showReviewDetail(id) {
  try {
    var item = await apiRequest("/ai-reviews/" + id);
    // 构建 AI 复核详情行
    var reviewRows = [
      { label: "复核ID", value: safeText(item.id, "--") },
      { label: "关联告警ID", value: safeText(item.alarmId, "--") },
      { label: "设备ID", value: safeText(item.deviceId, "--") },
      { label: "摄像头ID", value: safeText(item.cameraId, "--") },
      { label: "复核类型", value: safeText(item.reviewType, "--") },
      { label: "AI判定结果", value: formatReviewResult(item.reviewResult) },
      { label: "置信度", value: item.confidence != null ? Number(item.confidence).toFixed(1) + "%" : "--" },
      { label: "处理耗时", value: item.processingTimeMs != null ? item.processingTimeMs + " ms" : "--" },
      { label: "人工复核状态", value: formatManualReview(item.isManualReview, item.manualReviewResult) },
      { label: "人工复核人ID", value: safeText(item.manualReviewUserId, "--") },
      { label: "人工复核结果", value: safeText(item.manualReviewResult, "--") },
      { label: "备注", value: safeText(item.remark, "--") },
    ];
    // 原图展示（若 imageUrl 不为空）
    if (item.imageUrl) {
      var imgSrc = "/" + encodeURIComponent(item.imageUrl);
      reviewRows.push({ label: "原图", value: '<img src="' + imgSrc + '" alt="复核原图" style="max-width:100%;max-height:360px;border-radius:8px;margin-top:4px;" onerror="this.style.display=\'none\';var s=document.createElement(\'span\');s.style.color=\'#94a3b8\';s.textContent=\'图片加载失败\';this.parentElement.appendChild(s)" />', full: true, raw: true });
    }
    reviewRows.push(
      { label: "图像文件名", value: safeText(item.imageUrl, "--") },
      { label: "AI原始响应", value: safeText(item.aiRawResponse || "无", "无"), full: true },
      { label: "创建时间", value: safeText(item.createTime, "--") }
    );
    openDetailModal("AI复核详情 #" + id, reviewRows);
  } catch (error) {
    showGlobalAlert("AI复核详情加载失败: " + error.message);
  }
}
async function handleManualConfirm(id, result) {
  var label = result === "CONFIRMED" ? "确认" : "驳回";
  if (!confirm("确定要" + label + "该AI复核结果吗？")) return;
  try {
    await apiRequest("/ai-reviews/" + id + "/manual-confirm", {
      method: "PUT",
      body: JSON.stringify({ manualReviewResult: result, remark: "管理端人工" + label })
    });
    await loadReviewRows(state.reviewsPage.page);
    await loadAlarmRows(state.alarmsPage.page);
    showGlobalAlert("人工" + label + "成功");
  } catch (error) {
    showGlobalAlert("人工" + label + "失败: " + error.message);
  }
}
function connectWebSocket() {
  try {
    if (!location.host) { setChip("wsStatus", "WebSocket: 已断开", "warn"); return; }
    const token = getToken();
    const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/alarm" + (token ? "?token=" + encodeURIComponent(token) : "");
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => setChip("wsStatus", "WebSocket: 已连接", "ok");
    socket.onclose = () => setChip("wsStatus", "WebSocket: 已断开", "warn");
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.kind === "broadcast") { showBroadcastBanner(payload); }
        else { showRealtimeAlarmBanner(payload); }
        loadAnalysisData();
        loadAlarmRows(1);
        loadReviewRows(1);
      } catch (error) {
        showGlobalAlert("实时告警: " + event.data);
      }
    };
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
  const btnAddDevice = el("btnAddDevice");
  const btnSearchDevices = el("btnSearchDevices");
  const btnResetDevices = el("btnResetDevices");
  const btnExportDevices = el("btnExportDevices");
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
  const btnLogout = el("btnLogout");
  const deviceSelectAll = el("deviceSelectAll");
  const alarmSelectAll = el("alarmSelectAll");
  const screenDeviceSelect = el("screenDeviceSelect");
  const chatInput = el("chatInput");
  const deviceForm = el("deviceForm");
  const deviceIdInput = el("formDeviceId");
  const deviceKeyword = el("deviceKeyword");
  const deviceBuildingFilter = el("deviceBuildingFilter");

  if (screenRefresh) screenRefresh.addEventListener("click", async () => { await loadScreenData(); await loadDevices(); await loadSelectedDeviceTrend(); });
  if (analysisRefresh) analysisRefresh.addEventListener("click", loadAnalysisData);
  if (devicesRefresh) devicesRefresh.addEventListener("click", async () => { await loadDeviceStats(); await loadDevices(1); });
  if (aiRefresh) aiRefresh.addEventListener("click", async () => { await loadHealthStatus(); await loadScreenData(); });
  if (alarmsRefresh) alarmsRefresh.addEventListener("click", () => loadAlarmRows(1));
  if (btnAddDevice) btnAddDevice.addEventListener("click", () => openDeviceFormModal("create"));
  if (btnSearchDevices) btnSearchDevices.addEventListener("click", () => loadDevices(1));
  if (btnResetDevices) btnResetDevices.addEventListener("click", () => {
    state.deviceStatusQuickFilter = "";
    state.deviceFilterAvgBattery = false;
    if (deviceKeyword) deviceKeyword.value = "";
    if (deviceBuildingFilter) deviceBuildingFilter.value = "";
    if (el("deviceStatusFilter")) el("deviceStatusFilter").value = "";
    loadDevices(1);
    renderDeviceStatsCards();
  });
  if (btnExportDevices) btnExportDevices.addEventListener("click", downloadDevicesCsv);
  if (btnLoadAlarms) btnLoadAlarms.addEventListener("click", () => loadAlarmRows(1));
  if (btnSendQuestion) btnSendQuestion.addEventListener("click", sendQuestion);
  if (btnBroadcast) btnBroadcast.addEventListener("click", sendBroadcast);
  if (btnLogout) btnLogout.addEventListener("click", logout);
  if (btnSelectAllDevices) btnSelectAllDevices.addEventListener("click", () => { state.selectedDeviceIds = getVisibleDeviceRecords().map((item) => String(item.id)); renderDevicesTable(); });
  if (btnClearDevices) btnClearDevices.addEventListener("click", () => { state.selectedDeviceIds = []; renderDevicesTable(); });
  if (btnBatchDeleteDevices) btnBatchDeleteDevices.addEventListener("click", batchDeleteDevices);
  if (btnSelectAllAlarms) btnSelectAllAlarms.addEventListener("click", () => { state.selectedAlarmIds = (state.alarmsPage.records || []).map((item) => String(item.id)); renderAlarmTable(); });
  if (btnClearAlarms) btnClearAlarms.addEventListener("click", () => { state.selectedAlarmIds = []; renderAlarmTable(); });
  if (btnBatchConfirmAlarms) btnBatchConfirmAlarms.addEventListener("click", () => batchHandleAlarms("confirm"));
  if (btnBatchResolveAlarms) btnBatchResolveAlarms.addEventListener("click", () => batchHandleAlarms("resolve"));
  if (btnBatchArchiveAlarms) btnBatchArchiveAlarms.addEventListener("click", () => batchHandleAlarms("archive"));
  if (btnBatchCloseAlarms) btnBatchCloseAlarms.addEventListener("click", () => batchHandleAlarms("close"));
  if (deviceSelectAll) deviceSelectAll.addEventListener("change", () => { state.selectedDeviceIds = deviceSelectAll.checked ? getVisibleDeviceRecords().map((item) => String(item.id)) : []; renderDevicesTable(); });
  if (alarmSelectAll) alarmSelectAll.addEventListener("change", () => { state.selectedAlarmIds = alarmSelectAll.checked ? (state.alarmsPage.records || []).map((item) => String(item.id)) : []; renderAlarmTable(); });
  if (chatInput) chatInput.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendQuestion(); } });
  if (screenDeviceSelect) screenDeviceSelect.addEventListener("change", async () => { state.selectedDeviceId = screenDeviceSelect.value; await loadSelectedDeviceTrend(); });
  const deviceStatusFilter = el("deviceStatusFilter");
  if (deviceStatusFilter) deviceStatusFilter.addEventListener("change", () => {
    state.deviceStatusQuickFilter = deviceStatusFilter.value.trim();
    state.deviceFilterAvgBattery = false;
    renderDeviceStatsCards();
  });
  if (deviceForm) deviceForm.addEventListener("submit", submitDeviceForm);
  if (deviceIdInput) deviceIdInput.addEventListener("blur", async () => {
    const value = deviceIdInput.value.trim();
    if (!value) return setDeviceIdValidation("", "");
    if (!DEVICE_ID_REGEX.test(value)) return setDeviceIdValidation("设备编号仅支持 4-32 位字母、数字、下划线或中划线", "error");
    const duplicated = await checkDeviceIdUnique(value, state.editingDeviceId);
    setDeviceIdValidation(duplicated ? "设备编号已存在" : "设备编号可用", duplicated ? "error" : "ok");
  });
  [deviceKeyword, deviceBuildingFilter, deviceStatusFilter].forEach((node) => {
    if (node) node.addEventListener("keydown", (event) => { if (event.key === "Enter") loadDevices(1); });
  });
  document.querySelectorAll("[data-device-stat-filter]").forEach((node) => node.addEventListener("click", () => {
    const filter = node.getAttribute("data-device-stat-filter") || "";
    state.deviceFilterAvgBattery = filter === "AVG_BATTERY";
    state.deviceStatusQuickFilter = filter && filter !== "AVG_BATTERY" ? filter : "";
    loadDevices(1);
    renderDeviceStatsCards();
  }));
  // 新 AI 视图按钮
  const btnClearChat = el("btnClearChat"); if (btnClearChat) btnClearChat.addEventListener("click", clearChat);
  const btnOpenLogDrawer = el("btnOpenLogDrawer"); if (btnOpenLogDrawer) btnOpenLogDrawer.addEventListener("click", openLogDrawer);
  const btnCloseDrawer = el("btnCloseDrawer"); if (btnCloseDrawer) btnCloseDrawer.addEventListener("click", closeLogDrawer);
  const logDrawerMask = el("logDrawerMask"); if (logDrawerMask) logDrawerMask.addEventListener("click", closeLogDrawer);
  // 绑定弹窗
  const bindForm = el("bindForm"); if (bindForm) bindForm.addEventListener("submit", submitBindForm);
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
  bindQuickQs();
  document.addEventListener("click", (event) => {
    const modal = el("detailModal");
    if (modal && !modal.classList.contains("hidden") && event.target === modal.querySelector(".modal-mask")) closeDetailModal();
    const formModal = el("deviceFormModal");
    if (formModal && !formModal.classList.contains("hidden") && event.target === formModal.querySelector(".modal-mask")) closeDeviceFormModal();
    if (event.target && event.target.matches && event.target.matches("[data-device-form-close='true']")) closeDeviceFormModal();
    if (event.target && event.target.matches && event.target.matches("[data-modal-close='true']")) closeDetailModal();
    if (event.target && event.target.matches && event.target.matches("[data-bind-close='true']")) closeBindModal();
    const bindModal = el("bindModal");
    if (bindModal && !bindModal.classList.contains("hidden") && event.target === bindModal.querySelector(".modal-mask")) closeBindModal();
  });
}

function initSidebarHover() {
  const sidebar = document.querySelector(".sidebar");
  const layout = document.querySelector(".app-layout");
  if (!sidebar || !layout) return;
  sidebar.addEventListener("mouseenter", () => layout.classList.add("sidebar-expanded"));
  sidebar.addEventListener("mouseleave", () => layout.classList.remove("sidebar-expanded"));
}

async function bootstrap() {
  if (!getToken()) {
    clearAuthAndBackToLogin();
    return;
  }
  state.aiSessionId = buildSessionId();
  initMenus();
  bindEvents();
  initSidebarHover();
  setClock();
  setInterval(setClock, 1000);
  connectWebSocket();
  await loadHealthStatus();
  await Promise.all([loadDeviceStats(), loadDevices(1), loadScreenData(), loadAnalysisData(), loadAlarmRows(1)]);
  renderAiJudgement();
  setInterval(async () => { await loadHealthStatus(); await loadScreenData(); }, 20000);
}

bootstrap();
