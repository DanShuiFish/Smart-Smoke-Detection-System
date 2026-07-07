/**
 * 智慧烟感预警系统 - 居民端核心逻辑
 * 功能：仪表盘、我的设备、告警记录、AI问答、个人中心
 */
(function () {
  'use strict';

  const API_BASE = '/api/v1';

  // ===== 全局状态 =====
  let currentUser = null;
  let myDeviceIds = [];
  let currentView = 'dashboard';
  let refreshTimer = null;
  let chatSessionId = null;
  let dashboardRefreshing = false;

  // ===== DOM 缓存 =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ===== 初始化 =====
  async function init() {
    // 验证登录状态
    const token = localStorage.getItem('smoke_token');
    if (!token) {
      window.location.href = '/index.html';
      return;
    }

    // 从缓存中读取用户信息
    const userStr = localStorage.getItem('smoke_user');
    if (userStr) {
      try { currentUser = JSON.parse(userStr); } catch(e) {}
    }

    // 非居民角色跳转管理端
    if (!currentUser || (currentUser.role || '').toUpperCase() !== 'RESIDENT') {
      window.location.href = '/index.html';
      return;
    }

    // 初始化 UI
    updateUserUI();
    await loadMyDeviceIds();
    setupSidebarInteraction();
    setupNavigation();
    setupModals();
    setupProfileForms();
    setupChat();
    showView('dashboard');
    startAutoRefresh();
  }

  // ===== API 封装 =====
  function authHeaders() {
    const token = localStorage.getItem('smoke_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    };
  }

  async function apiGet(path) {
    const resp = await fetch(API_BASE + path, { headers: authHeaders() });
    if (resp.status === 401) {
      localStorage.removeItem('smoke_token');
      localStorage.removeItem('smoke_user');
      window.location.href = '/';
      return { code: 401 };
    }
    return resp.json();
  }

  async function apiPost(path, body) {
    const resp = await fetch(API_BASE + path, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (resp.status === 401) {
      localStorage.removeItem('smoke_token');
      localStorage.removeItem('smoke_user');
      window.location.href = '/';
      return { code: 401 };
    }
    return resp.json();
  }

  async function apiPut(path, body) {
    const resp = await fetch(API_BASE + path, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    if (resp.status === 401) {
      localStorage.removeItem('smoke_token');
      localStorage.removeItem('smoke_user');
      window.location.href = '/';
      return { code: 401 };
    }
    return resp.json();
  }

  // ===== 用户 UI 更新 =====
  function updateUserUI() {
    if (!currentUser) return;
    const name = currentUser.realName || currentUser.username;
    $('#userName').textContent = name;
    $('#userAvatar').textContent = name.charAt(0).toUpperCase();
  }

  function updateViewHeading(title, sub) {
    $('#viewTitle').textContent = title;
    $('#viewSubTitle').innerHTML = `${escapeHtml(sub)} <span class="endpoint-badge resident">居民端</span>`;
  }

  function updateRuntimeMeta() {
    const now = new Date();
    const timeText = formatTime(now);
    $('#clock').textContent = timeText;
    $('#footerSyncTime').textContent = '最后同步: ' + timeText;
    $('#systemLastSync').textContent = '最近同步: ' + timeText;
  }

  function hideGlobalAlert() {
    const node = $('#globalAlert');
    if (!node) return;
    node.classList.add('hidden');
    node.innerHTML = '';
  }

  function buildAlarmLocation(item) {
    return [item.locationBuilding || item.building, item.locationFloor || item.floor, item.locationRoom || item.room]
      .filter(Boolean)
      .join('');
  }

  function formatAlarmMetric(item) {
    const type = String(item.alarmType || '').toUpperCase();
    const smoke = Number(item.smokeConcentration || item.smoke || 0);
    const temp = Number(item.temperature || 0);
    const threshold = Number(item.thresholdValue || 0);
    if (type === 'TEMP_OVERFLOW') {
      return Number.isFinite(temp) && temp > 0 ? ('温度 ' + temp.toFixed(1) + ' C') : '温度异常';
    }
    if (Number.isFinite(smoke) && smoke > 0 && Number.isFinite(threshold) && threshold > 0) {
      return '当前 ' + smoke.toFixed(2) + ' / 阈值 ' + threshold.toFixed(2) + ' mg/m3';
    }
    if (Number.isFinite(smoke) && smoke > 0) {
      return '当前 ' + smoke.toFixed(2) + ' mg/m3';
    }
    return '等待更多数据';
  }

  function showRealtimeAlarmBanner(payload) {
    const node = $('#globalAlert');
    if (!node) return;
    const levelLabel = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '紧急' }[String(payload.alarmLevel || '').toUpperCase()] || '--';
    const levelClass = alarmLevelClass(payload.alarmLevel);
    const title = levelLabel + '级' + alarmTypeLabel(payload.alarmType || payload.alarmTypeText);
    const deviceName = payload.deviceName || payload.deviceId || '未知设备';
    const location = buildAlarmLocation(payload);
    const metric = formatAlarmMetric(payload);
    const summary = payload.message || metric;
    node.innerHTML = '<div class="alert-banner ' + levelClass + '">' +
      '<div class="alert-banner-title">' + escapeHtml(title) + ' | ' + escapeHtml(deviceName) + '</div>' +
      '<div class="alert-banner-meta">' + (location ? ('位置: ' + escapeHtml(location) + ' · ') : '') + '状态: ' + escapeHtml(formatAlarmStatusText(payload.alarmStatus)) + ' · ' + escapeHtml(metric) + '</div>' +
      '<div class="alert-banner-desc">' + escapeHtml(summary) + '</div></div>';
    node.classList.remove('hidden');
    clearTimeout(showRealtimeAlarmBanner.timer);
    showRealtimeAlarmBanner.timer = setTimeout(() => node.classList.add('hidden'), 10000);
  }

  // ===== 获取我的设备 ID =====
  async function loadMyDeviceIds() {
    try {
      const resp = await apiGet('/bindings/my-device-ids');
      if (resp.code === 200) {
        myDeviceIds = resp.data || [];
      }
    } catch (err) {
      console.error('获取设备ID失败:', err);
    }
  }

  // ===== 导航切换 =====
  function setupNavigation() {
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        $$('.nav-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        showView(this.dataset.view);
      });
    });
  }

  function setupSidebarInteraction() {
    const sidebar = document.querySelector('.sidebar');
    const layout = document.querySelector('.app-layout');
    if (!sidebar || !layout || window.innerWidth <= 900) return;

    sidebar.addEventListener('mouseenter', function () {
      layout.classList.add('sidebar-expanded');
    });

    sidebar.addEventListener('mouseleave', function () {
      layout.classList.remove('sidebar-expanded');
    });
  }

  function showView(viewName) {
    currentView = viewName;
    $$('.view').forEach(v => v.classList.remove('active'));
    const viewEl = $('#view-' + viewName);
    if (viewEl) viewEl.classList.add('active');

    // 更新标题
    const titles = {
      dashboard: ['首页 / 仪表盘', '我的设备概览与实时告警'],
      devices: ['我的设备', '查看已绑定设备的实时状态和历史趋势'],
      alarms: ['告警记录', '查看关联设备的告警历史'],
      ai: ['AI 智能问答', '消防知识智能对话'],
      profile: ['个人中心', '管理个人信息与密码'],
    };
    const [title, sub] = titles[viewName] || ['', ''];
    updateViewHeading(title, sub);

    // 渲染视图
    switch (viewName) {
      case 'dashboard': renderDashboard(); break;
      case 'devices': renderDevices(); break;
      case 'alarms': renderAlarms(); break;
      case 'ai': break; // AI 在 setupChat 中已初始化
      case 'profile': renderProfile(); break;
    }
  }

  // ===== 仪表盘 =====
  async function renderDashboard() {
    await loadMyDeviceIds();

    // KPI 统计
    try {
      const devResp = await apiGet('/bindings/my-devices?page=1&size=100');

      // 用我的设备 ID 过滤告警
      let alarmUrl = '/alarms?page=1&pageSize=100';
      if (myDeviceIds.length > 0) {
        alarmUrl += '&deviceIds=' + myDeviceIds.join(',');
      }
      const alarmResp = await apiGet(alarmUrl);

      let totalDevices = 0, onlineDevices = 0, todayAlarms = 0, pendingAlarms = 0;

      if (devResp.code === 200 && devResp.data) {
        const records = devResp.data.records || [];
        totalDevices = devResp.data.total || records.length;
        onlineDevices = records.filter(d => d.status === 'ONLINE').length;
      }

      if (alarmResp.code === 200 && alarmResp.data) {
        const records = alarmResp.data.records || [];
        const today = new Date().toISOString().split('T')[0];
        todayAlarms = records.filter(a => a.alarmTime && a.alarmTime.startsWith(today)).length;
        pendingAlarms = records.filter(a => a.alarmStatus === 'PENDING' || a.alarmStatus === 'CONFIRMING').length;
      }

      $('#kpiTotalDevices').textContent = totalDevices;
      $('#kpiOnlineDevices').textContent = onlineDevices;
      $('#kpiTodayAlarms').textContent = todayAlarms;
      $('#kpiPendingAlarms').textContent = pendingAlarms;
      $('#residentDeviceSummary').textContent = '我的设备: ' + totalDevices;
      $('#activeAlarmStatus').textContent = '待处理告警: ' + pendingAlarms;

      // 填充设备选择器
      const deviceSelect = $('#dashDeviceSelect');
      deviceSelect.innerHTML = '<option value="">选择设备</option>';
      const devRecords = devResp.data?.records || [];
      const deviceMap = new Map(devRecords.map(d => [String(d.id), d]));
      devRecords.forEach(d => {
        deviceSelect.innerHTML += `<option value="${d.id}">${d.deviceName || d.deviceId}</option>`;
      });

      const trendSelect = $('#trendDeviceSelect');
      trendSelect.innerHTML = '<option value="">选择设备查看趋势</option>';
      devRecords.forEach(d => {
        trendSelect.innerHTML += `<option value="${d.id}">${d.deviceName || d.deviceId}</option>`;
      });

      // 默认选中第一台设备
      if (devRecords.length > 0) {
        deviceSelect.value = devRecords[0].id;
        await loadRealtimeData(devRecords[0].id);
        trendSelect.value = devRecords[0].id;
        loadTrendChart(devRecords[0].id);
      }

      deviceSelect.onchange = async function () {
        if (this.value) {
          await loadRealtimeData(this.value);
        }
      };

      trendSelect.onchange = function () {
        if (this.value) {
          loadTrendChart(this.value);
        }
      };

      // 最近告警
      const alarmRecords = alarmResp.data?.records || [];
      renderRecentAlarms(alarmRecords);

      const activeAlarm = alarmRecords.find(a => a.alarmStatus === 'PENDING' || a.alarmStatus === 'CONFIRMING' || a.alarmStatus === 'CONFIRMED');
      if (activeAlarm) {
        const device = deviceMap.get(String(activeAlarm.deviceId)) || {};
        showRealtimeAlarmBanner({
          ...device,
          ...activeAlarm,
          building: activeAlarm.building || device.locationBuilding,
          floor: activeAlarm.floor || device.locationFloor,
          room: activeAlarm.room || device.locationRoom,
          deviceName: activeAlarm.deviceName || device.deviceName || device.deviceId,
        });
      } else {
        hideGlobalAlert();
      }

    } catch (err) {
      console.error('仪表盘渲染失败:', err);
    }
  }

  async function loadRealtimeData(deviceId) {
    try {
      const resp = await apiGet('/data/latest/' + deviceId);
      if (resp.code === 200 && resp.data) {
        const d = resp.data;
        $('#dashSmokeValue').textContent = d.smokeConcentration != null ? Number(d.smokeConcentration).toFixed(4) : '--';
        $('#dashTempValue').textContent = d.temperature != null ? Number(d.temperature).toFixed(1) + ' ℃' : '-- ℃';
        $('#dashHumiValue').textContent = d.humidity != null ? Number(d.humidity).toFixed(1) + ' %' : '-- %';
      }
    } catch (err) {
      console.error('实时数据加载失败:', err);
    }
  }

  function renderRecentAlarms(alarms) {
    const list = $('#dashAlarmList');
    const recent = alarms.slice(0, 5);
    if (recent.length === 0) {
      list.innerHTML = '<li class="empty-state"><strong>暂无告警</strong><p>您的设备运行正常</p></li>';
      return;
    }
    list.innerHTML = recent.map(a => `
      <li class="list-item">
        <div class="list-item-row">
          <span class="alarm-device">${a.alarmType || '--'}</span>
          <span class="status-badge ${alarmStatusClass(a.alarmStatus)}">${a.alarmStatus || '--'}</span>
          <span class="alarm-time">${a.alarmTime || '--'}</span>
        </div>
      </li>
    `).join('');
  }

  // ===== 我的设备 =====
  async function renderDevices(page = 1) {
    try {
      const resp = await apiGet(`/bindings/my-devices?page=${page}&size=20`);
      if (resp.code !== 200) return;

      const pageData = resp.data;
      const devices = pageData.records || [];

      // 渲染表格
      const tbody = $('#deviceTableBody');
      if (devices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--muted);">暂无绑定设备</td></tr>`;
      } else {
        tbody.innerHTML = devices.map(d => `
          <tr>
            <td>${d.deviceName || '--'}</td>
            <td>${d.deviceId || '--'}</td>
            <td>${d.locationBuilding || '--'}</td>
            <td>${d.locationFloor || '--'}</td>
            <td><span class="status-badge ${deviceStatusClass(d.status)}">${d.status || '--'}</span></td>
            <td>${d.smokeConcentration != null ? Number(d.smokeConcentration).toFixed(4) : '--'}</td>
            <td>${d.temperature != null ? Number(d.temperature).toFixed(1) + '℃' : '--'}</td>
            <td><button class="btn btn-main" onclick="window.showDeviceTrend(${d.id})" style="font-size:12px;padding:5px 10px;">趋势</button></td>
          </tr>
        `).join('');
      }

      // 分页
      renderPagination('devicePagination', page, pageData.pages || 1, pageData.total || 0, renderDevices);

    } catch (err) {
      console.error('设备列表渲染失败:', err);
    }
  }

  window.showDeviceTrend = function (deviceId) {
    showView('dashboard');
    setTimeout(() => {
      $('#trendDeviceSelect').value = deviceId;
      loadTrendChart(deviceId);
    }, 200);
  };

  async function loadTrendChart(deviceId) {
    try {
      const now = new Date();
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const startStr = formatDateTime(start);
      const endStr = formatDateTime(now);

      const resp = await apiGet(`/data/history/${deviceId}?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}&page=1&pageSize=2000`);
      if (resp.code !== 200) return;

      // DataController.history 返回 PageResult，取 records 数组
      const pageData = resp.data || {};
      const data = pageData.records || [];
      const points = data
        .map(d => ({
          time: (d.collectTime || d.createTime || '').substring(11, 19),
          smoke: d.smokeConcentration != null ? Number(d.smokeConcentration) : null,
        }))
        .filter(item => item.time && item.smoke != null && !Number.isNaN(item.smoke));

      const times = points.map(item => item.time);
      const smokeValues = points.map(item => item.smoke);

      const chartDom = $('#chartTrend');
      if (!chartDom) return;

      let chart = echarts.getInstanceByDom(chartDom);
      if (!chart) chart = echarts.init(chartDom);

      if (smokeValues.length === 0) {
        chart.clear();
        chart.setOption({
          title: {
            text: '最近24小时暂无烟雾数据',
            left: 'center',
            top: 'middle',
            textStyle: {
              color: '#64748b',
              fontSize: 14,
              fontWeight: 500,
            },
          },
        });
        return;
      }

      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 50, right: 20, top: 20, bottom: 40 },
        xAxis: {
          type: 'category',
          data: times,
          axisLabel: { rotate: 45, fontSize: 10 },
        },
        yAxis: {
          type: 'value',
          name: 'mg/m³',
          min: 0,
        },
        series: [{
          name: '烟雾浓度',
          type: 'line',
          data: smokeValues,
          smooth: true,
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(37,99,235,0.3)' },
              { offset: 1, color: 'rgba(37,99,235,0.02)' },
            ]),
          },
          lineStyle: { color: '#2563eb', width: 2 },
          itemStyle: { color: '#2563eb' },
          symbol: 'none',
        }],
      });

      window.addEventListener('resize', () => chart.resize());
    } catch (err) {
      console.error('趋势图加载失败:', err);
    }
  }

  // ===== 告警记录 =====
  async function renderAlarms(page = 1) {
    try {
      const status = $('#alarmStatusFilter').value || '';
      let url = `/alarms?page=${page}&pageSize=20`;
      if (status) url += '&status=' + status;
      // 按我的设备过滤（使用 deviceIds）
      if (myDeviceIds.length > 0) {
        url += '&deviceIds=' + myDeviceIds.join(',');
      } else {
        // 没有设备则显示空
        $('#alarmTableBody').innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted);">您没有绑定任何设备</td></tr>`;
        return;
      }

      const resp = await apiGet(url);
      if (resp.code !== 200) return;

      const pageData = resp.data;
      const alarms = pageData.records || [];

      const tbody = $('#alarmTableBody');
      if (alarms.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted);">暂无告警记录</td></tr>`;
      } else {
        tbody.innerHTML = alarms.map(a => `
          <tr>
            <td>${a.alarmTime || '--'}</td>
            <td>${alarmTypeLabel(a.alarmType)}</td>
            <td><span class="status-badge ${alarmLevelClass(a.alarmLevel)}">${a.alarmLevel || '--'}</span></td>
            <td><span class="status-badge ${alarmStatusClass(a.alarmStatus)}">${a.alarmStatus || '--'}</span></td>
            <td>${a.deviceId || '--'}</td>
            <td><button class="btn" onclick="window.showAlarmDetail(${a.id})" style="font-size:12px;padding:5px 10px;">详情</button></td>
          </tr>
        `).join('');
      }

      renderPagination('alarmPagination', page, pageData.pages || 1, pageData.total || 0, renderAlarms);

    } catch (err) {
      console.error('告警列表渲染失败:', err);
    }
  }

  // 查询按钮
  $('#btnLoadAlarms').addEventListener('click', () => renderAlarms(1));

  window.showAlarmDetail = async function (id) {
    try {
      const resp = await apiGet('/alarms/' + id);
      if (resp.code !== 200) return;

      const a = resp.data;
      $('#detailModalTitle').textContent = '告警详情';
      $('#detailModalBody').innerHTML = `
        <div class="detail-grid">
          <div class="detail-item"><span>告警编号</span><strong>${a.alarmCode || '--'}</strong></div>
          <div class="detail-item"><span>告警类型</span><strong>${alarmTypeLabel(a.alarmType)}</strong></div>
          <div class="detail-item"><span>告警等级</span><strong>${a.alarmLevel || '--'}</strong></div>
          <div class="detail-item"><span>告警状态</span><strong>${a.alarmStatus || '--'}</strong></div>
          <div class="detail-item"><span>烟雾浓度</span><strong>${a.smokeConcentration != null ? a.smokeConcentration + ' mg/m³' : '--'}</strong></div>
          <div class="detail-item"><span>阈值</span><strong>${a.thresholdValue != null ? a.thresholdValue + ' mg/m³' : '--'}</strong></div>
          <div class="detail-item"><span>告警时间</span><strong>${a.alarmTime || '--'}</strong></div>
          <div class="detail-item"><span>确认时间</span><strong>${a.confirmTime || '--'}</strong></div>
          <div class="detail-full detail-item"><span>AI 复核结果</span><strong>${a.aiReview ? (a.aiReview.reviewResult || '未复核') : '未复核'}</strong></div>
          <div class="detail-full detail-item"><span>备注</span><strong>${a.remark || '无'}</strong></div>
        </div>
      `;
      $('#detailModal').classList.remove('hidden');
    } catch (err) {
      console.error('告警详情加载失败:', err);
    }
  };

  // ===== AI 智能问答 =====
  function setupChat() {
    chatSessionId = 'user-' + (currentUser?.id || '0') + '-' + Date.now();

    const chatLog = $('#chatLog');
    const chatInput = $('#chatInput');
    const chatEmpty = $('#chatEmpty');

    // 快捷问题
    $$('.quick-qs span').forEach(span => {
      span.addEventListener('click', function () {
        sendMessage(this.dataset.q);
      });
    });

    // 发送按钮
    $('#btnSendQuestion').addEventListener('click', function () {
      const text = chatInput.value.trim();
      if (!text) return;
      sendMessage(text);
      chatInput.value = '';
    });

    // 回车发送
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = chatInput.value.trim();
        if (!text) return;
        sendMessage(text);
        chatInput.value = '';
      }
    });

    // 清除对话
    $('#btnClearChat').addEventListener('click', function () {
      chatLog.innerHTML = '';
      chatLog.appendChild(chatEmpty);
      chatEmpty.classList.remove('hidden');
      chatSessionId = 'user-' + (currentUser?.id || '0') + '-' + Date.now();
      $('#chatSessionId').textContent = chatSessionId;
      $('#chatMsgCount').textContent = '0';
    });

    $('#chatSessionId').textContent = chatSessionId;
  }

  async function sendMessage(text) {
    const chatLog = $('#chatLog');
    const chatEmpty = $('#chatEmpty');
    chatEmpty.classList.add('hidden');

    const now = new Date();
    const timeStr = formatTime(now);

    // 添加用户消息
    const userMsg = document.createElement('div');
    userMsg.className = 'msg-row user';
    userMsg.innerHTML = `
      <div class="msg-avatar user-av">${(currentUser?.realName || currentUser?.username || '我').charAt(0)}</div>
      <div class="msg-body">
        <div class="msg-meta"><span class="msg-sender">我</span><span class="msg-time">${timeStr}</span></div>
        <div class="msg-bubble">${escapeHtml(text)}</div>
      </div>
    `;
    chatLog.appendChild(userMsg);

    // 添加 AI 加载中
    const aiMsg = document.createElement('div');
    aiMsg.className = 'msg-row ai';
    aiMsg.id = 'ai-loading';
    aiMsg.innerHTML = `
      <div class="msg-avatar ai-av">AI</div>
      <div class="msg-body">
        <div class="msg-meta"><span class="msg-sender">智能助手</span><span class="msg-time">${timeStr}</span></div>
        <div class="msg-bubble">思考中...</div>
      </div>
    `;
    chatLog.appendChild(aiMsg);
    chatLog.scrollTop = chatLog.scrollHeight;

    try {
      const resp = await apiPost('/conversations', {
        sessionId: chatSessionId,
        question: text,
      });

      const loadingEl = $('#ai-loading');
      if (loadingEl) loadingEl.remove();

      if (resp.code === 200 && resp.data) {
        const answer = resp.data.answer || '抱歉，暂时无法回答您的问题。';
        const convId = resp.data.id;

        const aiResp = document.createElement('div');
        aiResp.className = 'msg-row ai';
        aiResp.innerHTML = `
          <div class="msg-avatar ai-av">AI</div>
          <div class="msg-body">
            <div class="msg-meta"><span class="msg-sender">智能助手</span><span class="msg-time">${timeStr}</span></div>
            <div class="msg-bubble">${escapeHtml(answer)}</div>
            <div class="msg-rate">
              ${[1,2,3,4,5].map(n => `<button class="rate-btn" data-rate="${n}" data-id="${convId}">${'⭐'.repeat(n)}</button>`).join('')}
            </div>
          </div>
        `;
        chatLog.appendChild(aiResp);

        // 绑定评分事件
        aiResp.querySelectorAll('.rate-btn').forEach(btn => {
          btn.addEventListener('click', async function () {
            const rate = this.dataset.rate;
            const cid = this.dataset.id;
            await rateConversation(cid, rate);
            aiResp.querySelectorAll('.rate-btn').forEach(b => b.classList.remove('rated'));
            this.classList.add('rated');
          });
        });

        $('#chatMsgCount').textContent = parseInt($('#chatMsgCount').textContent) + 1;
      } else {
        const aiErr = document.createElement('div');
        aiErr.className = 'msg-row ai';
        aiErr.innerHTML = `
          <div class="msg-avatar ai-av">AI</div>
          <div class="msg-body">
            <div class="msg-meta"><span class="msg-sender">智能助手</span><span class="msg-time">${timeStr}</span></div>
            <div class="msg-bubble">抱歉，服务暂时不可用，请稍后再试。</div>
          </div>
        `;
        chatLog.appendChild(aiErr);
      }
    } catch (err) {
      const loadingEl = $('#ai-loading');
      if (loadingEl) loadingEl.remove();
      console.error('发送消息失败:', err);
    }

    chatLog.scrollTop = chatLog.scrollHeight;
  }

  async function rateConversation(convId, rating) {
    try {
      await apiPut('/conversations/' + convId + '/rate', { userRating: rating });
    } catch (err) {
      console.error('评分失败:', err);
    }
  }

  // ===== 个人中心 =====
  function setupProfileForms() {
    // 修改资料
    $('#profileForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      $('#profileError').textContent = '';
      $('#profileSuccess').textContent = '';

      const body = {
        realName: $('#profileRealName').value.trim(),
        phone: $('#profilePhone').value.trim(),
        email: $('#profileEmail').value.trim(),
      };

      try {
        const resp = await apiPut('/users/' + currentUser.id, body);
        if (resp.code === 200) {
          $('#profileSuccess').textContent = '✅ 资料已更新';
          // 刷新本地用户信息
          const meResp = await apiGet('/auth/me');
          if (meResp.code === 200) {
            currentUser = meResp.data;
            updateUserUI();
          }
        } else {
          $('#profileError').textContent = resp.msg || '更新失败';
        }
      } catch (err) {
        $('#profileError').textContent = '网络异常';
      }
    });

    // 修改密码
    $('#passwordForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      $('#passwordError').textContent = '';
      $('#passwordSuccess').textContent = '';

      const oldPwd = $('#oldPassword').value;
      const newPwd = $('#newPassword').value;
      const confirmPwd = $('#newPasswordConfirm').value;

      if (newPwd.length < 6) {
        $('#passwordError').textContent = '新密码至少6位';
        return;
      }
      if (newPwd !== confirmPwd) {
        $('#passwordError').textContent = '两次密码不一致';
        return;
      }

      try {
        const resp = await apiPut('/users/' + currentUser.id + '/password', {
          oldPassword: oldPwd,
          newPassword: newPwd,
        });
        if (resp.code === 200) {
          $('#passwordSuccess').textContent = '✅ 密码已修改，下次登录请使用新密码';
          $('#passwordForm').reset();
        } else {
          $('#passwordError').textContent = resp.msg || '修改失败';
        }
      } catch (err) {
        $('#passwordError').textContent = '网络异常';
      }
    });
  }

  async function renderProfile() {
    if (!currentUser) return;

    $('#profileUsername').value = currentUser.username || '';
    $('#profileRealName').value = currentUser.realName || '';
    $('#profilePhone').value = currentUser.phone || '';
    $('#profileEmail').value = currentUser.email || '';
    $('#profileRole').value = roleLabel(currentUser.role);

    $('#profileError').textContent = '';
    $('#profileSuccess').textContent = '';
    $('#passwordError').textContent = '';
    $('#passwordSuccess').textContent = '';
    $('#passwordForm').reset();
  }

  // ===== 模态框 =====
  function setupModals() {
    // 关闭模态框
    $$('[data-modal-close]').forEach(el => {
      el.addEventListener('click', function () {
        $('#detailModal').classList.add('hidden');
      });
    });

    // 点击遮罩关闭
    $('.modal-mask').addEventListener('click', function () {
      $('#detailModal').classList.add('hidden');
    });
  }

  // ===== 分页 =====
  function renderPagination(containerId, page, pages, total, callback) {
    const container = $('#' + containerId);
    if (!container) return;

    container.innerHTML = `
      <span class="page-info">共 ${total} 条，第 ${page} / ${pages} 页</span>
      <div class="page-actions">
        <button class="btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">上一页</button>
        <button class="btn" ${page >= pages ? 'disabled' : ''} data-page="${page + 1}">下一页</button>
      </div>
    `;

    container.querySelectorAll('.page-actions .btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const p = parseInt(this.dataset.page);
        if (p > 0 && p <= pages) callback(p);
      });
    });
  }

  // ===== 退出登录 =====
  $('#btnLogout').addEventListener('click', async function () {
    await apiPost('/auth/logout', {});
    localStorage.removeItem('smoke_token');
    localStorage.removeItem('smoke_user');
    window.location.href = '/';
  });

  // ===== 自动刷新 =====
  function startAutoRefresh() {
    refreshDashboardImmediately();
    refreshTimer = setInterval(() => {
      refreshDashboardImmediately();
    }, 20000); // 每20秒刷新

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        refreshDashboardImmediately();
      }
    });
  }

  async function refreshDashboardImmediately() {
    updateRuntimeMeta();
    if (currentView !== 'dashboard' || dashboardRefreshing) {
      return;
    }
    dashboardRefreshing = true;
    try {
      await loadMyDeviceIds();
      await renderDashboard();
    } finally {
      dashboardRefreshing = false;
    }
  }

  // ===== 工具函数 =====
  function formatDateTime(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}:${s}`;
  }

  function formatTime(date) {
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function deviceStatusClass(status) {
    const map = { 'ONLINE': 'ok', 'OFFLINE': 'warn', 'ERROR': 'danger', 'INACTIVE': 'info' };
    return map[status] || 'info';
  }

  function alarmStatusClass(status) {
    const map = { 'PENDING': 'danger', 'CONFIRMING': 'warn', 'CONFIRMED': 'warn', 'RESOLVED': 'info', 'ARCHIVED': 'ok', 'CLOSED': 'info' };
    return map[status] || 'info';
  }

  function formatAlarmStatusText(status) {
    const map = { 'PENDING': '待处理', 'CONFIRMING': '确认中', 'CONFIRMED': '已确认', 'RESOLVED': '已处置', 'ARCHIVED': '已归档', 'CLOSED': '已关闭' };
    return map[status] || status || '--';
  }

  function alarmLevelClass(level) {
    const map = { 'LOW': 'ok', 'MEDIUM': 'warn', 'HIGH': 'warn', 'CRITICAL': 'danger' };
    return map[level] || 'info';
  }

  function alarmTypeLabel(type) {
    const map = { 'SMOKE_OVERFLOW': '烟雾超标', 'DEVICE_OFFLINE': '设备离线', 'DEVICE_ERROR': '设备故障' };
    return map[type] || type || '--';
  }

  function roleLabel(role) {
    const map = { 'RESIDENT': '居民', 'COMMUNITY_ADMIN': '小区管理员', 'SYSTEM_ADMIN': '系统管理员', 'FIREFIGHTER': '消防员' };
    return map[role] || role;
  }

  // ===== 启动 =====
  init();

})();
