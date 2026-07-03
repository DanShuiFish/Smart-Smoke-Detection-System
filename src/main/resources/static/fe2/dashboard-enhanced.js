const API_BASE = "/api/v1";
const state = {
  devices: [],
  alarms: [],
  stats: {},
  selectedDeviceId: null,
};

const charts = {
  realtime: null,
  heatmap: null,
  trend: null,
  type: null,
  building: null,
};

function el(id) {
  return document.getElementById(id);
}

function safeText(v, fallback = "--") {
  return v === null || v === undefined || v === "" ? fallback : String(v);
}

function getToken() {
  return localStorage.getItem("smartSmokeToken") || localStorage.getItem("token") || "";
}

async function apiRequest(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) {
    headers.Authorization = "Bearer " + token;
  }
  const res = await fetch(API_BASE + path, { ...options, headers });
  if (!res.ok) {
    throw new Error("HTTP " + res.status + " " + path);
  }
  const body = await res.json();
  if (body && typeof body === "object" && "code" in body) {
    if (body.code !== 200) {
      throw new Error(body.msg || body.message || "接口返回失败");
    }
    return body.data;
  }
  return body;
}

function setClock() {
  el("clock").textContent = new Date().toLocaleString("zh-CN", { hour12: false });
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
  if (el("footerSyncTime")) {
    el("footerSyncTime").textContent = "最后同步: " + now;
  }
}

function switchView(view) {
  document.querySelectorAll(".view").forEach((n) => n.classList.remove("active"));
  document.querySelectorAll(".menu-item").forEach((n) => n.classList.remove("active"));
  const target = el("view-" + view);
  if (target) target.classList.add("active");
  const menu = document.querySelector('.menu-item[data-view="' + view + '"]');
  if (menu) menu.classList.add("active");
  const map = {
    screen: ["首页 / 数据大屏", "设备态势、实时监测、告警联动"],
    devices: ["设备管理", "设备状态、关键参数与运行信息"],
    analysis: ["数据分析", "趋势分析、类型占比与楼栋分布"],
    ai: ["AI 智能问答", "知识问答与火情研判"],
    alarms: ["告警日志", "告警记录、确认和处置流程"],
  };
  const pair = map[view] || map.screen;
  el("viewTitle").textContent = pair[0];
  el("viewSubTitle").textContent = pair[1];
}

function initMenus() {
  document.querySelectorAll(".menu-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  el("btnOpenAlarms").addEventListener("click", () => switchView("alarms"));
}

function alarmStatusClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "PENDING" || s === "CONFIRMING") return "warn";
  if (s === "RESOLVED" || s === "ARCHIVED" || s === "CLOSED") return "ok";
  if (s === "CONFIRMED") return "info";
  return "info";
}

function renderKpi() {
  const total = Number(state.stats.totalDevices || 0);
  const online = Number(state.stats.onlineDevices || 0);
  const today = Number(state.stats.todayAlarms || 0);
  const pending = Number(state.stats.pendingAlarms || 0);

  el("kpiTotalDevices").textContent = String(total);
  el("kpiOnlineDevices").textContent = String(online);
  el("kpiTodayAlarms").textContent = String(today);
  el("kpiPendingAlarms").textContent = String(pending);

  const onlineRate = total > 0 ? ((online / total) * 100).toFixed(1) : "0.0";
  const onlineRateEl = el("screenOnlineRate");
  if (onlineRateEl) onlineRateEl.textContent = onlineRate;

  setChip("activeAlarmStatus", "活跃告警: " + safeText(state.stats.pendingAlarms, "0"), Number(state.stats.pendingAlarms || 0) > 0 ? "warn" : "ok");
}

function renderScreenAlarms() {
  const rows = (state.alarms || []).slice(0, 6);
  const list = el("screenAlarmList");
  if (!rows.length) {
    list.innerHTML = '<li class="list-item">暂无告警</li>';
    return;
  }
  list.innerHTML = rows.map((x) => {
    const level = String(x.alarmLevel || "").toUpperCase();
    const left = level === "HIGH" || level === "CRITICAL" ? "danger" : level === "MEDIUM" ? "warn" : "info";
    return '<li class="list-item alarm-card ' + left + '">' +
      '<div class="card-row"><strong>' + safeText(x.alarmType, "告警") + '</strong>' +
      '<span class="status-badge ' + alarmStatusClass(x.alarmStatus) + '">' + safeText(x.alarmStatus, "--") + '</span></div>' +
      '<div style="margin-top:6px;color:#9ebde8;">设备: ' + safeText(x.deviceId) + ' · 等级: ' + safeText(x.alarmLevel) + '</div>' +
      '</li>';
  }).join("");
}

function ensureChart(nodeId) {
  const node = el(nodeId);
  if (!node) return null;
  return echarts.init(node);
}

function renderRealtimeChart(points) {
  if (!charts.realtime) charts.realtime = ensureChart("chartRealtime");
  if (!charts.realtime) return;
  const list = Array.isArray(points) ? points : [];

  const latest = list.length ? list[list.length - 1] : null;
  const smokeNow = Number((latest && (latest.smoke || latest.smokeValue || latest.smokeConcentration)) || 0);
  const tempNow = Number((latest && (latest.temperature || latest.tempValue)) || 0);
  const signalNowRaw = Number((latest && (latest.signalStrength || latest.rssi)) || 0);

  const smokeNode = el("screenSmokeValue");
  const tempNode = el("screenTempValue");
  const signalNode = el("screenSignalValue");
  if (smokeNode) smokeNode.textContent = smokeNow.toFixed(1);
  if (tempNode) tempNode.textContent = tempNow.toFixed(1);
  if (signalNode) signalNode.textContent = Number.isFinite(signalNowRaw) ? String(signalNowRaw) : "--";

  charts.realtime.setOption({
    tooltip: { trigger: "axis" },
    grid: { left: 40, right: 20, top: 30, bottom: 30 },
    xAxis: { type: "category", data: list.map((p) => safeText(p.time, "")), axisLabel: { color: "#8fb0db" } },
    yAxis: { type: "value", axisLabel: { color: "#8fb0db" } },
    series: [
      { name: "烟雾", type: "line", smooth: true, data: list.map((p) => Number(p.smoke || p.smokeValue || p.smokeConcentration || 0)) },
      { name: "温度", type: "line", smooth: true, data: list.map((p) => Number(p.temperature || p.tempValue || 0)) },
    ],
  });
}

function renderScreenHeatmap(points, alarms) {
  if (!charts.heatmap) charts.heatmap = ensureChart("chartHeatmap");
  if (!charts.heatmap) return;

  const buildingMap = new Map();
  const floorMap = new Map();
  const counter = new Map();

  const add = (building, floor, weight) => {
    const b = safeText(building, "未知楼栋");
    const f = safeText(floor, "未知楼层");
    if (!buildingMap.has(b)) buildingMap.set(b, buildingMap.size);
    if (!floorMap.has(f)) floorMap.set(f, floorMap.size);
    const key = b + "::" + f;
    counter.set(key, (counter.get(key) || 0) + Number(weight || 1));
  };

  (Array.isArray(points) ? points : []).forEach((p) => add(p.building || p.locationBuilding, p.floor || p.locationFloor, 1));
  (Array.isArray(alarms) ? alarms : []).forEach((a) => add(a.building || a.locationBuilding, a.floor || a.locationFloor, 2));

  const buildings = Array.from(buildingMap.keys());
  const floors = Array.from(floorMap.keys());
  const data = [];
  counter.forEach((val, key) => {
    const pair = key.split("::");
    data.push([buildingMap.get(pair[0]), floorMap.get(pair[1]), val]);
  });

  const max = data.length ? Math.max.apply(null, data.map((d) => Number(d[2] || 0))) : 1;
  charts.heatmap.setOption({
    tooltip: {
      formatter: (p) => {
        const v = p.value || [];
        return safeText(buildings[v[0]], "未知楼栋") + " / " + safeText(floors[v[1]], "未知楼层") + "<br/>热度: " + safeText(v[2], "0");
      }
    },
    grid: { left: 52, right: 18, top: 26, bottom: 52 },
    xAxis: { type: "category", data: buildings, axisLabel: { color: "#8fb0db" } },
    yAxis: { type: "category", data: floors, axisLabel: { color: "#8fb0db" } },
    visualMap: {
      min: 0,
      max: Math.max(5, max),
      orient: "horizontal",
      left: "center",
      bottom: 5,
      textStyle: { color: "#8fb0db" },
      inRange: { color: ["#17355a", "#1f78c1", "#28c7ff", "#ffd166", "#ff6b6b"] }
    },
    series: [{ type: "heatmap", data }],
  });
}

function renderAnalysisCharts(alarmStats, deviceStats) {
  if (!charts.trend) charts.trend = ensureChart("chartAlarmTrend");
  if (!charts.type) charts.type = ensureChart("chartAlarmType");
  if (!charts.building) charts.building = ensureChart("chartDeviceBuilding");

  const trend = (alarmStats && alarmStats.dailyTrend) || [];
  if (charts.trend) {
    charts.trend.setOption({
      xAxis: { type: "category", data: trend.map((x) => x.date), axisLabel: { color: "#8fb0db" } },
      yAxis: { type: "value", axisLabel: { color: "#8fb0db" } },
      grid: { left: 40, right: 20, top: 30, bottom: 30 },
      series: [{ type: "bar", data: trend.map((x) => Number(x.count || 0)) }],
    });
  }

  const types = (alarmStats && alarmStats.typeDistribution) || [];
  if (charts.type) {
    charts.type.setOption({
      series: [{ type: "pie", radius: ["35%", "65%"], data: types.map((x) => ({ name: x.type, value: x.count })) }],
    });
  }

  const buildings = (deviceStats && deviceStats.buildingDistribution) || [];
  if (charts.building) {
    charts.building.setOption({
      xAxis: { type: "category", data: buildings.map((x) => x.building), axisLabel: { color: "#8fb0db" } },
      yAxis: { type: "value", axisLabel: { color: "#8fb0db" } },
      grid: { left: 40, right: 20, top: 30, bottom: 30 },
      series: [{ type: "bar", data: buildings.map((x) => Number(x.count || 0)) }],
    });
  }
}

function renderDevices() {
  const box = el("deviceCards");
  if (!state.devices.length) {
    box.innerHTML = '<div class="list-item">暂无设备</div>';
    return;
  }
  box.innerHTML = state.devices.map((d) => {
    const status = String(d.status || "UNKNOWN").toUpperCase();
    const cls = status === "ONLINE" ? "ok" : status === "OFFLINE" ? "warn" : "danger";
    return '<article class="device-card ' + (status === "ONLINE" ? "online" : "") + '">' +
      '<div class="card-row"><strong>' + safeText(d.deviceName, d.deviceCode || "设备") + '</strong>' +
      '<span class="status-badge ' + cls + '">' + status + '</span></div>' +
      '<div style="margin-top:6px;color:#9ebde8;">编号: ' + safeText(d.deviceCode) + ' · 楼栋: ' + safeText(d.building) + '</div>' +
      '<div class="device-kpis"><div><span>烟雾</span><strong>' + safeText(d.latestSmoke, "--") + '</strong></div>' +
      '<div><span>温度</span><strong>' + safeText(d.latestTemp, "--") + '</strong></div>' +
      '<div><span>湿度</span><strong>' + safeText(d.latestHumidity, "--") + '</strong></div></div>' +
      '</article>';
  }).join("");
}

function renderAlarmRows() {
  const box = el("alarmRows");
  if (!state.alarms.length) {
    box.innerHTML = '<div class="alarm-row">暂无告警记录</div>';
    return;
  }
  box.innerHTML = state.alarms.map((a) => {
    const statusClass = alarmStatusClass(a.alarmStatus);
    return '<article class="alarm-row alarm-card ' + statusClass + '">' +
      '<div class="card-row"><strong>' + safeText(a.alarmType, "告警") + '</strong>' +
      '<span class="status-badge ' + statusClass + '">' + safeText(a.alarmStatus, "--") + '</span></div>' +
      '<div style="margin-top:6px;color:#9ebde8;">设备: ' + safeText(a.deviceId) + ' · 等级: ' + safeText(a.alarmLevel) + '</div>' +
      '<div class="alarm-actions"><button class="btn btn-main" data-action="confirm" data-id="' + safeText(a.id, "") + '">确认</button>' +
      '<button class="btn" data-action="resolve" data-id="' + safeText(a.id, "") + '">处置</button></div>' +
      '</article>';
  }).join("");

  box.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      try {
        if (action === "confirm") await apiRequest("/alarms/" + id + "/confirm", { method: "POST" });
        if (action === "resolve") await apiRequest("/alarms/" + id + "/resolve", { method: "POST" });
        await loadAlarmRows();
      } catch (e) {
        console.error(e);
      }
    });
  });
}

function appendChat(role, text) {
  const log = el("chatLog");
  const div = document.createElement("div");
  div.className = "bubble " + (role === "user" ? "user" : "ai");
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

async function sendQuestion() {
  const input = el("chatInput");
  const q = input.value.trim();
  if (!q) return;
  appendChat("user", q);
  input.value = "";
  try {
    const res = await apiRequest("/conversations", {
      method: "POST",
      body: JSON.stringify({ question: q }),
    });
    const answer = safeText(res.answer || res.content || "暂无回复");
    appendChat("ai", answer);
    el("aiJudgement").textContent = answer;
  } catch (e) {
    appendChat("ai", "调用失败: " + e.message);
  }
}

async function sendBroadcast() {
  try {
    await apiRequest("/broadcasts", { method: "POST", body: JSON.stringify({ content: "请注意火警，立即疏散", level: "HIGH" }) });
    showGlobalAlert("广播指令已下发");
  } catch (e) {
    showGlobalAlert("广播失败: " + e.message);
  }
}

function showGlobalAlert(text) {
  const node = el("globalAlert");
  node.textContent = text;
  node.classList.remove("hidden");
  setTimeout(() => node.classList.add("hidden"), 4000);
}

async function loadHealthStatus() {
  try {
    const health = await apiRequest("/health");
    const status = String(health.status || "UNKNOWN").toUpperCase();
    setChip("healthStatus", "服务状态: " + status, status === "UP" ? "ok" : "danger");
    const c = health.components || {};
    setChip("mqttStatus", "MQTT: " + safeText(c.mqtt, "--"), String(c.mqtt || "").toUpperCase() === "UP" ? "ok" : "warn");
    setChip("redisStatus", "Redis: " + safeText(c.redis, "--"), String(c.redis || "").toUpperCase() === "UP" ? "ok" : "warn");
  } catch (_e) {
    setChip("healthStatus", "服务状态: 获取失败", "danger");
    setChip("mqttStatus", "MQTT: --", "warn");
    setChip("redisStatus", "Redis: --", "warn");
  }
}

async function loadScreenData() {
  try {
    const [stats, realtime, alarms, alarmStats, deviceStats] = await Promise.all([
      apiRequest("/dashboard/stats"),
      apiRequest("/dashboard/realtime"),
      apiRequest("/alarms?size=20"),
      apiRequest("/dashboard/alarm-stats"),
      apiRequest("/dashboard/device-stats"),
    ]);
    state.stats = stats || {};
    state.alarms = (alarms && (alarms.records || alarms.list || alarms)) || [];

    const rtList = (realtime && (realtime.latestData || realtime.points || realtime.records || realtime.list || [])) || [];
    renderKpi();
    renderScreenAlarms();
    renderAlarmRows();
    renderRealtimeChart(rtList);
    renderScreenHeatmap(rtList, state.alarms);
    renderAnalysisCharts(alarmStats || {}, deviceStats || {});
    setSyncTime();
  } catch (e) {
    console.error(e);
    showGlobalAlert("大屏数据加载失败: " + e.message);
  }
}

async function loadDevices() {
  const kw = el("deviceKeyword").value.trim();
  const st = el("deviceStatusFilter").value.trim();
  let q = "?page=1&size=100";
  if (kw) q += "&keyword=" + encodeURIComponent(kw);
  if (st) q += "&status=" + encodeURIComponent(st);
  try {
    const data = await apiRequest("/devices" + q);
    state.devices = (data && (data.records || data.list || data)) || [];
    renderDevices();

    const select = el("screenDeviceSelect");
    select.innerHTML = state.devices.map((d) => '<option value="' + safeText(d.id, "") + '">' + safeText(d.deviceName, d.deviceCode || "设备") + '</option>').join("");
    if (!state.selectedDeviceId && state.devices.length) {
      state.selectedDeviceId = String(state.devices[0].id || "");
      select.value = state.selectedDeviceId;
    }
  } catch (e) {
    console.error(e);
    showGlobalAlert("设备数据加载失败: " + e.message);
  }
}

async function loadAlarmRows() {
  const st = el("alarmStatusFilter").value.trim();
  let q = "?page=1&size=30";
  if (st) q += "&status=" + encodeURIComponent(st);
  try {
    const data = await apiRequest("/alarms" + q);
    state.alarms = (data && (data.records || data.list || data)) || [];
    renderAlarmRows();
    renderScreenAlarms();
  } catch (e) {
    showGlobalAlert("告警数据加载失败: " + e.message);
  }
}

function connectWebSocket() {
  try {
    const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/alarm";
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => { el("wsStatus").textContent = "WebSocket 已连接"; el("wsStatus").classList.add("ok"); };
    ws.onclose = () => { el("wsStatus").textContent = "WebSocket 已断开"; el("wsStatus").classList.remove("ok"); };
    ws.onmessage = (evt) => showGlobalAlert("实时告警: " + evt.data);
  } catch (_e) {
    el("wsStatus").textContent = "WebSocket 不可用";
  }
}

function bindEvents() {
  el("btnRefreshScreen").addEventListener("click", loadScreenData);
  el("btnSearchDevices").addEventListener("click", loadDevices);
  el("btnLoadAlarms").addEventListener("click", loadAlarmRows);
  el("btnSendQuestion").addEventListener("click", sendQuestion);
  el("btnBroadcast").addEventListener("click", sendBroadcast);
  el("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendQuestion(); });
  el("screenDeviceSelect").addEventListener("change", () => {
    state.selectedDeviceId = el("screenDeviceSelect").value;
  });
}

async function bootstrap() {
  initMenus();
  bindEvents();
  setClock();
  setInterval(setClock, 1000);
  connectWebSocket();
  await loadHealthStatus();
  await loadDevices();
  await loadScreenData();
  setInterval(async () => {
    await loadHealthStatus();
    await loadScreenData();
  }, 20000);
}

bootstrap();
