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
  reviewsPage: { page: 1, pageSize: 10, total: 0, pages: 1, records: [] },
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
  // 区域广播无需依赖活跃告警，始终可用
  const btn = document.getElementById("btnBroadcast");
  if (btn) { btn.disabled = false; btn.title = "向指定楼栋/楼层的所有设备发送广播"; }
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
    broadcasts: ["广播管理", "按楼栋/楼层下发广播指令，查看历史记录"],
    viz: ["设备可视化", "楼栋 / 楼层 / 设备三级下钻，实时状态一目了然"],
  };
  const pair = map[view] || map.screen;
  const title = el("viewTitle");
  const subtitle = el("viewSubTitle");
  const banner = el("bannerTitle");
  if (title) title.textContent = pair[0];
  if (subtitle) subtitle.textContent = pair[1];
  if (banner) banner.textContent = pair[0];
  if (view === "reviews") { loadReviewRows(1); }
  if (view === "broadcasts") { loadBroadcastOptions(); loadBroadcastHistory(1); }
  if (view === "viz") { setTimeout(function(){ window.initViz(); }, 200); }
  if (view === "viz") { if (window.refreshViz) window.refreshViz(); }
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
  var offNode = el("kpiOfflineDevices"); if (offNode) offNode.textContent = String(stats.offlineDevices || 0);
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
  // 编辑时加载已有阈值
  if (mode === "edit" && item && item.id) {
    loadDeviceThresholds(item.id);
  }
}
async function loadDeviceThresholds(devId) {
  try {
    const d = await apiRequest("/thresholds?page=1&pageSize=200&_t=" + Date.now());
    const all = (d && d.records) || [];
    const devThr = all.filter(function(t) { return String(t.deviceId) === String(devId); });
    var sH = devThr.find(function(t) { return t.thresholdType === 'SMOKE_CONCENTRATION' && t.alarmLevel === 'HIGH'; });
    var sM = devThr.find(function(t) { return t.thresholdType === 'SMOKE_CONCENTRATION' && t.alarmLevel === 'MEDIUM'; });
    var tH = devThr.find(function(t) { return t.thresholdType === 'TEMPERATURE'; });
    if (el("formSmokeHigh")) el("formSmokeHigh").value = sH ? sH.thresholdMax : '0.30';
    if (el("formSmokeMed")) el("formSmokeMed").value = sM ? sM.thresholdMax : '0.15';
    if (el("formTempHigh")) el("formTempHigh").value = tH ? tH.thresholdMax : '65';
  } catch (e) {
    console.warn("阈值加载失败:", e);
  }
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
      '<td><div class="table-actions"><button class="btn" data-device-edit="true" data-id="' + escapeHtml(safeText(item.id, "")) + '">编辑</button><button class="btn danger" data-device-delete="true" data-id="' + escapeHtml(safeText(item.id, "")) + '">删除</button><button class="btn" data-device-detail="true" data-id="' + escapeHtml(safeText(item.id, "")) + '">详情</button><button class="btn" data-device-threshold="true" data-id="' + escapeHtml(safeText(item.id, "")) + '" data-code="' + escapeHtml(safeText(item.deviceId, "")) + '">阈值</button></div></td>' +
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
  body.querySelectorAll("button[data-device-threshold]").forEach((button) => button.addEventListener("click", () => {
    showDevThrModal(button.dataset.id, button.dataset.code);
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
      var resp = await handleAlarmAction(btn.dataset.action, btn.dataset.id);
      // 确认告警后检测是否需要弹窗询问广播
      if (btn.dataset.action === "confirm" && resp && resp.shouldBroadcast) {
        var ok = confirm('告警已确认。\n\n检测到火情告警，是否立即向该设备所在区域发送紧急广播？');
        if (ok) {
          var alarm = await apiRequest('/alarms/' + btn.dataset.id);
          if (alarm) {
            showBroadcastConfirmModal(alarm);
          }
        }
      }
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
    const resp = await apiRequest(isEdit ? "/devices/" + state.editingDeviceId : "/devices", {
      method: isEdit ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    // 保存阈值
    var devId = (resp && resp.id) || state.editingDeviceId;
    if (devId) {
      var sH = parseFloat(el("formSmokeHigh")?.value) || 0.30;
      var sM = parseFloat(el("formSmokeMed")?.value) || 0.15;
      var tH = parseFloat(el("formTempHigh")?.value) || 65;
      await saveDevThrSilent(devId, sH, sM, tH);
    }
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
async function batchHandleAlarms(action) {
  if (!state.selectedAlarmIds.length) return showGlobalAlert("请先选择要批量处理的告警");
  await Promise.allSettled(state.selectedAlarmIds.map((id) => handleAlarmAction(action, id)));
  state.selectedAlarmIds = [];
  await loadAlarmRows(state.alarmsPage.page);
  await loadScreenData();
  await loadAnalysisData();
}
async function handleAlarmAction(action, id) {
  if (action === "confirm") return await apiRequest("/alarms/" + id + "/confirm", { method: "PUT", body: JSON.stringify({ confirmMethod: "MANUAL" }) });
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
  var building = (el("broadcastBuilding")?.value || "").trim();
  var floor = (el("broadcastFloor")?.value || "").trim();
  var content = (el("broadcastContent")?.value || "").trim();
  if (!building) { showGlobalAlert("请输入楼栋"); return; }
  if (!content) { showGlobalAlert("请输入广播内容"); return; }
  var label = building + (floor ? floor : "全部楼层");
  if (!confirm("确认向 " + label + " 下发广播？\n\n内容: " + content.substring(0, 100))) return;
  try {
    await apiRequest("/broadcasts/area", {
      method: "POST",
      body: JSON.stringify({ building: building, floor: floor || null, broadcastContent: content, broadcastType: "EMERGENCY", triggerMode: "MANUAL" })
    });
    showGlobalAlert("已向 " + label + " 下发广播");
    addLog("success", "/api/v1/broadcasts/area", "区域广播已下发", 200, 0);
  } catch (error) {
    showGlobalAlert("广播失败: " + error.message);
  }
}

// ===== 告警确认弹窗广播 =====
function showBroadcastConfirmModal(alarm) {
  var building = alarm.building || alarm.locationBuilding || '';
  var floor = alarm.floor || alarm.locationFloor || '';
  var content = '【火警紧急通知】' + building + (floor ? ' ' + floor : '') + '区域检测到火情，请立即按照疏散通道有序撤离！';
  var area = building + (floor ? ' ' + floor : '');

  var html = '<div class="modal-mask" id="broadcastModal" onclick="if(event.target===this)this.remove()">' +
    '<div class="modal-panel" style="width:500px">' +
    '<h3>📢 发送紧急广播</h3>' +
    '<div class="form-group"><label>广播区域</label><input id="bcArea" value="' + escapeHtml(area) + '" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin:4px 0;box-sizing:border-box"></div>' +
    '<div class="form-group"><label>广播内容</label><textarea id="bcContent" rows="4" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin:4px 0;box-sizing:border-box">' + escapeHtml(content) + '</textarea></div>' +
    '<div style="display:flex;gap:8px;margin-top:10px">' +
    '<button class="btn btn-main" onclick="sendBroadcastFromAlarm(' + (alarm.id != null ? Number(alarm.id) : 0) + ')">发送广播</button>' +
    '<button class="btn" onclick="document.getElementById(\'broadcastModal\').remove()">取消</button></div>' +
    '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}

async function sendBroadcastFromAlarm(alarmId) {
  var area = (document.getElementById("bcArea")?.value || "").trim();
  var content = (document.getElementById("bcContent")?.value || "").trim();
  if (!content) { showGlobalAlert("请输入广播内容"); return; }
  try {
    await apiRequest("/broadcasts", {
      method: "POST",
      body: JSON.stringify({
        alarmId: alarmId,
        broadcastArea: area,
        broadcastContent: content,
        broadcastType: "EMERGENCY",
        triggerMode: "ALARM_LINKAGE"
      })
    });
    var modal = document.getElementById("broadcastModal");
    if (modal) modal.remove();
    showGlobalAlert("紧急广播已发送");
  } catch (error) {
    showGlobalAlert("广播发送失败: " + error.message);
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
  loadConversationHistory();
}

// ===== AI 对话历史管理 =====

async function loadConversationHistory() {
  var container = el("conversationHistory");
  if (!container) return;
  try {
    var data = await apiRequest("/conversations?page=1&pageSize=20");
    var records = (data && data.records) || [];
    if (!records.length) {
      container.innerHTML = '<div class="empty-state"><strong>暂无对话</strong><p>发送第一条消息后在此显示</p></div>';
      return;
    }
    var sessionMap = {};
    records.forEach(function(item) {
      if (!sessionMap[item.sessionId]) {
        sessionMap[item.sessionId] = {
          sessionId: item.sessionId,
          firstQuestion: item.question ? item.question.substring(0, 30) : "无内容",
          lastTime: item.createTime,
          count: 1
        };
      } else {
        sessionMap[item.sessionId].count++;
        sessionMap[item.sessionId].lastTime = item.createTime;
      }
    });
    var sessions = Object.values(sessionMap).sort(function(a, b) {
      return (b.lastTime || "").localeCompare(a.lastTime || "");
    });
    container.innerHTML = sessions.map(function(s) {
      var isActive = s.sessionId === state.aiSessionId;
      return '<div class="conv-item' + (isActive ? ' active' : '') + '" data-session="' + s.sessionId + '" style="padding:8px;border-bottom:1px solid #e2e8f0;cursor:pointer;' + (isActive ? 'background:#eff6ff;' : '') + '">' +
        '<div style="font-weight:600;font-size:13px;color:' + (isActive ? '#2563eb' : '#334155') + ';">' + escapeHtml(s.firstQuestion) + (s.count > 1 ? ' (' + s.count + '轮)' : '') + '</div>' +
        '<div style="font-size:11px;color:#94a3b8;margin-top:2px;">' + escapeHtml(s.lastTime || "") + (isActive ? ' · 当前' : '') + '</div>' +
        '</div>';
    }).join("");
    container.querySelectorAll(".conv-item").forEach(function(el) {
      el.addEventListener("click", function() { resumeConversation(this.dataset.session); });
    });
  } catch (error) {
    container.innerHTML = '<div class="empty-state"><strong>加载失败</strong><p>' + error.message + '</p></div>';
  }
}

async function startNewConversation() {
  state.aiSessionId = buildSessionId();
  var log = el("chatLog");
  if (log) log.innerHTML = '<div class="chat-empty-state" id="chatEmpty"><span class="empty-icon">💬</span><strong>您好！我是智慧烟感智能助手</strong><p>您可以问我关于火灾预防、设备使用、灾情研判等方面的问题</p><div class="quick-qs"><span data-q="发生火灾如何逃生？">发生火灾如何逃生？</span><span data-q="附近有哪些消防设备可用？">附近有哪些消防设备可用？</span><span data-q="如何进行火灾隐患排查？">如何进行火灾隐患排查？</span><span data-q="当前区域风险等级是多少？">当前区域风险等级是多少？</span></div></div>';
  bindQuickQs();
  lastAiAnswer = "";
  aiRound = 0;
  var latEl = el("modelLatency"); if (latEl) latEl.textContent = "— ms";
  var rndEl = el("modelRounds"); if (rndEl) rndEl.textContent = "0";
  var tokEl = el("modelTokens"); if (tokEl) tokEl.textContent = "—";
  renderAiJudgement();
  updateBroadcastButtonState();
  loadConversationHistory();
}

async function resumeConversation(sessionId) {
  state.aiSessionId = sessionId;
  var log = el("chatLog");
  if (!log) return;
  log.innerHTML = '<div class="empty-state"><strong>加载历史对话...</strong></div>';
  try {
    var data = await apiRequest("/conversations?sessionId=" + encodeURIComponent(sessionId) + "&page=1&pageSize=200");
    var records = (data && data.records) || [];
    records.sort(function(a, b) { return (a.createTime || "").localeCompare(b.createTime || ""); });
    log.innerHTML = '<div class="chat-empty-state" id="chatEmpty" style="display:none;"></div>';
    records.forEach(function(item) {
      if (item.question) appendChat("user", item.question);
      if (item.answer) appendChat("ai", item.answer);
    });
    aiRound = records.filter(function(r) { return r.question; }).length;
    var rndEl = el("modelRounds"); if (rndEl) rndEl.textContent = String(aiRound);
    lastAiAnswer = records.length > 0 ? (records[records.length - 1].answer || "") : "";
  } catch (error) {
    log.innerHTML = '<div class="empty-state"><strong>加载失败</strong><p>' + error.message + '</p></div>';
  }
  loadConversationHistory();
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

// ===== 广播管理 =====
async function loadBroadcastOptions() {
  try {
    var data = await apiRequest("/simulation/devices");
    var devices = Array.isArray(data) ? data : [];
    var buildings = [...new Set(devices.map(function(d) { return d.building; }).filter(Boolean))].sort();
    var bSel = el("broadcastBuildingSel");
    if (bSel) { bSel.innerHTML = '<option value="">-- 选择楼栋 --</option>' + buildings.map(function(b) { return '<option value="' + b + '">' + b + '</option>'; }).join(''); }
    if (bSel) bSel.addEventListener("change", function() {
      var floors = [...new Set(devices.filter(function(d) { return d.building === bSel.value; }).map(function(d) { return d.floor; }).filter(Boolean))].sort();
      var fSel = el("broadcastFloorSel");
      if (fSel) { fSel.innerHTML = '<option value="">-- 全部楼层 --</option>' + floors.map(function(f) { return '<option value="' + f + '">' + f + '</option>'; }).join(''); }
    });
  } catch(e) { console.error(e); }
}
async function loadBroadcastHistory(page) {
  if (!page) page = 1;
  try {
    var data = await apiRequest("/broadcasts?page=" + page + "&pageSize=10");
    var pageData = normalizePageResult(data, page, 10);
    var body = el("broadcastTableBody");
    if (!body) return;
    if (!pageData.records.length) { body.innerHTML = '<tr><td colspan="4"><div class="empty-state"><strong>暂无广播记录</strong></div></td></tr>'; return; }
    body.innerHTML = pageData.records.map(function(r) { return '<tr><td>' + safeText(r.createTime, "--") + '</td><td>' + safeText(r.broadcastArea, "--") + '</td><td>' + safeText(r.broadcastType, "--") + '</td><td>' + safeText(r.sendStatus, "--") + '</td></tr>'; }).join('');
    var pg = el("broadcastPagination");
    if (pg) pg.innerHTML = '<span class="page-info">第 ' + pageData.page + ' / ' + pageData.pages + ' 页，共 ' + pageData.total + ' 条</span>';
  } catch(e) { console.error(e); }
}
async function sendBroadcastAction() {
  var building = (el("broadcastBuildingSel")?.value || "").trim();
  var floor = (el("broadcastFloorSel")?.value || "").trim();
  var content = (el("broadcastContent")?.value || "").trim();
  console.log("sendBroadcastAction:", {building, floor, content});
  if (!building) { showGlobalAlert("请选择楼栋"); return; }
  if (!content) { showGlobalAlert("请输入广播内容"); return; }
  var label = building + (floor ? floor : "全部楼层");
  if (!confirm("确认向 " + label + " 下发广播？")) return;
  try {
    var payload = { building: building, floor: floor || null, broadcastContent: content, broadcastType: "EMERGENCY", triggerMode: "MANUAL" };
    console.log("POST /broadcasts/area:", payload);
    var resp = await apiRequest("/broadcasts/area", { method: "POST", body: JSON.stringify(payload) });
    console.log("broadcast response:", resp);
    showGlobalAlert("已向 " + label + " 下发广播");
    loadBroadcastHistory(1);
  } catch(error) { console.error("broadcast error:", error); showGlobalAlert("广播失败: " + error.message); }
}
async function jumpToBroadcast(building, floor) {
  switchView("broadcasts");
  await loadBroadcastOptions(); // 等数据加载完
  var bSel = el("broadcastBuildingSel");
  if (bSel && building) { bSel.value = building; bSel.dispatchEvent(new Event("change")); }
  await new Promise(function(r) { setTimeout(r, 200); }); // 等楼层联动
  var fSel = el("broadcastFloorSel");
  if (fSel && floor && floor.trim()) { fSel.value = floor; }
  var cEl = el("broadcastContent");
  if (cEl && building) { cEl.value = "【火警告警通知】" + building + (floor ? floor : "") + "检测到火情，请立即疏散！"; }
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

// 告警音效（懒初始化，首次用户点击后激活）
var _alarmAudioCtx = null;
function _ensureAudioCtx() { if (!_alarmAudioCtx) { _alarmAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } if (_alarmAudioCtx.state === 'suspended') { _alarmAudioCtx.resume(); } return _alarmAudioCtx; }
document.addEventListener('click', function() { _ensureAudioCtx(); }, { once: false });
function playAlarmSound() {
  try { var ctx = _ensureAudioCtx(); var t = ctx.currentTime;
    // 第一段：高频急促
    var o1 = ctx.createOscillator(); var g1 = ctx.createGain(); o1.connect(g1); g1.connect(ctx.destination);
    o1.type = 'sawtooth'; o1.frequency.setValueAtTime(1000, t); o1.frequency.setValueAtTime(800, t+0.15); o1.frequency.setValueAtTime(1000, t+0.3);
    g1.gain.setValueAtTime(0.25, t); g1.gain.exponentialRampToValueAtTime(0.01, t+0.35);
    o1.start(t); o1.stop(t+0.35);
    // 第二段：低沉持续
    var o2 = ctx.createOscillator(); var g2 = ctx.createGain(); o2.connect(g2); g2.connect(ctx.destination);
    o2.type = 'square'; o2.frequency.setValueAtTime(500, t+0.35); o2.frequency.setValueAtTime(400, t+0.65);
    g2.gain.setValueAtTime(0.01, t+0.35); g2.gain.linearRampToValueAtTime(0.2, t+0.4); g2.gain.exponentialRampToValueAtTime(0.01, t+0.9);
    o2.start(t+0.35); o2.stop(t+0.9);
  } catch(e) {}
}

var _lastAlarmKeys = {};
function showRealtimeAlarmBanner(payload) {
  var key = (payload.deviceId || '') + '|' + (payload.alarmType || '') + '|' + (payload.alarmStatus || '');
  var now = Date.now();
  if (_lastAlarmKeys[key] && (now - _lastAlarmKeys[key]) < 3000) return; // 3秒内去重
  _lastAlarmKeys[key] = now;
  const stack = el("alarmBannerStack");
  if (!stack) return;
  const levelClass = alarmLevelClass(payload.alarmLevel);
  const title = formatAlarmLevel(payload.alarmLevel) + "级" + formatAlarmType(payload.alarmType || payload.alarmTypeText);
  const deviceName = safeText(payload.deviceName || payload.deviceId, "未知设备");
  const location = [payload.building, payload.floor, payload.room].filter(Boolean).join("");
  const metric = formatAlarmMetric(payload);
  const summary = safeText(payload.message, metric);
  var id = "banner-" + Date.now() + "-" + Math.random().toString(36).slice(2,6);
  var card = document.createElement("div");
  card.id = id;
  card.className = "alarm-card";
  card.style.cssText = "background:#fff;border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,0.12);padding:12px 16px;border-left:4px solid " + (levelClass === "danger" ? "#ef4444" : levelClass === "warn" ? "#f59e0b" : "#3b82f6") + ";cursor:pointer;animation:fadeIn 0.3s ease;";
  card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;"><div><strong style="font-size:13px;color:#1e293b;">' + escapeHtml(title) + '</strong><span style="margin-left:8px;font-size:11px;color:#64748b;">' + escapeHtml(deviceName) + '</span></div><span style="cursor:pointer;color:#94a3b8;font-size:16px;line-height:1;" onclick="this.parentElement.parentElement.remove()">×</span></div>' +
    '<div style="font-size:11px;color:#94a3b8;margin-top:3px;">' + (location ? escapeHtml(location) + ' · ' : '') + escapeHtml(formatAlarmStatus(payload.alarmStatus)) + ' · ' + escapeHtml(metric) + '</div>';
  stack.appendChild(card);
  // 10秒后自动消失
  setTimeout(function() { var el = document.getElementById(id); if (el) el.remove(); }, 10000);
  // 最多保留 5 条
  while (stack.children.length > 5) { stack.removeChild(stack.firstChild); }
}

function showDeviceOnlineBanner(payload) {
  var stack = el("alarmBannerStack");
  var dName = safeText(payload.deviceName || payload.deviceId, "未知设备");
  var addr = [payload.building, payload.floor, payload.room].filter(Boolean).join("");
  if (!stack) return;
  var id = "on-" + Date.now() + "-" + Math.random().toString(36).slice(2,6);
  var card = document.createElement("div");
  card.id = id;
  card.style.cssText = "background:#f0fdf4;border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,0.08);padding:10px 14px;border-left:4px solid #22c55e;font-size:12px;";
  card.innerHTML = '<strong style="color:#166534;">📡 设备恢复在线</strong> ' + escapeHtml(dName) + (addr ? ' · ' + escapeHtml(addr) : '') + ' <span style="float:right;cursor:pointer;color:#94a3b8;" onclick="this.parentElement.remove()">×</span>';
  stack.appendChild(card);
  setTimeout(function() { var el = document.getElementById(id); if (el) el.remove(); }, 10000);
}

var _lastBcKey = "", _lastBcTime = 0;
function showBroadcastBanner(payload) {
  var key = (payload.area || '') + '|' + (payload.message || '').substring(0, 30);
  var now = Date.now();
  if (_lastBcKey === key && (now - (_lastBcTime||0)) < 3000) return;
  _lastBcKey = key; _lastBcTime = now;
  var stack = el("alarmBannerStack");
  if (!stack) return;
  var area = safeText(payload.area || payload.broadcastArea, "当前区域");
  var msg = safeText(payload.message || payload.broadcastContent, "");
  var id = "bc-" + Date.now() + "-" + Math.random().toString(36).slice(2,6);
  var card = document.createElement("div");
  card.className = "broadcast-card";
  card.id = id;
  card.style.cssText = "background:#fef2f2;border-radius:10px;padding:14px 16px;border-left:5px solid #dc2626;cursor:pointer;";
  card.innerHTML = '<div style="display:flex;justify-content:space-between;"><div style="flex:1;"><div style="font-size:15px;font-weight:700;color:#dc2626;">🚨 紧急广播 · ' + escapeHtml(area) + '</div><div style="font-size:13px;color:#1e293b;margin-top:6px;line-height:1.5;">' + escapeHtml(msg) + '</div></div><span style="cursor:pointer;color:#94a3b8;font-size:18px;padding-left:8px;" onclick="document.getElementById(\'' + id + '\').remove()">×</span></div>';
  stack.appendChild(card);
  setTimeout(function() { var el = document.getElementById(id); if (el) el.remove(); }, 120000);
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
    // AI确认火情 → 显示广播按钮
    if (item.reviewResult === "FIRE_CONFIRMED" && item.deviceId) {
      var modalBody = el("detailModalBody");
      if (modalBody) {
        var btnRow = document.createElement("div");
        btnRow.style.cssText = "margin-top:16px;text-align:center;";
        btnRow.innerHTML = '<button class="btn btn-main danger-wide" id="btnBroadcastFromReview" style="font-size:14px;padding:10px 24px;">📢 下发广播到此区域</button>';
        modalBody.appendChild(btnRow);
        document.getElementById("btnBroadcastFromReview").addEventListener("click", async function() {
          try { var dev = await apiRequest("/devices/" + item.deviceId); closeDetailModal(); await jumpToBroadcast(dev.locationBuilding, dev.locationFloor); }
          catch(e) { showGlobalAlert("获取设备信息失败"); }
        });
      }
    }
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
        else if (payload.kind === "device_online") { showDeviceOnlineBanner(payload); }
        else { showRealtimeAlarmBanner(payload); }
        loadScreenData();
        loadAnalysisData();
        loadAlarmRows(1);
        loadReviewRows(1);
        loadDeviceStats();
        loadDevices(state.devicesPage.page || 1);
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
  var btnSendBc = el("btnSendBroadcast"); if (btnSendBc) btnSendBc.addEventListener("click", sendBroadcastAction);
  var btnRefreshBc = el("btnRefreshBroadcasts"); if (btnRefreshBc) btnRefreshBc.addEventListener("click", function() { loadBroadcastHistory(1); });
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
  const btnNewConversation = el("btnNewConversation"); if (btnNewConversation) btnNewConversation.addEventListener("click", startNewConversation);
  const btnRefreshHistory = el("btnRefreshHistory"); if (btnRefreshHistory) btnRefreshHistory.addEventListener("click", loadConversationHistory);
  const btnOpenLogDrawer = el("btnOpenLogDrawer"); if (btnOpenLogDrawer) btnOpenLogDrawer.addEventListener("click", openLogDrawer);
  const btnCloseDrawer = el("btnCloseDrawer"); if (btnCloseDrawer) btnCloseDrawer.addEventListener("click", closeLogDrawer);
  const logDrawerMask = el("logDrawerMask"); if (logDrawerMask) logDrawerMask.addEventListener("click", closeLogDrawer);
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
  setInterval(async () => { await loadHealthStatus(); await loadScreenData(); }, 10000);
}

// ===== 设备可视化 (Three.js 3D 楼层图 v2) =====
window._vizData=null; window._vizSel=null; window._vizBld=null; window._vizFlr=null; window._vizThr=[];
window._vizScene=null; window._vizCamera=null; window._vizRenderer=null; window._vizMarkers=[]; window._vizPulseObjs=[];

window.initViz=async function(){
  var d=await apiRequest("/devices/building-tree"); window._vizData=(d&&d.buildings)?d:null;
  var t=await apiRequest("/thresholds?page=1&pageSize=200"); window._vizThr=(t&&t.records)?t.records:[];
  initThreeJS();
  renderVizBlds();
  if(window._vizData&&window._vizData.buildings.length>0&&!window._vizBld) selectVizBld(window._vizData.buildings[0].name);
  else if(window._vizBld) selectVizBld(window._vizBld);
};
window.refreshViz=function(){window.initViz();};

function initThreeJS(){
  if(window._vizRenderer) return;
  var container=el("vizFloorPlan"); if(!container)return;
  var W=container.clientWidth||800, H=container.clientHeight||500;
  window._vizScene=new THREE.Scene(); window._vizScene.background=new THREE.Color(0x0f172a);
  window._vizScene.fog=new THREE.Fog(0x0f172a,5,25);
  window._vizCamera=new THREE.PerspectiveCamera(45,W/H,0.1,1000); window._vizCamera.position.set(10,8,12); window._vizCamera.lookAt(0,2,0);
  window._vizRenderer=new THREE.WebGLRenderer({antialias:true,alpha:true}); window._vizRenderer.setSize(W,H); window._vizRenderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  window._vizRenderer.shadowMap.enabled=true; window._vizRenderer.shadowMap.type=THREE.PCFSoftShadowMap;
  container.innerHTML=''; container.appendChild(window._vizRenderer.domElement);
  // Lights
  window._vizScene.add(new THREE.AmbientLight(0x334155,1.2));
  var sun=new THREE.DirectionalLight(0xffffff,1.5); sun.position.set(15,20,10); sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); window._vizScene.add(sun);
  var fill=new THREE.DirectionalLight(0x60a5fa,0.4); fill.position.set(-5,3,-5); window._vizScene.add(fill);
  // Grid floor
  var grid=new THREE.GridHelper(16,16,0x1e293b,0x1e293b); grid.position.y=-0.01; window._vizScene.add(grid);
  // OrbitControls (drag to rotate)
  window._vizControls=new THREE.OrbitControls(window._vizCamera,window._vizRenderer.domElement);
  window._vizControls.enableDamping=true; window._vizControls.dampingFactor=0.1; window._vizControls.target.set(0,2,0);
  // Raycaster
  window._vizRaycaster=new THREE.Raycaster();
  window._vizRenderer.domElement.addEventListener('click',function(e){
    var rect=this.getBoundingClientRect(); var mx=((e.clientX-rect.left)/rect.width)*2-1; var my=-((e.clientY-rect.top)/rect.height)*2+1;
    window._vizRaycaster.setFromCamera(new THREE.Vector2(mx,my),window._vizCamera);
    var hits=window._vizRaycaster.intersectObjects(window._vizMarkers);
    if(hits.length>0){var ud=hits[0].object.userData; if(ud.clickable){selectVizDev(ud); highlightVizMarker(hits[0].object);}}
  });
  // Animation loop
  function animate(){requestAnimationFrame(animate); window._vizControls.update();
    window._vizPulseObjs.forEach(function(o){if(o.userData.pulsing){o.material.emissiveIntensity=0.4+Math.sin(Date.now()*0.01)*0.4;}});
    window._vizRenderer.render(window._vizScene,window._vizCamera);} animate();
  // Resize
  window.addEventListener('resize',function(){if(!window._vizRenderer)return; var c=el("vizFloorPlan"); if(!c)return; window._vizCamera.aspect=c.clientWidth/c.clientHeight; window._vizCamera.updateProjectionMatrix(); window._vizRenderer.setSize(c.clientWidth,c.clientHeight);});
}

function renderVizBlds(){
  var l=el("vizBuildingList"); if(!l)return;
  var bs=(window._vizData&&window._vizData.buildings)?window._vizData.buildings:[];
  l.innerHTML=bs.map(function(b){var n=b.name||''; return '<div class="viz-building-item'+(window._vizBld===n?' active':'')+'" data-bld="'+escapeHtml(n)+'" onclick="selectVizBld(this.dataset.bld)">'+escapeHtml(n)+' <span class="count">'+(b.total||0)+'台</span></div>';}).join('');
}

function selectVizBld(name){
  window._vizBld=name; window._vizFlr=null;
  renderVizBlds(); renderVizStats(); renderVizDevicePanel();
  var bs=(window._vizData&&window._vizData.buildings)?window._vizData.buildings:[];
  var b=bs.find(function(x){return x.name===name;}); if(!b)return;
  var floors=[]; (b.floors||[]).forEach(function(f){floors.push(f.name);}); floors.sort();
  renderVizFlrTabs(floors);
  if(floors.length>0) selectVizFlr(floors[0]);
  else rebuildVizScene([]);
}

function renderVizFlrTabs(floors){
  var t=el("vizFloorTabs"); if(!t)return;
  t.innerHTML=floors.map(function(f){return '<button class="viz-floor-tab'+(window._vizFlr===f?' active':'')+'" data-flr="'+escapeHtml(f)+'" onclick="selectVizFlr(this.dataset.flr)">'+escapeHtml(f)+'</button>';}).join('');
}

function selectVizFlr(floor){
  window._vizFlr=floor;
  var bs=(window._vizData&&window._vizData.buildings)?window._vizData.buildings:[];
  var b=bs.find(function(x){return x.name===window._vizBld;}); if(!b)return;
  var floors=[]; (b.floors||[]).forEach(function(f){floors.push(f.name);}); floors.sort();
  renderVizFlrTabs(floors);
  var devs=(b.devices||[]).filter(function(d){return d.locationFloor===floor;});
  rebuildVizScene(devs,b.name);
  renderVizStats(); renderVizDevicePanel();
}

function rebuildVizScene(devs,bldName){
  if(!window._vizScene) return;
  // Clear existing markers
  window._vizMarkers.forEach(function(o){window._vizScene.remove(o);}); window._vizMarkers=[];
  window._vizPulseObjs.forEach(function(o){window._vizScene.remove(o);}); window._vizPulseObjs=[];
  // Multi-floor 3D building
  var floors=[]; devs.forEach(function(d){var f=d.locationFloor||''; if(floors.indexOf(f)<0)floors.push(f);}); floors.sort();
  var numFloors=Math.max(floors.length,1); var bldW=7, bldD=5, floorH=1.2;
  var isClickable=true;
  // Draw each floor as a glass box
  var bx=-bldW/2, bz=-bldD/2;
  for(var fi=0; fi<numFloors; fi++){
    var fy=fi*floorH;
    // Floor slab
    var slabGeo=new THREE.BoxGeometry(bldW,0.08,bldD); var slabMat=new THREE.MeshPhongMaterial({color:0x334155}); var slab=new THREE.Mesh(slabGeo,slabMat); slab.position.set(bx+bldW/2,fy,bz+bldD/2); slab.receiveShadow=true; slab.castShadow=true; window._vizScene.add(slab);
    // Glass walls
    var wallGeo=new THREE.BoxGeometry(bldW,floorH-0.1,bldD); var wallMat=new THREE.MeshPhongMaterial({color:0x60a5fa,transparent:true,opacity:0.08,emissive:0x1e3a5f,emissiveIntensity:0.3}); var wall=new THREE.Mesh(wallGeo,wallMat); wall.position.set(bx+bldW/2,fy+floorH/2,bz+bldD/2); wall.userData={floor:i}; window._vizScene.add(wall);
    // Edge lines
    var edgeGeo=new THREE.EdgesGeometry(wallGeo); var edgeMat=new THREE.LineBasicMaterial({color:0x475569}); var edge=new THREE.LineSegments(edgeGeo,edgeMat); wall.add(edge);
    // Floor label
    var canvas=document.createElement('canvas'); canvas.width=256; canvas.height=32; var ctx=canvas.getContext('2d'); ctx.fillStyle='#94a3b8'; ctx.font='bold 14px sans-serif'; ctx.textAlign='center'; ctx.fillText(floors[fi]||'',128,22); var tex=new THREE.CanvasTexture(canvas); var spMat=new THREE.SpriteMaterial({map:tex,transparent:true}); var sp=new THREE.Sprite(spMat); sp.position.set(bx+bldW+0.5,fy+floorH/2,bz); sp.scale.set(2,0.3,1); window._vizScene.add(sp);
    // Devices on this floor
    var floorDevs=devs.filter(function(d){return (d.locationFloor||'')===floors[fi];});
    floorDevs.forEach(function(d,di){
      var dCol=di%4, dRow=Math.floor(di/4);
      var dx=bx+1.2+dCol*1.5, dy=fy+0.4+dRow*0.6, dz=bz+1.5;
      var color=d.status==='ONLINE'?0x22c55e:0xef4444;
      var geo=new THREE.SphereGeometry(0.22,32,32);
      var mat=new THREE.MeshPhongMaterial({color:color,emissive:color,emissiveIntensity:0.5,shininess:100});
      var mesh=new THREE.Mesh(geo,mat); mesh.position.set(dx,dy,dz); mesh.castShadow=true;
      mesh.userData={deviceId:d.deviceId,id:d.id,clickable:isClickable,floor:floors[fi],status:d.status};
      window._vizScene.add(mesh); window._vizMarkers.push(mesh);
      // Glow ring
      var ringGeo=new THREE.TorusGeometry(0.28,0.03,8,32); var ringMat=new THREE.MeshBasicMaterial({color:color,transparent:true,opacity:0.6}); var ring=new THREE.Mesh(ringGeo,ringMat); ring.position.copy(mesh.position); ring.rotation.x=Math.PI/2; window._vizScene.add(ring); window._vizPulseObjs.push(ring);
      // Label
      var lCanvas=document.createElement('canvas'); lCanvas.width=128; lCanvas.height=24; var lCtx=lCanvas.getContext('2d'); lCtx.fillStyle='#e2e8f0'; lCtx.font='9px sans-serif'; lCtx.textAlign='center'; lCtx.fillText((d.deviceId||'').substring(0,8),64,16); var lTex=new THREE.CanvasTexture(lCanvas); var lSpMat=new THREE.SpriteMaterial({map:lTex,transparent:true}); var lSp=new THREE.Sprite(lSpMat); lSp.position.set(dx,dy+0.35,dz); lSp.scale.set(1.2,0.25,1); window._vizScene.add(lSp);
    });
  }
}

function highlightVizMarker(mesh){window._vizMarkers.forEach(function(m){m.material.emissiveIntensity=0.5;}); mesh.material.emissiveIntensity=1; mesh.material.emissive=new THREE.Color(0xffff00); setTimeout(function(){mesh.material.emissive=new THREE.Color(mesh.userData.status==='ONLINE'?0x22c55e:0xef4444); mesh.material.emissiveIntensity=0.5;},1500);}

function renderVizStats(){
  var bar=el("vizStatsBar"); if(!bar)return;
  var bs=(window._vizData&&window._vizData.buildings)?window._vizData.buildings:[];
  var b=bs.find(function(x){return x.name===window._vizBld;}); if(!b)return;
  var devs=(b.devices||[]).filter(function(d){return !window._vizFlr||d.locationFloor===window._vizFlr;});
  bar.innerHTML='<span class="viz-stat"><span class="viz-stat-dot online"></span>在线:'+devs.filter(function(d){return d.status==='ONLINE';}).length+'</span> <span class="viz-stat"><span class="viz-stat-dot offline"></span>离线:'+devs.filter(function(d){return d.status==='OFFLINE';}).length+'</span> <span style="margin-left:auto">共'+devs.length+'台</span>';
}

// Device list panel in sidebar
function renderVizDevicePanel(){
  if(!window._vizBld)return;
  var bs=(window._vizData&&window._vizData.buildings)?window._vizData.buildings:[];
  var b=bs.find(function(x){return x.name===window._vizBld;}); if(!b)return;
  var devs=(b.devices||[]).filter(function(d){return !window._vizFlr||d.locationFloor===window._vizFlr;});
  var sidebar=el("vizSidebar"); if(!sidebar)return;
  var panel=sidebar.querySelector(".viz-device-panel");
  if(!panel){panel=document.createElement("div"); panel.className="viz-device-panel"; sidebar.appendChild(panel);}
  panel.innerHTML='<div style="font-weight:700;font-size:11px;margin:8px 0 4px;padding-top:8px;border-top:1px solid #e2e8f0">📋 设备清单 ('+devs.length+')</div>';
  devs.forEach(function(d){
    var cls=d.status==='ONLINE'?'online':'offline'; var sel=window._vizSel&&window._vizSel.id===d.id;
    panel.innerHTML+='<div class="viz-device-list-item'+(sel?' selected':'')+'" data-dcode="'+escapeHtml(d.deviceId||'')+'" data-did="'+d.id+'" onclick="selectVizDevFromList(this.dataset.dcode,parseInt(this.dataset.did))" style="padding:4px 6px;cursor:pointer;font-size:10px;border-radius:4px;'+(sel?'background:#eff6ff;font-weight:600;':'')+'"><span class="d '+cls+'" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:'+(d.status==='ONLINE'?'#22c55e':'#ef4444')+';margin-right:4px;"></span>'+escapeHtml(d.deviceId||'')+' · '+escapeHtml(d.locationRoom||'')+'</div>';
  });
}
async function selectVizDevFromList(deviceCode,deviceId){
  window._vizSel={deviceId:deviceCode,id:deviceId};
  renderVizDevicePanel();
  renderVizDetail({deviceId:deviceCode,id:deviceId});
  // Highlight in 3D scene
  window._vizMarkers.forEach(function(m){if(m.userData.id===deviceId)highlightVizMarker(m);});
}

function selectVizDev(ud){if(!ud.clickable)return; window._vizSel=ud; renderVizDetail(ud); renderVizDevicePanel();}
async function renderVizDetail(ud){
  var body=el("vizDetailBody"); if(!body)return;
  body.innerHTML='加载中...';
  var dev=await apiRequest("/devices/"+ud.id);
  if(!dev){body.innerHTML='设备不存在';return;}
  var devThr=window._vizThr.filter(function(t){return String(t.deviceId)===String(ud.id);});
  var sH=devThr.find(function(t){return t.thresholdType==='SMOKE_CONCENTRATION'&&t.alarmLevel==='HIGH';});
  var sM=devThr.find(function(t){return t.thresholdType==='SMOKE_CONCENTRATION'&&t.alarmLevel==='MEDIUM';});
  var tH=devThr.find(function(t){return t.thresholdType==='TEMPERATURE';});
  body.innerHTML=
    '<div style="margin-bottom:8px"><span style="color:'+(dev.status==='ONLINE'?'#22c55e':'#ef4444')+'">●</span> <strong>'+escapeHtml(dev.deviceId||ud.deviceId)+'</strong></div>'+
    '<div style="font-size:11px;margin:2px 0"><label style="color:#94a3b8">名称</label> '+escapeHtml(dev.deviceName||'--')+'</div>'+
    '<div style="font-size:11px;margin:2px 0"><label style="color:#94a3b8">地址</label> '+escapeHtml((dev.locationBuilding||'')+(dev.locationFloor||'')+(dev.locationRoom||''))+'</div>'+
    '<div style="font-size:11px;margin:2px 0"><label style="color:#94a3b8">电量/信号</label> '+(dev.battery||'--')+'% / '+(dev.signalStrength||'--')+'%</div>'+
    '<hr style="margin:8px 0"><div style="font-weight:700;font-size:12px;margin-bottom:4px">⚙️ 阈值配置</div>'+
    '<div style="font-size:11px;margin:2px 0"><label style="color:#94a3b8">烟雾HIGH</label> <input id="vtSH" value="'+(sH?sH.thresholdMax:'0.30')+'" style="width:80px;padding:3px;border:1px solid #d1d5db;border-radius:4px;font-size:11px"></div>'+
    '<div style="font-size:11px;margin:2px 0"><label style="color:#94a3b8">烟雾MED</label> <input id="vtSM" value="'+(sM?sM.thresholdMax:'0.15')+'" style="width:80px;padding:3px;border:1px solid #d1d5db;border-radius:4px;font-size:11px"></div>'+
    '<div style="font-size:11px;margin:2px 0"><label style="color:#94a3b8">温度HIGH</label> <input id="vtTH" value="'+(tH?tH.thresholdMax:'65')+'" style="width:80px;padding:3px;border:1px solid #d1d5db;border-radius:4px;font-size:11px"></div>'+
    '<button class="btn btn-main" style="width:100%;margin-top:8px;font-size:11px;padding:6px" onclick="saveVizThr('+ud.id+')">💾 保存阈值</button>';
}

async function saveVizThr(devId){
  var sH=parseFloat(el("vtSH").value)||0.3, sM=parseFloat(el("vtSM").value)||0.15, tH=parseFloat(el("vtTH").value)||65;
  try{
    var old=(window._vizThr||[]).filter(function(t){return String(t.deviceId)===String(devId);});
    for(var i=0;i<old.length;i++) await apiRequest("/thresholds/"+old[i].id,{method:"DELETE"});
    await apiRequest("/thresholds",{method:"POST",body:JSON.stringify({deviceId:Number(devId),thresholdType:"SMOKE_CONCENTRATION",thresholdMax:sH,alarmLevel:"HIGH",status:"ENABLED",sortOrder:1})});
    await apiRequest("/thresholds",{method:"POST",body:JSON.stringify({deviceId:Number(devId),thresholdType:"SMOKE_CONCENTRATION",thresholdMax:sM,alarmLevel:"MEDIUM",status:"ENABLED",sortOrder:2})});
    await apiRequest("/thresholds",{method:"POST",body:JSON.stringify({deviceId:Number(devId),thresholdType:"TEMPERATURE",thresholdMax:tH,alarmLevel:"HIGH",status:"ENABLED",sortOrder:1})});
    alert('阈值已保存'); window._vizThr = (await apiRequest('/thresholds?page=1&pageSize=200'))?.records || [];
  }catch(e){showGlobalAlert("保存失败:"+e.message);}
}

// 设备管理页阈值
window._devThr=[];
async function showDevThrModal(devId,devCode){
  var d=await apiRequest("/thresholds?page=1&pageSize=200&_t="+Date.now()); window._devThr=(d&&d.records)?d.records:[];
  var sH=window._devThr.find(function(t){return String(t.deviceId)===String(devId)&&t.thresholdType==='SMOKE_CONCENTRATION'&&t.alarmLevel==='HIGH';});
  var sM=window._devThr.find(function(t){return String(t.deviceId)===String(devId)&&t.thresholdType==='SMOKE_CONCENTRATION'&&t.alarmLevel==='MEDIUM';});
  var tH=window._devThr.find(function(t){return String(t.deviceId)===String(devId)&&t.thresholdType==='TEMPERATURE';});
  var m=el("detailModal"),t=el("detailModalTitle"),b=el("detailModalBody");
  if(!m||!t||!b)return; t.textContent='阈值配置: '+devCode; m.classList.remove("hidden");
  b.innerHTML='<div style="padding:12px"><div class="form-group"><label>烟雾 HIGH (mg/m³)</label><input id="dtSH" value="'+(sH?sH.thresholdMax:'0.30')+'" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin:4px 0;"></div>'+
    '<div class="form-group"><label>烟雾 MEDIUM (mg/m³)</label><input id="dtSM" value="'+(sM?sM.thresholdMax:'0.15')+'" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin:4px 0;"></div>'+
    '<div class="form-group"><label>温度 HIGH (°C)</label><input id="dtTH" value="'+(tH?tH.thresholdMax:'65')+'" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;margin:4px 0;"></div>'+
    '<button class="btn btn-main" style="width:100%;margin-top:10px" onclick="saveDevThr(\''+devId+'\')">保存阈值</button></div>';
}
async function saveDevThr(devId){
  var sH=parseFloat(el("dtSH").value)||0.3, sM=parseFloat(el("dtSM").value)||0.15, tH=parseFloat(el("dtTH").value)||65;
  try{
    var old=(window._devThr||[]).filter(function(t){return String(t.deviceId)===String(devId);});
    for(var i=0;i<old.length;i++) await apiRequest("/thresholds/"+old[i].id,{method:"DELETE"});
    await apiRequest("/thresholds",{method:"POST",body:JSON.stringify({deviceId:Number(devId),thresholdType:"SMOKE_CONCENTRATION",thresholdMax:sH,alarmLevel:"HIGH",status:"ENABLED",sortOrder:1})});
    await apiRequest("/thresholds",{method:"POST",body:JSON.stringify({deviceId:Number(devId),thresholdType:"SMOKE_CONCENTRATION",thresholdMax:sM,alarmLevel:"MEDIUM",status:"ENABLED",sortOrder:2})});
    await apiRequest("/thresholds",{method:"POST",body:JSON.stringify({deviceId:Number(devId),thresholdType:"TEMPERATURE",thresholdMax:tH,alarmLevel:"HIGH",status:"ENABLED",sortOrder:1})});
    showGlobalAlert("阈值已保存"); closeDetailModal();
  }catch(e){showGlobalAlert("保存失败:"+e.message);}
}

// 设备表单中静默保存阈值（先删旧阈值，再插新阈值）
async function saveDevThrSilent(devId, sH, sM, tH) {
  try {
    var old = await apiRequest("/thresholds?page=1&pageSize=200&deviceId=" + devId);
    var records = (old && old.records) || [];
    for (var i = 0; i < records.length; i++) {
      await apiRequest("/thresholds/" + records[i].id, { method: "DELETE" });
    }
    await apiRequest("/thresholds", { method: "POST", body: JSON.stringify({ deviceId: Number(devId), thresholdType: "SMOKE_CONCENTRATION", thresholdMax: sH, alarmLevel: "HIGH", status: "ENABLED", sortOrder: 1 }) });
    await apiRequest("/thresholds", { method: "POST", body: JSON.stringify({ deviceId: Number(devId), thresholdType: "SMOKE_CONCENTRATION", thresholdMax: sM, alarmLevel: "MEDIUM", status: "ENABLED", sortOrder: 2 }) });
    await apiRequest("/thresholds", { method: "POST", body: JSON.stringify({ deviceId: Number(devId), thresholdType: "TEMPERATURE", thresholdMax: tH, alarmLevel: "HIGH", status: "ENABLED", sortOrder: 1 }) });
  } catch (e) {
    console.warn("阈值保存失败（不影响设备保存）:", e);
  }
}

bootstrap();
