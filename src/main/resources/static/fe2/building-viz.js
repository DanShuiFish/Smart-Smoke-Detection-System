(function () {
  var state = window.state || {};
  if (!state.viz) state.viz = { buildings: [], selectedBuilding: null, selectedFloor: null, selectedDevice: null, highlightedDevice: null, broadcastFloors: [] };

  function el(id) { return document.getElementById(id); }
  function safeText(v, fallback) { if (v === null || v === undefined || String(v).trim() === "") return fallback || "--"; return String(v).trim(); }
  function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var STATUS_CLASS = { ONLINE: "online", OFFLINE: "offline", ERROR: "error", INACTIVE: "inactive" };
  var STATUS_TEXT = { ONLINE: "在线", OFFLINE: "离线", ERROR: "故障", INACTIVE: "未激活" };

  // 3D scene references
  var sceneRefs = { scene: null, camera: null, renderer: null, devMeshes: [], buildingGroup: null, animFrame: null };

  async function apiRequest(path, options) {
    var token = localStorage.getItem("smoke_token") || localStorage.getItem("smartSmokeToken") || localStorage.getItem("token") || "";
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    var opts = { headers: headers };
    if (options) { if (options.method) opts.method = options.method; if (options.body) opts.body = options.body; }
    var resp = await fetch("/api/v1" + path, opts);
    if (resp.status === 401) throw new Error("未登录");
    if (!resp.ok) throw new Error("Request failed: " + resp.status);
    var json = await resp.json();
    if (json.code !== 200) throw new Error(json.msg || "API error");
    return json.data;
  }

  async function loadBuildingTree() {
    try {
      var data = await apiRequest("/devices/building-tree");
      state.viz.buildings = data.buildings || [];
      if (state.viz.buildings.length > 0 && !state.viz.selectedBuilding) {
        state.viz.selectedBuilding = state.viz.buildings[0].name;
        state.viz.selectedFloor = null;
      }
      renderAll();
    } catch (e) { console.error("Failed to load building tree:", e); }
  }

  function renderAll() { renderBuildingList(); renderDevicePanel(); renderMain(); renderDetail(); }

  // ===== Left sidebar: Building list =====
  function renderBuildingList() {
    var list = el("vizBuildingList"); if (!list) return;
    var html = "";
    // "全部楼栋" 选项
    var allActive = !state.viz.selectedBuilding;
    html += '<div class="viz-building-item"><div class="viz-building-header' + (allActive ? " active" : "") + '" data-building="">';
    html += '<span class="viz-building-name">📋 全部楼栋</span>';
    var totalOnline = 0, totalOffline = 0, totalError = 0;
    (state.viz.buildings || []).forEach(function (b) {
      totalOnline += (b.online || 0);
      totalOffline += (b.offline || 0);
      totalError += (b.error || 0);
    });
    html += '<span class="viz-building-stats"><span class="viz-bstat-online">' + totalOnline + '</span>';
    html += '<span class="viz-bstat-offline">' + totalOffline + '</span>';
    html += '<span class="viz-bstat-error">' + totalError + '</span></span></div>';
    if (allActive) {
      // 显示全部楼栋时不展示楼层列表
    }
    html += '</div>';
    (state.viz.buildings || []).forEach(function (b) {
      var isActive = state.viz.selectedBuilding === b.name;
      html += '<div class="viz-building-item"><div class="viz-building-header' + (isActive ? " active" : "") + '" data-building="' + escapeHtml(b.name) + '">';
      html += '<span class="viz-building-name">' + escapeHtml(b.name) + '</span>';
      html += '<span class="viz-building-stats"><span class="viz-bstat-online">' + (b.online || 0) + '</span>';
      html += '<span class="viz-bstat-offline">' + (b.offline || 0) + '</span>';
      html += '<span class="viz-bstat-error">' + (b.error || 0) + '</span></span></div>';
      if (isActive) {
        html += '<div class="viz-floor-list">';
        (b.floors || []).forEach(function (f) {
          var fActive = state.viz.selectedFloor === f.name;
          html += '<div class="viz-floor-item' + (fActive ? " active" : "") + '" data-floor="' + escapeHtml(f.name) + '">';
          html += '<span>' + escapeHtml(f.name) + '</span><span class="viz-floor-count">' + f.online + "/" + f.total + '</span></div>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
    list.innerHTML = html;
    // Click events
    list.querySelectorAll(".viz-building-header").forEach(function (hdr) {
      hdr.addEventListener("click", function () {
        var bName = hdr.getAttribute("data-building");
        if (!bName) {
          // 选择了 "全部楼栋"
          state.viz.selectedBuilding = null;
        } else {
          state.viz.selectedBuilding = (state.viz.selectedBuilding === bName) ? null : bName;
        }
        state.viz.selectedFloor = null; state.viz.selectedDevice = null;
        renderAll();
      });
    });
    list.querySelectorAll(".viz-floor-item").forEach(function (item) {
      item.addEventListener("click", function (e) {
        e.stopPropagation();
        state.viz.selectedFloor = item.getAttribute("data-floor");
        state.viz.selectedDevice = null;
        renderMain(); renderDevicePanel(); renderDetail();
      });
    });
  }

  // ===== Device list panel (above building list in sidebar) =====
  function renderDevicePanel() {
    var building = getCurrentBuilding();
    // Add device panel after building list
    var sidebar = el("vizSidebar");
    if (!sidebar) return;
    // Remove old device panel
    var oldPanel = sidebar.querySelector(".viz-device-panel");
    if (oldPanel) oldPanel.remove();

    // 收集设备：优先按楼栋选中过滤，否则显示所有设备
    var devices = [];
    if (building && building.devices) {
      devices = building.devices.slice();
    } else if (state.viz.buildings && state.viz.buildings.length > 0) {
      // 未选中楼栋时显示所有设备
      (state.viz.buildings || []).forEach(function (b) {
        (b.devices || []).forEach(function (d) {
          devices.push(d);
        });
      });
    }
    if (devices.length === 0) return;

    var selFloor = state.viz.selectedFloor;
    if (selFloor) {
      devices = devices.filter(function (d) { return (d.locationFloor || "").trim() === selFloor; });
    }

    var searchTerm = (el("vizSearchInput") ? el("vizSearchInput").value : "").toLowerCase();
    if (searchTerm) {
      devices = devices.filter(function (d) {
        return (d.deviceId || "").toLowerCase().indexOf(searchTerm) >= 0 ||
               (d.deviceName || "").toLowerCase().indexOf(searchTerm) >= 0;
      });
    }

    var panel = document.createElement("div");
    panel.className = "viz-device-panel";
    panel.style.cssText = "border-top:2px solid #e2e8f0;margin-top:4px;";

    var header = document.createElement("div");
    header.className = "viz-sidebar-header";
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
    header.innerHTML = '<span>📡 设备清单</span><span style="font-size:10px;color:#94a3b8;">' + devices.length + ' 台</span>';
    panel.appendChild(header);

    var listDiv = document.createElement("div");
    listDiv.style.cssText = "max-height:300px;overflow-y:auto;";
    listDiv.className = "viz-device-panel-list";

    devices.forEach(function (d) {
      var st = (d.status || "").toUpperCase();
      var isHighlighted = state.viz.highlightedDevice === d.deviceId;
      var isSelected = state.viz.selectedDevice && state.viz.selectedDevice.deviceId === d.deviceId;
      var row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 12px;cursor:pointer;font-size:12px;border-bottom:1px solid #f1f5f9;transition:background .12s;" +
        (isHighlighted ? "background:#fef3c7;border-left:3px solid #f59e0b;" : "") +
        (isSelected ? "background:#dbeafe;border-left:3px solid #2563eb;" : "");
      row.addEventListener("mouseenter", function () { if (!isHighlighted) row.style.background = "#f8fafc"; });
      row.addEventListener("mouseleave", function () { if (!isHighlighted && !isSelected) row.style.background = ""; });
      row.addEventListener("click", function () {
        state.viz.selectedDevice = d;
        state.viz.highlightedDevice = d.deviceId;
        highlightDevice3D(d.deviceId);
        renderDevicePanel();
        renderDetail();
      });

      var dot = document.createElement("span");
      dot.style.cssText = "width:8px;height:8px;border-radius:50%;flex-shrink:0;" +
        (st === "ONLINE" ? "background:#22c55e;box-shadow:0 0 6px #22c55e;" :
         st === "OFFLINE" ? "background:#f59e0b;" :
         st === "ERROR" ? "background:#ef4444;box-shadow:0 0 6px #ef4444;" : "background:#94a3b8;");
      row.appendChild(dot);

      var info = document.createElement("div");
      info.style.cssText = "flex:1;min-width:0;";
      info.innerHTML = '<div style="font-weight:600;font-size:11px;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
        escapeHtml(d.deviceName || d.deviceId) + '</div>' +
        '<div style="font-size:10px;color:#94a3b8;">' + escapeHtml(d.deviceId) + ' · ' + escapeHtml(d.locationRoom || "") + '</div>';
      row.appendChild(info);

      var reading = document.createElement("div");
      reading.style.cssText = "text-align:right;font-size:10px;color:#64748b;";
      var smokeVal = d.smokeConcentration != null ? Number(d.smokeConcentration).toFixed(2) : "--";
      var tempVal = d.temperature != null ? Number(d.temperature).toFixed(1) : "--";
      reading.innerHTML = '<div>' + smokeVal + ' mg</div><div>' + tempVal + '°C</div>';
      row.appendChild(reading);

      listDiv.appendChild(row);
    });

    if (devices.length === 0) {
      var empty = document.createElement("div");
      empty.style.cssText = "text-align:center;padding:20px;color:#94a3b8;font-size:12px;";
      empty.textContent = "该楼层暂无设备";
      listDiv.appendChild(empty);
    }

    panel.appendChild(listDiv);
    sidebar.appendChild(panel);
  }

  function getCurrentBuilding() {
    if (!state.viz.selectedBuilding) return null;
    return (state.viz.buildings || []).find(function (b) { return b.name === state.viz.selectedBuilding; }) || null;
  }

  // ===== 3D Main view =====
  function renderMain() {
    var building = getCurrentBuilding();
    var statsBar = el("vizStatsBar");
    var tabs = el("vizFloorTabs");
    var plan = el("vizFloorPlan");
    var empty = el("vizEmpty");

    if (!building) {
      if (statsBar) statsBar.innerHTML = "";
      if (tabs) tabs.innerHTML = "";
      if (plan) plan.innerHTML = "";
      if (empty) { empty.style.display = "flex"; empty.innerHTML = '<strong>请从左侧选择一个楼栋</strong><p>点击楼栋名称展开楼层设备分布</p>'; }
      return;
    }
    if (empty) empty.style.display = "none";

    if (statsBar) {
      statsBar.innerHTML = '<span class="viz-stat-item"><strong>' + escapeHtml(building.name) + '</strong></span>' +
        '<span class="sep">|</span>' +
        '<span class="viz-stat-item">总数 <strong>' + (building.total || 0) + '</strong></span>' +
        '<span class="viz-stat-item on">在线 <strong>' + (building.online || 0) + '</strong></span>' +
        '<span class="viz-stat-item off">离线 <strong>' + (building.offline || 0) + '</strong></span>' +
        '<span class="viz-stat-item err">故障 <strong>' + (building.error || 0) + '</strong></span>';
    }

    // Floor tabs
    var rawFloors = building.floors || [];
    var maxFN = 12;
    rawFloors.forEach(function (f) { var m = String(f.name).match(/(\d+)/); if (m) { var n = parseInt(m[1]); if (n > maxFN) maxFN = n; } });
    var floorMap = {}; rawFloors.forEach(function (f) { floorMap[f.name] = f; });
    var floors = [];
    for (var fi = 1; fi <= maxFN; fi++) { var fn = fi + "层"; floors.push(floorMap[fn] || { name: fn, total: 0, online: 0 }); }
    if (!state.viz.selectedFloor && floors.length > 0) state.viz.selectedFloor = floors[0].name;

    if (tabs) {
      tabs.innerHTML = floors.map(function (f) {
        var active = state.viz.selectedFloor === f.name ? " active" : "";
        var hasBr = state.viz.broadcastFloors && state.viz.broadcastFloors.indexOf(f.name) >= 0;
        return '<button class="viz-floor-tab' + active + (hasBr ? ' broadcast-flash' : '') + '" data-floor="' + escapeHtml(f.name) + '"' +
          (hasBr ? ' style="border-color:#f59e0b;animation:broadcastTabPulse 1s infinite;"' : '') + '>' +
          escapeHtml(f.name) + (hasBr ? ' 📢' : '') + '</button>';
      }).join("");
    }

    // 3D rendering
    if (plan) {
      build3D(building, floors, plan);
    }

    // Floor tab events
    if (tabs) {
      tabs.querySelectorAll(".viz-floor-tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
          state.viz.selectedFloor = this.getAttribute("data-floor");
          state.viz.selectedDevice = null;
          renderMain(); renderDevicePanel(); renderDetail();
        });
      });
    }
  }

  function build3D(building, allFloors, container) {
    var THREE = window.THREE;
    if (!THREE) { container.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;">3D引擎加载中...</div>'; return; }

    // Properly clean up previous scene to prevent WebGL context leak
    if (sceneRefs.animFrame) cancelAnimationFrame(sceneRefs.animFrame);
    if (sceneRefs.renderer) {
      sceneRefs.renderer.dispose();
      sceneRefs.renderer.forceContextLoss();
      sceneRefs.renderer.domElement = null;
    }
    if (sceneRefs.scene) {
      sceneRefs.scene.traverse(function(obj) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(function(m) { disposeMaterial(m); });
          } else {
            disposeMaterial(obj.material);
          }
        }
      });
    }
    sceneRefs.scene = null;
    sceneRefs.renderer = null;
    sceneRefs.devMeshes = [];
    // Remove any existing canvas
    while (container.firstChild) container.removeChild(container.firstChild);

    function disposeMaterial(mat) {
      if (mat.map) mat.map.dispose();
      if (mat.lightMap) mat.lightMap.dispose();
      if (mat.bumpMap) mat.bumpMap.dispose();
      if (mat.normalMap) mat.normalMap.dispose();
      if (mat.specularMap) mat.specularMap.dispose();
      if (mat.envMap) mat.envMap.dispose();
      mat.dispose();
    }

    var cw = container.clientWidth || 750, ch = container.clientHeight || 520;
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdce8f5);
    scene.fog = new THREE.Fog(0xdce8f5, 60, 180);
    sceneRefs.scene = scene;

    var camera = new THREE.PerspectiveCamera(48, cw / Math.max(ch, 1), 0.5, 150);
    sceneRefs.camera = camera;

    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(cw, ch);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    sceneRefs.renderer = renderer;

    // Lighting
    scene.add(new THREE.AmbientLight(0xe8edf5, 0.6));
    var sun = new THREE.DirectionalLight(0xfff8e7, 1.4);
    sun.position.set(20, 30, 15); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -5;
    sun.shadow.bias = -0.0001;
    scene.add(sun);
    var fill = new THREE.DirectionalLight(0xdbeafe, 0.35); fill.position.set(-10, 10, -8); scene.add(fill);
    var rim = new THREE.DirectionalLight(0xffffff, 0.2); rim.position.set(0, 5, 15); scene.add(rim);

    var STATUS_COLORS = { ONLINE: 0x22c55e, OFFLINE: 0xf59e0b, ERROR: 0xef4444, INACTIVE: 0x94a3b8 };
    var devMeshes = [];
    var W = 2.8, D = 2.0, FLH = 3.0, CW = 1.4;

    // Ground
    var groundGeo = new THREE.PlaneGeometry(80, 80);
    var groundMat = new THREE.MeshPhongMaterial({ color: 0x4ade80, specular: 0x111111, shininess: 5 });
    var ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.6; ground.receiveShadow = true; scene.add(ground);
    var grid = new THREE.GridHelper(60, 40, 0x22c55e, 0x86efac); grid.position.y = -0.58; scene.add(grid);

    // Road
    var allDevices = building.devices || [];
    var floorRooms = {};
    allFloors.forEach(function (f) {
      var fn = f.name;
      var fds = allDevices.filter(function (d) { return (d.locationFloor || "").trim() === fn; });
      var rooms = {};
      fds.forEach(function (d) { var room = safeText(d.locationRoom, "").trim(); if (!room) return; if (!rooms[room]) rooms[room] = []; rooms[room].push(d); });
      var floorNum = 1; var m = fn.match(/(\d+)|B(\d+)/i); if (m) floorNum = m[1] ? parseInt(m[1]) : -parseInt(m[2]);
      var base = floorNum > 0 ? floorNum * 100 : 0; var names = [];
      for (var i = 1; i <= 10; i++) names.push(floorNum > 0 ? String(base + i) : ("B" + Math.abs(floorNum) + "0" + i));
      Object.keys(rooms).forEach(function (r) { if (names.indexOf(r) < 0) names.push(r); });
      var an = names.slice(0, 12); var mid = Math.ceil(an.length / 2);
      floorRooms[fn] = { left: an.slice(0, mid), right: an.slice(mid), devices: rooms };
    });

    var buildingHeight = allFloors.length * (FLH + 0.3) + 1.2;
    var maxRow = 1;
    for (var fi2 = 0; fi2 < allFloors.length; fi2++) {
      var fr = floorRooms[allFloors[fi2].name] || { left: [], right: [] };
      var m2 = Math.ceil(Math.max(fr.left.length, fr.right.length) / 2);
      if (m2 > maxRow) maxRow = m2;
    }
    var totalD = (D + 0.4) * maxRow + 1;
    var bw = (W + 0.2) * 2 + CW + 0.4, bd = totalD + 0.6;

    // Plaza
    var plazaGeo = new THREE.PlaneGeometry(bw + 3, 4);
    var plazaMat = new THREE.MeshPhongMaterial({ color: 0x64748b, specular: 0x222222 });
    var plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, -0.57, -bd / 2 - 2.5); plaza.receiveShadow = true; scene.add(plaza);

    // Trees
    function makeTree(x, z) {
      var g = new THREE.Group();
      var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2, 8), new THREE.MeshPhongMaterial({ color: 0x92400e }));
      trunk.position.set(x, 0.4, z); trunk.castShadow = true; g.add(trunk);
      var foliage = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 8), new THREE.MeshPhongMaterial({ color: 0x16a34a }));
      foliage.position.set(x, 2, z); foliage.castShadow = true; g.add(foliage);
      return g;
    }
    scene.add(makeTree(-bw / 2 - 2.5, -bd / 2 - 3));
    scene.add(makeTree(bw / 2 + 2.5, -bd / 2 - 3));
    scene.add(makeTree(-bw / 2 - 2.5, bd / 2 + 3));
    scene.add(makeTree(bw / 2 + 2.5, bd / 2 + 3));

    // Building foundation
    var foundation = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.4, 0.5, bd + 0.4), new THREE.MeshPhongMaterial({ color: 0x475569 }));
    foundation.position.y = -0.3; foundation.receiveShadow = true; foundation.castShadow = true; scene.add(foundation);

    // Glass curtain wall
    var glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x87ceeb, transparent: true, opacity: 0.06, roughness: 0.05,
      metalness: 0.1, side: THREE.DoubleSide, depthWrite: false
    });
    var frameMat = new THREE.MeshPhongMaterial({ color: 0x475569, specular: 0x333333, shininess: 60 });

    // Four glass walls
    [{ w: bw, d: bd, ry: 0, px: 0, pz: -bd / 2 },
     { w: bw, d: bd, ry: 0, px: 0, pz: bd / 2 },
     { w: bd, d: bw, ry: Math.PI / 2, px: -bw / 2, pz: 0 },
     { w: bd, d: bw, ry: Math.PI / 2, px: bw / 2, pz: 0 }].forEach(function (s) {
      var panel = new THREE.Mesh(new THREE.PlaneGeometry(s.w, buildingHeight), glassMat);
      panel.position.set(s.px, buildingHeight / 2, s.pz);
      panel.rotation.y = s.ry;
      scene.add(panel);
    });

    // Corner pillars
    [[-bw / 2, -bd / 2], [bw / 2, -bd / 2], [-bw / 2, bd / 2], [bw / 2, bd / 2]].forEach(function (c) {
      var p = new THREE.Mesh(new THREE.BoxGeometry(0.1, buildingHeight, 0.1), frameMat);
      p.position.set(c[0], buildingHeight / 2, c[1]); p.castShadow = true; scene.add(p);
    });

    // Horizontal frame bands every 2 floors
    for (var y = FLH + 0.3; y < buildingHeight; y += (FLH + 0.3) * 2) {
      [[0, -bd / 2, 0], [0, bd / 2, 0]].forEach(function (b) {
        var band = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.06, 0.06), frameMat);
        band.position.set(b[0], y, b[1]); scene.add(band);
      });
      [[-bw / 2, 0, Math.PI / 2], [bw / 2, 0, Math.PI / 2]].forEach(function (b) {
        var band = new THREE.Mesh(new THREE.BoxGeometry(bd, 0.06, 0.06), frameMat);
        band.position.set(b[0], y, b[1]); band.rotation.y = b[2]; scene.add(band);
      });
    }

    // Elevator shaft
    var elevGeo = new THREE.CylinderGeometry(0.6, 0.6, buildingHeight, 16);
    var elev = new THREE.Mesh(elevGeo, new THREE.MeshPhongMaterial({ color: 0x94a3b8, specular: 0x444444, shininess: 40 }));
    elev.position.set(0, buildingHeight / 2, -totalD / 2 - 0.5); elev.castShadow = true; scene.add(elev);
    var elevRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.06, 8, 32), new THREE.MeshPhongMaterial({ color: 0x3b82f6, emissive: 0x2563eb, emissiveIntensity: 0.6 }));
    elevRing.rotation.x = Math.PI / 2; elevRing.position.copy(elev.position); scene.add(elevRing);

    // Build rooms and devices per floor
    function makeRoom(name, x, yBase, z, devs) {
      var g = new THREE.Group();
      g.position.set(x, yBase, z);
      var slab = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, 0.14, D - 0.05), new THREE.MeshPhongMaterial({ color: 0xf1f5f9 }));
      slab.position.y = 0.07; slab.castShadow = true; slab.receiveShadow = true; g.add(slab);

      var isEmpty = !devs || devs.length === 0;
      var wallColor = isEmpty ? 0xd1d5db : 0x94a3b8;
      var wallMat = new THREE.MeshPhongMaterial({ color: wallColor, transparent: true, opacity: 0.25, depthWrite: false });
      [{ w: W, d: 0.08, x: 0, z: -D / 2 }, { w: W, d: 0.08, x: 0, z: D / 2 },
       { w: 0.08, d: D, x: -W / 2, z: 0 }, { w: 0.08, d: D, x: W / 2, z: 0 }].forEach(function (p) {
        var w = new THREE.Mesh(new THREE.BoxGeometry(p.w, FLH, p.d), wallMat);
        w.position.set(p.x, FLH / 2, p.z); w.castShadow = true; w.receiveShadow = true; g.add(w);
      });

      (devs || []).forEach(function (d, di) {
        var st = (d.status || "").toUpperCase();
        var sc = STATUS_COLORS[st] || 0x94a3b8;
        var isAlarm = st === "ERROR";
        var px = (di % 3 - 1) * 0.75, pz = Math.floor(di / 3) * 0.55 - 0.35;

        // Base
        var base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.2, 16), new THREE.MeshPhongMaterial({ color: 0xf8fafc, emissive: 0x222222, emissiveIntensity: 0.2 }));
        base.position.set(px, 0.24, pz); base.castShadow = true; g.add(base);

        // Device sphere
        var sphere = new THREE.Mesh(new THREE.SphereGeometry(0.38, 20, 20),
          new THREE.MeshPhongMaterial({ color: sc, emissive: sc, emissiveIntensity: isAlarm ? 1.8 : 1.0, specular: 0xffffff, shininess: 80 }));
        sphere.position.set(px, 0.42, pz); sphere.castShadow = true;
        sphere.userData = { device: d, alarm: isAlarm, roomName: name };
        sphere.name = "device-" + d.deviceId;
        g.add(sphere); devMeshes.push(sphere);

        // Glow ring
        var ringColor = isAlarm ? 0xef4444 : sc;
        var ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 8, 24),
          new THREE.MeshPhongMaterial({ color: ringColor, emissive: ringColor, emissiveIntensity: isAlarm ? 1.2 : 0.6, transparent: true, opacity: 0.8 }));
        ring.position.set(px, 0.24, pz); ring.rotation.x = Math.PI / 2; g.add(ring);

        // Alarm outer ring (only for alarm devices)
        if (isAlarm) {
          var outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 24),
            new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 }));
          outerRing.position.set(px, 0.24, pz); outerRing.rotation.x = Math.PI / 2;
          outerRing.userData = { isAlarmRing: true, deviceId: d.deviceId };
          g.add(outerRing);
        }
      });

      // Room label
      var labelCanvas = document.createElement('canvas');
      labelCanvas.width = 192; labelCanvas.height = 72;
      var ct = labelCanvas.getContext('2d');
      ct.fillStyle = 'rgba(255,255,255,0.85)'; ct.fillRect(0, 0, 192, 72);
      ct.strokeStyle = '#2563eb'; ct.lineWidth = 3; ct.strokeRect(3, 3, 186, 66);
      ct.fillStyle = '#1e293b'; ct.font = 'bold 28px sans-serif'; ct.textAlign = 'center'; ct.textBaseline = 'middle';
      ct.fillText(name, 96, 36);
      var labelTex = new THREE.CanvasTexture(labelCanvas);
      var labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true }));
      labelSprite.position.set(x, yBase + FLH * 0.75, z); labelSprite.scale.set(1.6, 0.6, 1); scene.add(labelSprite);

      scene.add(g);
      return g;
    }

    // Build all floors
    allFloors.forEach(function (f, fi3) {
      var yBase = fi3 * (FLH + 0.3) + 0.15;
      var fr = floorRooms[f.name] || { left: [], right: [], devices: {} };

      // Corridor floor
      var corrSlab = new THREE.Mesh(new THREE.BoxGeometry(CW - 0.1, 0.1, totalD - 0.5), new THREE.MeshPhongMaterial({ color: 0xb0bec5 }));
      corrSlab.position.set(0, yBase + 0.05, 0); corrSlab.receiveShadow = true; scene.add(corrSlab);

      // Broadcast overlay for this floor
      if (state.viz.broadcastFloors && state.viz.broadcastFloors.indexOf(f.name) >= 0) {
        var brOverlay = new THREE.Mesh(
          new THREE.BoxGeometry(bw + 0.1, FLH * 0.3, bd + 0.1),
          new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.15, depthWrite: false })
        );
        brOverlay.position.set(0, yBase + FLH / 2, 0);
        brOverlay.userData = { isBroadcastOverlay: true, floorName: f.name };
        brOverlay.name = "broadcast-overlay-" + f.name;
        scene.add(brOverlay);
      }

      var lx = -(CW / 2 + W / 2);
      fr.left.forEach(function (rn, i) { makeRoom(rn, lx - (i % 2) * (W + 0.2), yBase, -Math.floor(i / 2) * (D + 0.4), fr.devices[rn] || []); });
      var rx = CW / 2 + W / 2;
      fr.right.forEach(function (rn, i) { makeRoom(rn, rx + (i % 2) * (W + 0.2), yBase, -Math.floor(i / 2) * (D + 0.4), fr.devices[rn] || []); });
    });

    // Roof
    var roof = new THREE.Mesh(new THREE.BoxGeometry((W + 0.2) * 2 + CW + 1, 0.2, totalD + 1), new THREE.MeshPhongMaterial({ color: 0x475569 }));
    roof.position.y = buildingHeight; roof.castShadow = true; roof.receiveShadow = true; scene.add(roof);
    // Roof edge
    [{ w: bw + 0.1, d: 0.05, pz: -bd / 2 }, { w: bw + 0.1, d: 0.05, pz: bd / 2 }].forEach(function (s) {
      var edge = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.08, s.d), frameMat);
      edge.position.set(0, buildingHeight, s.pz); scene.add(edge);
    });

    // Camera
    var buildingCenter = new THREE.Vector3(0, buildingHeight / 2, 0);
    var camDist = Math.max(buildingHeight * 1.6, 18);
    camera.position.set(camDist * 0.55, buildingHeight * 0.85, camDist * 0.75);
    camera.lookAt(buildingCenter);

    // Orbit controls
    var orbitRadius = camDist, orbitTheta = 0.85, orbitPhi = 1.15, viewY = buildingCenter.y;
    var isDragging = false, px = 0, py = 0;

    function updateCameraPosition() {
      var sp = Math.sin(orbitPhi);
      camera.position.set(
        orbitRadius * sp * Math.cos(orbitTheta),
        viewY + orbitRadius * Math.cos(orbitPhi),
        orbitRadius * sp * Math.sin(orbitTheta)
      );
      camera.lookAt(0, viewY, 0);
    }
    updateCameraPosition();

    renderer.domElement.addEventListener("mousedown", function (e) { isDragging = true; px = e.clientX; py = e.clientY; e.preventDefault(); });
    window.addEventListener("mouseup", function () { isDragging = false; });
    window.addEventListener("mousemove", function (e) {
      if (!isDragging) return;
      orbitTheta -= (e.clientX - px) * 0.005;
      viewY += (e.clientY - py) * 0.06;
      viewY = Math.max(0, Math.min(buildingHeight, viewY));
      px = e.clientX; py = e.clientY;
      updateCameraPosition();
    });
    renderer.domElement.addEventListener("wheel", function (e) {
      e.preventDefault();
      orbitRadius += e.deltaY * 0.025;
      orbitRadius = Math.max(5, Math.min(55, orbitRadius));
      updateCameraPosition();
    });

    // Fly to floor
    window.zoomToFloor3D = function (floorName) {
      var fi = -1;
      for (var i = 0; i < allFloors.length; i++) { if (allFloors[i].name === floorName) { fi = i; break; } }
      if (fi < 0) return;
      if (state.viz.selectedFloor !== floorName) state.viz.selectedFloor = floorName;
      var ty = fi * (FLH + 0.3) + FLH / 2;
      var startRadius = orbitRadius, startPhi = orbitPhi, startTheta = orbitTheta, startViewY = viewY;
      var targetPos = new THREE.Vector3(8, ty + 0.5, 2.5);
      var d2 = new THREE.Vector3().subVectors(targetPos, new THREE.Vector3(0, ty, 0));
      var endRadius = Math.max(6, d2.length()), endPhi = Math.acos(Math.max(-1, Math.min(1, d2.y / endRadius)));
      var endTheta = Math.atan2(d2.z, d2.x), endViewY = ty;
      var st = Date.now();
      function step() {
        var t = Math.min((Date.now() - st) / 900, 1);
        var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        orbitRadius = startRadius + (endRadius - startRadius) * e;
        orbitPhi = startPhi + (endPhi - startPhi) * e;
        orbitTheta = startTheta + (endTheta - startTheta) * e;
        viewY = startViewY + (endViewY - startViewY) * e;
        updateCameraPosition();
        if (t < 1) requestAnimationFrame(step);
      }
      step();
    };

    // Highlight device in 3D
    window.highlightDevice3D = function (deviceId) {
      var found = null;
      devMeshes.forEach(function (m) {
        if (m.userData.device && m.userData.device.deviceId === deviceId) {
          found = m;
          m.material.emissive.set(0xffffff);
          m.material.emissiveIntensity = 2.0;
        } else if (m.userData.device) {
          var st = (m.userData.device.status || "").toUpperCase();
          var sc = STATUS_COLORS[st] || 0x94a3b8;
          m.material.emissive.set(sc);
          m.material.emissiveIntensity = m.userData.alarm ? 1.8 : 1.0;
        }
      });
      // Fly to highlighted device
      if (found) {
        var wp = new THREE.Vector3();
        found.getWorldPosition(wp);
        var startRadius = orbitRadius, startPhi = orbitPhi, startTheta = orbitTheta, startViewY = viewY;
        var endViewY = wp.y;
        var d = new THREE.Vector3().subVectors(new THREE.Vector3(6, wp.y + 1, 3), new THREE.Vector3(0, wp.y, 0));
        var endRadius = Math.max(4, d.length()), endPhi = Math.acos(Math.max(-1, Math.min(1, d.y / endRadius)));
        var endTheta = Math.atan2(d.z, d.x);
        var st = Date.now();
        function flyStep() {
          var t = Math.min((Date.now() - st) / 600, 1);
          var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          orbitRadius = startRadius + (endRadius - startRadius) * e;
          orbitPhi = startPhi + (endPhi - startPhi) * e;
          orbitTheta = startTheta + (endTheta - startTheta) * e;
          viewY = startViewY + (endViewY - startViewY) * e;
          updateCameraPosition();
          if (t < 1) requestAnimationFrame(flyStep);
        }
        flyStep();
      }
    };

    sceneRefs.devMeshes = devMeshes;

    // Raycaster for clicking devices
    var raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
    renderer.domElement.addEventListener("click", function (e) {
      if (isDragging) return;
      var rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      var hits = raycaster.intersectObjects(devMeshes);
      if (hits.length > 0 && hits[0].object.userData.device) {
        state.viz.selectedDevice = hits[0].object.userData.device;
        state.viz.highlightedDevice = state.viz.selectedDevice.deviceId;
        highlightDevice3D(state.viz.selectedDevice.deviceId);
        renderDevicePanel();
        renderDetail();
      }
    });

    // Animate
    function animate() {
      sceneRefs.animFrame = requestAnimationFrame(animate);
      var t = Date.now() * 0.001;
      devMeshes.forEach(function (m) {
        var ud = m.userData;
        if (ud.alarm) {
          // Alarm pulse: breathing effect
          m.material.emissiveIntensity = 1.2 + 0.6 * Math.sin(t * 5);
          // Scale pulse
          var s = 1 + 0.08 * Math.sin(t * 5);
          m.scale.setScalar(s);
        }
      });
      // Pulse broadcast overlays
      scene.children.forEach(function (child) {
        if (child.userData && child.userData.isBroadcastOverlay) {
          child.material.opacity = 0.08 + 0.07 * Math.sin(t * 4);
        }
        if (child.userData && child.userData.isAlarmRing) {
          child.material.opacity = 0.3 + 0.2 * Math.sin(t * 6);
        }
      });
      // Elevator ring animation
      elevRing.rotation.z += 0.008;
      elevRing.material.emissiveIntensity = 0.4 + 0.25 * Math.sin(t * 4);
      renderer.render(scene, camera);
    }
    animate();

    // Resize
    var rh = function () {
      var w = container.clientWidth, h = container.clientHeight;
      if (w && h) { camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); }
    };
    window.addEventListener("resize", rh);
    container._rh = rh;
  }

  // ===== Detail panel (right sidebar) =====
  function renderDetail() {
    var body = el("vizDetailBody"); if (!body) return;
    var d = state.viz.selectedDevice;
    if (!d) { body.innerHTML = '<p class="viz-detail-placeholder">点击设备图标查看详情<br><small>支持实时配置阈值</small></p>'; return; }
    var st = (d.status || "").toUpperCase();
    var sc = STATUS_CLASS[st] || "inactive";
    var loc = [d.locationBuilding, d.locationFloor, d.locationRoom].filter(Boolean).join(" ");

    var html =
      '<div style="text-align:center;margin-bottom:14px;"><span class="viz-detail-status ' + sc + '">' + (STATUS_TEXT[st] || st) + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">设备名称</span><span class="value">' + escapeHtml(safeText(d.deviceName, d.deviceId)) + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">设备编号</span><span class="value">' + escapeHtml(d.deviceId || "--") + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">安装位置</span><span class="value">' + escapeHtml(safeText(loc, "--")) + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">烟雾浓度</span><span class="value">' + (d.smokeConcentration != null ? Number(d.smokeConcentration).toFixed(3) + " mg/m³" : "--") + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">温度</span><span class="value">' + (d.temperature != null ? Number(d.temperature).toFixed(1) + " °C" : "--") + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">电量</span><span class="value">' + (d.battery != null ? d.battery + "%" : "--") + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">信号强度</span><span class="value">' + (d.signalStrength != null ? d.signalStrength + " dBm" : "--") + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">最后心跳</span><span class="value" style="font-size:11px;">' + escapeHtml(d.lastHeartbeat || "--") + '</span></div>' +
      // Threshold config section
      '<hr style="border-color:#e2e8f0;margin:12px 0;">' +
      '<div style="font-size:12px;font-weight:700;margin-bottom:8px;color:#1e293b;">⚙️ 阈值配置</div>' +
      '<div class="viz-threshold-cfg">' +
      '<div class="threshold-row-viz"><label>烟雾HIGH</label><input type="range" id="vizSmokeHigh" min="5" max="60" value="30" oninput="window.vizThrSync()"><span class="thr-val" id="vizSmokeHighV">0.30</span></div>' +
      '<div class="threshold-row-viz"><label>烟雾MED</label><input type="range" id="vizSmokeMed" min="5" max="40" value="15" oninput="window.vizThrSync()"><span class="thr-val" id="vizSmokeMedV">0.15</span></div>' +
      '<div class="threshold-row-viz"><label>温度HIGH</label><input type="range" id="vizTempHigh" min="20" max="100" value="65" oninput="window.vizThrSync()"><span class="thr-val" id="vizTempHighV">65°C</span></div>' +
      '</div>' +
      '<button class="btn btn-primary btn-sm" style="width:100%;margin-top:10px;padding:8px;border:none;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;font-size:12px;font-weight:600;" onclick="window.vizSaveThreshold(\'' + d.deviceId + '\')">💾 保存阈值</button>' +
      '<button class="btn btn-outline btn-sm" style="width:100%;margin-top:4px;padding:6px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#64748b;cursor:pointer;font-size:11px;" onclick="window.vizLoadThresholds(\'' + d.deviceId + '\')">🔄 加载当前阈值</button>';

    body.innerHTML = html;
    // Load thresholds
    if (window.vizLoadThresholds) window.vizLoadThresholds(d.deviceId);
  }

  // ===== Threshold helpers (exposed to global scope for onclick handlers) =====
  window.vizThrSync = function () {
    var sh = document.getElementById("vizSmokeHigh");
    var sm = document.getElementById("vizSmokeMed");
    var th = document.getElementById("vizTempHigh");
    if (sh) document.getElementById("vizSmokeHighV").textContent = (sh.value / 100).toFixed(2);
    if (sm) document.getElementById("vizSmokeMedV").textContent = (sm.value / 100).toFixed(2);
    if (th) document.getElementById("vizTempHighV").textContent = th.value + "°C";
  };

  window.vizLoadThresholds = async function (deviceCode) {
    try {
      var t = await apiRequest("/simulation/device/threshold?deviceCode=" + encodeURIComponent(deviceCode));
      if (t) {
        if (t.smokeHigh !== undefined) {
          var sh = document.getElementById("vizSmokeHigh"); if (sh) { sh.value = Math.round(t.smokeHigh * 100); document.getElementById("vizSmokeHighV").textContent = Number(t.smokeHigh).toFixed(2); }
        }
        if (t.smokeMedium !== undefined) {
          var sm = document.getElementById("vizSmokeMed"); if (sm) { sm.value = Math.round(t.smokeMedium * 100); document.getElementById("vizSmokeMedV").textContent = Number(t.smokeMedium).toFixed(2); }
        }
        if (t.tempHigh !== undefined) {
          var th = document.getElementById("vizTempHigh"); if (th) { th.value = t.tempHigh; document.getElementById("vizTempHighV").textContent = t.tempHigh + "°C"; }
        }
      }
    } catch (e) {}
  };

  window.vizSaveThreshold = async function (deviceCode) {
    var sh = document.getElementById("vizSmokeHigh");
    var sm = document.getElementById("vizSmokeMed");
    var th = document.getElementById("vizTempHigh");
    var sH = sh ? parseFloat(sh.value) / 100 : 0.30;
    var sM = sm ? parseFloat(sm.value) / 100 : 0.15;
    var tH = th ? parseInt(th.value) : 65;
    try {
      await apiRequest("/simulation/device/threshold", {
        method: "POST",
        body: JSON.stringify({ deviceCode: deviceCode, smokeHigh: sH, smokeMedium: sM, tempHigh: tH })
      });
      // Brief success feedback
      var btn = document.querySelector("button[onclick*='vizSaveThreshold']");
      if (btn) { var orig = btn.textContent; btn.textContent = "✅ 阈值已保存"; btn.style.background = "#059669"; setTimeout(function () { btn.textContent = orig; btn.style.background = "#2563eb"; }, 1500); }
    } catch (e) { alert("保存阈值失败: " + e.message); }
  };

  // ===== Broadcast overlay control =====
  window.setBroadcastFloor = function (floorName, active) {
    if (!state.viz.broadcastFloors) state.viz.broadcastFloors = [];
    if (active) {
      if (state.viz.broadcastFloors.indexOf(floorName) < 0) state.viz.broadcastFloors.push(floorName);
    } else {
      state.viz.broadcastFloors = state.viz.broadcastFloors.filter(function (f) { return f !== floorName; });
    }
    renderMain();
  };

  // Init
  window.refreshViz = loadBuildingTree;
  // 轻量级刷新：只更新设备数据和面板，不重建 3D 场景
  window.refreshVizLight = async function () {
    try {
      var data = await apiRequest("/devices/building-tree");
      state.viz.buildings = data.buildings || [];
      renderBuildingList();
      renderDevicePanel();
      renderDetail();
      // 增量更新 3D 中的设备球体颜色（不重建场景）
      if (window.updateDeviceStatus3D) window.updateDeviceStatus3D(state.viz.buildings);
    } catch (e) { console.error("Light refresh failed:", e); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(loadBuildingTree, 200); });
  } else { setTimeout(loadBuildingTree, 200); }

  document.addEventListener("DOMContentLoaded", function () {
    var btn = el("btnRefreshViz"); if (btn) btn.addEventListener("click", loadBuildingTree);
    var search = el("vizSearchInput");
    if (search) {
      search.addEventListener("input", function () {
        renderDevicePanel();
        // Also highlight in 3D
        if (search.value && state.viz.buildings) {
          var found = null;
          var bld = getCurrentBuilding();
          if (bld && bld.devices) {
            var q = search.value.toLowerCase();
            found = bld.devices.find(function (d) { return (d.deviceId || "").toLowerCase().indexOf(q) >= 0; });
          }
          if (found) {
            state.viz.highlightedDevice = found.deviceId;
            if (window.highlightDevice3D) window.highlightDevice3D(found.deviceId);
          }
        }
      });
    }
  });
})();

// ===== WebSocket for 3D viz =====
(function () {
  var _wsReconnectDelay = 5000;
  var _wsMaxDelay = 30000;
  function connectVizWs() {
    try {
      var token = localStorage.getItem("smoke_token") || localStorage.getItem("smartSmokeToken") || localStorage.getItem("token") || "";
      var wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/alarm" + (token ? "?token=" + encodeURIComponent(token) : "");
      var socket = new WebSocket(wsUrl);
      socket.onopen = function () { _wsReconnectDelay = 5000; };
      socket.onclose = function () { setTimeout(connectVizWs, _wsReconnectDelay); _wsReconnectDelay = Math.min(_wsReconnectDelay * 2, _wsMaxDelay); };
      socket.onmessage = function (event) {
        try {
          var payload = JSON.parse(event.data);
          var kind = payload.kind || "";

          // 仅 data_changed / device_config_changed / alarm / alarm_result 触发轻量刷新
          if (kind === "data_changed" || kind === "device_config_changed" || kind === "device_online" || kind === "device_offline") {
            if (window.refreshVizLight) window.refreshVizLight();
          } else if (kind === "alarm" || kind === "alarm_result") {
            // 告警需要轻量刷新设备状态 + 更新告警球体
            if (window.refreshVizLight) window.refreshVizLight();
          } else if (kind === "broadcast_notify" || kind === "broadcast") {
            // 广播通知保持 3D 覆盖层
            if (window.refreshVizLight) window.refreshVizLight();
          }
          // heartbeat / realtime / status_change — 不做任何刷新

          // Handle broadcast notifications for overlay effect
          if (kind === "broadcast_notify" && payload.floor && window.setBroadcastFloor) {
            window.setBroadcastFloor(payload.floor, true);
            setTimeout(function () { window.setBroadcastFloor(payload.floor, false); }, 30000);
          }
        } catch (e) {}
      };
    } catch (e) { setTimeout(connectVizWs, _wsReconnectDelay); }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(connectVizWs, 500); });
  } else { setTimeout(connectVizWs, 500); }
})();
