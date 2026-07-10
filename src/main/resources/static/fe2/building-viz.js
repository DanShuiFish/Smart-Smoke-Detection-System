(function () {
  var state = window.state || {};
  if (!state.viz) state.viz = { buildings: [], selectedBuilding: null, selectedFloor: null, selectedDevice: null };

  function el(id) { return document.getElementById(id); }
  function safeText(v, fallback) { if (v === null || v === undefined || String(v).trim() === "") return fallback || "--"; return String(v).trim(); }
  function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  var STATUS_CLASS = { ONLINE: "online", OFFLINE: "offline", ERROR: "error", INACTIVE: "inactive" };
  var STATUS_TEXT = { ONLINE: "\u5728\u7EBF", OFFLINE: "\u79BB\u7EBF", ERROR: "\u6545\u969C", INACTIVE: "\u672A\u6FC0\u6D3B" };

  async function apiRequest(path) {
    var token = localStorage.getItem("smoke_token") || localStorage.getItem("smartSmokeToken") || localStorage.getItem("token") || "";
    var headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    var resp = await fetch("/api/v1" + path, { headers: headers });
    if (resp.status === 401) throw new Error("\u672A\u767B\u5F55");
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

  function renderAll() { renderBuildingList(); renderMain(); renderDetail(); }

  function renderBuildingList() {
    var list = el("vizBuildingList"); if (!list) return;
    var html = "";
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
    list.querySelectorAll(".viz-building-header").forEach(function (hdr) {
      hdr.addEventListener("click", function () {
        var bName = hdr.getAttribute("data-building");
        state.viz.selectedBuilding = (state.viz.selectedBuilding === bName) ? null : bName;
        state.viz.selectedFloor = null; state.viz.selectedDevice = null;
        renderAll();
      });
    });
    list.querySelectorAll(".viz-floor-item").forEach(function (item) {
      item.addEventListener("click", function (e) {
        e.stopPropagation();
        state.viz.selectedFloor = item.getAttribute("data-floor");
        state.viz.selectedDevice = null;
        renderMain(); renderDetail();
      });
    });
  }

  function getCurrentBuilding() {
    if (!state.viz.selectedBuilding) return null;
    return (state.viz.buildings || []).find(function (b) { return b.name === state.viz.selectedBuilding; }) || null;
  }

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
      if (empty) { empty.style.display = "flex"; empty.innerHTML = '<strong>\u8BF7\u4ECE\u5DE6\u4FA7\u9009\u62E9\u4E00\u4E2A\u697C\u680B</strong><p>\u70B9\u51FB\u697C\u680B\u540D\u79F0\u5C55\u5F00\u697C\u5C42\u8BBE\u5907\u5206\u5E03</p>'; }
      return;
    }
    if (empty) empty.style.display = "none";
    if (statsBar) {
      statsBar.innerHTML = '<span class="viz-stat-item"><strong>' + escapeHtml(building.name) + '</strong></span>' +
        '<span class="sep">|</span>' +
        '<span class="viz-stat-item">\u603B\u6570 <strong>' + (building.total || 0) + '</strong></span>' +
        '<span class="viz-stat-item on">\u5728\u7EBF <strong>' + (building.online || 0) + '</strong></span>' +
        '<span class="viz-stat-item off">\u79BB\u7EBF <strong>' + (building.offline || 0) + '</strong></span>' +
        '<span class="viz-stat-item err">\u6545\u969C <strong>' + (building.error || 0) + '</strong></span>';
    }
    // Floor tabs
    var rawFloors2 = building.floors || [];
    var maxFN2 = 12;
    rawFloors2.forEach(function (f) { var m2 = String(f.name).match(/(\d+)/); if (m2) { var n2 = parseInt(m2[1]); if (n2 > maxFN2) maxFN2 = n2; } });
    var floorMap2 = {}; rawFloors2.forEach(function (f) { floorMap2[f.name] = f; });
    var floors = [];
    for (var fi2 = 1; fi2 <= maxFN2; fi2++) { var fn2 = fi2 + "\u5C42"; floors.push(floorMap2[fn2] || { name: fn2, total: 0, online: 0 }); }
    if (!state.viz.selectedFloor && floors.length > 0) state.viz.selectedFloor = floors[0].name;
    if (tabs) {
      tabs.innerHTML = floors.map(function (f) {
        var active = state.viz.selectedFloor === f.name ? " active" : "";
        return '<button class="viz-floor-tab' + active + '" data-floor="' + escapeHtml(f.name) + '">' + escapeHtml(f.name) + '</button>';
      }).join("");
    }

    // === 3D Building ===
    if (plan) {
      var allDevices = building.devices || [];
      var allFloors = floors;
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

      var THREE = window.THREE;
      if (!THREE) { plan.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;">3D\u5F15\u64CE\u52A0\u8F7D\u4E2D...</div>'; return; }
      plan.innerHTML = '';
      var cw = plan.clientWidth || 700, ch = plan.clientHeight || 500;
      var scene = new THREE.Scene();
      scene.background = new THREE.Color(0xe8ecf0);
      scene.fog = new THREE.Fog(0xe8ecf0, 60, 150);
      var camera = new THREE.PerspectiveCamera(50, cw / Math.max(ch, 1), 0.5, 120);
      var renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(cw, ch);
      renderer.shadowMap.enabled = true;
      plan.appendChild(renderer.domElement);
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      var sun = new THREE.DirectionalLight(0xffffff, 1.2);
      sun.position.set(15, 25, 10); sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 80;
      sun.shadow.camera.left = -25; sun.shadow.camera.right = 25;
      sun.shadow.camera.top = 25; sun.shadow.camera.bottom = -5;
      scene.add(sun);
      var fill = new THREE.DirectionalLight(0xdbeafe, 0.3); fill.position.set(-5, 8, -5); scene.add(fill);

      var STATUS_COLORS = { ONLINE: 0x00ff7f, OFFLINE: 0xff9100, ERROR: 0xff0040, INACTIVE: 0xffea00 };
      var devMeshes = [];
      var W = 2.6, D = 1.8, FLH = 2.8, CW = 1.2;

      function makeRoom(name, x, yBase, z, devs) {
        var isEmpty = !devs || devs.length === 0;
        var g = new THREE.Group(); g.position.set(x, yBase, z);
        var slab = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, 0.12, D - 0.05), new THREE.MeshPhongMaterial({ color: 0xf1f5f9 }));
        slab.position.y = 0.06; slab.castShadow = true; slab.receiveShadow = true; g.add(slab);
        var wc = isEmpty ? 0xd1d5db : 0x94a3b8;
        var wm = new THREE.MeshPhongMaterial({ color: wc, transparent: true, opacity: 0.3, depthWrite: false });
        [{ w: W, d: 0.08, x: 0, z: -D/2 }, { w: W, d: 0.08, x: 0, z: D/2 }, { w: 0.08, d: D, x: -W/2, z: 0 }, { w: 0.08, d: D, x: W/2, z: 0 }].forEach(function (p) {
          var w = new THREE.Mesh(new THREE.BoxGeometry(p.w, FLH, p.d), wm);
          w.position.set(p.x, FLH/2, p.z); w.castShadow = true; w.receiveShadow = true; g.add(w);
        });
        (devs || []).forEach(function (d, di) {
          var st = (d.status || "").toUpperCase(); var sc = STATUS_COLORS[st] || 0x94a3b8; var isAlarm = st === "ERROR";
          var px = (di % 3 - 1) * 0.7, pz = Math.floor(di / 3) * 0.5 - 0.3;
          var base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.18, 16), new THREE.MeshPhongMaterial({ color: 0xf8fafc, emissive: 0x333333, emissiveIntensity: 0.2 }));
          base.position.set(px, 0.22, pz); base.castShadow = true; g.add(base);
          var sphere = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), new THREE.MeshPhongMaterial({ color: sc, emissive: sc, emissiveIntensity: isAlarm ? 1.5 : 1.0 }));
          sphere.position.set(px, 0.38, pz); sphere.castShadow = true;
          sphere.userData = { device: d, alarm: isAlarm }; g.add(sphere); devMeshes.push(sphere);
          var ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 16), new THREE.MeshPhongMaterial({ color: sc, emissive: sc, emissiveIntensity: 0.8, transparent: true, opacity: 0.8 }));
          ring.position.set(px, 0.22, pz); ring.rotation.x = Math.PI / 2; g.add(ring);
        });
        // Room label
        var labelCanvas = document.createElement('canvas'); labelCanvas.width = 192; labelCanvas.height = 72;
        var ct = labelCanvas.getContext('2d');
        ct.fillStyle = 'rgba(255,255,255,0.85)'; ct.fillRect(0, 0, 192, 72);
        ct.strokeStyle = '#2563eb'; ct.lineWidth = 3; ct.strokeRect(3, 3, 186, 66);
        ct.fillStyle = '#1e293b'; ct.font = 'bold 28px sans-serif'; ct.textAlign = 'center'; ct.textBaseline = 'middle';
        ct.fillText(name, 96, 36);
        var labelTex = new THREE.CanvasTexture(labelCanvas);
        var labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true }));
        labelSprite.position.set(x, yBase + FLH * 0.75, z); labelSprite.scale.set(1.5, 0.56, 1); scene.add(labelSprite);
        scene.add(g);
        return g;
      }

      var buildingHeight = allFloors.length * (FLH + 0.3) + 1;
      var maxRow = 1;
      for (var fi3 = 0; fi3 < allFloors.length; fi3++) { var fr = floorRooms[allFloors[fi3].name] || {left:[],right:[]}; var m2 = Math.ceil(Math.max(fr.left.length, fr.right.length) / 2); if (m2 > maxRow) maxRow = m2; }
      var totalD = (D + 0.4) * maxRow;
      var grass = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshPhongMaterial({ color: 0x4ade80 }));
      grass.rotation.x = -Math.PI / 2; grass.position.y = -0.5; grass.receiveShadow = true; scene.add(grass);
      var grid2 = new THREE.GridHelper(50, 30, 0x22c55e, 0x4ade80); grid2.position.y = -0.48; scene.add(grid2);
      var bw2=(2.6+0.2)*2+1.2+0.3,bd3=Math.max(6,(1.8+0.4)*1)+0.5;
      var plaza = new THREE.Mesh(new THREE.PlaneGeometry(bw2+1.5,3),new THREE.MeshPhongMaterial({color:0x64748b})); plaza.rotation.x=-Math.PI/2;plaza.position.set(0,-0.48,-bd3/2-2);plaza.receiveShadow=true;scene.add(plaza);
      var tm=new THREE.MeshPhongMaterial({color:0x22c55e}),trm=new THREE.MeshPhongMaterial({color:0x92400e});
      [[-bw2/2-2,-bd3/2-0.5],[bw2/2+2,-bd3/2-0.5],[-bw2/2-3,bd3/2+0.5],[bw2/2+3,bd3/2+0.5],[-bw2/2-1.5,0],[bw2/2+1.5,0]].forEach(function(tp){var tr=new THREE.Mesh(new THREE.CylinderGeometry(.15,.2,1.5,8),trm);tr.position.set(tp[0],.25,tp[1]);tr.castShadow=true;scene.add(tr);var lf=new THREE.Mesh(new THREE.ConeGeometry(.8,1.8,8),tm);lf.position.set(tp[0],1.5,tp[1]);lf.castShadow=true;scene.add(lf);});
      // Elevator
      var elevGeo = new THREE.CylinderGeometry(0.55, 0.55, buildingHeight, 16);
      var elev = new THREE.Mesh(elevGeo, new THREE.MeshPhongMaterial({ color: 0x64748b }));
      elev.position.set(0, buildingHeight / 2, -totalD / 2 - 0.5); elev.castShadow = true; scene.add(elev);
      var elevRing = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.06, 8, 16), new THREE.MeshPhongMaterial({ color: 0x3b82f6, emissive: 0x2563eb, emissiveIntensity: 0.5 }));
      elevRing.rotation.x = Math.PI / 2; elevRing.position.copy(elev.position); scene.add(elevRing);
      // Build floors
      allFloors.forEach(function (f, fi4) {
        var yBase = fi4 * (FLH + 0.3) + 0.1;
        var fr = floorRooms[f.name] || { left: [], right: [], devices: {} };
        var corrSlab = new THREE.Mesh(new THREE.BoxGeometry(CW - 0.1, 0.1, totalD - 0.5), new THREE.MeshPhongMaterial({ color: 0x94a3b8 }));
        corrSlab.position.set(0, yBase + 0.05, 0); corrSlab.receiveShadow = true; scene.add(corrSlab);
        var lx = -(CW / 2 + W / 2);
        fr.left.forEach(function (rn, i) { makeRoom(rn, lx - (i % 2) * (W + 0.2), yBase, -Math.floor(i / 2) * (D + 0.4), fr.devices[rn] || []); });
        var rx = CW / 2 + W / 2;
        fr.right.forEach(function (rn, i) { makeRoom(rn, rx + (i % 2) * (W + 0.2), yBase, -Math.floor(i / 2) * (D + 0.4), fr.devices[rn] || []); });
      });
      var roof = new THREE.Mesh(new THREE.BoxGeometry((W + 0.2) * 2 + CW + 1, 0.15, totalD + 1), new THREE.MeshPhongMaterial({ color: 0x64748b }));
      roof.position.y = buildingHeight; roof.castShadow = true; roof.receiveShadow = true; scene.add(roof);

      // === Glass curtain wall facade ===
      var bw = (W + 0.2) * 2 + CW + 0.3, bd2 = totalD + 0.5;
      var glassMat = new THREE.MeshPhysicalMaterial({ color: 0x87ceeb, transparent: true, opacity: 0.04, roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
      var frameMat2 = new THREE.MeshPhongMaterial({ color: 0x475569 });
      // Four glass walls
      [{w:bw, d:bd2, ry:0, px:0, pz:-bd2/2}, {w:bw, d:bd2, ry:0, px:0, pz:bd2/2}, {w:bd2, d:bw, ry:Math.PI/2, px:-bw/2, pz:0}, {w:bd2, d:bw, ry:Math.PI/2, px:bw/2, pz:0}].forEach(function(s) {
        var panel = new THREE.Mesh(new THREE.PlaneGeometry(s.w, buildingHeight), glassMat);
        panel.position.set(s.px, buildingHeight/2, s.pz);
        panel.rotation.y = s.ry;
        scene.add(panel);
      });
      // Corner pillars
      [[-bw/2,-bd2/2],[bw/2,-bd2/2],[-bw/2,bd2/2],[bw/2,bd2/2]].forEach(function(c) {
        var p = new THREE.Mesh(new THREE.BoxGeometry(0.08, buildingHeight, 0.08), frameMat2);
        p.position.set(c[0], buildingHeight/2, c[1]);
        scene.add(p);
      });
      // Horizontal frame bands
      for (var y = FLH + 0.3; y < buildingHeight; y += (FLH + 0.3) * 2) {
        [[0,-bd2/2,0],[0,bd2/2,0],[-bw/2,0,Math.PI/2],[bw/2,0,Math.PI/2]].forEach(function(b) {
          var band = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.05, 0.05), frameMat2);
          band.position.set(b[0], y, b[1]);
          band.rotation.y = b[2];
          scene.add(band);
        });
      }
      // Roof frame
      var roofEdge = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.1, 0.05, 0.05), frameMat2);
      roofEdge.position.set(0, buildingHeight, -bd2/2); scene.add(roofEdge);
      roofEdge = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.1, 0.05, 0.05), frameMat2);
      roofEdge.position.set(0, buildingHeight, bd2/2); scene.add(roofEdge);

      var buildingCenter = new THREE.Vector3(0, buildingHeight / 2, 0);
      var camDist = Math.max(buildingHeight * 1.5, 16);
      camera.position.set(camDist * 0.6, buildingHeight * 0.85, camDist * 0.8);
      camera.lookAt(buildingCenter);

      // Manual orbit: horizontal=rotate, vertical=slide up/down
      var orbitRadius = camDist, orbitTheta = 0.8, orbitPhi = 1.2, viewY = buildingCenter.y;
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
      var dirV = new THREE.Vector3().subVectors(camera.position, new THREE.Vector3(0, viewY, 0));
      orbitRadius = dirV.length();
      orbitTheta = Math.atan2(dirV.z, dirV.x);
      updateCameraPosition();

      renderer.domElement.addEventListener("mousedown", function (e) { isDragging = true; px = e.clientX; py = e.clientY; e.preventDefault(); });
      window.addEventListener("mouseup", function () { isDragging = false; });
      window.addEventListener("mousemove", function (e) {
        if (!isDragging) return;
        orbitTheta -= (e.clientX - px) * 0.005;
        viewY += (e.clientY - py) * 0.05;
        viewY = Math.max(0, Math.min(buildingHeight, viewY));
        px = e.clientX; py = e.clientY;
        updateCameraPosition();
      });
      renderer.domElement.addEventListener("wheel", function (e) {
        e.preventDefault();
        orbitRadius += e.deltaY * 0.02;
        orbitRadius = Math.max(4, Math.min(50, orbitRadius));
        updateCameraPosition();
      });

      // Floor zoom
      window.zoomToFloor3D = function (floorName) {
        var fi = -1;
        for (var i = 0; i < allFloors.length; i++) { if (allFloors[i].name === floorName) { fi = i; break; } }
        if (fi < 0) return;
        if (state.viz.selectedFloor !== floorName) state.viz.selectedFloor = floorName;
        var ty = fi * (FLH + 0.3) + FLH / 2;
        var startRadius = orbitRadius, startPhi = orbitPhi, startTheta = orbitTheta, startViewY = viewY;
        var targetPos = new THREE.Vector3(7, ty + 0.3, 2);
        var d2 = new THREE.Vector3().subVectors(targetPos, new THREE.Vector3(0, ty, 0));
        var endRadius = d2.length(), endPhi = Math.acos(Math.max(-1, Math.min(1, d2.y / endRadius))), endTheta = Math.atan2(d2.z, d2.x), endViewY = ty;
        var st = Date.now();
        function step() {
          var t = Math.min((Date.now() - st) / 800, 1);
          var e = t < 0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
          orbitRadius = startRadius + (endRadius - startRadius) * e;
          orbitPhi = startPhi + (endPhi - startPhi) * e;
          orbitTheta = startTheta + (endTheta - startTheta) * e;
          viewY = startViewY + (endViewY - startViewY) * e;
          updateCameraPosition();
          if (t < 1) requestAnimationFrame(step);
        }
        step();
      };

      // Raycaster
      var raycaster = new THREE.Raycaster(), mouse = new THREE.Vector2();
      renderer.domElement.addEventListener("click", function (e) {
        var rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        var hits = raycaster.intersectObjects(devMeshes);
        if (hits.length > 0 && hits[0].object.userData.device) {
          state.viz.selectedDevice = hits[0].object.userData.device;
          renderDetail();
        }
      });

      function animate() {
        requestAnimationFrame(animate);
        devMeshes.forEach(function (m) { var ud = m.userData; if (ud.alarm || (ud.device && (ud.device.status||'').toUpperCase()==='OFFLINE')) { m.material.emissiveIntensity = ud.alarm ? 0.4+0.3*Math.sin(Date.now()*0.006) : 0.3+0.2*Math.sin(Date.now()*0.003); } });
        elevRing.rotation.z += 0.01;
        elevRing.material.emissiveIntensity = 0.4 + 0.2 * Math.sin(Date.now() * 0.003);
        renderer.render(scene, camera);
      }
      animate();

      var rh = function () { var w = plan.clientWidth, h = plan.clientHeight; if (w && h) { camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); } };
      window.addEventListener("resize", rh);
      plan._rh = rh;
    }

    // Floor tab events
    if (tabs) {
      tabs.querySelectorAll(".viz-floor-tab").forEach(function (tab) {
        tab.addEventListener("click", function () {
          state.viz.selectedFloor = this.getAttribute("data-floor");
          state.viz.selectedDevice = null;
          if (window.zoomToFloor3D) window.zoomToFloor3D(state.viz.selectedFloor);
          renderDetail();
        });
      });
    }
  }

  function renderDetail() {
    var body = el("vizDetailBody"); if (!body) return;
    var d = state.viz.selectedDevice;
    if (!d) { body.innerHTML = '<p class="viz-detail-placeholder">\u70B9\u51FB\u8BBE\u5907\u56FE\u6807\u67E5\u770B\u8BE6\u60C5</p>'; return; }
    var st = (d.status || "").toUpperCase();
    var sc = STATUS_CLASS[st] || "inactive";
    var loc = [d.locationBuilding, d.locationFloor, d.locationRoom].filter(Boolean).join(" ");
    body.innerHTML =
      '<div style="text-align:center;margin-bottom:16px;"><span class="viz-detail-status ' + sc + '">' + (STATUS_TEXT[st] || st) + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">\u8BBE\u5907\u540D\u79F0</span><span class="value">' + escapeHtml(safeText(d.deviceName, d.deviceId)) + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">\u8BBE\u5907\u7F16\u53F7</span><span class="value">' + escapeHtml(d.deviceId || "--") + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">\u5B89\u88C5\u4F4D\u7F6E</span><span class="value">' + escapeHtml(safeText(loc, "--")) + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">\u70DF\u96FE\u6D53\u5EA6</span><span class="value">' + (d.smokeConcentration != null ? Number(d.smokeConcentration).toFixed(3) + " mg/m3" : "--") + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">\u6E29\u5EA6</span><span class="value">' + (d.temperature != null ? Number(d.temperature).toFixed(1) + " C" : "--") + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">\u7535\u91CF</span><span class="value">' + (d.battery != null ? d.battery + "%" : "--") + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">\u4FE1\u53F7\u5F3A\u5EA6</span><span class="value">' + (d.signalStrength != null ? d.signalStrength + " dBm" : "--") + '</span></div>' +
      '<div class="viz-detail-row"><span class="label">\u6700\u540E\u5FC3\u8DF3</span><span class="value">' + (d.lastHeartbeat || "--") + '</span></div>';
  }

  window.refreshViz = loadBuildingTree;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(loadBuildingTree, 100); });
  } else { setTimeout(loadBuildingTree, 100); }
  document.addEventListener("DOMContentLoaded", function () {
    var btn = el("btnRefreshViz"); if (btn) btn.addEventListener("click", loadBuildingTree);
    var search = el("vizSearchInput"); if (search) search.addEventListener("input", function () { });
  });
})();

(function () {
  function connectVizWs() {
    try {
      var token = localStorage.getItem("smoke_token") || localStorage.getItem("smartSmokeToken") || localStorage.getItem("token") || "";
      var wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/ws/alarm" + (token ? "?token=" + encodeURIComponent(token) : "");
      var socket = new WebSocket(wsUrl);
      socket.onopen = function () {};
      socket.onclose = function () { setTimeout(connectVizWs, 5000); };
      socket.onmessage = function (event) {
        try {
          var payload = JSON.parse(event.data);
          var kind = payload.kind || "";
          if (kind === "realtime" || kind === "status_change" || kind === "device_online" || kind === "device_offline" || kind === "alarm" || kind === "heartbeat") {
            if (window.refreshViz) window.refreshViz();
          }
        } catch (e) {}
      };
    } catch (e) { setTimeout(connectVizWs, 5000); }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(connectVizWs, 500); });
  } else { setTimeout(connectVizWs, 500); }
})();