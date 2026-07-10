const gState = window.state;
const THREE = window.THREE;
const { OrbitControls } = window.THREE;


const BW = 280, BD = 180, FH = 28, FG = 12, FU = FH + FG;
let scene, camera, rdr, ldr, ctrl, group = null, devObjs = [], rc, ptr;

function init(container) {
  scene = new THREE.Scene(); scene.background = new THREE.Color(0xf8fafc);
  camera = new THREE.PerspectiveCamera(40, container.clientWidth/container.clientHeight, 1, 2000);
  camera.position.set(450, 350, 450);
  rdr = new THREE.WebGLRenderer({ antialias: true });
  rdr.setSize(container.clientWidth, container.clientHeight);
  rdr.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.appendChild(rdr.domElement);
  ldr = new THREE.CSS2DRenderer();
  ldr.setSize(container.clientWidth, container.clientHeight);
  ldr.domElement.style.position = "absolute"; ldr.domElement.style.top = "0"; ldr.domElement.style.left = "0";
  ldr.domElement.style.pointerEvents = "none";
  container.appendChild(ldr.domElement);
  ctrl = new OrbitControls(camera, rdr.domElement); ctrl.target.set(0, 0, 0); ctrl.update();
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(200, 300, 200); scene.add(dl);
  const fl = new THREE.DirectionalLight(0xffffff, 0.3); fl.position.set(-200, 100, -200); scene.add(fl);
  const gh = new THREE.GridHelper(600, 20, 0x94a3b8, 0xe2e8f0); gh.position.y = -20; scene.add(gh);
  rc = new THREE.Raycaster(); ptr = new THREE.Vector2();
  addEventListener("resize", () => { const w=container.clientWidth,h=container.clientHeight; camera.aspect=w/h; camera.updateProjectionMatrix(); rdr.setSize(w,h); ldr.setSize(w,h); });
  rdr.domElement.addEventListener("click", onClick);
  rdr.domElement.addEventListener("mousemove", onHover);
  animate();
}

const STATUS_COLORS = { ONLINE: 0x059669, OFFLINE: 0x94a3b8, ERROR: 0xdc2626 };

function build(devices, floorNames) {
  if (group) { scene.remove(group); group.traverse(c => { if(c.geometry)c.geometry.dispose(); if(c.material)c.material.dispose(); }); }
  group = new THREE.Group(); devObjs = [];
  if (!floorNames || !floorNames.length) { scene.add(group); return; }
  const N = floorNames.length, TH = N * FU;
  const byFloor = {};
  (devices||[]).forEach(d => { const f = String(d.locationFloor||"").trim(); if(f){if(!byFloor[f])byFloor[f]=[]; byFloor[f].push(d);} });
  floorNames.forEach((nm, i) => {
    const cy = i * FU + FH/2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(BW,FH,BD), new THREE.MeshPhysicalMaterial({color:0xe2e8f0,roughness:0.6,metalness:0.1,transparent:true,opacity:0.9}));
    m.position.y = cy; m.userData = { floor: nm, idx: i }; group.add(m);
    const el = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({color:0x94a3b8,transparent:true,opacity:0.3}));
    el.position.y = cy; group.add(el);
    // Floor label
    const d = document.createElement("div"); d.textContent = nm; Object.assign(d.style, {color:"#475569",fontSize:"14px",fontWeight:"600",background:"rgba(255,255,255,0.85)",padding:"2px 10px",borderRadius:"4px",border:"1px solid #e2e8f0"});
    const lbl = new THREE.CSS2DObject(d); lbl.position.set(-BW/2-40, cy, 0); group.add(lbl);
    // Devices
    const fds = byFloor[nm] || [];
    fds.forEach((dev, di) => {
      const nf = fds.length, sx = nf>1?BW/(nf+1):0, x = nf>1?-BW/2+sx+di*sx:0;
      addDev(dev, x, cy+FH/2, 0);
    });
  });
  // Facade
  const fm = new THREE.MeshPhysicalMaterial({color:0xcbd5e1,transparent:true,opacity:0.08,side:THREE.DoubleSide});
  [-1,1].forEach(s => { const w = new THREE.Mesh(new THREE.PlaneGeometry(BD,TH), fm); w.position.set(s*BW/2, TH/2-FG/2, 0); w.rotation.y = s*Math.PI/2; group.add(w); });
  const bw = new THREE.Mesh(new THREE.PlaneGeometry(BW,TH), fm); bw.position.set(0, TH/2-FG/2, -BD/2); group.add(bw);
  scene.add(group);
  const dd = Math.max(BW, TH, BD) * 1.4;
  camera.position.set(dd, dd*0.55, dd); ctrl.target.set(0, TH/2-FG/2, 0); ctrl.update();
}

function addDev(dev, x, y, z) {
  const st = String(dev.status||"").toUpperCase();
  const al = state&&window.state.fp&&window.state.fp.alarmIds&&window.state.fp.alarmIds.has(String(dev.id));
  const c = al ? 0xef4444 : (STATUS_COLORS[st] || 0x94a3b8);
  const m = new THREE.Mesh(new THREE.SphereGeometry(7,16,16), new THREE.MeshPhysicalMaterial({color:c,roughness:0.3,metalness:0.1,emissive:c,emissiveIntensity:al?0.5:0.1}));
  m.position.set(x,y,z); m.userData = { device: dev, isAlert: al || false }; group.add(m);
  const d = document.createElement("div"); d.textContent = dev.deviceName||dev.deviceId; Object.assign(d.style, {color:"#1e293b",fontSize:"11px",fontWeight:"500",background:"rgba(255,255,255,0.9)",padding:"1px 6px",borderRadius:"3px",border:"1px solid #e2e8f0",pointerEvents:"none",whiteSpace:"nowrap"});
  const lbl = new THREE.CSS2DObject(d); lbl.position.set(x,y+14,z); group.add(lbl);
  if (al) {
    const rg = new THREE.Mesh(new THREE.RingGeometry(9,13,24), new THREE.MeshBasicMaterial({color:0xef4444,transparent:true,opacity:0.5,side:THREE.DoubleSide}));
    rg.position.set(x,y,z); rg.lookAt(0,1,0); rg.userData = { spd: 1+Math.random()*0.5 };
    group.add(rg); devObjs.push({ mesh: m, device: dev, element: d, ring: rg });
  } else devObjs.push({ mesh: m, device: dev, element: d });
}

function animate() {
  requestAnimationFrame(animate);
  devObjs.forEach(o => { if(o.ring) { const s = 1+0.3*Math.sin(Date.now()*0.003*(o.ring.userData.spd||1)); o.ring.scale.set(s,s,s); o.ring.material.opacity = 0.3+0.3*Math.sin(Date.now()*0.003*(o.ring.userData.spd||1)); } });
  ctrl.update(); rdr.render(scene, camera); ldr.render(scene, camera);
}

function getHit(event) {
  const b = rdr.domElement.getBoundingClientRect();
  ptr.x = ((event.clientX-b.left)/b.width)*2-1;
  ptr.y = -((event.clientY-b.top)/b.height)*2+1;
  rc.setFromCamera(ptr, camera);
  return rc.intersectObjects(devObjs.map(o=>o.mesh));
}

function onClick(event) {
  const hits = getHit(event);
  if (hits.length && hits[0].object.userData.device) showTooltip(hits[0].object.userData.device, event);
  else hideTooltip();
}

function onHover(event) {
  const hits = getHit(event);
  rdr.domElement.style.cursor = hits.length ? "pointer" : "default";
  devObjs.forEach(o => { if(o.mesh.material.emissiveIntensity!==undefined) o.mesh.material.emissiveIntensity = o.mesh.userData.isAlert?0.5:0.1; });
  if (hits.length && hits[0].object.material.emissiveIntensity!==undefined) hits[0].object.material.emissiveIntensity = 0.8;
}

function showTooltip(dev, event) {
  const t = document.getElementById("fpTooltip"); if(!t) return;
  const st = String(dev.status||"").toUpperCase(), sl = st==="ONLINE"?"在线":st==="OFFLINE"?"离线":st==="ERROR"?"故障":"未知";
  const tc = st==="ONLINE"?"ok":st==="OFFLINE"?"warn":st==="ERROR"?"danger":"info";
  const loc = [dev.locationBuilding,dev.locationFloor,dev.locationRoom].filter(Boolean).join(" ");
  const smoke = (dev.smokeConcentration!=null) ? `<div class="fp-tooltip-row">烟雾浓度 <strong>${Number(dev.smokeConcentration).toFixed(3)} mg/m³</strong></div>` : "";
  const temp = (dev.temperature!=null) ? `<div class="fp-tooltip-row">温度 <strong>${Number(dev.temperature).toFixed(1)} °C</strong></div>` : "";
  t.innerHTML = `<div class="fp-tooltip-title">${(dev.deviceName||dev.deviceId)} <span class="status-tag ${tc}">${sl}</span></div>` +
    `<div class="fp-tooltip-row">编号 <strong>${dev.deviceId}</strong></div>` +
    `<div class="fp-tooltip-row">位置 <strong>${loc}</strong></div>${smoke}${temp}` +
    `<div class="fp-tooltip-row">电量 <strong>${dev.battery!=null?dev.battery+"%":"--"}</strong></div>` +
    `<div class="fp-tooltip-row">信号 <strong>${dev.signalStrength!=null?dev.signalStrength+" dBm":"--"}</strong></div>`;
  const cr = document.getElementById("threeContainer").getBoundingClientRect();
  t.style.left = Math.max(5, Math.min(event.clientX-cr.left-t.offsetWidth/2, cr.width-t.offsetWidth-5))+"px";
  t.style.top = Math.max(5, event.clientY-cr.top-t.offsetHeight-15)+"px";
  t.classList.remove("hidden");
}

function hideTooltip() { const t=document.getElementById("fpTooltip"); if(t) t.classList.add("hidden"); }

window.renderThreeBuilding = function(name, floorNames, devices) {
  const c = document.getElementById("threeContainer"); if(!c) return;
  if(!scene) init(c);
  const ee = document.getElementById("fpEmpty");
  if(ee) ee.style.display="none";
  build(devices, floorNames);
};

window.updateThreeDevice = function(payload) {
  const did = String(payload.deviceId||payload.id||"");
  const o = devObjs.find(x => String(x.device.deviceId)===did || String(x.device.id)===did);
  if(!o) return;
  if(payload.status) o.device.status=payload.status;
  if(payload.smokeConcentration!==undefined) o.device.smokeConcentration=payload.smokeConcentration;
  if(payload.temperature!==undefined) o.device.temperature=payload.temperature;
  const st = String(o.device.status||"").toUpperCase();
  const al = payload.kind==="alarm";
  const c = al ? 0xef4444 : (STATUS_COLORS[st] || 0x94a3b8);
  o.mesh.material.color.setHex(c); o.mesh.material.emissive.setHex(c);
  o.mesh.material.emissiveIntensity = al ? 0.5 : 0.1;
  o.mesh.userData.isAlert = al;
  o.element.textContent = o.device.deviceName||o.device.deviceId;
};

