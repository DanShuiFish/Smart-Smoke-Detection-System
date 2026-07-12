// ===== 设备可视化 (SVG Floor Plan) =====
window._vizData = null; window._vizSelectedDevice = null; window._vizCurrentBuilding = null; window._vizCurrentFloor = null;
window._vizThresholds = [];

window.initViz = async function() {
  try { var resp = await apiRequest("/devices/building-tree"); window._vizData = resp && resp.buildings ? resp : null; }
  catch(e) { window._vizData = null; }
  try { var t = await apiRequest("/thresholds?page=1&pageSize=200"); window._vizThresholds = (t&&t.records)||[]; } catch(e) {}
  if (window._vizData && window._vizData.buildings && window._vizData.buildings.length > 0) {
    selectVizBuilding(window._vizData.buildings[0].name);
  } else {
    renderVizBuildings();
  }
  var searchEl = el("vizSearchInput"); if (searchEl) { searchEl.oninput = function() { renderVizDeviceList(); }; };
};
window.refreshViz = function() { window.initViz(); };

function renderVizBuildings() {
  var list = el("vizBuildingList"); if (!list) return;
  var buildings = (window._vizData&&window._vizData.buildings) ? window._vizData.buildings : [];
  if (!buildings.length) { list.innerHTML = '<div style="padding:10px;color:#94a3b8;font-size:11px;">暂无楼栋数据</div>'; return; }
  list.innerHTML = buildings.map(function(b) {
    var name = b.name || '未分类';
    return '<div class="viz-building-item' + (window._vizCurrentBuilding===name?' active':'') + '" onclick="selectVizBuilding(\'' + name.replace(/'/g,"\\'") + '\')">' +
      escapeHtml(name) + '<span class="count">' + (b.total||0) + '台</span></div>';
  }).join('');
}

function selectVizBuilding(building) {
  window._vizCurrentBuilding = building; window._vizCurrentFloor = null;
  renderVizBuildings();
  renderVizStats(building);
  renderVizFloorTabs(building);
  renderVizDeviceList();
  var floors = getVizFloors(building);
  if (floors.length > 0) { selectVizFloor(building, floors[0]); }
  else { el("vizFloorPlan").innerHTML = ''; el("vizEmpty").style.display = 'flex'; el("vizDetailBody").innerHTML = '<p class="viz-detail-placeholder">选择设备查看详情</p>'; }
}

function getVizFloors(building) {
  var buildings = (window._vizData&&window._vizData.buildings) ? window._vizData.buildings : [];
  var b = buildings.find(function(x) { return x.name === building; });
  return (b&&b.floors) ? b.floors.map(function(f) { return f.name; }).sort() : [];
}

function selectVizFloor(building, floor) {
  window._vizCurrentFloor = floor;
  renderVizFloorTabs(building);
  renderVizFloorPlan(building, floor);
  renderVizStats(building, floor);
}

function renderVizFloorTabs(building) {
  var tabs = el("vizFloorTabs"); if (!tabs) return;
  var floors = getVizFloors(building);
  tabs.innerHTML = floors.map(function(f) {
    return '<button class="viz-floor-tab' + (window._vizCurrentFloor===f?' active':'') + '" onclick="selectVizFloor(\'' + building.replace(/'/g,"\\'") + '\',\'' + f.replace(/'/g,"\\'") + '\')">' + escapeHtml(f) + '</button>';
  }).join('');
}

function renderVizStats(building, floor) {
  var bar = el("vizStatsBar"); if (!bar) return;
  var buildings = (window._vizData&&window._vizData.buildings) ? window._vizData.buildings : [];
  var b = buildings.find(function(x) { return x.name === building; }); if (!b) return;
  var devices = (b.devices||[]).filter(function(d) { return !floor || d.locationFloor === floor; });
  var online = devices.filter(function(d) { return d.status === 'ONLINE'; }).length;
  var offline = devices.filter(function(d) { return d.status === 'OFFLINE'; }).length;
  bar.innerHTML = '<div class="viz-stat"><span class="viz-stat-dot online"></span>在线: '+online+'</div>'+
    '<div class="viz-stat"><span class="viz-stat-dot offline"></span>离线: '+offline+'</div>'+
    '<div class="viz-stat" style="margin-left:auto;">共 '+devices.length+' 台</div>';
}

function renderVizFloorPlan(building, floor) {
  var svgContainer = el("vizFloorPlan"); var empty = el("vizEmpty");
  if (!svgContainer) return;
  var buildings = (window._vizData&&window._vizData.buildings) ? window._vizData.buildings : [];
  var b = buildings.find(function(x) { return x.name === building; }); if (!b) return;
  var allDevices = (b.devices||[]).filter(function(d) { return d.locationFloor === floor; });
  if (!allDevices.length) { svgContainer.innerHTML = ''; if (empty) empty.style.display = 'flex'; return; }
  if (empty) empty.style.display = 'none';
  var rooms = []; var seen = {};
  allDevices.forEach(function(d) {
    var key = d.locationRoom || '大厅';
    if (!seen[key]) { seen[key] = true; rooms.push({ name: key, devices: [] }); }
    rooms.find(function(r) { return r.name === key; }).devices.push(d);
  });
  var cols = Math.min(rooms.length, 4); var rows = Math.ceil(rooms.length / cols);
  var svg = '<svg viewBox="0 0 ' + (cols*180+40) + ' ' + Math.max(rows*160+40,200) + '" xmlns="http://www.w3.org/2000/svg">';
  svg += '<rect x="0" y="8" width="' + (cols*180+40) + '" height="14" class="viz-corridor" rx="3"/>';
  svg += '<text x="' + (cols*90+20) + '" y="18" text-anchor="middle" class="viz-room-tag">' + escapeHtml(floor||'') + ' 走廊</text>';
  rooms.forEach(function(room, i) {
    var col = i % cols; var row = Math.floor(i / cols);
    var x = col * 180 + 20; var y = row * 160 + 34;
    svg += '<rect x="' + x + '" y="' + y + '" width="160" height="140" class="viz-room" rx="8"/>';
    svg += '<text x="' + (x+80) + '" y="' + (y+16) + '" text-anchor="middle" class="viz-room-tag">' + escapeHtml(room.name) + '</text>';
    var devPerRow = 3; var dSize = 36; var gap = 10;
    room.devices.forEach(function(d, di) {
      var dCol = di % devPerRow; var dRow = Math.floor(di / devPerRow);
      var dx = x + 12 + dCol * (dSize + gap); var dy = y + 26 + dRow * (dSize + 16);
      var color = d.status === 'ONLINE' ? '#22c55e' : '#ef4444';
      svg += '<circle cx="' + (dx+dSize/2) + '" cy="' + (dy+dSize/2) + '" r="12" fill="' + color + '" opacity="0.15"/>';
      svg += '<circle cx="' + (dx+dSize/2) + '" cy="' + (dy+dSize/2) + '" r="8" fill="' + color + '" class="viz-device-marker" onclick="selectVizDevice(\'' + (d.deviceId||'').replace(/'/g,"\\'") + '\',' + (d.id||0) + ')"/>';
      svg += '<text x="' + (dx+dSize/2) + '" y="' + (dy+dSize+4) + '" text-anchor="middle" font-size="7" fill="#475569">' + escapeHtml((d.deviceId||'').substring(0,7)) + '</text>';
    });
  });
  svg += '</svg>';
  svgContainer.innerHTML = svg;
}

function selectVizDevice(deviceCode, deviceId) {
  window._vizSelectedDevice = { code: deviceCode, id: deviceId };
  renderVizDetail(deviceCode, deviceId);
  renderVizDeviceList();
}

async function renderVizDetail(deviceCode, deviceId) {
  var body = el("vizDetailBody"); if (!body) return;
  body.innerHTML = '<div style="text-align:center;color:#64748b;padding:10px;">加载中...</div>';
  try {
    var dev = await apiRequest("/devices/" + deviceId);
    if (!dev) { body.innerHTML = '<p class="viz-detail-placeholder">设备不存在</p>'; return; }
    var devThr = window._vizThresholds.filter(function(t) { return String(t.deviceId) === String(deviceId); });
    var sH = devThr.find(function(t) { return t.thresholdType === 'SMOKE_CONCENTRATION' && t.alarmLevel === 'HIGH'; });
    var sM = devThr.find(function(t) { return t.thresholdType === 'SMOKE_CONCENTRATION' && t.alarmLevel === 'MEDIUM'; });
    var tH = devThr.find(function(t) { return t.thresholdType === 'TEMPERATURE'; });
    var statusColor = dev.status === 'ONLINE' ? '#22c55e' : '#ef4444';
    body.innerHTML =
      '<div style="margin-bottom:10px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + statusColor + ';margin-right:4px;"></span><strong>' + escapeHtml(dev.deviceId||deviceCode) + '</strong></div>'+
      '<div class="viz-detail-field"><label>名称</label><value>' + escapeHtml(dev.deviceName||'--') + '</value></div>'+
      '<div class="viz-detail-field"><label>状态</label><value style="color:'+statusColor+'">' + escapeHtml(dev.status||'--') + '</value></div>'+
      '<div class="viz-detail-field"><label>地址</label><value>' + escapeHtml((dev.locationBuilding||'')+(dev.locationFloor||'')+(dev.locationRoom||'')) + '</value></div>'+
      '<div class="viz-detail-field"><label>电量/信号</label><value>' + (dev.battery||'--') + '% / ' + (dev.signalStrength||'--') + '%</value></div>'+
      '<hr style="margin:10px 0;border-color:#e2e8f0;">'+
      '<div style="font-weight:700;font-size:12px;margin-bottom:6px;">阈值配置</div>'+
      '<div class="viz-detail-field"><label>烟雾 HIGH (mg/m)</label><input id="vizThrSH" value="'+(sH?sH.thresholdMax:'0.30')+'" style="width:100%;padding:5px;border:1px solid #d1d5db;border-radius:4px;margin:2px 0;"></div>'+
      '<div class="viz-detail-field"><label>烟雾 MEDIUM (mg/m)</label><input id="vizThrSM" value="'+(sM?sM.thresholdMax:'0.15')+'" style="width:100%;padding:5px;border:1px solid #d1d5db;border-radius:4px;margin:2px 0;"></div>'+
      '<div class="viz-detail-field"><label>温度 HIGH (C)</label><input id="vizThrTH" value="'+(tH?tH.thresholdMax:'65')+'" style="width:100%;padding:5px;border:1px solid #d1d5db;border-radius:4px;margin:2px 0;"></div>'+
      '<button class="btn btn-main" style="width:100%;margin-top:6px;font-size:11px;padding:8px;" onclick="saveVizThresholds('+deviceId+')">保存阈值</button>';
  } catch(e) { body.innerHTML = '<p class="viz-detail-placeholder">加载失败: '+e.message+'</p>'; }
}

async function saveVizThresholds(deviceId) {
  var sH=parseFloat(el("vizThrSH").value)||0.30, sM=parseFloat(el("vizThrSM").value)||0.15, tH=parseFloat(el("vizThrTH").value)||65;
  var old = window._vizThresholds.filter(function(t) { return String(t.deviceId)===String(deviceId); });
  for (var i=0; i<old.length; i++) { try { await apiRequest("/thresholds/"+old[i].id,{method:"DELETE"}); } catch(e) {} }
  await apiRequest("/thresholds",{method:"POST",body:JSON.stringify({deviceId:Number(deviceId),thresholdType:'SMOKE_CONCENTRATION',thresholdMax:sH,alarmLevel:'HIGH',status:'ENABLED',sortOrder:1})});
  await apiRequest("/thresholds",{method:"POST",body:JSON.stringify({deviceId:Number(deviceId),thresholdType:'SMOKE_CONCENTRATION',thresholdMax:sM,alarmLevel:'MEDIUM',status:'ENABLED',sortOrder:2})});
  await apiRequest("/thresholds",{method:"POST",body:JSON.stringify({deviceId:Number(deviceId),thresholdType:'TEMPERATURE',thresholdMax:tH,alarmLevel:'HIGH',status:'ENABLED',sortOrder:1})});
  showGlobalAlert("阈值已保存"); window.initViz();
}

function renderVizDeviceList() {
  var building = window._vizCurrentBuilding;
  if (!building) return;
  var buildings = (window._vizData&&window._vizData.buildings) ? window._vizData.buildings : [];
  var b = buildings.find(function(x) { return x.name === building; }); if (!b) return;
  var devices = b.devices || [];
  var searchEl = el("vizSearchInput"); var searchTerm = searchEl ? searchEl.value.trim().toLowerCase() : '';
  if (searchTerm) devices = devices.filter(function(d) { return (d.deviceId||'').toLowerCase().indexOf(searchTerm)>=0 || (d.deviceName||'').toLowerCase().indexOf(searchTerm)>=0; });
  var sidebar = el("vizSidebar");
  if (!sidebar) return;
  var listEl = sidebar.querySelector(".viz-device-list");
  if (!listEl) { listEl = document.createElement("div"); listEl.className = "viz-device-list"; sidebar.appendChild(listEl); }
  var selId = window._vizSelectedDevice ? window._vizSelectedDevice.id : null;
  listEl.innerHTML = '<div style="font-weight:700;font-size:11px;margin-bottom:4px;">设备清单 ('+devices.length+')</div>' +
    devices.map(function(d) {
      var sel = selId === d.id;
      var cls = d.status === 'ONLINE' ? 'online' : 'offline';
      return '<div class="viz-device-list-item' + (sel?' selected':'') + '" onclick="selectVizDevice(\''+(d.deviceId||'').replace(/'/g,"\\'")+'\','+(d.id||0)+')"><span class="d '+cls+'"></span>' + escapeHtml(d.deviceId||d.id) + ' · ' + escapeHtml(d.locationRoom||'') + '</div>';
    }).join('');
}
