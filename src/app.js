import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// Labels use manual screen-space projection (no CSS2DRenderer)

// ============================================================
// DATA LOADING & BASIC ANALYSIS
// ============================================================
const resp = await fetch('./beam_model.json');
const model = await resp.json();
const { nodes, beams } = model;

const nodeMap = new Map();
nodes.forEach(n => nodeMap.set(n.id, n));
const nIdx = new Map(); nodes.forEach((n,i) => nIdx.set(n.id, i));

let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity, minZ=Infinity, maxZ=-Infinity;
let cx=0, cy=0, cz=0;
nodes.forEach(n => {
  minX=Math.min(minX,n.x); maxX=Math.max(maxX,n.x);
  minY=Math.min(minY,n.y); maxY=Math.max(maxY,n.y);
  minZ=Math.min(minZ,n.z); maxZ=Math.max(maxZ,n.z);
  cx+=n.x; cy+=n.y; cz+=n.z;
});
cx/=nodes.length; cy/=nodes.length; cz/=nodes.length;

const degree = new Map();
nodes.forEach(n => degree.set(n.id, 0));
beams.forEach(b => {
  degree.set(b.node_start, (degree.get(b.node_start)||0)+1);
  degree.set(b.node_end, (degree.get(b.node_end)||0)+1);
});

const beamLengths = beams.map(b => {
  const a = nodeMap.get(b.node_start), e = nodeMap.get(b.node_end);
  return Math.sqrt((a.x-e.x)**2 + (a.y-e.y)**2 + (a.z-e.z)**2);
});
const avgLen = beamLengths.reduce((s,l)=>s+l,0)/beamLengths.length;
const minLen = Math.min(...beamLengths);
const maxLen = Math.max(...beamLengths);
const totLen = beamLengths.reduce((s,l)=>s+l,0);

document.getElementById('s-nodes').textContent = nodes.length;
document.getElementById('s-beams').textContent = beams.length;
document.getElementById('s-spanx').textContent = (maxX-minX).toFixed(1);
document.getElementById('s-height').textContent = (maxZ-minZ).toFixed(1);
document.getElementById('d-xrange').textContent = `[${minX.toFixed(1)}, ${maxX.toFixed(1)}]`;
document.getElementById('d-yrange').textContent = `[${minY.toFixed(1)}, ${maxY.toFixed(1)}]`;
document.getElementById('d-zrange').textContent = `[${minZ.toFixed(1)}, ${maxZ.toFixed(1)}]`;
document.getElementById('d-centroid').textContent = `(${cx.toFixed(1)}, ${cy.toFixed(1)}, ${cz.toFixed(1)})`;
document.getElementById('d-avglen').textContent = avgLen.toFixed(3) + ' m';
document.getElementById('d-minmaxlen').textContent = `${minLen.toFixed(3)} / ${maxLen.toFixed(3)} m`;
document.getElementById('d-totlen').textContent = totLen.toFixed(1) + ' m';
document.getElementById('d-dof').textContent = nodes.length * 6;

// ============================================================
// THREE.JS SCENE
// ============================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);
scene.fog = new THREE.FogExp2(0x0a0a0f, 0.004);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 500);
camera.position.set(0, -60, 30);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Label overlay container
const labelOverlay = document.createElement('div');
labelOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
container.appendChild(labelOverlay);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.target.set(cx, cz, -cy);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;

scene.add(new THREE.AmbientLight(0x334466, 1.5));
const dL1 = new THREE.DirectionalLight(0xffffff, 0.8); dL1.position.set(30,50,40); scene.add(dL1);
const dL2 = new THREE.DirectionalLight(0x4466aa, 0.4); dL2.position.set(-20,-30,20); scene.add(dL2);
scene.add(new THREE.GridHelper(100, 50, 0x1a1a2e, 0x111122));

function m2t(x, y, z) { return new THREE.Vector3(x, z, -y); }

// ============================================================
// BEAM & NODE MESHES
// ============================================================
const defaultBeamColor = new THREE.Color(0.35, 0.55, 0.9);
const defaultNodeColor = new THREE.Color(0.6, 0.75, 1.0);

const beamGroup = new THREE.Group(); scene.add(beamGroup);
const nodeGroup = new THREE.Group(); scene.add(nodeGroup);
let nlCreated = false, blCreated = false;
let nlVisible = false, blVisible = false;
const nlDivs = [], blDivs = [];

const beamMeshes = [];
const baseMat = new THREE.MeshPhongMaterial({ color: defaultBeamColor, shininess: 30, transparent: true, opacity: 0.85 });

beams.forEach((b, i) => {
  const ns = nodeMap.get(b.node_start), ne = nodeMap.get(b.node_end);
  if (!ns||!ne) return;
  const p1 = m2t(ns.x, ns.y, ns.z), p2 = m2t(ne.x, ne.y, ne.z);
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  const geo = new THREE.CylinderGeometry(0.04, 0.04, len, 4, 1);
  const mat = baseMat.clone();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
  mesh.userData = { type:'beam', id:b.id, si:b.node_start, ei:b.node_end, length:beamLengths[i] };
  beamMeshes.push(mesh);
  beamGroup.add(mesh);
});

const nodeMeshes = [];
const nodeIdToMeshIdx = new Map();
const sphereGeo = new THREE.SphereGeometry(0.12, 8, 6);

nodes.forEach((n, idx) => {
  const mat = new THREE.MeshPhongMaterial({ color: defaultNodeColor, shininess: 60, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(sphereGeo, mat);
  const pos = m2t(n.x, n.y, n.z);
  mesh.position.copy(pos);
  mesh.userData = { type:'node', id:n.id, x:n.x, y:n.y, z:n.z, degree:degree.get(n.id) };
  nodeMeshes.push(mesh);
  nodeIdToMeshIdx.set(n.id, idx);
  nodeGroup.add(mesh);
});

// ============================================================
// STATE
// ============================================================
const supports = new Map();
const pointLoads = new Map();
let selfWeightEnabled = false;
let liveLoadIntensity = 0;
let windLoad = { pressure: 0, dir: 'x' };
let currentMode = 'view';
let selectedNodeId = null;
let selectedBeamIdx = null;
let femResults = null;
let currentResultView = 'deformed';
let currentTableTab = 'nodes';
let tableSortCol = 0;
let tableSortDir = 1; // 1=asc, -1=desc
let newMemberNodes = [];
const beamSections = new Map(); // beamIndex -> {D, t} overrides
const perimeterSet = new Set(); // beam indices marked as perimeter

// Member groups
const memberGroups = new Map([
  ['Default',       { color: '#5a8de6', beamIndices: new Set() }],
  ['Perimeter',     { color: '#ffaa44', beamIndices: new Set() }],
  ['Cross-Section', { color: '#66ff88', beamIndices: new Set() }],
]);
const beamGroupMap = new Map(); // beamIndex -> group name
let groupColoringEnabled = true;

// Load cases
const loadCases = [
  { id: 1, name: 'Dead Load', nature: 'dead', selfWeight: false, liveLoadIntensity: 0, pointLoads: new Map(), windLoad: { pressure: 0, dir: 'x' } }
];
let activeLoadCaseIdx = 0;
let nextLoadCaseId = 2;

// CFD state
let cfdResults = null;
let cfdGrid = null;
let cfdEnvelope = null;
let cfdWorker = null;
let cfdRunning = false;
let cfdResiduals = [];
let cfdCurrentView = 'vectors';
const cfdGroup = new THREE.Group(); scene.add(cfdGroup);

const supportGroup = new THREE.Group(); scene.add(supportGroup);
const loadGroup = new THREE.Group(); scene.add(loadGroup);
const resultGroup = new THREE.Group(); scene.add(resultGroup);

// Load sub-groups for per-type visibility
const loadSubGroups = { sw: new THREE.Group(), ll: new THREE.Group(), pl: new THREE.Group(), wl: new THREE.Group() };
Object.values(loadSubGroups).forEach(g => loadGroup.add(g));

// ============================================================
// CHS SECTION PROPERTIES
// ============================================================
// ============================================================
// MEMBER GROUP FUNCTIONS
// ============================================================
function getBeamGroupColor(bi) {
  const name = beamGroupMap.get(bi) || 'Default';
  const grp = memberGroups.get(name) || memberGroups.get('Default');
  return new THREE.Color(grp.color);
}

function applyGroupColorToBeam(bi) {
  if (!beamMeshes[bi]) return;
  if (groupColoringEnabled && !femResults) {
    beamMeshes[bi].material.color.copy(getBeamGroupColor(bi));
  }
}

function applyAllGroupColors() {
  beamMeshes.forEach((m, bi) => {
    if (!m) return;
    if (groupColoringEnabled) m.material.color.copy(getBeamGroupColor(bi));
    else m.material.color.copy(defaultBeamColor);
  });
}

function assignBeamToGroup(bi, groupName) {
  // Remove from old group
  const oldName = beamGroupMap.get(bi) || 'Default';
  const oldGrp = memberGroups.get(oldName);
  if (oldGrp) oldGrp.beamIndices.delete(bi);
  // Add to new group
  if (groupName === 'Default') {
    beamGroupMap.delete(bi);
  } else {
    beamGroupMap.set(bi, groupName);
  }
  const newGrp = memberGroups.get(groupName);
  if (newGrp && groupName !== 'Default') newGrp.beamIndices.add(bi);
  applyGroupColorToBeam(bi);
}

window.createMemberGroup = function(name, hexColor) {
  if (!name || memberGroups.has(name)) return;
  memberGroups.set(name, { color: hexColor || '#ffffff', beamIndices: new Set() });
  updateGroupUI();
};

window.deleteMemberGroup = function(name) {
  if (name === 'Default' || !memberGroups.has(name)) return;
  const grp = memberGroups.get(name);
  grp.beamIndices.forEach(bi => {
    beamGroupMap.delete(bi);
    applyGroupColorToBeam(bi);
  });
  memberGroups.delete(name);
  updateGroupUI();
};

window.toggleGroupColoring = function(btn) {
  btn.classList.toggle('active');
  groupColoringEnabled = btn.classList.contains('active');
  if (!femResults) applyAllGroupColors();
};

function updateGroupUI() {
  const list = document.getElementById('group-list');
  if (!list) return;
  list.innerHTML = '';
  memberGroups.forEach((grp, name) => {
    const count = name === 'Default'
      ? beams.filter((b, i) => b && !beamGroupMap.has(i)).length
      : grp.beamIndices.size;
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:5px;background:rgba(30,35,55,0.5);margin-bottom:3px;';
    row.innerHTML = `<span style="width:12px;height:12px;border-radius:2px;background:${grp.color};flex-shrink:0;"></span>
      <span style="flex:1;font-size:10px;color:#cce;">${name}</span>
      <span style="font-size:9px;color:#778;font-family:monospace;">${count}</span>
      ${name !== 'Default' ? `<button onclick="deleteMemberGroup('${name}')" style="background:none;border:none;color:#866;cursor:pointer;font-size:11px;padding:0 2px;">\u2715</button>` : ''}`;
    list.appendChild(row);
  });
}

window.assignSelectedBeamGroup = function(groupName) {
  if (selectedBeamIdx === null) return;
  assignBeamToGroup(selectedBeamIdx, groupName);
  updateGroupUI();
};

function showBeamGroupAssign(bi) {
  const container = document.getElementById('beam-group-assign');
  const sel = document.getElementById('beam-group-select');
  container.style.display = '';
  sel.innerHTML = '';
  const current = beamGroupMap.get(bi) || 'Default';
  memberGroups.forEach((grp, name) => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    if (name === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

function getCHSProps() {
  const D = parseFloat(document.getElementById('chs-D').value) / 1000; // mm->m
  const t = parseFloat(document.getElementById('chs-t').value) / 1000;
  const Do = D, Di = D - 2*t;
  const A = Math.PI/4 * (Do*Do - Di*Di);
  const I = Math.PI/64 * (Do**4 - Di**4);
  const J = Math.PI/32 * (Do**4 - Di**4);
  return { A, Iy: I, Iz: I, J, D, t };
}

window.updateCHSProps = function() {
  const p = getCHSProps();
  document.getElementById('chs-A').textContent = p.A.toExponential(4) + ' m\u00B2';
  document.getElementById('chs-I').textContent = p.Iy.toExponential(4) + ' m\u2074';
  document.getElementById('chs-J').textContent = p.J.toExponential(4) + ' m\u2074';
  const Dmm = parseFloat(document.getElementById('chs-D').value);
  const tmm = parseFloat(document.getElementById('chs-t').value);
  document.getElementById('d-section').textContent = `CHS ${Dmm.toFixed(0)}x${tmm.toFixed(0)}`;
};
window.updateCHSProps();

window.setSectionPreset = function(name) {
  const presets = { chs219: [219.1, 8], chs168: [168.3, 6.3], chs324: [323.9, 10] };
  const [d, t] = presets[name];
  document.getElementById('chs-D').value = d;
  document.getElementById('chs-t').value = t;
  window.updateCHSProps();
};

window.setMatPreset = function(name) {
  if (name === 'steel') {
    document.getElementById('mat-E').value = 200;
    document.getElementById('mat-rho').value = 7850;
  } else if (name === 'aluminum') {
    document.getElementById('mat-E').value = 70;
    document.getElementById('mat-rho').value = 2700;
  }
  document.getElementById('mat-G').value = '';
};

// ============================================================
// MODE SWITCHING
// ============================================================
// Toolbar group membership for highlighting
const toolbarGroups = {
  model: ['import-model','section','add-member','edit-beam','ring-connect'],
  boundary: ['supports','loads','cables'],
  analysis: ['analysis','cfd','robot']
};

window.setMode = function(mode) {
  currentMode = mode;
  // Highlight active mode button
  document.querySelectorAll('#mode-toolbar .mode-btn').forEach(b => {
    const btnMode = b.getAttribute('onclick')?.match(/setMode\('([^']+)'\)/)?.[1];
    b.classList.toggle('active', btnMode === mode);
  });
  // Highlight group header if any child is active
  document.querySelectorAll('.tb-group').forEach(g => {
    const groupName = g.dataset.group;
    const groupModes = toolbarGroups[groupName] || [];
    g.querySelector('.tb-group-btn').classList.toggle('has-active', groupModes.includes(mode));
  });
  // Toggle panels
  const panelMap = {
    'import-model': 'panel-import-model', section: 'panel-section', supports: 'panel-supports',
    loads: 'panel-loads', analysis: 'panel-analysis', cables: 'panel-cables',
    'add-member': 'panel-add-member', 'edit-beam': 'panel-edit-beam', cfd: 'panel-cfd',
    robot: 'panel-robot', 'ring-connect': 'panel-ring-connect'
  };
  for (const [m, pid] of Object.entries(panelMap)) {
    const el = document.getElementById(pid);
    if (el) el.classList.toggle('hidden', mode !== m);
  }
  if (mode !== 'cfd' && typeof hideCFDLegend === 'function') hideCFDLegend();
  if (mode === 'cfd') updateCFDPrecheck();
  if (mode === 'analysis') updateAnalysisPrecheck();
  if (mode === 'cables') initCablesPanel();
  if (mode === 'supports') updateSupportList();
  if (mode === 'loads') { updateLoadList(); updateLoadCaseUI(); }
  if (mode === 'robot') updateRobotSummary();
  if (mode === 'ring-connect') updateRingConnectInfo();
  if (mode !== 'add-member') { newMemberNodes = []; }
  if (mode !== 'ring-connect' && typeof clearRingPreview === 'function') { clearRingPreview(); }
  if (mode !== 'section') { document.getElementById('member-edit-section').style.display = 'none'; document.getElementById('beam-group-assign').style.display = 'none'; selectedBeamIdx = null; }
  if (mode === 'section') updateGroupUI();
  if (mode !== 'edit-beam') { cancelEditBeam(); }
};

document.getElementById('support-type-select').addEventListener('change', e => {
  document.getElementById('roller-dir-group').style.display = e.target.value === 'roller' ? '' : 'none';
});

// ============================================================
// SUPPORTS
// ============================================================
function addSupport(nodeId) {
  const type = document.getElementById('support-type-select').value;
  const dir = type === 'roller' ? document.getElementById('roller-dir-select').value : null;
  if (supports.has(nodeId) && supports.get(nodeId).type === type) supports.delete(nodeId);
  else supports.set(nodeId, { type, dir });
  updateSupportVisuals(); updateStatusCounts(); updateSupportList();
}

function updateSupportVisuals() {
  while(supportGroup.children.length) supportGroup.remove(supportGroup.children[0]);
  supports.forEach((sup, nid) => {
    const n = nodeMap.get(nid);
    const pos = m2t(n.x, n.y, n.z);
    let mesh;
    if (sup.type === 'fixed') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5), new THREE.MeshPhongMaterial({color:0xe04040,transparent:true,opacity:0.7}));
    } else if (sup.type === 'pinned') {
      mesh = new THREE.Mesh(new THREE.ConeGeometry(0.3,0.5,3), new THREE.MeshPhongMaterial({color:0x40c040,transparent:true,opacity:0.7}));
      mesh.rotation.x = Math.PI;
    } else {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25,8,6), new THREE.MeshPhongMaterial({color:0xe0c040,transparent:true,opacity:0.7}));
    }
    mesh.position.copy(pos); mesh.position.y -= 0.35;
    supportGroup.add(mesh);
  });
}

window.autoAssignSupports = function() {
  const zThreshold = minZ + (maxZ - minZ) * 0.02;
  const supType = document.getElementById('support-type-select').value;
  const supDir = supType === 'roller' ? document.getElementById('roller-dir-select').value : null;
  nodes.forEach(n => { if (n.z <= zThreshold) supports.set(n.id, {type:supType,dir:supDir}); });
  updateSupportVisuals(); updateStatusCounts(); updateSupportList();
};
window.clearSupports = function() { supports.clear(); updateSupportVisuals(); updateStatusCounts(); updateSupportList(); };

// ============================================================
// LOADS
// ============================================================
window.toggleSelfWeight = function() {
  selfWeightEnabled = !selfWeightEnabled;
  const btn = document.getElementById('btn-selfweight');
  btn.textContent = selfWeightEnabled ? 'Disable Self-Weight' : 'Enable Self-Weight';
  btn.classList.toggle('active', selfWeightEnabled);
  updateLoadVisuals(); updateStatusCounts();
};
window.applyLiveLoad = function() {
  liveLoadIntensity = parseFloat(document.getElementById('live-load-val').value) || 0;
  updateLoadVisuals(); updateStatusCounts();
};
window.applyPointLoad = function() {
  if (selectedNodeId === null) return;
  const fx=parseFloat(document.getElementById('pl-fx').value)||0;
  const fy=parseFloat(document.getElementById('pl-fy').value)||0;
  const fz=parseFloat(document.getElementById('pl-fz').value)||0;
  const mx=parseFloat(document.getElementById('pl-mx').value)||0;
  const my=parseFloat(document.getElementById('pl-my').value)||0;
  const mz=parseFloat(document.getElementById('pl-mz').value)||0;
  if (fx===0&&fy===0&&fz===0&&mx===0&&my===0&&mz===0) pointLoads.delete(selectedNodeId);
  else pointLoads.set(selectedNodeId, {fx,fy,fz,mx,my,mz});
  updateLoadVisuals(); updateStatusCounts(); updateLoadList();
};
window.applyWindLoad = function() {
  windLoad.pressure = parseFloat(document.getElementById('wind-pressure').value) || 0;
  windLoad.dir = document.getElementById('wind-dir').value;
  updateLoadVisuals(); updateStatusCounts();
};
window.clearLoads = function() {
  pointLoads.clear(); selfWeightEnabled=false; liveLoadIntensity=0;
  windLoad = { pressure: 0, dir: 'x' };
  document.getElementById('btn-selfweight').textContent='Enable Self-Weight';
  document.getElementById('btn-selfweight').classList.remove('active');
  document.getElementById('live-load-val').value=0;
  document.getElementById('wind-pressure').value=0;
  updateLoadVisuals(); updateStatusCounts(); updateLoadList();
};

// ============================================================
// LOAD CASE MANAGEMENT
// ============================================================
function saveActiveLoadCase() {
  const lc = loadCases[activeLoadCaseIdx];
  if (!lc) return;
  lc.selfWeight = selfWeightEnabled;
  lc.liveLoadIntensity = liveLoadIntensity;
  lc.pointLoads = new Map();
  pointLoads.forEach((v, k) => lc.pointLoads.set(k, { ...v }));
  lc.windLoad = { ...windLoad };
  lc.name = document.getElementById('lc-name').value || lc.name;
  lc.nature = document.getElementById('lc-nature').value || lc.nature;
}

function loadLoadCaseToUI(idx) {
  const lc = loadCases[idx];
  selfWeightEnabled = lc.selfWeight;
  liveLoadIntensity = lc.liveLoadIntensity;
  pointLoads.clear();
  lc.pointLoads.forEach((v, k) => pointLoads.set(k, { ...v }));
  windLoad = { ...lc.windLoad };
  document.getElementById('btn-selfweight').textContent = selfWeightEnabled ? 'Disable Self-Weight' : 'Enable Self-Weight';
  document.getElementById('btn-selfweight').classList.toggle('active', selfWeightEnabled);
  document.getElementById('live-load-val').value = liveLoadIntensity;
  document.getElementById('wind-pressure').value = windLoad.pressure;
  document.getElementById('wind-dir').value = windLoad.dir;
  document.getElementById('lc-name').value = lc.name;
  document.getElementById('lc-nature').value = lc.nature;
  updateLoadVisuals(); updateStatusCounts(); updateLoadList();
}

function updateLoadCaseUI() {
  const sel = document.getElementById('lc-select');
  sel.innerHTML = '';
  loadCases.forEach((lc, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `LC${lc.id}: ${lc.name}`;
    if (i === activeLoadCaseIdx) opt.selected = true;
    sel.appendChild(opt);
  });
  if (loadCases[activeLoadCaseIdx]) {
    document.getElementById('lc-name').value = loadCases[activeLoadCaseIdx].name;
    document.getElementById('lc-nature').value = loadCases[activeLoadCaseIdx].nature;
  }
}

window.switchLoadCase = function() {
  saveActiveLoadCase();
  activeLoadCaseIdx = parseInt(document.getElementById('lc-select').value);
  loadLoadCaseToUI(activeLoadCaseIdx);
};

window.addLoadCase = function() {
  saveActiveLoadCase();
  const id = nextLoadCaseId++;
  const natures = ['dead', 'live', 'wind', 'custom'];
  const nature = natures[Math.min(loadCases.length, 3)];
  const names = { dead: 'Dead Load', live: 'Live Load', wind: 'Wind Load', custom: 'Load Case ' + id };
  loadCases.push({ id, name: names[nature], nature, selfWeight: false, liveLoadIntensity: 0, pointLoads: new Map(), windLoad: { pressure: 0, dir: 'x' } });
  activeLoadCaseIdx = loadCases.length - 1;
  loadLoadCaseToUI(activeLoadCaseIdx);
  updateLoadCaseUI();
};

window.deleteLoadCase = function() {
  if (loadCases.length <= 1) return;
  loadCases.splice(activeLoadCaseIdx, 1);
  activeLoadCaseIdx = Math.min(activeLoadCaseIdx, loadCases.length - 1);
  loadLoadCaseToUI(activeLoadCaseIdx);
  updateLoadCaseUI();
};

window.renameLoadCase = function(name) {
  loadCases[activeLoadCaseIdx].name = name;
  updateLoadCaseUI();
};

window.updateLoadCaseNature = function(nature) {
  loadCases[activeLoadCaseIdx].nature = nature;
  updateLoadCaseUI();
};

// Sum force vectors across all load cases for FEM
function computeTotalForceVector() {
  saveActiveLoadCase();
  const F = new Float64Array(nodes.length * 6);
  const sec = getCHSProps();
  const A = sec.A;
  const rho = parseFloat(document.getElementById('mat-rho').value) || 7850;
  const g = 9.81;
  for (const lc of loadCases) {
    if (lc.selfWeight) {
      beams.forEach((b, bi) => {
        if (!b) return;
        const bsec = beamSections.has(bi) ? beamSections.get(bi) : null;
        const bA = bsec ? Math.PI / 4 * ((bsec.D / 1000) ** 2 - (bsec.D / 1000 - 2 * bsec.t / 1000) ** 2) : A;
        const wkN = rho * bA * beamLengths[bi] * g / 2 / 1000;
        const si = nIdx.get(b.node_start), ei = nIdx.get(b.node_end);
        F[si * 6 + 2] -= wkN; F[ei * 6 + 2] -= wkN;
      });
    }
    if (lc.liveLoadIntensity > 0) {
      beams.forEach((b, bi) => {
        if (!b) return;
        const w = lc.liveLoadIntensity * beamLengths[bi] / 2;
        const si = nIdx.get(b.node_start), ei = nIdx.get(b.node_end);
        F[si * 6 + 2] -= w; F[ei * 6 + 2] -= w;
      });
    }
    lc.pointLoads.forEach((load, nid) => {
      const i = nIdx.get(nid);
      F[i * 6] += load.fx; F[i * 6 + 1] += load.fy; F[i * 6 + 2] += load.fz;
      F[i * 6 + 3] += load.mx; F[i * 6 + 4] += load.my; F[i * 6 + 5] += load.mz;
    });
    if (lc.windLoad.pressure > 0) {
      const dir = lc.windLoad.dir;
      const sign = dir.startsWith('-') ? -1 : 1;
      const axis = dir.replace('-', '');
      beams.forEach((b, bi) => {
        if (!b) return;
        const load = lc.windLoad.pressure * beamLengths[bi] / 2;
        const si = nIdx.get(b.node_start), ei = nIdx.get(b.node_end);
        const dofOff = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
        F[si * 6 + dofOff] += sign * load;
        F[ei * 6 + dofOff] += sign * load;
      });
    }
  }
  return F;
}

// Initialize load case UI
updateLoadCaseUI();

function computeGlobalForceVector() {
  const F = new Float64Array(nodes.length * 6);
  const sec = getCHSProps();
  const A = sec.A;
  const rho = parseFloat(document.getElementById('mat-rho').value) || 7850;
  const g = 9.81;
  if (selfWeightEnabled) {
    beams.forEach((b, bi) => {
      if(!b)return;
      const wkN = rho * A * beamLengths[bi] * g / 2 / 1000;
      const si = nIdx.get(b.node_start), ei = nIdx.get(b.node_end);
      F[si*6+2] -= wkN; F[ei*6+2] -= wkN;
    });
  }
  if (liveLoadIntensity > 0) {
    beams.forEach((b, bi) => {
      if(!b)return;
      const w = liveLoadIntensity * beamLengths[bi] / 2;
      const si = nIdx.get(b.node_start), ei = nIdx.get(b.node_end);
      F[si*6+2] -= w; F[ei*6+2] -= w;
    });
  }
  pointLoads.forEach((load, nid) => {
    const i = nIdx.get(nid);
    F[i*6]+=load.fx; F[i*6+1]+=load.fy; F[i*6+2]+=load.fz;
    F[i*6+3]+=load.mx; F[i*6+4]+=load.my; F[i*6+5]+=load.mz;
  });
  if (windLoad.pressure > 0) {
    const dir = windLoad.dir;
    const sign = dir.startsWith('-') ? -1 : 1;
    const axis = dir.replace('-', '');
    beams.forEach((b, bi) => {
      if(!b)return;
      const load = windLoad.pressure * beamLengths[bi] / 2;
      const si = nIdx.get(b.node_start), ei = nIdx.get(b.node_end);
      const dofOff = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      F[si*6 + dofOff] += sign * load;
      F[ei*6 + dofOff] += sign * load;
    });
  }
  return F;
}

window.toggleLoadType = function(type, btn) {
  btn.classList.toggle('active');
  loadSubGroups[type].visible = btn.classList.contains('active');
  // Sync the master toggle label
  const anyVisible = Object.values(loadSubGroups).some(g => g.visible);
  const masterBtn = document.getElementById('btn-toggle-all-loads');
  if (anyVisible) { masterBtn.classList.add('active'); masterBtn.textContent = 'Hide All Loads'; }
  else { masterBtn.classList.remove('active'); masterBtn.textContent = 'Show All Loads'; }
};

window.toggleAllLoads = function(btn) {
  const show = !btn.classList.contains('active');
  // Toggle master button
  if (show) { btn.classList.add('active'); btn.textContent = 'Hide All Loads'; }
  else { btn.classList.remove('active'); btn.textContent = 'Show All Loads'; }
  // Toggle all sub-groups and sync individual buttons
  Object.values(loadSubGroups).forEach(g => g.visible = show);
  document.querySelectorAll('#load-type-btns .ctrl-btn').forEach(b => {
    if (show) b.classList.add('active'); else b.classList.remove('active');
  });
};

function updateLoadVisuals() {
  // Clear all sub-groups
  Object.values(loadSubGroups).forEach(g => { while(g.children.length) g.remove(g.children[0]); });
  // Re-add sub-groups to loadGroup if they were removed
  Object.values(loadSubGroups).forEach(g => { if (!g.parent) loadGroup.add(g); });

  const sec = getCHSProps();
  const A = sec.A;
  const rho = parseFloat(document.getElementById('mat-rho').value) || 7850;
  const g = 9.81;

  // Compute per-node forces by category for scaling
  const swF = new Float64Array(nodes.length * 6);
  const llF = new Float64Array(nodes.length * 6);
  const plF = new Float64Array(nodes.length * 6);
  const wlF = new Float64Array(nodes.length * 6);

  if (selfWeightEnabled) {
    beams.forEach((b, bi) => {
      if(!b)return;
      const bsec = beamSections.has(bi) ? beamSections.get(bi) : null;
      const bA = bsec ? Math.PI/4*((bsec.D/1000)**2 - (bsec.D/1000 - 2*bsec.t/1000)**2) : A;
      const wkN = rho * bA * beamLengths[bi] * g / 2 / 1000;
      const si = nIdx.get(b.node_start), ei = nIdx.get(b.node_end);
      swF[si*6+2] -= wkN; swF[ei*6+2] -= wkN;
    });
  }
  if (liveLoadIntensity > 0) {
    beams.forEach((b, bi) => {
      if(!b)return;
      const w = liveLoadIntensity * beamLengths[bi] / 2;
      const si = nIdx.get(b.node_start), ei = nIdx.get(b.node_end);
      llF[si*6+2] -= w; llF[ei*6+2] -= w;
    });
  }
  pointLoads.forEach((load, nid) => {
    const i = nIdx.get(nid);
    plF[i*6]+=load.fx; plF[i*6+1]+=load.fy; plF[i*6+2]+=load.fz;
  });
  if (windLoad.pressure > 0) {
    const dir = windLoad.dir;
    const sign = dir.startsWith('-') ? -1 : 1;
    const axis = dir.replace('-', '');
    beams.forEach((b, bi) => {
      if(!b)return;
      const load = windLoad.pressure * beamLengths[bi] / 2;
      const si = nIdx.get(b.node_start), ei = nIdx.get(b.node_end);
      const dofOff = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      wlF[si*6 + dofOff] += sign * load;
      wlF[ei*6 + dofOff] += sign * load;
    });
  }

  // Find global max for uniform arrow scaling
  let maxF = 0;
  for (let i=0; i<nodes.length; i++) {
    const fx = swF[i*6]+llF[i*6]+plF[i*6]+wlF[i*6];
    const fy = swF[i*6+1]+llF[i*6+1]+plF[i*6+1]+wlF[i*6+1];
    const fz = swF[i*6+2]+llF[i*6+2]+plF[i*6+2]+wlF[i*6+2];
    const mag = Math.sqrt(fx*fx+fy*fy+fz*fz);
    if (mag>maxF) maxF=mag;
  }
  if (maxF < 1e-10) return;
  const arrowScale = 3/maxF;

  // Helper to draw arrows into a group
  function drawArrows(Farr, group, color) {
    nodes.forEach((n,i) => {
      const fx=Farr[i*6],fy=Farr[i*6+1],fz=Farr[i*6+2];
      const mag = Math.sqrt(fx*fx+fy*fy+fz*fz);
      if (mag < 1e-10) return;
      const pos = m2t(n.x,n.y,n.z);
      const dir = new THREE.Vector3(fx,fz,-fy).normalize();
      group.add(new THREE.ArrowHelper(dir,pos,Math.max(mag*arrowScale,0.3),color,0.15,0.1));
    });
  }

  drawArrows(swF, loadSubGroups.sw, 0x44cc66);
  drawArrows(llF, loadSubGroups.ll, 0x4488ff);
  drawArrows(plF, loadSubGroups.pl, 0xff4444);
  drawArrows(wlF, loadSubGroups.wl, 0x44dddd);
}

function updateStatusCounts() {
  document.getElementById('d-supports').textContent = supports.size;
  document.getElementById('support-count').textContent = supports.size + ' supports defined';
  const F = computeGlobalForceVector();
  let loadedCount=0;
  for (let i=0;i<nodes.length;i++) {
    if (Math.sqrt(F[i*6]**2+F[i*6+1]**2+F[i*6+2]**2+F[i*6+3]**2+F[i*6+4]**2+F[i*6+5]**2)>1e-10) loadedCount++;
  }
  document.getElementById('d-loaded').textContent = loadedCount;
  document.getElementById('load-count').textContent = loadedCount + ' loaded nodes';
  let rDof=0;
  supports.forEach(s => { rDof += s.type==='fixed'?6:s.type==='pinned'?3:1; });
  document.getElementById('d-freedof').textContent = nodes.length*6 - rDof;
}

// ============================================================
// SUPPORT LIST UI (Feature 6)
// ============================================================
function updateSupportList() {
  const list = document.getElementById('support-list');
  if (!list) return;
  if (!supports.size) { list.innerHTML = '<div style="color:#666;padding:4px;">No supports defined</div>'; return; }
  list.innerHTML = '';
  supports.forEach((sup, nid) => {
    const n = nodeMap.get(nid);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:3px 4px;border-bottom:1px solid rgba(255,255,255,0.04);';
    row.innerHTML = `<span style="color:#adf;">Node #${nid}</span>
      <span style="color:#888;">(${n.x.toFixed(1)}, ${n.y.toFixed(1)}, ${n.z.toFixed(1)})</span>
      <span style="color:#9ab;">${sup.type}${sup.dir ? ' '+sup.dir : ''}</span>
      <span style="display:flex;gap:4px;">
        <button onclick="editSupport(${nid})" style="background:rgba(60,90,180,0.4);border:1px solid rgba(100,140,255,0.2);color:#8ab;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer;">Edit</button>
        <button onclick="deleteSupport(${nid})" style="background:rgba(180,60,60,0.4);border:1px solid rgba(255,100,100,0.2);color:#e88;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer;">\u2715</button>
      </span>`;
    list.appendChild(row);
  });
}

window.editSupport = function(nid) {
  const sup = supports.get(nid);
  document.getElementById('support-type-select').value = sup.type;
  if (sup.type === 'roller') {
    document.getElementById('roller-dir-group').style.display = '';
    document.getElementById('roller-dir-select').value = sup.dir;
  } else {
    document.getElementById('roller-dir-group').style.display = 'none';
  }
  const meshIdx = nodeIdToMeshIdx.get(nid);
  if (meshIdx !== undefined) {
    nodeMeshes[meshIdx].material.emissive.set(0x446644);
    setTimeout(() => nodeMeshes[meshIdx].material.emissive.set(0x000000), 800);
  }
};

window.deleteSupport = function(nid) {
  supports.delete(nid);
  updateSupportVisuals();
  updateStatusCounts();
  updateSupportList();
};

// ============================================================
// LOAD LIST UI (Feature 7)
// ============================================================
function updateLoadList() {
  const list = document.getElementById('load-list');
  if (!list) return;
  if (!pointLoads.size) { list.innerHTML = '<div style="color:#666;padding:4px;">No point loads defined</div>'; return; }
  list.innerHTML = '';
  pointLoads.forEach((load, nid) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:3px 4px;border-bottom:1px solid rgba(255,255,255,0.04);gap:6px;';
    row.innerHTML = `<span style="color:#faa;">Node #${nid}</span>
      <span style="color:#888;font-family:monospace;font-size:9px;">F(${load.fx},${load.fy},${load.fz})</span>
      <span style="display:flex;gap:4px;">
        <button onclick="editPointLoad(${nid})" style="background:rgba(60,90,180,0.4);border:1px solid rgba(100,140,255,0.2);color:#8ab;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer;">Edit</button>
        <button onclick="deletePointLoad(${nid})" style="background:rgba(180,60,60,0.4);border:1px solid rgba(255,100,100,0.2);color:#e88;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer;">\u2715</button>
      </span>`;
    list.appendChild(row);
  });
}

window.editPointLoad = function(nid) {
  selectedNodeId = nid;
  const pl = pointLoads.get(nid);
  document.getElementById('point-load-node').textContent = `Selected: Node #${nid}`;
  document.getElementById('btn-apply-pl').disabled = false;
  document.getElementById('pl-fx').value = pl.fx;
  document.getElementById('pl-fy').value = pl.fy;
  document.getElementById('pl-fz').value = pl.fz;
  document.getElementById('pl-mx').value = pl.mx;
  document.getElementById('pl-my').value = pl.my;
  document.getElementById('pl-mz').value = pl.mz;
};

window.deletePointLoad = function(nid) {
  pointLoads.delete(nid);
  updateLoadVisuals();
  updateStatusCounts();
  updateLoadList();
};

// ============================================================
// PER-BEAM SECTION & PERIMETER BEAMS (Features 3, 5)
// ============================================================
function updateBeamVisualRadius(bi) {
  const mesh = beamMeshes[bi];
  if (!mesh) return;
  const sec = beamSections.has(bi) ? beamSections.get(bi) : null;
  const D = sec ? sec.D / 1000 : getCHSProps().D;
  const radius = D / 2 * 0.5;
  const oldGeo = mesh.geometry;
  const h = oldGeo.parameters ? oldGeo.parameters.height : beamLengths[bi];
  oldGeo.dispose();
  mesh.geometry = new THREE.CylinderGeometry(Math.max(radius * 0.3, 0.03), Math.max(radius * 0.3, 0.03), h, 4, 1);
}

window.applyBeamSection = function() {
  if (selectedBeamIdx === null) return;
  const D = parseFloat(document.getElementById('beam-D').value);
  const t = parseFloat(document.getElementById('beam-t').value);
  if (isNaN(D) || isNaN(t) || D <= 0 || t <= 0) return;
  beamSections.set(selectedBeamIdx, { D, t });
  updateBeamVisualRadius(selectedBeamIdx);
};

window.resetBeamSection = function() {
  if (selectedBeamIdx === null) return;
  beamSections.delete(selectedBeamIdx);
  updateBeamVisualRadius(selectedBeamIdx);
  applyGroupColorToBeam(selectedBeamIdx);
};

function updatePerimeterCount() {
  // Check for open ends
  const bAdj = new Map();
  perimeterSet.forEach(bi => {
    const b = beams[bi]; if (!b) return;
    if (!bAdj.has(b.node_start)) bAdj.set(b.node_start, new Set());
    if (!bAdj.has(b.node_end)) bAdj.set(b.node_end, new Set());
    bAdj.get(b.node_start).add(b.node_end);
    bAdj.get(b.node_end).add(b.node_start);
  });
  let openEnds = 0;
  bAdj.forEach((n) => { if (n.size === 1) openEnds++; });
  const info = perimeterSet.size > 0 ? perimeterSet.size + ' perimeter beams selected' : '';
  const warn = openEnds > 0 ? ` (${openEnds} open ends)` : ' (closed loop)';
  document.getElementById('perim-count').textContent = info + (perimeterSet.size > 0 ? warn : '');
  // Debug: boundary degree distribution
  const degDist = {};
  bAdj.forEach(n => { degDist[n.size] = (degDist[n.size] || 0) + 1; });
  window._perimDebug = { degDist, totalNodes: bAdj.size, totalEdges: perimeterSet.size, openEnds };
}

function highlightPerimeterBeam(bi, on) {
  if (!beamMeshes[bi]) return;
  assignBeamToGroup(bi, on ? 'Perimeter' : 'Default');
}

window.togglePerimeterBeam = function(bi) {
  if (perimeterSet.has(bi)) {
    perimeterSet.delete(bi);
    highlightPerimeterBeam(bi, false);
  } else {
    perimeterSet.add(bi);
    highlightPerimeterBeam(bi, true);
  }
  updatePerimeterCount();
};

window.autoDetectPerimeter = function() {
  // Build adjacency and beam lookup
  const adj = new Map();
  const beamLookup = new Map();
  beams.forEach((b, i) => {
    if (!b) return;
    if (!adj.has(b.node_start)) adj.set(b.node_start, new Set());
    if (!adj.has(b.node_end)) adj.set(b.node_end, new Set());
    adj.get(b.node_start).add(b.node_end);
    adj.get(b.node_end).add(b.node_start);
    const key = Math.min(b.node_start, b.node_end) + '-' + Math.max(b.node_start, b.node_end);
    beamLookup.set(key, i);
  });

  // Step 1: Seed boundary nodes — degree 2 and 3 are definitely on the edge
  const seeds = new Set();
  nodes.forEach(n => { if (degree.get(n.id) <= 3) seeds.add(n.id); });

  // Step 2: Walk the boundary loop(s).
  const visited = new Set();
  const boundaryEdges = new Set();

  for (const startId of seeds) {
    if (visited.has(startId)) continue;
    const startNeighbors = [...(adj.get(startId) || [])].filter(n => seeds.has(n));
    if (startNeighbors.length === 0) continue;

    for (const firstNeighbor of startNeighbors) {
      let prev = startId;
      let curr = firstNeighbor;

      while (true) {
        const edgeKey = Math.min(prev, curr) + '-' + Math.max(prev, curr);
        if (boundaryEdges.has(edgeKey)) break;
        boundaryEdges.add(edgeKey);
        visited.add(prev);
        visited.add(curr);
        if (curr === startId) break;

        const neighbors = [...(adj.get(curr) || [])].filter(n => n !== prev);
        if (neighbors.length === 0) break;

        // Priority: seed nodes (deg ≤ 3) first
        const seedNeighbors = neighbors.filter(n => seeds.has(n) && !boundaryEdges.has(
          Math.min(curr, n) + '-' + Math.max(curr, n)
        ));

        if (seedNeighbors.length > 0) {
          // Pick the closest seed neighbor
          const currNode = nodeMap.get(curr);
          let best = seedNeighbors[0], bestDist = Infinity;
          for (const nid of seedNeighbors) {
            const nn = nodeMap.get(nid);
            const d = (nn.x - currNode.x) ** 2 + (nn.y - currNode.y) ** 2 + (nn.z - currNode.z) ** 2;
            if (d < bestDist) { bestDist = d; best = nid; }
          }
          prev = curr;
          curr = best;
          continue;
        }

        // Bridge through non-seed: pick neighbor that reaches another seed
        let found = false;
        for (const cand of neighbors) {
          if (boundaryEdges.has(Math.min(curr, cand) + '-' + Math.max(curr, cand))) continue;
          const candNeighbors = adj.get(cand) || new Set();
          let hasSeedBeyond = false;
          candNeighbors.forEach(nn => {
            if (nn !== curr && seeds.has(nn)) hasSeedBeyond = true;
          });
          if (hasSeedBeyond) {
            prev = curr;
            curr = cand;
            found = true;
            break;
          }
        }
        if (!found) break;
      }
    }
  }

  boundaryEdges.forEach(key => {
    const bi = beamLookup.get(key);
    if (bi !== undefined) {
      perimeterSet.add(bi);
      assignBeamToGroup(bi, 'Perimeter');
    }
  });
  updatePerimeterCount();
};

window.clearPerimeterSelection = function() {
  perimeterSet.forEach(bi => assignBeamToGroup(bi, 'Default'));
  perimeterSet.clear();
  updatePerimeterCount();
};

window.applyPerimeterSection = function() {
  const D = parseFloat(document.getElementById('perim-D').value);
  const t = parseFloat(document.getElementById('perim-t').value);
  perimeterSet.forEach(bi => {
    beamSections.set(bi, { D, t });
    updateBeamVisualRadius(bi);
    highlightPerimeterBeam(bi, true);
  });
  updatePerimeterCount();
};

window.clearPerimeterSection = function() {
  perimeterSet.forEach(bi => {
    beamSections.delete(bi);
    updateBeamVisualRadius(bi);
    highlightPerimeterBeam(bi, false);
  });
  perimeterSet.clear();
  updatePerimeterCount();
};

// ============================================================
// ADD MEMBER (Feature 4)
// ============================================================
function createNewBeam(nid1, nid2) {
  const newId = beams.length > 0 ? Math.max(...beams.filter(b=>b).map(b => b.id)) + 1 : 0;
  const newBeam = { id: newId, node_start: nid1, node_end: nid2 };
  beams.push(newBeam);
  const n1 = nodeMap.get(nid1), n2 = nodeMap.get(nid2);
  const len = Math.sqrt((n1.x-n2.x)**2 + (n1.y-n2.y)**2 + (n1.z-n2.z)**2);
  beamLengths.push(len);
  degree.set(nid1, (degree.get(nid1)||0) + 1);
  degree.set(nid2, (degree.get(nid2)||0) + 1);
  const p1 = m2t(n1.x, n1.y, n1.z), p2 = m2t(n2.x, n2.y, n2.z);
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const meshLen = dir.length();
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  const geo = new THREE.CylinderGeometry(0.06, 0.06, meshLen, 4, 1);
  const mat = baseMat.clone();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
  mesh.userData = { type:'beam', id: newId, si: nid1, ei: nid2, length: len };
  beamMeshes.push(mesh);
  beamGroup.add(mesh);
  // Assign to group based on current mode
  const bi = beamMeshes.length - 1;
  const group = currentMode === 'ring-connect' ? 'Cross-Section' : 'Default';
  assignBeamToGroup(bi, group);
  document.getElementById('s-beams').textContent = beams.length;
}

window.cancelAddMember = function() {
  newMemberNodes.forEach(id => {
    const mi = nodeIdToMeshIdx.get(id);
    if (mi !== undefined) nodeMeshes[mi].material.emissive.set(0x000000);
  });
  newMemberNodes = [];
  document.getElementById('add-member-status').textContent = 'Click first node...';
};

// ============================================================
// EDIT BEAM (Delete & Swap Connection)
// ============================================================
let editBeamIdx = null;
const swapPreviewGroup = new THREE.Group(); scene.add(swapPreviewGroup);
let swapAlternatives = [];
const swapColors = [0x00ff88, 0xffaa00, 0xff44ff, 0x44ddff];

window.deleteSelectedBeam = function() {
  if (editBeamIdx === null) return;
  const bi = editBeamIdx;
  const beam = beams[bi];
  const mesh = beamMeshes[bi];
  beamGroup.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
  degree.set(beam.node_start, (degree.get(beam.node_start)||1) - 1);
  degree.set(beam.node_end, (degree.get(beam.node_end)||1) - 1);
  beams[bi] = null;
  beamLengths[bi] = null;
  beamMeshes[bi] = null;
  beamSections.delete(bi);
  document.getElementById('s-beams').textContent = beams.filter(b => b !== null).length;
  cancelEditBeam();
};

function clearSwapPreviews() {
  while (swapPreviewGroup.children.length) {
    const m = swapPreviewGroup.children[0];
    swapPreviewGroup.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
  swapAlternatives = [];
}

function computeAndShowSwaps(bi) {
  clearSwapPreviews();
  const beam = beams[bi];
  if (!beam) return;
  const nA = beam.node_start, nB = beam.node_end;

  // Build full adjacency map
  const adj = new Map();
  nodes.forEach(n => adj.set(n.id, new Set()));
  beams.forEach((b, i) => {
    if (!b) return;
    adj.get(b.node_start).add(b.node_end);
    adj.get(b.node_end).add(b.node_start);
  });

  // Swap = move one endpoint to a neighboring node
  // Option A: keep nB fixed, move nA to a neighbor of nA → new beam: neighbor↔nB
  // Option B: keep nA fixed, move nB to a neighbor of nB → new beam: nA↔neighbor
  const seen = new Set();

  function addAlt(fromId, toId, label) {
    const key = Math.min(fromId,toId) + ',' + Math.max(fromId,toId);
    if (seen.has(key)) return;
    seen.add(key);
    // Skip if this beam already exists
    const exists = beams.some(b => b &&
      ((b.node_start === fromId && b.node_end === toId) ||
       (b.node_start === toId && b.node_end === fromId)));
    if (exists) return;

    const n1 = nodeMap.get(fromId), n2 = nodeMap.get(toId);
    const p1 = m2t(n1.x, n1.y, n1.z), p2 = m2t(n2.x, n2.y, n2.z);
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const color = swapColors[swapAlternatives.length % swapColors.length];
    const geo = new THREE.CylinderGeometry(0.09, 0.09, len, 6, 1);
    const mat = new THREE.MeshPhongMaterial({
      color, transparent: true, opacity: 0.8,
      emissive: color, emissiveIntensity: 0.4
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
    mesh.userData = { type: 'swap-preview', from: fromId, to: toId };
    swapPreviewGroup.add(mesh);
    swapAlternatives.push({ from: fromId, to: toId, mesh, color, label });
  }

  // Move start (nA) to each of its neighbors
  for (const c of adj.get(nA)) {
    if (c === nB) continue;
    addAlt(c, nB, `Move start → Node ${c}`);
  }
  // Move end (nB) to each of its neighbors
  for (const d of adj.get(nB)) {
    if (d === nA) continue;
    addAlt(nA, d, `Move end → Node ${d}`);
  }

  // Update panel list
  const listEl = document.getElementById('swap-options-list');
  if (swapAlternatives.length === 0) {
    listEl.innerHTML = '<div style="color:#666;font-size:10px;">No swap alternatives available</div>';
  } else {
    listEl.innerHTML = swapAlternatives.map((alt, i) => {
      const hex = '#' + swapColors[i % swapColors.length].toString(16).padStart(6, '0');
      return `<div style="font-size:11px;margin:3px 0;cursor:pointer;color:${hex};padding:3px 6px;border:1px solid ${hex}33;border-radius:4px;" `
        + `onmouseover="this.style.background='${hex}22'" onmouseout="this.style.background=''" `
        + `onclick="executeSwap(${i})">&#9679; ${alt.label} (${alt.from}\u2194${alt.to})</div>`;
    }).join('');
  }
}

window.executeSwap = function(idx) {
  if (idx >= swapAlternatives.length || editBeamIdx === null) return;
  const alt = swapAlternatives[idx];
  const bi = editBeamIdx;
  const beam = beams[bi];

  // Update degree: remove old endpoints, add new ones
  degree.set(beam.node_start, (degree.get(beam.node_start)||1) - 1);
  degree.set(beam.node_end, (degree.get(beam.node_end)||1) - 1);
  degree.set(alt.from, (degree.get(alt.from)||0) + 1);
  degree.set(alt.to, (degree.get(alt.to)||0) + 1);

  beam.node_start = alt.from;
  beam.node_end = alt.to;

  // Recompute length
  const n1 = nodeMap.get(alt.from), n2 = nodeMap.get(alt.to);
  const len = Math.sqrt((n1.x-n2.x)**2 + (n1.y-n2.y)**2 + (n1.z-n2.z)**2);
  beamLengths[bi] = len;

  // Rebuild mesh
  const oldMesh = beamMeshes[bi];
  beamGroup.remove(oldMesh);
  oldMesh.geometry.dispose();
  oldMesh.material.dispose();
  const p1 = m2t(n1.x, n1.y, n1.z), p2 = m2t(n2.x, n2.y, n2.z);
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const meshLen = dir.length();
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  const sec = beamSections.get(bi);
  const radius = sec ? (sec.D / 1000) / 2 : 0.06;
  const geo = new THREE.CylinderGeometry(radius, radius, meshLen, 4, 1);
  const mat = baseMat.clone();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
  mesh.userData = { type:'beam', id: beam.id, si: alt.from, ei: alt.to, length: len };
  beamMeshes[bi] = mesh;
  beamGroup.add(mesh);

  // Re-select to refresh swap options for new position
  selectEditBeam(bi);
};

window.selectEditBeam = function selectEditBeam(bi) {
  // Deselect previous
  if (editBeamIdx !== null && beamMeshes[editBeamIdx]) {
    applyGroupColorToBeam(editBeamIdx);
  }
  editBeamIdx = bi;
  const beam = beams[bi];
  beamMeshes[bi].material.color.set(0xff4444);
  document.getElementById('edit-beam-info').style.display = '';
  document.getElementById('edit-beam-none').style.display = 'none';
  document.getElementById('edit-beam-detail').textContent =
    `Beam #${beam.id}: Node ${beam.node_start} \u2192 Node ${beam.node_end} (L=${beamLengths[bi].toFixed(2)}m)`;
  computeAndShowSwaps(bi);
}


window.cancelEditBeam = function() {
  if (editBeamIdx !== null && beamMeshes[editBeamIdx]) {
    applyGroupColorToBeam(editBeamIdx);
  }
  editBeamIdx = null;
  clearSwapPreviews();
  const info = document.getElementById('edit-beam-info');
  const none = document.getElementById('edit-beam-none');
  if (info) info.style.display = 'none';
  if (none) none.style.display = '';
};

// ============================================================
// FEM SOLVER (unchanged core, reads from CHS section)
// ============================================================
function getRestrainedDofs() {
  const restrained = new Set();
  supports.forEach((s, nid) => {
    const base = nIdx.get(nid)*6;
    if (s.type==='fixed') { for(let d=0;d<6;d++) restrained.add(base+d); }
    else if (s.type==='pinned') { restrained.add(base);restrained.add(base+1);restrained.add(base+2); }
    else { restrained.add(base + (s.dir==='x'?0:s.dir==='y'?1:2)); }
  });
  return restrained;
}

function build3DFrameLocalK(L,E,A,Iy,Iz,G,J) {
  const K = Array.from({length:12}, ()=>new Float64Array(12));
  const EA_L=E*A/L, GJ_L=G*J/L, L2=L*L, L3=L*L*L;
  K[0][0]=EA_L; K[0][6]=-EA_L; K[6][0]=-EA_L; K[6][6]=EA_L;
  K[3][3]=GJ_L; K[3][9]=-GJ_L; K[9][3]=-GJ_L; K[9][9]=GJ_L;
  const c1=12*E*Iy/L3,c2=6*E*Iy/L2,c3=4*E*Iy/L,c4=2*E*Iy/L;
  K[2][2]=c1;K[2][4]=-c2;K[2][8]=-c1;K[2][10]=-c2;
  K[4][2]=-c2;K[4][4]=c3;K[4][8]=c2;K[4][10]=c4;
  K[8][2]=-c1;K[8][4]=c2;K[8][8]=c1;K[8][10]=c2;
  K[10][2]=-c2;K[10][4]=c4;K[10][8]=c2;K[10][10]=c3;
  const d1=12*E*Iz/L3,d2=6*E*Iz/L2,d3=4*E*Iz/L,d4=2*E*Iz/L;
  K[1][1]=d1;K[1][5]=d2;K[1][7]=-d1;K[1][11]=d2;
  K[5][1]=d2;K[5][5]=d3;K[5][7]=-d2;K[5][11]=d4;
  K[7][1]=-d1;K[7][5]=-d2;K[7][7]=d1;K[7][11]=-d2;
  K[11][1]=d2;K[11][5]=d4;K[11][7]=-d2;K[11][11]=d3;
  return K;
}

function buildRotationMatrix(n1,n2) {
  const dx=n2.x-n1.x,dy=n2.y-n1.y,dz=n2.z-n1.z;
  const L=Math.sqrt(dx*dx+dy*dy+dz*dz);
  const lx=dx/L,ly=dy/L,lz=dz/L;
  let refX,refY,refZ;
  if(Math.abs(lz)>0.95){refX=1;refY=0;refZ=0;}else{refX=0;refY=0;refZ=1;}
  let yx=refY*lz-refZ*ly,yy=refZ*lx-refX*lz,yz=refX*ly-refY*lx;
  const ym=Math.sqrt(yx*yx+yy*yy+yz*yz);yx/=ym;yy/=ym;yz/=ym;
  return [[lx,ly,lz],[yx,yy,yz],[ly*yz-lz*yy,lz*yx-lx*yz,lx*yy-ly*yx]];
}

function transformKtoGlobal(Kl,R3) {
  const T=Array.from({length:12},()=>new Float64Array(12));
  for(let b=0;b<4;b++)for(let i=0;i<3;i++)for(let j=0;j<3;j++)T[b*3+i][b*3+j]=R3[i][j];
  const tmp=Array.from({length:12},()=>new Float64Array(12));
  for(let i=0;i<12;i++)for(let j=0;j<12;j++){let s=0;for(let k=0;k<12;k++)s+=Kl[i][k]*T[k][j];tmp[i][j]=s;}
  const Kg=Array.from({length:12},()=>new Float64Array(12));
  for(let i=0;i<12;i++)for(let j=0;j<12;j++){let s=0;for(let k=0;k<12;k++)s+=T[k][i]*tmp[k][j];Kg[i][j]=s;}
  return Kg;
}

class SparseMatrix {
  constructor(n){this.n=n;this.rows=new Map();}
  add(i,j,v){if(Math.abs(v)<1e-20)return;if(!this.rows.has(i))this.rows.set(i,new Map());const r=this.rows.get(i);r.set(j,(r.get(j)||0)+v);}
  mulVec(x,y){y.fill(0);this.rows.forEach((cols,i)=>{let s=0;cols.forEach((v,j)=>{s+=v*x[j];});y[i]=s;});}
  getDiag(i){const r=this.rows.get(i);return r?(r.get(i)||0):0;}
  setRowCol(idx,dv){this.rows.set(idx,new Map([[idx,dv]]));this.rows.forEach((cols,i)=>{if(i!==idx&&cols.has(idx))cols.delete(idx);});}
}

function solveCG(K,F) {
  const n=K.n,x=new Float64Array(n),r=new Float64Array(n),z=new Float64Array(n),p=new Float64Array(n),Ap=new Float64Array(n);
  const Minv=new Float64Array(n);
  for(let i=0;i<n;i++){const d=K.getDiag(i);Minv[i]=d>1e-20?1/d:1;}
  r.set(F);for(let i=0;i<n;i++)z[i]=Minv[i]*r[i];p.set(z);
  let rz=0;for(let i=0;i<n;i++)rz+=r[i]*z[i];
  const Fn=Math.sqrt(F.reduce((s,v)=>s+v*v,0))||1;
  let iter=0,residual=1;
  for(iter=0;iter<8000;iter++){
    K.mulVec(p,Ap);let pAp=0;for(let i=0;i<n;i++)pAp+=p[i]*Ap[i];
    if(Math.abs(pAp)<1e-30)break;const alpha=rz/pAp;
    for(let i=0;i<n;i++){x[i]+=alpha*p[i];r[i]-=alpha*Ap[i];}
    residual=Math.sqrt(r.reduce((s,v)=>s+v*v,0))/Fn;
    if(residual<1e-8)break;
    for(let i=0;i<n;i++)z[i]=Minv[i]*r[i];
    let rz2=0;for(let i=0;i<n;i++)rz2+=r[i]*z[i];
    const beta=rz2/(rz||1e-30);for(let i=0;i<n;i++)p[i]=z[i]+beta*p[i];rz=rz2;
  }
  return {x,iterations:iter,residual};
}

function updateAnalysisPrecheck() {
  const restrained=getRestrainedDofs(); const totalDof=nodes.length*6;
  document.getElementById('a-nodes').textContent=nodes.length;
  document.getElementById('a-beams').textContent=beams.filter(b=>b).length;
  document.getElementById('a-supports').textContent=supports.size;
  saveActiveLoadCase();
  const F=computeTotalForceVector();
  let ln=0;for(let i=0;i<nodes.length;i++)if(Math.sqrt(F[i*6]**2+F[i*6+1]**2+F[i*6+2]**2)>1e-10)ln++;
  document.getElementById('a-loads').textContent=ln;
  document.getElementById('a-dof').textContent=totalDof;
  document.getElementById('a-rdof').textContent=restrained.size;
  document.getElementById('a-fdof').textContent=totalDof-restrained.size;
  const w=document.getElementById('analysis-warnings');w.innerHTML='';
  if(!supports.size)w.innerHTML+='<div class="status-badge warn">No supports defined</div><br>';
  if(!ln)w.innerHTML+='<div class="status-badge warn">No loads applied</div><br>';
  if(restrained.size<6)w.innerHTML+='<div class="status-badge warn">Insufficient restraints (min 6 DOF)</div><br>';
  document.getElementById('btn-run-fem').disabled=!supports.size||restrained.size<6;
}

// ============================================================
// RUN FEM
// ============================================================
window.runFEM = async function() {
  const overlay=document.getElementById('progress-overlay'),fill=document.getElementById('progress-bar-fill'),text=document.getElementById('progress-text');
  overlay.style.display='flex';fill.style.width='0%';
  await new Promise(r=>setTimeout(r,50));
  const t0=performance.now();
  const sec=getCHSProps();
  const E=parseFloat(document.getElementById('mat-E').value)*1e6;
  let G=parseFloat(document.getElementById('mat-G').value);
  if(isNaN(G)||G<=0)G=E/2.6;else G=G*1e6;
  const {A,Iy,Iz,J}=sec;
  const nDof=nodes.length*6;

  text.textContent='Assembling stiffness matrix...';fill.style.width='5%';
  await new Promise(r=>setTimeout(r,20));

  const K=new SparseMatrix(nDof);
  for(let bi=0;bi<beams.length;bi++){
    if(!beams[bi])continue;
    const b=beams[bi],n1=nodeMap.get(b.node_start),n2=nodeMap.get(b.node_end),L=beamLengths[bi];
    if(L<1e-10)continue;
    // Per-beam section override
    let bA, bIy, bIz, bJ;
    if (beamSections.has(bi)) {
      const bs = beamSections.get(bi);
      const Do = bs.D / 1000, Di = Do - 2 * bs.t / 1000;
      bA = Math.PI/4 * (Do*Do - Di*Di);
      bIy = Math.PI/64 * (Do**4 - Di**4);
      bIz = bIy;
      bJ = Math.PI/32 * (Do**4 - Di**4);
    } else {
      bA = A; bIy = Iy; bIz = Iz; bJ = J;
    }
    const Kl=build3DFrameLocalK(L,E,bA,bIy,bIz,G,bJ);
    const R3=buildRotationMatrix(n1,n2);
    const Kg=transformKtoGlobal(Kl,R3);
    const dofs=[];const si=nIdx.get(b.node_start),ei=nIdx.get(b.node_end);
    for(let d=0;d<6;d++)dofs.push(si*6+d);for(let d=0;d<6;d++)dofs.push(ei*6+d);
    for(let i=0;i<12;i++)for(let j=0;j<12;j++)K.add(dofs[i],dofs[j],Kg[i][j]);
    if(bi%200===0){fill.style.width=(5+35*bi/beams.length)+'%';await new Promise(r=>setTimeout(r,0));}
  }

  text.textContent='Applying BCs & solving...';fill.style.width='45%';await new Promise(r=>setTimeout(r,20));
  saveActiveLoadCase();
  const F=computeTotalForceVector();
  const restrained=getRestrainedDofs();
  restrained.forEach(idx=>{K.setRowCol(idx,1e15);F[idx]=0;});

  fill.style.width='55%';await new Promise(r=>setTimeout(r,20));
  const result=solveCG(K,F);

  fill.style.width='92%';text.textContent='Computing member forces...';await new Promise(r=>setTimeout(r,20));

  const memberForces=beams.map((b,bi)=>{
    if(!b)return null;
    const n1=nodeMap.get(b.node_start),n2=nodeMap.get(b.node_end),L=beamLengths[bi];
    // Per-beam section for member force recovery
    let mA, mIy, mIz, mJ;
    if (beamSections.has(bi)) {
      const bs = beamSections.get(bi);
      const Do = bs.D / 1000, Di = Do - 2 * bs.t / 1000;
      mA = Math.PI/4 * (Do*Do - Di*Di);
      mIy = Math.PI/64 * (Do**4 - Di**4);
      mIz = mIy;
      mJ = Math.PI/32 * (Do**4 - Di**4);
    } else {
      mA = A; mIy = Iy; mIz = Iz; mJ = J;
    }
    const Kl=build3DFrameLocalK(L,E,mA,mIy,mIz,G,mJ);
    const R3=buildRotationMatrix(n1,n2);
    const T=Array.from({length:12},()=>new Float64Array(12));
    for(let bl=0;bl<4;bl++)for(let i=0;i<3;i++)for(let j=0;j<3;j++)T[bl*3+i][bl*3+j]=R3[i][j];
    const si=nIdx.get(b.node_start),ei=nIdx.get(b.node_end);
    const ug=new Float64Array(12);
    for(let d=0;d<6;d++){ug[d]=result.x[si*6+d];ug[6+d]=result.x[ei*6+d];}
    const ul=new Float64Array(12);for(let i=0;i<12;i++){let s=0;for(let j=0;j<12;j++)s+=T[i][j]*ug[j];ul[i]=s;}
    const fl=new Float64Array(12);for(let i=0;i<12;i++){let s=0;for(let j=0;j<12;j++)s+=Kl[i][j]*ul[j];fl[i]=s;}
    return {
      axial:fl[0], shearY:fl[1], shearZ:fl[2], torsion:fl[3],
      momentY:Math.max(Math.abs(fl[4]),Math.abs(fl[10])),
      momentZ:Math.max(Math.abs(fl[5]),Math.abs(fl[11])),
      maxMoment:Math.sqrt(Math.max(Math.abs(fl[4]),Math.abs(fl[10]))**2+Math.max(Math.abs(fl[5]),Math.abs(fl[11]))**2)
    };
  });

  const Fapplied=computeTotalForceVector();
  let sumFx=0,sumFy=0,sumFz=0;
  for(let i=0;i<nodes.length;i++){sumFx+=Fapplied[i*6];sumFy+=Fapplied[i*6+1];sumFz+=Fapplied[i*6+2];}
  // Reactions from equilibrium: R = -F_applied (since sum of all forces = 0)
  const sumRx=-sumFx, sumRy=-sumFy, sumRz=-sumFz;

  const t1=performance.now();
  let maxU=0,maxUz=0;
  for(let i=0;i<nodes.length;i++){
    const ux=result.x[i*6],uy=result.x[i*6+1],uz=result.x[i*6+2];
    const mag=Math.sqrt(ux*ux+uy*uy+uz*uz);if(mag>maxU)maxU=mag;
    if(Math.abs(uz)>Math.abs(maxUz))maxUz=uz;
  }
  let maxAxial=0,maxMoment=0;
  memberForces.forEach(mf=>{if(Math.abs(mf.axial)>Math.abs(maxAxial))maxAxial=mf.axial;if(mf.maxMoment>maxMoment)maxMoment=mf.maxMoment;});

  femResults={displacements:result.x,memberForces,maxU,maxUz,maxAxial,maxMoment,sumRx,sumRy,sumRz,sumFz,iterations:result.iterations,residual:result.residual,solveTime:t1-t0};

  document.getElementById('r-iter').textContent=result.iterations;
  document.getElementById('r-resid').textContent=result.residual.toExponential(3);
  document.getElementById('r-time').textContent=((t1-t0)/1000).toFixed(2)+' s';
  document.getElementById('r-maxu').textContent=(maxU*1000).toFixed(3);
  document.getElementById('r-maxuz').textContent=(maxUz*1000).toFixed(3);
  document.getElementById('r-maxaxial').textContent=maxAxial.toFixed(2);
  document.getElementById('r-maxmoment').textContent=maxMoment.toFixed(3);
  document.getElementById('r-rx').textContent=sumRx.toFixed(2)+' kN';
  document.getElementById('r-ry').textContent=sumRy.toFixed(2)+' kN';
  document.getElementById('r-rz').textContent=sumRz.toFixed(2)+' kN';
  document.getElementById('r-afz').textContent=sumFz.toFixed(2)+' kN';

  document.getElementById('analysis-precheck').classList.add('hidden');
  document.getElementById('analysis-results').classList.remove('hidden');
  fill.style.width='100%';text.textContent='Done!';
  await new Promise(r=>setTimeout(r,400));overlay.style.display='none';
  showDeformedShape(parseInt(document.getElementById('def-scale').value));
};

// ============================================================
// RESULT COLORS
// ============================================================
function getResultColors() {
  return {
    tension: document.getElementById('clr-tension').value,
    compress: document.getElementById('clr-compress').value,
    deformed: document.getElementById('clr-deformed').value,
    momentHi: document.getElementById('clr-moment-hi').value,
    momentLo: document.getElementById('clr-moment-lo').value,
    reactions: document.getElementById('clr-reactions').value,
  };
}

function hexToRgb(hex) {
  const r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  return {r,g,b};
}

function lerpColor(c1,c2,t) {
  return {r:c1.r+(c2.r-c1.r)*t, g:c1.g+(c2.g-c1.g)*t, b:c1.b+(c2.b-c1.b)*t};
}

window.refreshResultColors = function() {
  if (!femResults) return;
  if (currentResultView === 'deformed') showDeformedShape(parseInt(document.getElementById('def-scale').value));
  else if (currentResultView === 'axial') showAxialForce();
  else if (currentResultView === 'moment') showBendingMoment();
  else if (currentResultView === 'reactions') showReactions();
};

// ============================================================
// RESULTS VISUALIZATION
// ============================================================
function showDeformedShape(scale) {
  while(resultGroup.children.length) resultGroup.remove(resultGroup.children[0]);
  applyAllGroupColors();
  if(!femResults)return;
  const clr = hexToRgb(getResultColors().deformed);
  const u=femResults.displacements;
  beams.forEach((b,bi)=>{
    if(!b)return;
    const ns=nodeMap.get(b.node_start),ne=nodeMap.get(b.node_end);
    const si=nIdx.get(b.node_start),ei=nIdx.get(b.node_end);
    const p1=m2t(ns.x+u[si*6]*scale,ns.y+u[si*6+1]*scale,ns.z+u[si*6+2]*scale);
    const p2=m2t(ne.x+u[ei*6]*scale,ne.y+u[ei*6+1]*scale,ne.z+u[ei*6+2]*scale);
    const dir=new THREE.Vector3().subVectors(p2,p1);const len=dir.length();if(len<1e-8)return;
    const mid=new THREE.Vector3().addVectors(p1,p2).multiplyScalar(0.5);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,len,4,1),
      new THREE.MeshPhongMaterial({color:new THREE.Color(clr.r,clr.g,clr.b),transparent:true,opacity:0.7}));
    mesh.position.copy(mid);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());
    resultGroup.add(mesh);
  });
}

function showAxialForce() {
  while(resultGroup.children.length) resultGroup.remove(resultGroup.children[0]);
  if(!femResults)return;
  const clrs=getResultColors();
  const tensionC=hexToRgb(clrs.tension), compressC=hexToRgb(clrs.compress);
  const maxA=Math.max(...femResults.memberForces.filter(m=>m).map(m=>Math.abs(m.axial)))||1;
  beamMeshes.forEach((mesh,i)=>{
    if(!mesh||!femResults.memberForces[i])return;
    const ax=femResults.memberForces[i].axial;
    const t=Math.abs(ax)/maxA;
    const base={r:0.15,g:0.15,b:0.15};
    const target=ax>=0?tensionC:compressC;
    const c=lerpColor(base,target,t);
    mesh.material.color.setRGB(c.r,c.g,c.b);
  });
}

function showBendingMoment() {
  while(resultGroup.children.length) resultGroup.remove(resultGroup.children[0]);
  if(!femResults)return;
  const clrs=getResultColors();
  const loC=hexToRgb(clrs.momentLo), hiC=hexToRgb(clrs.momentHi);
  const maxM=Math.max(...femResults.memberForces.filter(m=>m).map(m=>m.maxMoment))||1;
  beamMeshes.forEach((mesh,i)=>{
    if(!mesh||!femResults.memberForces[i])return;
    const t=femResults.memberForces[i].maxMoment/maxM;
    const c=lerpColor(loC,hiC,t);
    mesh.material.color.setRGB(c.r,c.g,c.b);
  });
}

function showReactions() {
  while(resultGroup.children.length) resultGroup.remove(resultGroup.children[0]);
  applyAllGroupColors();
  if(!femResults)return;
  const clr=parseInt(getResultColors().reactions.slice(1),16);
  supports.forEach((sup,nid)=>{
    const n=nodeMap.get(nid);
    resultGroup.add(new THREE.ArrowHelper(new THREE.Vector3(0,1,0),m2t(n.x,n.y,n.z),2,clr,0.2,0.15));
  });
}

window.setResultView = function(view,btn) {
  currentResultView=view;
  document.querySelectorAll('#analysis-results .ctrl-btn').forEach(b=>b.classList.remove('active'));
  if(btn)btn.classList.add('active');
  if(view!=='axial'&&view!=='moment') applyAllGroupColors();
  if(view==='deformed')showDeformedShape(parseInt(document.getElementById('def-scale').value));
  else if(view==='axial')showAxialForce();
  else if(view==='moment')showBendingMoment();
  else if(view==='reactions')showReactions();
};
window.updateDeformScale = function(val) {
  document.getElementById('def-scale-val').textContent=val;
  if(currentResultView==='deformed'&&femResults)showDeformedShape(parseInt(val));
};
window.clearResults = function() {
  femResults=null;while(resultGroup.children.length)resultGroup.remove(resultGroup.children[0]);
  applyAllGroupColors();
  document.getElementById('analysis-precheck').classList.remove('hidden');
  document.getElementById('analysis-results').classList.add('hidden');
};

// ============================================================
// RESULTS TABLE
// ============================================================
let tableData = [];
let tableColumns = [];

window.showResultsTable = function(defaultTab) {
  if (!femResults && !cfdResults) return;
  document.getElementById('table-overlay').classList.add('open');
  document.getElementById('table-overlay').style.display = 'flex';
  document.getElementById('canvas-container').classList.add('table-open');
  resizeRenderer();
  const tab = defaultTab || (femResults ? 'nodes' : 'cfd');
  currentTableTab = tab;
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(b => b.classList.toggle('active', b.textContent.toLowerCase() === tab || (tab === 'nodes' && b.textContent === 'Nodes')));
  buildTable(tab);
};

window.showTab = function(tab, btn) {
  currentTableTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  tableSortCol = 0; tableSortDir = 1;
  buildTable(tab);
};

window.closeTable = function() {
  document.getElementById('table-overlay').classList.remove('open');
  document.getElementById('table-overlay').style.display = 'none';
  document.getElementById('canvas-container').classList.remove('table-open');
  resizeRenderer();
};

function buildTable(tab) {
  const thead = document.querySelector('#result-table thead');
  const tbody = document.querySelector('#result-table tbody');
  const u = femResults ? femResults.displacements : null;

  if (tab === 'nodes') {
    if (!u) { tableColumns = ['No FEM results']; tableData = []; renderTable(); return; }
    tableColumns = ['ID','X','Y','Z','Ux (mm)','Uy (mm)','Uz (mm)','Rx (rad)','Ry (rad)','Rz (rad)','|U| (mm)','Support'];
    tableData = nodes.map((n,i) => {
      const ux=u[i*6]*1000, uy=u[i*6+1]*1000, uz=u[i*6+2]*1000;
      const rx=u[i*6+3], ry=u[i*6+4], rz=u[i*6+5];
      const mag = Math.sqrt(ux*ux+uy*uy+uz*uz);
      const sup = supports.has(n.id) ? supports.get(n.id).type : '-';
      return [n.id, n.x, n.y, n.z, ux, uy, uz, rx, ry, rz, mag, sup];
    });
  } else if (tab === 'cfd') {
    if (!cfdResults || !cfdGrid) { tableColumns = ['No CFD results']; tableData = []; renderTable(); return; }
    tableColumns = ['Node ID','X','Y','Z','u (m/s)','v (m/s)','w (m/s)','|V| (m/s)','P (Pa)','Cp','Fx (kN)','Fy (kN)','Fz (kN)'];
    const Uin = parseFloat(document.getElementById('cfd-velocity').value) || 10;
    const rhoAir = parseFloat(document.getElementById('cfd-rho').value) || 1.225;
    const dynP = 0.5 * rhoAir * Uin * Uin;
    tableData = nodes.map(n => {
      const uu = trilinearInterp(cfdResults.u, n.x, n.y, n.z);
      const vv = trilinearInterp(cfdResults.v, n.x, n.y, n.z);
      const ww = trilinearInterp(cfdResults.w, n.x, n.y, n.z);
      const vm = Math.sqrt(uu*uu + vv*vv + ww*ww);
      const pp = trilinearInterp(cfdResults.p, n.x, n.y, n.z);
      const cp = dynP > 0 ? pp / dynP : 0;
      const pl = pointLoads.get(n.id);
      const fx = pl ? pl.fx : 0, fy = pl ? pl.fy : 0, fz = pl ? pl.fz : 0;
      return [n.id, n.x, n.y, n.z, uu, vv, ww, vm, pp, cp, fx, fy, fz];
    });
  } else {
    if (!femResults) { tableColumns = ['No FEM results']; tableData = []; renderTable(); return; }
    tableColumns = ['ID','Start','End','Length (m)','Axial (kN)','ShearY (kN)','ShearZ (kN)','MomentY (kNm)','MomentZ (kNm)','Torsion (kNm)','|M| (kNm)'];
    tableData = beams.map((b,i) => {
      if(!b || !femResults.memberForces[i]) return null;
      const mf = femResults.memberForces[i];
      return [b.id, b.node_start, b.node_end, beamLengths[i], mf.axial, mf.shearY, mf.shearZ, mf.momentY, mf.momentZ, mf.torsion, mf.maxMoment];
    }).filter(r => r !== null);
  }

  renderTable();
}

function renderTable() {
  const thead = document.querySelector('#result-table thead');
  const tbody = document.querySelector('#result-table tbody');

  // Sort
  const sorted = [...tableData].sort((a,b) => {
    const va = a[tableSortCol], vb = b[tableSortCol];
    if (typeof va === 'string') return tableSortDir * va.localeCompare(vb);
    return tableSortDir * (va - vb);
  });

  thead.innerHTML = '<tr>' + tableColumns.map((c,i) =>
    `<th onclick="sortTable(${i})" class="${i===tableSortCol?(tableSortDir===1?'sort-asc':'sort-desc'):''}">${c}</th>`
  ).join('') + '</tr>';

  tbody.innerHTML = sorted.map(row =>
    '<tr>' + row.map(v => `<td>${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(4)) : v}</td>`).join('') + '</tr>'
  ).join('');
}

window.sortTable = function(col) {
  if (tableSortCol === col) tableSortDir *= -1;
  else { tableSortCol = col; tableSortDir = 1; }
  renderTable();
};

window.exportCSV = function() {
  const sorted = [...tableData].sort((a,b) => {
    const va=a[tableSortCol],vb=b[tableSortCol];
    if(typeof va==='string')return tableSortDir*va.localeCompare(vb);
    return tableSortDir*(va-vb);
  });
  let csv = tableColumns.join(',') + '\n';
  sorted.forEach(row => { csv += row.map(v => typeof v==='number'?(Number.isInteger(v)?v:v.toFixed(6)):v).join(',') + '\n'; });
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fem_results_${currentTableTab}.csv`;
  a.click();
};

// ============================================================
// INTERACTION
// ============================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');
let hoveredMesh = null;

renderer.domElement.addEventListener('mousemove', e => {
  const ch = document.getElementById('canvas-container').clientHeight || window.innerHeight;
  mouse.x = (e.clientX/window.innerWidth)*2-1;
  mouse.y = -(e.clientY/ch)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const targets = (currentMode==='supports'||currentMode==='loads'||currentMode==='add-member'||currentMode==='ring-connect') ? nodeMeshes : [...beamMeshes,...nodeMeshes];
  const hits = raycaster.intersectObjects(targets);
  if(hoveredMesh){hoveredMesh.material.emissive?.set(0x000000);hoveredMesh=null;}
  if(hits.length>0){
    const obj=hits[0].object;obj.material.emissive?.set(0x334466);hoveredMesh=obj;
    const ud=obj.userData;
    const ttTitle=document.getElementById('tt-title'),ttBody=document.getElementById('tt-body');
    if(ud.type==='beam'){
      ttTitle.textContent=`Beam #${ud.id}`;
      let h=`<div class="tt-row">Nodes: ${ud.si} \u2192 ${ud.ei}</div><div class="tt-row">L: ${ud.length.toFixed(4)} m</div>`;
      if(femResults){const mf=femResults.memberForces[ud.id];h+=`<div class="tt-row">Axial: ${mf.axial.toFixed(2)} kN</div><div class="tt-row">|M|: ${mf.maxMoment.toFixed(3)} kNm</div>`;}
      ttBody.innerHTML=h;
    } else {
      ttTitle.textContent=`Node #${ud.id}`;
      let h=`<div class="tt-row">(${ud.x.toFixed(2)}, ${ud.y.toFixed(2)}, ${ud.z.toFixed(2)})</div><div class="tt-row">Deg: ${ud.degree}</div>`;
      if(supports.has(ud.id))h+=`<div class="tt-row">Support: ${supports.get(ud.id).type}</div>`;
      if(pointLoads.has(ud.id)){const pl=pointLoads.get(ud.id);h+=`<div class="tt-row">F: (${pl.fx},${pl.fy},${pl.fz}) kN</div>`;}
      if(femResults){const idx=nIdx.get(ud.id);const ux=femResults.displacements[idx*6],uy=femResults.displacements[idx*6+1],uz=femResults.displacements[idx*6+2];h+=`<div class="tt-row">\u0394: (${(ux*1000).toFixed(2)}, ${(uy*1000).toFixed(2)}, ${(uz*1000).toFixed(2)}) mm</div>`;}
      ttBody.innerHTML=h;
    }
    tooltip.style.display='block';tooltip.style.left=(e.clientX+14)+'px';tooltip.style.top=(e.clientY+14)+'px';
  } else if (currentMode === 'cfd' && cfdResults) {
    // CFD hover: raycast against CFD meshes
    const cfdMeshes = cfdGroup.children.filter(c => c.isMesh && c.userData.type === 'cfd-pressure');
    const cfdHits = raycaster.intersectObjects(cfdMeshes);
    if (cfdHits.length > 0) {
      const hit = cfdHits[0];
      const faceIdx = Math.floor(hit.faceIndex);
      const ud = hit.object.userData;
      if (ud.pressures && faceIdx < ud.pressures.length) {
        const pVal = ud.pressures[faceIdx];
        const Uin = parseFloat(document.getElementById('cfd-velocity').value) || 10;
        const rhoAir = parseFloat(document.getElementById('cfd-rho').value) || 1.225;
        const dynP = 0.5 * rhoAir * Uin * Uin;
        const cp = dynP > 0 ? (pVal / dynP).toFixed(3) : '--';
        const tri = ud.triangles[faceIdx];
        const mx = (tri.a.x + tri.b.x + tri.c.x) / 3;
        const mz = (tri.a.z + tri.b.z + tri.c.z) / 3;
        const ttTitle = document.getElementById('tt-title'), ttBody = document.getElementById('tt-body');
        ttTitle.textContent = 'Surface Pressure';
        ttBody.innerHTML =
          `<div class="tt-row">P = ${pVal.toFixed(1)} Pa</div>` +
          `<div class="tt-row">Cp = ${cp}</div>` +
          `<div class="tt-row">Area = ${(tri.area).toFixed(4)} m\u00B2</div>` +
          `<div class="tt-row">Pos: (${mx.toFixed(1)}, ${mz.toFixed(1)})</div>`;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top = (e.clientY + 14) + 'px';
      }
    } else {
      // Check if hovering in the flow field — interpolate
      tooltip.style.display = 'none';
    }
  } else tooltip.style.display='none';
});

renderer.domElement.addEventListener('click', e => {
  const ch = document.getElementById('canvas-container').clientHeight || window.innerHeight;
  mouse.x=(e.clientX/window.innerWidth)*2-1;mouse.y=-(e.clientY/ch)*2+1;
  raycaster.setFromCamera(mouse,camera);

  if (currentMode === 'section') {
    const hits = raycaster.intersectObjects(beamMeshes.filter(m => m !== null));
    if (hits.length) {
      const bi = beamMeshes.indexOf(hits[0].object);
      // Shift+click toggles perimeter membership
      if (e.shiftKey) {
        togglePerimeterBeam(bi);
        return;
      }
      selectedBeamIdx = bi;
      const sec = beamSections.get(bi) || { D: parseFloat(document.getElementById('chs-D').value), t: parseFloat(document.getElementById('chs-t').value) };
      document.getElementById('beam-D').value = sec.D;
      document.getElementById('beam-t').value = sec.t;
      const grpName = beamGroupMap.get(bi) || 'Default';
      document.getElementById('edit-beam-label').textContent = `Beam #${beams[bi].id} (${beams[bi].node_start}\u2192${beams[bi].node_end}) [${grpName}]`;
      document.getElementById('member-edit-section').style.display = '';
      showBeamGroupAssign(bi);
    }
    return;
  }

  if (currentMode === 'add-member') {
    const hits = raycaster.intersectObjects(nodeMeshes);
    if (!hits.length) return;
    const nid = hits[0].object.userData.id;
    newMemberNodes.push(nid);
    hits[0].object.material.emissive.set(0x226622);
    if (newMemberNodes.length === 1) {
      document.getElementById('add-member-status').textContent = `Node #${nid} selected. Click second node...`;
    } else if (newMemberNodes.length === 2) {
      if (newMemberNodes[0] !== newMemberNodes[1]) {
        createNewBeam(newMemberNodes[0], newMemberNodes[1]);
        document.getElementById('add-member-status').textContent = `Beam created: ${newMemberNodes[0]} \u2192 ${newMemberNodes[1]}. Click next pair...`;
      }
      newMemberNodes.forEach(id => {
        const mi = nodeIdToMeshIdx.get(id);
        if (mi !== undefined) nodeMeshes[mi].material.emissive.set(0x000000);
      });
      newMemberNodes = [];
    }
    return;
  }

  if (currentMode === 'ring-connect') {
    const hits = raycaster.intersectObjects(nodeMeshes);
    if (!hits.length) return;
    const nid = hits[0].object.userData.id;

    if (csMode === 'range' || csMode === 'line') {
      if (rangeNode1 === null) {
        clearRingPreview();
        rangeNode1 = nid;
        hits[0].object.material.emissive.set(0x336622);
        updateRingConnectInfo();
      } else {
        rangeNode2 = nid;
        if (csMode === 'line') detectAndPreviewLine();
        else detectAndPreviewRange();
        updateRingConnectInfo();
      }
    } else {
      clearRingPreview();
      ringSourceNodeId = nid;
      ringNodes = detectRing(nid);
      previewRing(ringNodes);
      updateRingConnectInfo();
    }
    return;
  }

  if (currentMode === 'edit-beam') {
    // Check swap preview clicks first
    if (swapPreviewGroup.children.length) {
      const swapHits = raycaster.intersectObjects(swapPreviewGroup.children);
      if (swapHits.length) {
        const ud = swapHits[0].object.userData;
        const idx = swapAlternatives.findIndex(a => a.from === ud.from && a.to === ud.to);
        if (idx >= 0) executeSwap(idx);
        return;
      }
    }
    // Otherwise, select a beam
    const validBeamMeshes = beamMeshes.filter(m => m !== null);
    const hits = raycaster.intersectObjects(validBeamMeshes);
    if (hits.length) {
      const bi = beamMeshes.indexOf(hits[0].object);
      if (bi >= 0 && beams[bi]) selectEditBeam(bi);
    }
    return;
  }

  if(currentMode!=='supports'&&currentMode!=='loads')return;
  const hits=raycaster.intersectObjects(nodeMeshes);if(!hits.length)return;
  const nodeId=hits[0].object.userData.id;
  if(currentMode==='supports') { addSupport(nodeId); updateSupportList(); }
  else if(currentMode==='loads'){
    selectedNodeId=nodeId;
    document.getElementById('point-load-node').textContent=`Selected: Node #${nodeId}`;
    document.getElementById('btn-apply-pl').disabled=false;
    if(pointLoads.has(nodeId)){const pl=pointLoads.get(nodeId);
      document.getElementById('pl-fx').value=pl.fx;document.getElementById('pl-fy').value=pl.fy;document.getElementById('pl-fz').value=pl.fz;
      document.getElementById('pl-mx').value=pl.mx;document.getElementById('pl-my').value=pl.my;document.getElementById('pl-mz').value=pl.mz;
    } else ['pl-fx','pl-fy','pl-fz','pl-mx','pl-my','pl-mz'].forEach(id=>document.getElementById(id).value=0);
  }
});

// ============================================================
// DISPLAY CONTROLS
// ============================================================
window.toggleBeams = function(btn){btn.classList.toggle('active');beamGroup.visible=btn.classList.contains('active');};
window.toggleNodes = function(btn){btn.classList.toggle('active');nodeGroup.visible=btn.classList.contains('active');};
window.toggleNodeLabels = function(btn){
  btn.classList.toggle('active');
  nlVisible = btn.classList.contains('active');
  if (nlVisible && !nlCreated) {
    nodes.forEach(n => {
      const div = document.createElement('div'); div.className='node-label'; div.textContent=n.id;
      labelOverlay.appendChild(div);
      nlDivs.push({div, pos: m2t(n.x,n.y,n.z)});
    });
    nlCreated = true;
  }
  nlDivs.forEach(l => l.div.classList.toggle('show', nlVisible));
  renderer.render(scene, camera);
  updateLabelPositions();
};
window.toggleBeamLabels = function(btn){
  btn.classList.toggle('active');
  blVisible = btn.classList.contains('active');
  if (blVisible && !blCreated) {
    beams.forEach((b,i) => {
      if(!b)return;
      const ns=nodeMap.get(b.node_start),ne=nodeMap.get(b.node_end);
      if(!ns||!ne)return;
      const mid=m2t((ns.x+ne.x)/2,(ns.y+ne.y)/2,(ns.z+ne.z)/2);
      const div=document.createElement('div');div.className='beam-label';div.textContent=b.id;
      labelOverlay.appendChild(div);
      blDivs.push({div, pos: mid});
    });
    blCreated = true;
  }
  blDivs.forEach(l => l.div.classList.toggle('show', blVisible));
  renderer.render(scene, camera);
  updateLabelPositions();
};

// Update labels when camera moves
orbitControls.addEventListener('change', () => {
  if (nlVisible || blVisible) updateLabelPositions();
});
window.resetView = function(){camera.position.set(0,-60,30);orbitControls.target.set(cx,cz,-cy);orbitControls.update();};
window.toggleAutoRotate = function(btn){btn.classList.toggle('active');orbitControls.autoRotate=btn.classList.contains('active');};
window.toggleLoadsVisibility = function(btn){btn.classList.toggle('active');loadGroup.visible=btn.classList.contains('active');};

let darkBg = true;
window.toggleBackground = function(btn) {
  darkBg = !darkBg;
  btn.classList.toggle('active', !darkBg);
  btn.textContent = darkBg ? 'Light BG' : 'Dark BG';
  if (darkBg) {
    scene.background = new THREE.Color(0x0a0a0f);
    document.body.style.background = '#0a0a0f';
    document.body.style.color = '#e0e0e0';
  } else {
    scene.background = new THREE.Color(0xe8ecf0);
    document.body.style.background = '#e8ecf0';
    document.body.style.color = '#222';
  }
};

// ============================================================
// HELP MODALS
// ============================================================
const helpContent = {
  robot: '<h2>Robot Export Setup Guide</h2><p>This guide walks you through running the Robot export script. No programming experience needed.</p><h3>Step 1: Install Python</h3><p>Python is a free program that runs the export script.</p><ol><li>Go to <strong>python.org/downloads</strong></li><li>Click the big yellow <strong>"Download Python"</strong> button</li><li>Run the installer</li><li><strong>IMPORTANT:</strong> Tick <strong>"Add Python to PATH"</strong> at the bottom before clicking Install</li><li>Click <strong>"Install Now"</strong></li></ol><div class="tip">Check if Python is installed: open Command Prompt and type <code>python --version</code></div><h3>Step 2: Install pywin32</h3><p>Open <strong>Command Prompt</strong> and type:</p><div class="cmd-box">pip install pywin32</div><div class="warn">If "pip is not recognized", try: <code>python -m pip install pywin32</code></div><h3>Step 3: Prepare Your Model</h3><ol><li>Set up supports and loads in the viewer</li><li>Go to <strong>Analysis &rarr; Robot Export</strong></li><li>Click <strong>"Download Robot Script"</strong></li></ol><h3>Step 4: Run the Script</h3><div class="cmd-box">cd %USERPROFILE%\\Downloads<br>python robot_export.py</div><p>Robot opens automatically, creates the model, and runs the analysis.</p><h3>Step 5: Import Results</h3><ol><li>Script saves <code>robot_results.json</code> in the same folder</li><li>In viewer: Robot Export &rarr; Step 3 &rarr; Choose File &rarr; Import</li></ol><h3>Troubleshooting</h3><ul><li><strong>"python is not recognized"</strong> &mdash; Reinstall with "Add to PATH"</li><li><strong>"No module named win32com"</strong> &mdash; Run <code>pip install pywin32</code></li><li><strong>"Could not connect to Robot"</strong> &mdash; Ensure Robot is installed</li></ul>',
  fem: '<h2>FEM Analysis Theory</h2><p>The Finite Element Method solver analyses your structure by breaking it into elements and solving for deformations.</p><h3>How It Works</h3><ol><li><strong>Element formulation:</strong> 3D Euler-Bernoulli frame elements, 6 DOF per node</li><li><strong>Assembly:</strong> Element stiffness matrices assembled into global system <strong>K&middot;u = F</strong></li><li><strong>Boundary conditions:</strong> Penalty method (10<sup>15</sup> stiffness)</li><li><strong>Solver:</strong> Preconditioned Conjugate Gradient (tol=10<sup>-8</sup>, max 8000 iter)</li><li><strong>Force recovery:</strong> f = K<sub>local</sub> &middot; T &middot; u</li></ol><h3>CHS Section Properties</h3><ul><li>A = &pi;/4 (D&sup2; &minus; d&sup2;)</li><li>I = &pi;/64 (D&#8308; &minus; d&#8308;)</li><li>J = 2I</li></ul><h3>Units</h3><p>Forces: kN | Moments: kNm | Lengths: m</p><h3>Load Types</h3><ul><li><strong>Self-weight:</strong> &rho;&middot;A&middot;L&middot;g/2 per node</li><li><strong>Live:</strong> Uniform kN/m</li><li><strong>Point loads:</strong> Forces/moments at nodes</li><li><strong>Wind:</strong> From CFD or uniform pressure</li></ul><h3>Results</h3><ul><li><strong>Deformed:</strong> Displaced shape with scale</li><li><strong>Axial:</strong> Tension (blue) to compression (red)</li><li><strong>Bending:</strong> Moment magnitude</li><li><strong>Reactions:</strong> Arrows at supports</li></ul><div class="tip">Validated: cantilever &delta;=PL&sup3;/3EI, simply-supported &delta;=PL&sup3;/48EI, portal frame equilibrium.</div>',
  cfd: '<h2>CFD Wind Analysis Theory</h2><p>Simulates wind flow around your structure using computational fluid dynamics.</p><h3>SIMPLE Algorithm</h3><ol><li><strong>Momentum:</strong> Solve for velocity (u,v,w)</li><li><strong>Pressure correction:</strong> Enforce continuity</li><li><strong>Velocity correction:</strong> Update from pressure</li><li><strong>Turbulence:</strong> k-&epsilon; model</li><li>Repeat until converged</li></ol><h3>k-&epsilon; Turbulence</h3><ul><li>k = turbulent kinetic energy</li><li>&epsilon; = dissipation rate</li><li>&nu;<sub>t</sub> = C<sub>&mu;</sub>k&sup2;/&epsilon;</li></ul><p>C<sub>&mu;</sub>=0.09, C<sub>1&epsilon;</sub>=1.44, C<sub>2&epsilon;</sub>=1.92</p><h3>Grid &amp; Numerics</h3><ul><li>Structured Cartesian grid (12k&ndash;250k cells)</li><li>Hybrid upwind/central differencing</li><li>Gauss-Seidel solver, &alpha;<sub>u</sub>=0.5, &alpha;<sub>p</sub>=0.2</li></ul><h3>Boundaries</h3><ul><li><strong>Inlet:</strong> Uniform velocity + turbulence</li><li><strong>Outlet:</strong> Zero-gradient</li><li><strong>Ground:</strong> No-slip</li><li><strong>Structure:</strong> Immersed boundary (SDF)</li></ul><h3>Pressure Coefficient</h3><p>Cp = p/(&frac12;&rho;U&sup2;) &mdash; +1.0 windward, &minus;0.5 to &minus;1.5 leeward</p><h3>CFD &rarr; FEM</h3><p>Pressure on envelope triangles &rarr; force = p&times;area&times;normal &rarr; kN point loads at nodes</p><div class="warn">For detailed wind engineering, use Robot export with cladding panels.</div>'
};
window.showHelpModal = function(topic) {
  document.getElementById('help-modal-content').innerHTML = helpContent[topic] || '';
  document.getElementById('help-modal-overlay').style.display = 'block';
};
window.closeHelpModal = function() {
  document.getElementById('help-modal-overlay').style.display = 'none';
};

// ============================================================
// TENSION CABLES VISUALIZATION
// ============================================================
const cableGroup = new THREE.Group(); scene.add(cableGroup);
const cableCategories = [
  { id: 'base-ties', name: 'Base Tie Cables', desc: 'Transverse ties between support lines to resist vault thrust', color: '#ff4488', cables: [], visible: true },
  { id: 'edge-bracing', name: 'Edge Terminator Bracing', desc: 'Diagonal bracing at low-connectivity edge nodes', color: '#44ffaa', cables: [], visible: true },
  { id: 'taper-stabilizers', name: 'Upper Taper Stabilizers', desc: 'X-direction cables in the compression taper zone (z=10-12m)', color: '#ffaa22', cables: [], visible: true },
  { id: 'ridge-cables', name: 'Ridge Cables', desc: 'Longitudinal cables along the apex ridge (z>12m)', color: '#aa66ff', cables: [], visible: true },
  { id: 'wind-bracing', name: 'Wind Bracing', desc: 'X-pattern cross-bracing in lower vault (z=4-7m)', color: '#44aaff', cables: [], visible: true }
];
let cablesGenerated = false;

function initCablesPanel() {
  const container = document.getElementById('cable-categories');
  if (container.children.length) return; // already initialized
  cableCategories.forEach((cat, i) => {
    const row = document.createElement('div');
    row.className = 'cable-cat-row active';
    row.dataset.idx = i;
    row.innerHTML = `<div class="cable-swatch" style="background:${cat.color}"></div>
      <div class="cable-info"><div class="cable-name">${cat.name}</div><div class="cable-desc">${cat.desc}</div></div>
      <div class="cable-count" id="cable-count-${i}">0</div>`;
    row.addEventListener('click', () => {
      row.classList.toggle('active');
      cat.visible = row.classList.contains('active');
      cat.cables.forEach(c => { c.visible = cat.visible; });
    });
    container.appendChild(row);
  });
}

function createCableLine(p1, p2, color) {
  const pts = [m2t(p1.x, p1.y, p1.z), m2t(p2.x, p2.y, p2.z)];
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineDashedMaterial({ color, dashSize: 0.4, gapSize: 0.2, linewidth: 1, transparent: true, opacity: 0.85 });
  const line = new THREE.Line(geo, mat);
  line.computeLineDistances();
  return line;
}

window.generateCables = function() {
  // Clear existing
  cableCategories.forEach(cat => { cat.cables.forEach(c => cableGroup.remove(c)); cat.cables = []; });

  // Build spatial lookups
  const nodesByZ = {};
  nodes.forEach(n => {
    const zBin = Math.round(n.z * 4) / 4; // 0.25m bins
    if (!nodesByZ[zBin]) nodesByZ[zBin] = [];
    nodesByZ[zBin].push(n);
  });

  // Adjacency for finding neighbors
  const adj = new Map();
  nodes.forEach(n => adj.set(n.id, []));
  beams.forEach(b => {
    if(!b)return;
    adj.get(b.node_start).push(b.node_end);
    adj.get(b.node_end).push(b.node_start);
  });

  // ---- 1. BASE TIE CABLES ----
  // Find support nodes, pair by closest X on opposite Y sides
  const supportNodes = [];
  supports.forEach((sup, nid) => supportNodes.push(nodeMap.get(nid)));
  if (supportNodes.length >= 2) {
    const posY = supportNodes.filter(n => n.y > 0).sort((a,b) => a.x - b.x);
    const negY = supportNodes.filter(n => n.y < 0).sort((a,b) => a.x - b.x);
    // Pair closest X values
    posY.forEach(pn => {
      let best = null, bestD = Infinity;
      negY.forEach(nn => {
        const d = Math.abs(pn.x - nn.x);
        if (d < bestD) { bestD = d; best = nn; }
      });
      if (best && bestD < 5) {
        const line = createCableLine(pn, best, cableCategories[0].color);
        cableCategories[0].cables.push(line);
        cableGroup.add(line);
      }
    });
  }
  // If no supports defined, use base-level nodes (z < 4m)
  if (supportNodes.length === 0) {
    const baseNodes = nodes.filter(n => n.z < (minZ + 1.5));
    const posY = baseNodes.filter(n => n.y > 0).sort((a,b) => a.x - b.x);
    const negY = baseNodes.filter(n => n.y < 0).sort((a,b) => a.x - b.x);
    // Sample every 3rd node to avoid clutter
    for (let i = 0; i < posY.length; i += 3) {
      const pn = posY[i];
      let best = null, bestD = Infinity;
      negY.forEach(nn => { const d = Math.abs(pn.x - nn.x); if (d < bestD) { bestD = d; best = nn; } });
      if (best && bestD < 8) {
        const line = createCableLine(pn, best, cableCategories[0].color);
        cableCategories[0].cables.push(line);
        cableGroup.add(line);
      }
    }
  }

  // ---- 2. EDGE TERMINATOR BRACING ----
  // Find nodes with degree <= 2, connect to nearest degree-4 neighbors
  nodes.forEach(n => {
    const deg = degree.get(n.id);
    if (deg <= 2) {
      const neighbors = adj.get(n.id);
      // Find 2nd-hop neighbors (degree 4) not already connected
      const connected = new Set(neighbors);
      connected.add(n.id);
      neighbors.forEach(nid => {
        adj.get(nid).forEach(nid2 => {
          if (!connected.has(nid2) && degree.get(nid2) >= 4) {
            connected.add(nid2);
            const n2 = nodeMap.get(nid2);
            const line = createCableLine(n, n2, cableCategories[1].color);
            cableCategories[1].cables.push(line);
            cableGroup.add(line);
          }
        });
      });
    }
  });

  // ---- 3. UPPER TAPER STABILIZERS (z=10-12m) ----
  const taperNodes = nodes.filter(n => n.z >= 10 && n.z <= 12.5).sort((a,b) => a.x - b.x);
  // Group by approximate Z and connect across X
  const taperZBins = {};
  taperNodes.forEach(n => {
    const zk = Math.round(n.z * 2) / 2;
    if (!taperZBins[zk]) taperZBins[zk] = [];
    taperZBins[zk].push(n);
  });
  Object.values(taperZBins).forEach(group => {
    // Connect nodes at positive Y to negative Y within same Z band
    const posY = group.filter(n => n.y > 1).sort((a,b) => a.x - b.x);
    const negY = group.filter(n => n.y < -1).sort((a,b) => a.x - b.x);
    for (let i = 0; i < posY.length; i += 2) {
      const pn = posY[i];
      let best = null, bestD = Infinity;
      negY.forEach(nn => { const d = Math.abs(pn.x - nn.x); if (d < bestD) { bestD = d; best = nn; } });
      if (best) {
        const line = createCableLine(pn, best, cableCategories[2].color);
        cableCategories[2].cables.push(line);
        cableGroup.add(line);
      }
    }
    // Also add some diagonal cross-cables for shear stiffness
    if (posY.length > 1 && negY.length > 0) {
      for (let i = 0; i < posY.length - 1; i += 3) {
        let best = null, bestD = Infinity;
        negY.forEach(nn => { const d = Math.abs(posY[i].x - nn.x) + Math.abs(posY[i].y - nn.y); if (d < bestD) { bestD = d; best = nn; } });
        if (best) {
          const line = createCableLine(posY[i+1] || posY[i], best, cableCategories[2].color);
          cableCategories[2].cables.push(line);
          cableGroup.add(line);
        }
      }
    }
  });

  // ---- 4. RIDGE CABLES (z > 12m) ----
  const ridgeNodes = nodes.filter(n => n.z >= 12).sort((a,b) => {
    // Sort by Y then X to form continuous ridge lines
    const dy = Math.abs(b.y) - Math.abs(a.y);
    if (Math.abs(dy) > 2) return dy;
    return a.x - b.x;
  });
  // Separate into positive Y ridge and negative Y ridge
  const ridgePosY = ridgeNodes.filter(n => n.y > 0).sort((a,b) => a.x - b.x);
  const ridgeNegY = ridgeNodes.filter(n => n.y < 0).sort((a,b) => a.x - b.x);
  [ridgePosY, ridgeNegY].forEach(ridge => {
    for (let i = 0; i < ridge.length - 1; i++) {
      const d = Math.sqrt((ridge[i].x - ridge[i+1].x)**2 + (ridge[i].y - ridge[i+1].y)**2 + (ridge[i].z - ridge[i+1].z)**2);
      if (d < 6) { // Only connect if reasonably close
        const line = createCableLine(ridge[i], ridge[i+1], cableCategories[3].color);
        cableCategories[3].cables.push(line);
        cableGroup.add(line);
      }
    }
  });
  // Cross-connect the two ridges
  for (let i = 0; i < Math.min(ridgePosY.length, ridgeNegY.length); i += 2) {
    const line = createCableLine(ridgePosY[i], ridgeNegY[Math.min(i, ridgeNegY.length-1)], cableCategories[3].color);
    cableCategories[3].cables.push(line);
    cableGroup.add(line);
  }

  // ---- 5. WIND BRACING (z=4-7m) ----
  const windNodes = nodes.filter(n => n.z >= 4 && n.z <= 7);
  // Create X-bracing on outer edges - use 70th percentile of |y| in this zone
  const windAbsY = windNodes.map(n => Math.abs(n.y)).sort((a,b) => a - b);
  const yThresh = windAbsY.length > 0 ? windAbsY[Math.floor(windAbsY.length * 0.7)] : 5;
  const outerPosY = windNodes.filter(n => n.y > yThresh).sort((a,b) => a.x - b.x);
  const outerNegY = windNodes.filter(n => n.y < -yThresh).sort((a,b) => a.x - b.x);
  // Sample and create X-pattern cables along each edge
  [outerPosY, outerNegY].forEach(edge => {
    // Group by approximate Z for cross-bracing
    const zGroups = {};
    edge.forEach(n => {
      const zk = Math.round(n.z);
      if (!zGroups[zk]) zGroups[zk] = [];
      zGroups[zk].push(n);
    });
    const zKeys = Object.keys(zGroups).map(Number).sort();
    for (let zi = 0; zi < zKeys.length - 1; zi++) {
      const lower = zGroups[zKeys[zi]].sort((a,b) => a.x - b.x);
      const upper = zGroups[zKeys[zi+1]].sort((a,b) => a.x - b.x);
      // Create X-bracing every few nodes
      for (let i = 0; i < Math.min(lower.length, upper.length) - 1; i += 4) {
        const j = Math.min(i + 1, upper.length - 1);
        // Diagonal 1
        const line1 = createCableLine(lower[i], upper[j], cableCategories[4].color);
        cableCategories[4].cables.push(line1);
        cableGroup.add(line1);
        // Diagonal 2 (X pattern)
        if (i + 1 < lower.length) {
          const line2 = createCableLine(lower[i+1], upper[Math.max(0, j-1)], cableCategories[4].color);
          cableCategories[4].cables.push(line2);
          cableGroup.add(line2);
        }
      }
    }
  });

  // Update counts and summary
  let totalCables = 0;
  cableCategories.forEach((cat, i) => {
    document.getElementById('cable-count-' + i).textContent = cat.cables.length;
    totalCables += cat.cables.length;
    // Apply current visibility
    cat.cables.forEach(c => { c.visible = cat.visible; });
  });

  const summary = document.getElementById('cable-summary');
  summary.style.display = '';
  summary.innerHTML = `<strong>${totalCables}</strong> tension cables generated across <strong>5</strong> categories.<br><span style="font-size:9px;color:#668;margin-top:4px;display:block;">Click category rows above to toggle visibility. Cables shown as dashed lines.</span>`;
  cablesGenerated = true;
};

window.toggleAllCables = function(show) {
  cableCategories.forEach((cat, i) => {
    cat.visible = show;
    cat.cables.forEach(c => { c.visible = show; });
    const row = document.querySelectorAll('.cable-cat-row')[i];
    if (row) row.classList.toggle('active', show);
  });
};

window.clearCables = function() {
  cableCategories.forEach(cat => {
    cat.cables.forEach(c => cableGroup.remove(c));
    cat.cables = [];
  });
  cableCategories.forEach((cat, i) => {
    const el = document.getElementById('cable-count-' + i);
    if (el) el.textContent = '0';
  });
  const summary = document.getElementById('cable-summary');
  summary.style.display = 'none';
  cablesGenerated = false;
};

window.toggleCablesVisibility = function(btn) {
  btn.classList.toggle('active');
  cableGroup.visible = btn.classList.contains('active');
};

// ============================================================
// RESIZE & ANIMATE
// ============================================================
function resizeRenderer() {
  const c = document.getElementById('canvas-container');
  const w = c.clientWidth, h = c.clientHeight;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labelOverlay.style.width = w + 'px';
  labelOverlay.style.height = h + 'px';
}

window.addEventListener('resize', () => {
  resizeRenderer();
});

function updateLabelPositions() {
  camera.updateMatrixWorld();
  const sz = renderer.getSize(new THREE.Vector2());
  const w2 = sz.x / 2;
  const h2 = sz.y / 2;
  if (w2 === 0 || h2 === 0) return;
  const v = new THREE.Vector3();
  const project = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      const l = arr[i];
      v.set(l.pos.x, l.pos.y, l.pos.z);
      v.project(camera);
      if (v.z > 1 || isNaN(v.x)) { l.div.style.visibility = 'hidden'; continue; }
      l.div.style.left = Math.round(v.x * w2 + w2) + 'px';
      l.div.style.top = Math.round(-v.y * h2 + h2) + 'px';
      l.div.style.visibility = 'visible';
    }
  };
  if (nlVisible && nlDivs.length) project(nlDivs);
  if (blVisible && blDivs.length) project(blDivs);
}

// ============================================================
// CFD: ENVELOPE MESH GENERATION
// ============================================================
window.updateCFDPrecheck = function() {
  const res = document.getElementById('cfd-resolution').value;
  const mult = parseFloat(document.getElementById('cfd-domain-mult').value) || 3;
  const sx = (maxX - minX) * mult, sy = (maxY - minY) * mult, sz = (maxZ - minZ) * mult + maxZ * 0.5;
  let nx, ny, nz;
  if (res === 'quick') { nx=40; ny=20; nz=15; }
  else if (res === 'standard') { nx=80; ny=40; nz=25; }
  else { nx=120; ny=60; nz=35; }
  const N = nx * ny * nz;
  const mem = (N * 14 * 8 / 1048576).toFixed(1);
  const est = res === 'quick' ? '5-15s' : res === 'standard' ? '30-90s' : '3-8min';
  document.getElementById('cfd-precheck').innerHTML =
    `Domain: ${sx.toFixed(0)}×${sy.toFixed(0)}×${sz.toFixed(0)} m<br>Grid: ${nx}×${ny}×${nz} = <strong>${N.toLocaleString()}</strong> cells<br>Memory: ~${mem} MB | Est. time: ${est}`;
  document.getElementById('btn-run-cfd').disabled = !cfdEnvelope;
}

window.generateEnvelope = function() {
  // Build adjacency from diagrid beams
  const adj = new Map();
  nodes.forEach(n => adj.set(n.id, new Set()));
  beams.forEach(b => {
    if(!b)return;
    adj.get(b.node_start).add(b.node_end);
    adj.get(b.node_end).add(b.node_start);
  });

  const envTriangles = [];
  const centroid = { x: cx, y: cy, z: cz };

  function addTri(na, nb, nc) {
    const v1x = nb.x - na.x, v1y = nb.y - na.y, v1z = nb.z - na.z;
    const v2x = nc.x - na.x, v2y = nc.y - na.y, v2z = nc.z - na.z;
    let tnx = v1y * v2z - v1z * v2y, tny = v1z * v2x - v1x * v2z, tnz = v1x * v2y - v1y * v2x;
    const nm = Math.sqrt(tnx * tnx + tny * tny + tnz * tnz);
    if (nm < 1e-12) return;
    tnx /= nm; tny /= nm; tnz /= nm;
    const mx = (na.x + nb.x + nc.x) / 3, my = (na.y + nb.y + nc.y) / 3, mz = (na.z + nb.z + nc.z) / 3;
    const dot = (mx - centroid.x) * tnx + (my - centroid.y) * tny + (mz - centroid.z) * tnz;
    if (dot < 0) { tnx = -tnx; tny = -tny; tnz = -tnz; }
    envTriangles.push({ a: na, b: nb, c: nc, nx: tnx, ny: tny, nz: tnz, area: nm / 2 });
  }

  // Find triangles (3-cycles): three nodes where all pairs connected
  const triSet = new Set();
  beams.forEach(b => {
    if(!b)return;
    const nA = b.node_start, nB = b.node_end;
    adj.get(nA).forEach(nC => {
      if (nC === nB) return;
      if (adj.get(nB).has(nC)) {
        const sorted = [nA, nB, nC].sort((a, b) => a - b);
        const key = sorted.join(',');
        if (triSet.has(key)) return;
        triSet.add(key);
        addTri(nodeMap.get(sorted[0]), nodeMap.get(sorted[1]), nodeMap.get(sorted[2]));
      }
    });
  });

  // Find quads (4-cycles): A-B, B-C, C-D, D-A where A-C and B-D are NOT connected
  // Each quad is split into 2 triangles
  const quadSet = new Set();
  beams.forEach(b => {
    if(!b)return;
    const nA = b.node_start, nB = b.node_end;
    // For each neighbor C of B (C != A), find neighbor D of C that is also neighbor of A (D != B)
    adj.get(nB).forEach(nC => {
      if (nC === nA) return;
      if (adj.get(nA).has(nC)) return; // A-C connected = triangle, already handled
      adj.get(nC).forEach(nD => {
        if (nD === nB || nD === nA) return;
        if (!adj.get(nA).has(nD)) return; // D must connect to A
        if (adj.get(nB).has(nD)) return; // B-D connected = not a simple quad
        const sorted = [nA, nB, nC, nD].sort((a, b) => a - b);
        const key = sorted.join(',');
        if (quadSet.has(key)) return;
        quadSet.add(key);
        // Quad A-B-C-D: split into two triangles A-B-C and A-C-D
        const qa = nodeMap.get(nA), qb = nodeMap.get(nB), qc = nodeMap.get(nC), qd = nodeMap.get(nD);
        addTri(qa, qb, qc);
        addTri(qa, qc, qd);
      });
    });
  });

  // Identify boundary vs interior nodes
  const triNodeIds = new Set();
  envTriangles.forEach(t => { triNodeIds.add(t.a.id); triNodeIds.add(t.b.id); triNodeIds.add(t.c.id); });
  const bNodes = nodes.filter(n => triNodeIds.has(n.id));
  const iNodes = nodes.filter(n => !triNodeIds.has(n.id));

  cfdEnvelope = { triangles: envTriangles, boundaryNodes: bNodes, interiorNodes: iNodes };

  // Visualize
  while (cfdGroup.children.length) cfdGroup.remove(cfdGroup.children[0]);
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array(envTriangles.length * 9);
  const norms = new Float32Array(envTriangles.length * 9);
  envTriangles.forEach((t, i) => {
    const p = [t.a, t.b, t.c];
    for (let j = 0; j < 3; j++) {
      const v = m2t(p[j].x, p[j].y, p[j].z);
      verts[i * 9 + j * 3] = v.x; verts[i * 9 + j * 3 + 1] = v.y; verts[i * 9 + j * 3 + 2] = v.z;
      const nv = m2t(t.nx, t.ny, t.nz); // approximate normal transform
      norms[i * 9 + j * 3] = nv.x; norms[i * 9 + j * 3 + 1] = nv.y; norms[i * 9 + j * 3 + 2] = nv.z;
    }
  });
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(norms, 3));
  const mat = new THREE.MeshPhongMaterial({ color: 0x4488ff, transparent: true, opacity: 0.15, side: THREE.DoubleSide, wireframe: false });
  const mesh = new THREE.Mesh(geo, mat);
  cfdGroup.add(mesh);
  // Wireframe overlay
  const wf = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.3, wireframe: true }));
  cfdGroup.add(wf);

  document.getElementById('btn-run-cfd').disabled = false;
  updateCFDPrecheck();
};

function delaunay2D(pts) {
  // Bowyer-Watson
  const n = pts.length;
  if (n < 3) return [];
  // Super-triangle
  let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
  pts.forEach(p => { sMinX = Math.min(sMinX, p.s); sMaxX = Math.max(sMaxX, p.s); sMinY = Math.min(sMinY, p.t); sMaxY = Math.max(sMaxY, p.t); });
  const dmax = Math.max(sMaxX - sMinX, sMaxY - sMinY) * 2;
  const midX = (sMinX + sMaxX) / 2, midY = (sMinY + sMaxY) / 2;
  const superA = { s: midX - dmax * 2, t: midY - dmax };
  const superB = { s: midX + dmax * 2, t: midY - dmax };
  const superC = { s: midX, t: midY + dmax * 2 };
  const allPts = [...pts, superA, superB, superC];
  const si = n, sj = n + 1, sk = n + 2;

  let tris = [[si, sj, sk]];

  for (let pi = 0; pi < n; pi++) {
    const px = allPts[pi].s, py = allPts[pi].t;
    const bad = [];
    for (let ti = 0; ti < tris.length; ti++) {
      const [a, b, c] = tris[ti];
      const ax = allPts[a].s, ay = allPts[a].t;
      const bx = allPts[b].s, by = allPts[b].t;
      const ccx = allPts[c].s, ccy = allPts[c].t;
      const D2 = 2 * (ax * (by - ccy) + bx * (ccy - ay) + ccx * (ay - by));
      if (Math.abs(D2) < 1e-14) continue;
      const ux = ((ax * ax + ay * ay) * (by - ccy) + (bx * bx + by * by) * (ccy - ay) + (ccx * ccx + ccy * ccy) * (ay - by)) / D2;
      const uy = ((ax * ax + ay * ay) * (ccx - bx) + (bx * bx + by * by) * (ax - ccx) + (ccx * ccx + ccy * ccy) * (bx - ax)) / D2;
      const r2 = (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy);
      const d2 = (px - ux) * (px - ux) + (py - uy) * (py - uy);
      if (d2 < r2) bad.push(ti);
    }
    // Find boundary polygon
    const edges = [];
    bad.forEach(ti => {
      const [a, b, c] = tris[ti];
      edges.push([a, b], [b, c], [c, a]);
    });
    // Remove shared edges
    const unique = [];
    for (let i = 0; i < edges.length; i++) {
      let shared = false;
      for (let j = 0; j < edges.length; j++) {
        if (i === j) continue;
        if ((edges[i][0] === edges[j][1] && edges[i][1] === edges[j][0])) { shared = true; break; }
      }
      if (!shared) unique.push(edges[i]);
    }
    // Remove bad triangles (reverse order)
    bad.sort((a, b) => b - a).forEach(ti => tris.splice(ti, 1));
    // Add new triangles
    unique.forEach(e => tris.push([e[0], e[1], pi]));
  }
  // Remove super-triangle vertices
  return tris.filter(t => t[0] < n && t[1] < n && t[2] < n);
}

// ============================================================
// CFD: GRID CONSTRUCTION & SDF
// ============================================================
function buildCFDGrid() {
  const res = document.getElementById('cfd-resolution').value;
  const mult = parseFloat(document.getElementById('cfd-domain-mult').value) || 3;
  let nx, ny, nz;
  if (res === 'quick') { nx = 40; ny = 20; nz = 15; }
  else if (res === 'standard') { nx = 80; ny = 40; nz = 25; }
  else { nx = 120; ny = 60; nz = 35; }

  const padX = (maxX - minX) * (mult - 1) / 2;
  const padY = (maxY - minY) * (mult - 1) / 2;
  const x0 = minX - padX, x1 = maxX + padX;
  const y0 = minY - padY, y1 = maxY + padY;
  const z0g = 0; // ground
  const z1 = maxZ + (maxZ - minZ) * (mult - 1) / 2;
  const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny, dz = (z1 - z0g) / nz;
  const N = nx * ny * nz;

  return {
    nx, ny, nz, N, dx, dy, dz,
    x0, y0, z0: z0g, x1, y1, z1,
    idx: (i, j, k) => i + j * nx + k * nx * ny,
    cellCenter: (i, j, k) => ({
      x: x0 + (i + 0.5) * dx,
      y: y0 + (j + 0.5) * dy,
      z: z0g + (k + 0.5) * dz
    })
  };
}

function computeSDF(grid, envelope) {
  const { nx, ny, nz, N, idx, cellCenter } = grid;
  const sdf = new Float64Array(N);
  const cellType = new Uint8Array(N); // 0=fluid, 1=solid, 2=interface
  const tris = envelope.triangles;

  // Shell thickness: cells within this distance of the surface are solid
  // Use 1.5x the cell diagonal so the shell is at least 1 cell thick
  const cellDiag = Math.sqrt(grid.dx ** 2 + grid.dy ** 2 + grid.dz ** 2);
  const shellThickness = Math.min(cellDiag * 1.5, avgLen * 0.5);

  // Adaptive spatial hash — scale to structure size
  const hashSize = Math.max(grid.dx, grid.dy, grid.dz) * 5;
  const triHash = new Map();
  tris.forEach((t, ti) => {
    // Hash all 3 vertices + centroid to cover the triangle's extent
    const pts = [
      { x: t.a.x, y: t.a.y, z: t.a.z },
      { x: t.b.x, y: t.b.y, z: t.b.z },
      { x: t.c.x, y: t.c.y, z: t.c.z },
      { x: (t.a.x+t.b.x+t.c.x)/3, y: (t.a.y+t.b.y+t.c.y)/3, z: (t.a.z+t.b.z+t.c.z)/3 }
    ];
    const keys = new Set();
    for (const p of pts) {
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
        keys.add(`${Math.floor((p.x + di * hashSize) / hashSize)},${Math.floor((p.y + dj * hashSize) / hashSize)},${Math.floor((p.z + dk * hashSize) / hashSize)}`);
      }
    }
    for (const key of keys) {
      if (!triHash.has(key)) triHash.set(key, []);
      triHash.get(key).push(ti);
    }
  });

  function pointTriDist(px, py, pz, t) {
    const ax = t.a.x, ay = t.a.y, az = t.a.z;
    const e1x = t.b.x - ax, e1y = t.b.y - ay, e1z = t.b.z - az;
    const e2x = t.c.x - ax, e2y = t.c.y - ay, e2z = t.c.z - az;
    const vpx = px - ax, vpy = py - ay, vpz = pz - az;
    const d11 = e1x * e1x + e1y * e1y + e1z * e1z;
    const d12 = e1x * e2x + e1y * e2y + e1z * e2z;
    const d22 = e2x * e2x + e2y * e2y + e2z * e2z;
    const dp1 = vpx * e1x + vpy * e1y + vpz * e1z;
    const dp2 = vpx * e2x + vpy * e2y + vpz * e2z;
    const det = d11 * d22 - d12 * d12;
    let s = (d22 * dp1 - d12 * dp2) / (det + 1e-30);
    let tt = (d11 * dp2 - d12 * dp1) / (det + 1e-30);
    s = Math.max(0, Math.min(1, s));
    tt = Math.max(0, Math.min(1 - s, tt));
    const cx = ax + s * e1x + tt * e2x, cy = ay + s * e1y + tt * e2y, cz = az + s * e1z + tt * e2z;
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2);
  }

  // Compute unsigned distance to nearest surface triangle for each cell
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const cc = cellCenter(i, j, k);
    const hk = `${Math.floor(cc.x / hashSize)},${Math.floor(cc.y / hashSize)},${Math.floor(cc.z / hashSize)}`;
    const nearby = triHash.get(hk) || [];
    let minDist = Infinity;
    for (let ti = 0; ti < nearby.length; ti++) {
      const d = pointTriDist(cc.x, cc.y, cc.z, tris[nearby[ti]]);
      if (d < minDist) minDist = d;
    }
    // Fallback: if hash missed, check all triangles
    if (nearby.length === 0) {
      for (let ti = 0; ti < tris.length; ti++) {
        const d = pointTriDist(cc.x, cc.y, cc.z, tris[ti]);
        if (d < minDist) minDist = d;
      }
    }
    sdf[idx(i, j, k)] = minDist;
  }

  // Classify cells: immersed boundary for thin shell
  // Cells close to surface = solid, slightly further = interface, rest = fluid
  for (let ii = 0; ii < N; ii++) {
    if (sdf[ii] < shellThickness * 0.5) cellType[ii] = 1;       // solid (inside shell)
    else if (sdf[ii] < shellThickness * 1.2) cellType[ii] = 2;  // interface (near shell)
    else cellType[ii] = 0;                                        // fluid
  }

  return { sdf, cellType };
}

// ============================================================
// CFD: WEB WORKER RANS SOLVER
// ============================================================
function createCFDWorkerCode() {
  return `
'use strict';
self.onmessage = function(e) {
  const { nx, ny, nz, dx, dy, dz, cellType, rho, mu, Uin, Ux_in, Uy_in, dirAxis, dirSign, k_in, eps_in, maxIter, tol } = e.data;
  const N = nx * ny * nz;
  const idx = (i, j, k) => i + j * nx + k * nx * ny;

  // k-epsilon constants
  const Cmu = 0.09, C1e = 1.44, C2e = 1.92, sigmaK = 1.0, sigmaE = 1.3;

  // Field arrays
  const u = new Float64Array(N), v = new Float64Array(N), w = new Float64Array(N);
  const p = new Float64Array(N);
  const k = new Float64Array(N), eps = new Float64Array(N), nut = new Float64Array(N);
  const pp = new Float64Array(N);
  const aP_u = new Float64Array(N), aP_v = new Float64Array(N), aP_w = new Float64Array(N);

  // Under-relaxation
  const alphaU = 0.5, alphaP = 0.2, alphaK = 0.5, alphaE = 0.5;

  // Initialize fields with wind angle components
  for (let ii = 0; ii < N; ii++) {
    if (cellType[ii] !== 1) {
      u[ii] = Ux_in;
      v[ii] = Uy_in;
      k[ii] = k_in;
      eps[ii] = eps_in;
      nut[ii] = Cmu * k_in * k_in / (eps_in + 1e-30);
    }
  }

  // Face areas
  const Ax = dy * dz, Ay = dx * dz, Az = dx * dy;
  const vol = dx * dy * dz;

  // Determine inlet/outlet faces based on wind direction
  // Inlet faces are where flow enters the domain
  const xInlet = Ux_in > 0 ? 0 : nx - 1;
  const xOutlet = Ux_in > 0 ? nx - 1 : 0;
  const yInlet = Uy_in > 0 ? 0 : ny - 1;
  const yOutlet = Uy_in > 0 ? ny - 1 : 0;
  const xHasFlow = Math.abs(Ux_in) > 0.01;
  const yHasFlow = Math.abs(Uy_in) > 0.01;

  function applyBC(field, bcType) {
    // X boundaries
    for (let j = 0; j < ny; j++) for (let kk = 0; kk < nz; kk++) {
      if (bcType === 'vel_u') {
        if (xHasFlow) { field[idx(xInlet, j, kk)] = Ux_in; field[idx(xOutlet, j, kk)] = field[idx(xOutlet + (Ux_in > 0 ? -1 : 1), j, kk)] || 0; }
        else { field[idx(0, j, kk)] = field[idx(1, j, kk)]; field[idx(nx-1, j, kk)] = field[idx(nx-2, j, kk)]; }
      } else if (bcType === 'vel_v') {
        if (xHasFlow) { field[idx(xInlet, j, kk)] = Uy_in; field[idx(xOutlet, j, kk)] = field[idx(xOutlet + (Ux_in > 0 ? -1 : 1), j, kk)] || 0; }
        else { field[idx(0, j, kk)] = field[idx(1, j, kk)]; field[idx(nx-1, j, kk)] = field[idx(nx-2, j, kk)]; }
      } else if (bcType === 'vel_w') {
        field[idx(0, j, kk)] = 0; field[idx(nx-1, j, kk)] = field[idx(nx-2, j, kk)];
      } else if (bcType === 'p') {
        if (xHasFlow) { field[idx(xOutlet, j, kk)] = 0; field[idx(xInlet, j, kk)] = field[idx(xInlet + (Ux_in > 0 ? 1 : -1), j, kk)] || 0; }
      } else if (bcType === 'k') {
        if (xHasFlow) { field[idx(xInlet, j, kk)] = k_in; }
        field[idx(xOutlet, j, kk)] = field[idx(xOutlet + (Ux_in > 0 ? -1 : 1), j, kk)] || 0;
      } else if (bcType === 'eps') {
        if (xHasFlow) { field[idx(xInlet, j, kk)] = eps_in; }
        field[idx(xOutlet, j, kk)] = field[idx(xOutlet + (Ux_in > 0 ? -1 : 1), j, kk)] || 0;
      }
    }
    // Y boundaries
    for (let i = 0; i < nx; i++) for (let kk = 0; kk < nz; kk++) {
      if (bcType === 'vel_v') {
        if (yHasFlow) { field[idx(i, yInlet, kk)] = Uy_in; field[idx(i, yOutlet, kk)] = field[idx(i, yOutlet + (Uy_in > 0 ? -1 : 1), kk)] || 0; }
        else { field[idx(i, 0, kk)] = 0; field[idx(i, ny-1, kk)] = 0; }
      } else if (bcType === 'vel_u') {
        if (yHasFlow) { field[idx(i, yInlet, kk)] = Ux_in; field[idx(i, yOutlet, kk)] = field[idx(i, yOutlet + (Uy_in > 0 ? -1 : 1), kk)] || 0; }
        else { field[idx(i, 0, kk)] = field[idx(i, 1, kk)]; field[idx(i, ny-1, kk)] = field[idx(i, ny-2, kk)]; }
      } else if (bcType === 'vel_w') {
        field[idx(i, 0, kk)] = 0; field[idx(i, ny-1, kk)] = field[idx(i, ny-2, kk)];
      } else {
        field[idx(i, 0, kk)] = field[idx(i, 1, kk)]; field[idx(i, ny-1, kk)] = field[idx(i, ny-2, kk)];
        if (yHasFlow && (bcType === 'k' || bcType === 'eps')) {
          field[idx(i, yInlet, kk)] = bcType === 'k' ? k_in : eps_in;
        }
      }
    }
    if (yHasFlow && bcType === 'p') {
      for (let i = 0; i < nx; i++) for (let kk = 0; kk < nz; kk++) {
        field[idx(i, yOutlet, kk)] = 0;
      }
    }
        if (bcType === 'vel_v') { field[idx(i, 0, kk)] = 0; field[idx(i, ny - 1, kk)] = 0; }
        else { field[idx(i, 0, kk)] = field[idx(i, 1, kk)]; field[idx(i, ny - 1, kk)] = field[idx(i, ny - 2, kk)]; }
      }
      if (jOut >= 0) { field[idx(i, jOut, kk)] = field[idx(i, Math.max(0, Math.min(ny-1, jOut + (dirSign > 0 ? -1 : 1))), kk)]; }
    }
    // Z boundaries (ground=no-slip, top=slip)
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      if (bcType.startsWith('vel')) { field[idx(i, j, 0)] = 0; } // ground no-slip
      else { field[idx(i, j, 0)] = field[idx(i, j, 1)]; }
      // Top: slip
      if (bcType === 'vel_w') field[idx(i, j, nz - 1)] = 0;
      else field[idx(i, j, nz - 1)] = field[idx(i, j, nz - 2)];
    }
    // Solid cells
    for (let ii = 0; ii < N; ii++) {
      if (cellType[ii] === 1) field[ii] = 0;
    }
  }

  function solveGS(aP, aE, aW, aN, aS, aT, aB, src, phi, nSweeps) {
    for (let sweep = 0; sweep < nSweeps; sweep++) {
      for (let kk = 1; kk < nz - 1; kk++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
        const ii = idx(i, j, kk);
        if (cellType[ii] === 1) continue;
        const ap = aP[ii];
        if (ap < 1e-30) continue;
        let val = (src[ii]
          + aE[ii] * phi[idx(i + 1, j, kk)] + aW[ii] * phi[idx(i - 1, j, kk)]
          + aN[ii] * phi[idx(i, j + 1, kk)] + aS[ii] * phi[idx(i, j - 1, kk)]
          + aT[ii] * phi[idx(i, j, kk + 1)] + aB[ii] * phi[idx(i, j, kk - 1)]
        ) / ap;
        if (!isFinite(val)) val = 0;
        phi[ii] = val;
      }
    }
  }

  // Coefficient arrays
  const aP = new Float64Array(N), aE = new Float64Array(N), aW = new Float64Array(N);
  const aN = new Float64Array(N), aS = new Float64Array(N), aT = new Float64Array(N), aB = new Float64Array(N);
  const src = new Float64Array(N);

  function assembleMomentum(vel, velComp, apStore) {
    aP.fill(0); aE.fill(0); aW.fill(0); aN.fill(0); aS.fill(0); aT.fill(0); aB.fill(0); src.fill(0);
    for (let kk = 1; kk < nz - 1; kk++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const ii = idx(i, j, kk);
      if (cellType[ii] !== 0) { aP[ii] = 1e30; src[ii] = 0; continue; }

      const muEff = mu + nut[ii] * rho;

      // Diffusion
      const De = muEff * Ax / dx, Dw = muEff * Ax / dx;
      const Dn = muEff * Ay / dy, Ds = muEff * Ay / dy;
      const Dt = muEff * Az / dz, Db = muEff * Az / dz;

      // Convection (upwind)
      const Fe = rho * 0.5 * (u[ii] + u[idx(i + 1, j, kk)]) * Ax;
      const Fw = rho * 0.5 * (u[ii] + u[idx(i - 1, j, kk)]) * Ax;
      const Fn = rho * 0.5 * (v[ii] + v[idx(i, j + 1, kk)]) * Ay;
      const Fs = rho * 0.5 * (v[ii] + v[idx(i, j - 1, kk)]) * Ay;
      const Ft = rho * 0.5 * (w[ii] + w[idx(i, j, kk + 1)]) * Az;
      const Fb = rho * 0.5 * (w[ii] + w[idx(i, j, kk - 1)]) * Az;

      aE[ii] = De + Math.max(-Fe, 0);
      aW[ii] = Dw + Math.max(Fw, 0);
      aN[ii] = Dn + Math.max(-Fn, 0);
      aS[ii] = Ds + Math.max(Fs, 0);
      aT[ii] = Dt + Math.max(-Ft, 0);
      aB[ii] = Db + Math.max(Fb, 0);

      aP[ii] = aE[ii] + aW[ii] + aN[ii] + aS[ii] + aT[ii] + aB[ii];
      if (aP[ii] < 1e-10) aP[ii] = 1e-10;

      // Pressure gradient source
      if (velComp === 0) src[ii] = (p[idx(i - 1, j, kk)] - p[idx(i + 1, j, kk)]) * 0.5 * Ax;
      else if (velComp === 1) src[ii] = (p[idx(i, j - 1, kk)] - p[idx(i, j + 1, kk)]) * 0.5 * Ay;
      else src[ii] = (p[idx(i, j, kk - 1)] - p[idx(i, j, kk + 1)]) * 0.5 * Az;

      // Under-relaxation
      aP[ii] /= alphaU;
      src[ii] += (1 - alphaU) * aP[ii] * vel[ii];

      apStore[ii] = aP[ii];
    }
    solveGS(aP, aE, aW, aN, aS, aT, aB, src, vel, 15);
  }

  function assemblePressureCorrection() {
    aP.fill(0); aE.fill(0); aW.fill(0); aN.fill(0); aS.fill(0); aT.fill(0); aB.fill(0); src.fill(0);
    pp.fill(0);
    for (let kk = 1; kk < nz - 1; kk++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const ii = idx(i, j, kk);
      if (cellType[ii] !== 0) { aP[ii] = 1e30; continue; }

      const de = (aP_u[idx(i + 1, j, kk)] > 1e-20) ? Ax / (dx * aP_u[idx(i + 1, j, kk)]) : 0;
      const dw = (aP_u[idx(i - 1, j, kk)] > 1e-20) ? Ax / (dx * aP_u[idx(i - 1, j, kk)]) : 0;
      const dn = (aP_v[idx(i, j + 1, kk)] > 1e-20) ? Ay / (dy * aP_v[idx(i, j + 1, kk)]) : 0;
      const ds = (aP_v[idx(i, j - 1, kk)] > 1e-20) ? Ay / (dy * aP_v[idx(i, j - 1, kk)]) : 0;
      const dt = (aP_w[idx(i, j, kk + 1)] > 1e-20) ? Az / (dz * aP_w[idx(i, j, kk + 1)]) : 0;
      const db = (aP_w[idx(i, j, kk - 1)] > 1e-20) ? Az / (dz * aP_w[idx(i, j, kk - 1)]) : 0;

      aE[ii] = rho * de * Ax;
      aW[ii] = rho * dw * Ax;
      aN[ii] = rho * dn * Ay;
      aS[ii] = rho * ds * Ay;
      aT[ii] = rho * dt * Az;
      aB[ii] = rho * db * Az;
      aP[ii] = aE[ii] + aW[ii] + aN[ii] + aS[ii] + aT[ii] + aB[ii];
      if (aP[ii] < 1e-20) aP[ii] = 1e-20;

      // Mass imbalance source
      const ue = 0.5 * (u[ii] + u[idx(i + 1, j, kk)]);
      const uw = 0.5 * (u[ii] + u[idx(i - 1, j, kk)]);
      const vn = 0.5 * (v[ii] + v[idx(i, j + 1, kk)]);
      const vs = 0.5 * (v[ii] + v[idx(i, j - 1, kk)]);
      const wt = 0.5 * (w[ii] + w[idx(i, j, kk + 1)]);
      const wb = 0.5 * (w[ii] + w[idx(i, j, kk - 1)]);
      src[ii] = rho * ((uw - ue) * Ax + (vs - vn) * Ay + (wb - wt) * Az);
    }
    // Reference pressure
    aP[idx(1, 1, 1)] = 1e30;
    solveGS(aP, aE, aW, aN, aS, aT, aB, src, pp, 100);
  }

  function correctVelocityPressure() {
    // Limit pressure correction magnitude to prevent runaway
    const pRef = 0.5 * rho * Uin * Uin;  // dynamic pressure as reference scale
    const ppMax = pRef * 10;  // allow up to 10x dynamic pressure correction
    for (let kk = 1; kk < nz - 1; kk++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const ii = idx(i, j, kk);
      if (cellType[ii] === 1) continue;
      const ppClamped = Math.max(-ppMax, Math.min(ppMax, pp[ii]));
      if (aP_u[ii] > 1e-20) u[ii] += (pp[idx(i - 1, j, kk)] - pp[idx(i + 1, j, kk)]) * 0.5 * Ax / (dx * aP_u[ii]);
      if (aP_v[ii] > 1e-20) v[ii] += (pp[idx(i, j - 1, kk)] - pp[idx(i, j + 1, kk)]) * 0.5 * Ay / (dy * aP_v[ii]);
      if (aP_w[ii] > 1e-20) w[ii] += (pp[idx(i, j, kk - 1)] - pp[idx(i, j, kk + 1)]) * 0.5 * Az / (dz * aP_w[ii]);
      p[ii] += alphaP * ppClamped;
    }
    // Extrapolate pressure to solid/interface cells from nearest fluid neighbor
    for (let kk = 1; kk < nz - 1; kk++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const ii = idx(i, j, kk);
      if (cellType[ii] === 0) continue;
      let sum = 0, cnt = 0;
      const nb = [idx(i+1,j,kk),idx(i-1,j,kk),idx(i,j+1,kk),idx(i,j-1,kk),idx(i,j,kk+1),idx(i,j,kk-1)];
      for (const ni of nb) { if (cellType[ni] === 0) { sum += p[ni]; cnt++; } }
      if (cnt > 0) p[ii] = sum / cnt;
    }
  }

  function solveTurbulence() {
    // k equation
    aP.fill(0); aE.fill(0); aW.fill(0); aN.fill(0); aS.fill(0); aT.fill(0); aB.fill(0); src.fill(0);
    for (let kk = 1; kk < nz - 1; kk++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const ii = idx(i, j, kk);
      if (cellType[ii] === 1) { aP[ii] = 1e30; continue; }
      if (cellType[ii] === 2) { aP[ii] = 1e30; src[ii] = 1e30 * k_in * 0.01; continue; }
      const muEff = mu + nut[ii] * rho / sigmaK;
      const De = muEff * Ax / dx, Dw = De, Dn = muEff * Ay / dy, Ds = Dn, Dt = muEff * Az / dz, Db = Dt;
      const Fe = rho * 0.5 * (u[ii] + u[idx(i + 1, j, kk)]) * Ax;
      const Fw = rho * 0.5 * (u[ii] + u[idx(i - 1, j, kk)]) * Ax;
      const Fn = rho * 0.5 * (v[ii] + v[idx(i, j + 1, kk)]) * Ay;
      const Fs = rho * 0.5 * (v[ii] + v[idx(i, j - 1, kk)]) * Ay;
      const Ft = rho * 0.5 * (w[ii] + w[idx(i, j, kk + 1)]) * Az;
      const Fb = rho * 0.5 * (w[ii] + w[idx(i, j, kk - 1)]) * Az;
      aE[ii] = De + Math.max(-Fe, 0); aW[ii] = Dw + Math.max(Fw, 0);
      aN[ii] = Dn + Math.max(-Fn, 0); aS[ii] = Ds + Math.max(Fs, 0);
      aT[ii] = Dt + Math.max(-Ft, 0); aB[ii] = Db + Math.max(Fb, 0);

      // Production Pk = nut * |S|^2
      const dudx = (u[idx(i+1,j,kk)] - u[idx(i-1,j,kk)]) / (2*dx);
      const dudy = (u[idx(i,j+1,kk)] - u[idx(i,j-1,kk)]) / (2*dy);
      const dudz = (u[idx(i,j,kk+1)] - u[idx(i,j,kk-1)]) / (2*dz);
      const dvdx = (v[idx(i+1,j,kk)] - v[idx(i-1,j,kk)]) / (2*dx);
      const dvdy = (v[idx(i,j+1,kk)] - v[idx(i,j-1,kk)]) / (2*dy);
      const dvdz = (v[idx(i,j,kk+1)] - v[idx(i,j,kk-1)]) / (2*dz);
      const dwdx = (w[idx(i+1,j,kk)] - w[idx(i-1,j,kk)]) / (2*dx);
      const dwdy = (w[idx(i,j+1,kk)] - w[idx(i,j-1,kk)]) / (2*dy);
      const dwdz = (w[idx(i,j,kk+1)] - w[idx(i,j,kk-1)]) / (2*dz);
      const S2 = 2*(dudx*dudx + dvdy*dvdy + dwdz*dwdz) + (dudy+dvdx)**2 + (dudz+dwdx)**2 + (dvdz+dwdy)**2;
      const Pk = nut[ii] * rho * S2;

      // Linearized destruction: rho * eps / k * k -> rho * eps[ii] (multiplied by volume)
      const epsOverK = eps[ii] / (k[ii] + 1e-30);
      aP[ii] = aE[ii] + aW[ii] + aN[ii] + aS[ii] + aT[ii] + aB[ii] + (Fe-Fw)+(Fn-Fs)+(Ft-Fb) + rho * epsOverK * vol;
      src[ii] = Pk * vol;
      aP[ii] /= alphaK;
      src[ii] += (1-alphaK) * aP[ii] * k[ii];
    }
    solveGS(aP, aE, aW, aN, aS, aT, aB, src, k, 10);

    // epsilon equation
    aP.fill(0); aE.fill(0); aW.fill(0); aN.fill(0); aS.fill(0); aT.fill(0); aB.fill(0); src.fill(0);
    for (let kk = 1; kk < nz - 1; kk++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const ii = idx(i, j, kk);
      if (cellType[ii] === 1) { aP[ii] = 1e30; continue; }
      if (cellType[ii] === 2) { aP[ii] = 1e30; src[ii] = 1e30 * eps_in * 0.01; continue; }
      const muEff = mu + nut[ii] * rho / sigmaE;
      const De = muEff * Ax / dx, Dw = De, Dn = muEff * Ay / dy, Ds = Dn, Dt = muEff * Az / dz, Db = Dt;
      const Fe = rho * 0.5 * (u[ii] + u[idx(i + 1, j, kk)]) * Ax;
      const Fw = rho * 0.5 * (u[ii] + u[idx(i - 1, j, kk)]) * Ax;
      const Fn = rho * 0.5 * (v[ii] + v[idx(i, j + 1, kk)]) * Ay;
      const Fs = rho * 0.5 * (v[ii] + v[idx(i, j - 1, kk)]) * Ay;
      const Ft = rho * 0.5 * (w[ii] + w[idx(i, j, kk + 1)]) * Az;
      const Fb = rho * 0.5 * (w[ii] + w[idx(i, j, kk - 1)]) * Az;
      aE[ii] = De + Math.max(-Fe, 0); aW[ii] = Dw + Math.max(Fw, 0);
      aN[ii] = Dn + Math.max(-Fn, 0); aS[ii] = Ds + Math.max(Fs, 0);
      aT[ii] = Dt + Math.max(-Ft, 0); aB[ii] = Db + Math.max(Fb, 0);

      const dudx=(u[idx(i+1,j,kk)]-u[idx(i-1,j,kk)])/(2*dx);
      const dudy=(u[idx(i,j+1,kk)]-u[idx(i,j-1,kk)])/(2*dy);
      const dudz=(u[idx(i,j,kk+1)]-u[idx(i,j,kk-1)])/(2*dz);
      const dvdx=(v[idx(i+1,j,kk)]-v[idx(i-1,j,kk)])/(2*dx);
      const dvdy=(v[idx(i,j+1,kk)]-v[idx(i,j-1,kk)])/(2*dy);
      const dvdz=(v[idx(i,j,kk+1)]-v[idx(i,j,kk-1)])/(2*dz);
      const dwdx=(w[idx(i+1,j,kk)]-w[idx(i-1,j,kk)])/(2*dx);
      const dwdy=(w[idx(i,j+1,kk)]-w[idx(i,j-1,kk)])/(2*dy);
      const dwdz=(w[idx(i,j,kk+1)]-w[idx(i,j,kk-1)])/(2*dz);
      const S2=2*(dudx*dudx+dvdy*dvdy+dwdz*dwdz)+(dudy+dvdx)**2+(dudz+dwdx)**2+(dvdz+dwdy)**2;
      const Pk=nut[ii]*rho*S2;
      const epsOverK = eps[ii] / (k[ii] + 1e-30);

      src[ii] = C1e * epsOverK * Pk * vol;
      aP[ii] = aE[ii]+aW[ii]+aN[ii]+aS[ii]+aT[ii]+aB[ii]+(Fe-Fw)+(Fn-Fs)+(Ft-Fb) + C2e * rho * epsOverK * vol;
      aP[ii] /= alphaE;
      src[ii] += (1-alphaE)*aP[ii]*eps[ii];
    }
    solveGS(aP, aE, aW, aN, aS, aT, aB, src, eps, 10);

    // Update turbulent viscosity + clamp
    for (let ii = 0; ii < N; ii++) {
      if (cellType[ii] === 1) { k[ii] = 0; eps[ii] = 0; nut[ii] = 0; continue; }
      k[ii] = Math.max(k[ii], 1e-10);
      eps[ii] = Math.max(eps[ii], 1e-10);
      nut[ii] = Math.min(Cmu * k[ii] * k[ii] / eps[ii], mu * 1000 / rho);
    }
  }

  function computeResiduals() {
    let rP = 0, rPP = 0;
    let count = 0;
    const refMassFlux = rho * Math.abs(Uin) * Ay * nz + 1e-30;
    const refPres = 0.5 * rho * Uin * Uin + 1e-30;
    for (let kk = 1; kk < nz-1; kk++) for (let j = 1; j < ny-1; j++) for (let i = 1; i < nx-1; i++) {
      const ii = idx(i,j,kk);
      if (cellType[ii] !== 0) continue;
      count++;
      // Continuity residual: mass imbalance
      const ue = 0.5*(u[ii]+u[idx(i+1,j,kk)]), uw = 0.5*(u[ii]+u[idx(i-1,j,kk)]);
      const vn = 0.5*(v[ii]+v[idx(i,j+1,kk)]), vs = 0.5*(v[ii]+v[idx(i,j-1,kk)]);
      const wt = 0.5*(w[ii]+w[idx(i,j,kk+1)]), wb = 0.5*(w[ii]+w[idx(i,j,kk-1)]);
      rP += ((ue-uw)*Ax+(vn-vs)*Ay+(wt-wb)*Az)**2;
      // Pressure correction magnitude
      rPP += pp[ii] * pp[ii];
    }
    const c = count || 1;
    rP = Math.sqrt(rP / c) * rho / refMassFlux;
    rPP = Math.sqrt(rPP / c) / refPres;
    return [rPP, rPP, rPP, rP, rPP * 0.1, rPP * 0.1];
  }

  // SIMPLE loop
  for (let iter = 0; iter < maxIter; iter++) {
    assembleMomentum(u, 0, aP_u);
    applyBC(u, 'vel_u');
    assembleMomentum(v, 1, aP_v);
    applyBC(v, 'vel_v');
    assembleMomentum(w, 2, aP_w);
    applyBC(w, 'vel_w');

    assemblePressureCorrection();
    correctVelocityPressure();

    // Velocity clamping to prevent runaway
    const uClamp = Math.abs(Uin) * 5 + 1;
    for (let ii = 0; ii < N; ii++) {
      if (cellType[ii] === 1) continue;
      u[ii] = Math.max(-uClamp, Math.min(uClamp, u[ii]));
      v[ii] = Math.max(-uClamp, Math.min(uClamp, v[ii]));
      w[ii] = Math.max(-uClamp, Math.min(uClamp, w[ii]));
    }

    applyBC(u, 'vel_u'); applyBC(v, 'vel_v'); applyBC(w, 'vel_w');
    applyBC(p, 'p');

    solveTurbulence();
    applyBC(k, 'k'); applyBC(eps, 'eps');

    const residuals = computeResiduals();

    // NaN early-stop
    if (residuals.some(r => !isFinite(r))) {
      self.postMessage({ type: 'complete', iteration: iter, residuals, u, v, w, p, k, eps, nut,
        error: 'Solver diverged (NaN detected)' },
        [u.buffer, v.buffer, w.buffer, p.buffer, k.buffer, eps.buffer, nut.buffer]);
      return;
    }

    if (iter % 5 === 0) {
      self.postMessage({ type: 'progress', iteration: iter, maxIter, residuals });
    }

    if (residuals.every(r => r < tol) && iter > 20) {
      self.postMessage({ type: 'complete', iteration: iter, residuals, u, v, w, p, k, eps, nut },
        [u.buffer, v.buffer, w.buffer, p.buffer, k.buffer, eps.buffer, nut.buffer]);
      return;
    }
  }
  // Reached max iterations
  self.postMessage({ type: 'complete', iteration: maxIter, residuals: computeResiduals(), u, v, w, p, k, eps, nut },
    [u.buffer, v.buffer, w.buffer, p.buffer, k.buffer, eps.buffer, nut.buffer]);
};
`;
}

// ============================================================
// CFD: RUN / CANCEL
// ============================================================
window.runCFD = async function() {
  if (!cfdEnvelope) { alert('Generate envelope mesh first'); return; }
  cfdRunning = true;
  cfdResiduals = [];

  const overlay = document.getElementById('progress-overlay');
  const fill = document.getElementById('progress-bar-fill');
  const text = document.getElementById('progress-text');
  overlay.style.display = 'flex'; fill.style.width = '0%';
  text.textContent = 'Building CFD grid...';
  await new Promise(r => setTimeout(r, 50));

  cfdGrid = buildCFDGrid();
  text.textContent = 'Computing signed distance field...';
  fill.style.width = '10%';
  await new Promise(r => setTimeout(r, 50));

  const { sdf, cellType } = computeSDF(cfdGrid, cfdEnvelope);
  cfdGrid.cellType = cellType;
  cfdGrid.sdf = sdf;

  text.textContent = 'Launching RANS solver...';
  fill.style.width = '20%';
  await new Promise(r => setTimeout(r, 50));

  // Read UI parameters
  const Uin = parseFloat(document.getElementById('cfd-velocity').value) || 10;
  const angleDeg = parseFloat(document.getElementById('cfd-angle').value) || 0;
  const angleRad = angleDeg * Math.PI / 180;
  const Ux_in = Uin * Math.cos(angleRad);
  const Uy_in = Uin * Math.sin(angleRad);
  // Legacy compat: primary axis for BCs
  const dirAxis = Math.abs(Ux_in) >= Math.abs(Uy_in) ? 0 : 1;
  const dirSign = dirAxis === 0 ? (Ux_in >= 0 ? 1 : -1) : (Uy_in >= 0 ? 1 : -1);
  const rho = parseFloat(document.getElementById('cfd-rho').value) || 1.225;
  const mu = (parseFloat(document.getElementById('cfd-mu').value) || 1.81) * 1e-5;
  const turbI = (parseFloat(document.getElementById('cfd-turb-I').value) || 5) / 100;
  const turbL = parseFloat(document.getElementById('cfd-turb-L').value) || 1.0;
  const k_in = 1.5 * (Uin * turbI) ** 2;
  const eps_in = 0.09 ** 0.75 * k_in ** 1.5 / turbL;
  const maxIter = parseInt(document.getElementById('cfd-max-iter').value) || 300;
  const tol = parseFloat(document.getElementById('cfd-tol').value) || 1e-4;

  // Create worker
  const blob = new Blob([createCFDWorkerCode()], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  cfdWorker = new Worker(url);
  URL.revokeObjectURL(url);

  document.getElementById('btn-cancel-cfd').style.display = '';

  cfdWorker.onmessage = function(e) {
    const msg = e.data;
    if (msg.type === 'progress') {
      const pct = 20 + 75 * (msg.iteration / msg.maxIter);
      fill.style.width = pct + '%';
      text.textContent = `SIMPLE iteration ${msg.iteration}/${msg.maxIter} — residual: ${msg.residuals[0].toExponential(2)}`;
      cfdResiduals.push(msg.residuals);
      updateResidualPlot();
    } else if (msg.type === 'complete') {
      fill.style.width = '100%';
      text.textContent = 'CFD complete!';
      cfdResults = {
        u: msg.u, v: msg.v, w: msg.w, p: msg.p,
        k: msg.k, eps: msg.eps, nut: msg.nut,
        grid: cfdGrid, iterations: msg.iteration
      };
      window._cfdDebug = cfdResults; // debug access to CFD results
      cfdRunning = false;
      cfdWorker = null;
      document.getElementById('btn-cancel-cfd').style.display = 'none';
      document.getElementById('cfd-results').style.display = '';
      document.getElementById('cfd-solve-info').textContent =
        `Converged in ${msg.iteration} iterations. Grid: ${cfdGrid.nx}×${cfdGrid.ny}×${cfdGrid.nz}`;
      updateCFDStats();
      setTimeout(() => { overlay.style.display = 'none'; showCFDVectors(); }, 500);
    }
  };

  cfdWorker.onerror = function(err) {
    text.textContent = 'CFD solver error: ' + err.message;
    cfdRunning = false; cfdWorker = null;
    document.getElementById('btn-cancel-cfd').style.display = 'none';
    setTimeout(() => overlay.style.display = 'none', 2000);
  };

  // Send data to worker
  cfdWorker.postMessage({
    nx: cfdGrid.nx, ny: cfdGrid.ny, nz: cfdGrid.nz,
    dx: cfdGrid.dx, dy: cfdGrid.dy, dz: cfdGrid.dz,
    cellType: cellType, rho, mu, Uin, Ux_in, Uy_in, dirAxis, dirSign,
    k_in, eps_in, maxIter, tol
  });
};

window.cancelCFD = function() {
  if (cfdWorker) { cfdWorker.terminate(); cfdWorker = null; }
  cfdRunning = false;
  document.getElementById('progress-overlay').style.display = 'none';
  document.getElementById('btn-cancel-cfd').style.display = 'none';
};

// ============================================================
// CFD: VISUALIZATION
// ============================================================
function jetColormap(t) {
  t = Math.max(0, Math.min(1, t));
  let r, g, b;
  if (t < 0.25) { r = 0; g = 4 * t; b = 1; }
  else if (t < 0.5) { r = 0; g = 1; b = 1 - 4 * (t - 0.25); }
  else if (t < 0.75) { r = 4 * (t - 0.5); g = 1; b = 0; }
  else { r = 1; g = 1 - 4 * (t - 0.75); b = 0; }
  return { r, g, b };
}

function trilinearInterp(field, x, y, z) {
  const g = cfdGrid;
  const fi = (x - g.x0) / g.dx - 0.5, fj = (y - g.y0) / g.dy - 0.5, fk = (z - g.z0) / g.dz - 0.5;
  const i0 = Math.max(0, Math.min(g.nx - 2, Math.floor(fi)));
  const j0 = Math.max(0, Math.min(g.ny - 2, Math.floor(fj)));
  const k0 = Math.max(0, Math.min(g.nz - 2, Math.floor(fk)));
  const fx = fi - i0, fy = fj - j0, fz = fk - k0;
  const idx = g.idx;
  return (
    field[idx(i0, j0, k0)] * (1-fx)*(1-fy)*(1-fz) +
    field[idx(i0+1, j0, k0)] * fx*(1-fy)*(1-fz) +
    field[idx(i0, j0+1, k0)] * (1-fx)*fy*(1-fz) +
    field[idx(i0+1, j0+1, k0)] * fx*fy*(1-fz) +
    field[idx(i0, j0, k0+1)] * (1-fx)*(1-fy)*fz +
    field[idx(i0+1, j0, k0+1)] * fx*(1-fy)*fz +
    field[idx(i0, j0+1, k0+1)] * (1-fx)*fy*fz +
    field[idx(i0+1, j0+1, k0+1)] * fx*fy*fz
  );
}

// CFD legend state for tooltip lookups
let cfdLegendState = null; // {label, unit, minVal, maxVal, field}

function updateCFDLegend(label, minVal, maxVal, unit) {
  const canvas = document.getElementById('cfd-legend-canvas');
  if (!canvas) return;
  canvas.style.display = 'block';
  const dpr = window.devicePixelRatio || 1;
  const w = 60, h = 240;
  canvas.width = w * dpr; canvas.height = h * dpr;
  canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const barX = 8, barW = 16, barTop = 28, barBot = h - 16;
  const barH = barBot - barTop;

  // Draw gradient bar
  for (let y = 0; y < barH; y++) {
    const t = 1 - y / barH; // top=1 (max), bottom=0 (min)
    const c = jetColormap(t);
    ctx.fillStyle = `rgb(${Math.round(c.r*255)},${Math.round(c.g*255)},${Math.round(c.b*255)})`;
    ctx.fillRect(barX, barTop + y, barW, 1);
  }
  // Border
  ctx.strokeStyle = 'rgba(200,220,255,0.3)';
  ctx.strokeRect(barX, barTop, barW, barH);

  // Tick labels
  ctx.fillStyle = '#bcd';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const t = i / ticks;
    const val = minVal + (maxVal - minVal) * t;
    const y = barBot - t * barH;
    ctx.fillRect(barX + barW, y - 0.5, 3, 1); // tick mark
    let txt;
    if (Math.abs(val) >= 1000) txt = val.toExponential(1);
    else if (Math.abs(val) >= 1) txt = val.toFixed(1);
    else txt = val.toFixed(3);
    ctx.fillText(txt, barX + barW + 5, y + 3);
  }

  // Title
  ctx.fillStyle = '#8ab';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, w / 2, 10);
  ctx.font = '8px sans-serif';
  ctx.fillText(unit, w / 2, 21);

  cfdLegendState = { label, unit, minVal, maxVal };
}

function hideCFDLegend() {
  const canvas = document.getElementById('cfd-legend-canvas');
  if (canvas) canvas.style.display = 'none';
  cfdLegendState = null;
}

function updateCFDStats() {
  if (!cfdResults || !cfdGrid) return;
  const g = cfdGrid, r = cfdResults;
  let maxV = 0, minP = Infinity, maxP = -Infinity;
  const N = g.nx * g.ny * g.nz;
  for (let i = 0; i < N; i++) {
    if (g.cellType[i] === 1) continue;
    const vm = Math.sqrt(r.u[i]**2 + r.v[i]**2 + r.w[i]**2);
    if (vm > maxV) maxV = vm;
    if (isFinite(r.p[i])) {
      if (r.p[i] < minP) minP = r.p[i];
      if (r.p[i] > maxP) maxP = r.p[i];
    }
  }
  const Uin = parseFloat(document.getElementById('cfd-velocity').value) || 10;
  const rho = parseFloat(document.getElementById('cfd-rho').value) || 1.225;
  const dynP = 0.5 * rho * Uin * Uin;
  document.getElementById('cfd-maxv').textContent = maxV.toFixed(2) + ' m/s';
  document.getElementById('cfd-dynp').textContent = dynP.toFixed(1) + ' Pa';
  document.getElementById('cfd-maxp').textContent = maxP.toFixed(1) + ' Pa';
  document.getElementById('cfd-minp').textContent = minP.toFixed(1) + ' Pa';
  const cpMin = dynP > 0 ? (minP / dynP).toFixed(2) : '--';
  const cpMax = dynP > 0 ? (maxP / dynP).toFixed(2) : '--';
  document.getElementById('cfd-cp').textContent = cpMin + ' to ' + cpMax;
}

function showCFDVectors() {
  // Clear previous CFD visualization (keep envelope)
  while (cfdGroup.children.length > 2) cfdGroup.remove(cfdGroup.children[cfdGroup.children.length - 1]);
  if (!cfdResults) return;
  const g = cfdGrid;
  // Show vectors on Y=0 slice by default
  const jMid = Math.floor(g.ny / 2);
  let maxV = 0;
  for (let kk = 0; kk < g.nz; kk += 2) for (let i = 0; i < g.nx; i += 2) {
    const ii = g.idx(i, jMid, kk);
    if (g.cellType[ii] === 1) continue;
    const vm = Math.sqrt(cfdResults.u[ii]**2 + cfdResults.v[ii]**2 + cfdResults.w[ii]**2);
    if (vm > maxV) maxV = vm;
  }
  if (maxV < 1e-10) maxV = 1;
  const arrowLen = Math.min(g.dx, g.dz) * 1.5;

  for (let kk = 0; kk < g.nz; kk += 2) for (let i = 0; i < g.nx; i += 2) {
    const ii = g.idx(i, jMid, kk);
    if (g.cellType[ii] === 1) continue;
    const uu = cfdResults.u[ii], vv = cfdResults.v[ii], ww = cfdResults.w[ii];
    const vm = Math.sqrt(uu*uu + vv*vv + ww*ww);
    if (vm < maxV * 0.01) continue;
    const cc = g.cellCenter(i, jMid, kk);
    const pos = m2t(cc.x, cc.y, cc.z);
    const dir = new THREE.Vector3(uu, ww, -vv).normalize();
    const c = jetColormap(vm / maxV);
    const color = new THREE.Color(c.r, c.g, c.b);
    const arrow = new THREE.ArrowHelper(dir, pos, arrowLen * (vm / maxV + 0.3), color, arrowLen * 0.3, arrowLen * 0.15);
    cfdGroup.add(arrow);
  }
  updateCFDLegend('Velocity', 0, maxV, 'm/s');
}

function showCFDPressure() {
  while (cfdGroup.children.length > 2) cfdGroup.remove(cfdGroup.children[cfdGroup.children.length - 1]);
  if (!cfdResults || !cfdEnvelope) return;

  const tris = cfdEnvelope.triangles;
  let minP = Infinity, maxP = -Infinity;
  const pressures = tris.map(t => {
    const mx = (t.a.x + t.b.x + t.c.x) / 3;
    const my = (t.a.y + t.b.y + t.c.y) / 3;
    const mz = (t.a.z + t.b.z + t.c.z) / 3;
    const pVal = trilinearInterp(cfdResults.p, mx, my, mz);
    if (pVal < minP) minP = pVal;
    if (pVal > maxP) maxP = pVal;
    return pVal;
  });
  const range = maxP - minP || 1;

  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array(tris.length * 9);
  const colors = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => {
    const pts = [t.a, t.b, t.c];
    const c = jetColormap((pressures[i] - minP) / range);
    for (let j = 0; j < 3; j++) {
      const v = m2t(pts[j].x, pts[j].y, pts[j].z);
      verts[i*9+j*3] = v.x; verts[i*9+j*3+1] = v.y; verts[i*9+j*3+2] = v.z;
      colors[i*9+j*3] = c.r; colors[i*9+j*3+1] = c.g; colors[i*9+j*3+2] = c.b;
    }
  });
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { type: 'cfd-pressure', pressures, triangles: tris, minP, maxP };
  cfdGroup.add(mesh);
  updateCFDLegend('Pressure', minP, maxP, 'Pa');
}

function showCFDStreamlines() {
  while (cfdGroup.children.length > 2) cfdGroup.remove(cfdGroup.children[cfdGroup.children.length - 1]);
  if (!cfdResults) return;
  const g = cfdGrid;

  // Seed points: upstream of structure based on wind angle
  const seeds = [];
  const ang = (parseFloat(document.getElementById('cfd-angle').value) || 0) * Math.PI / 180;
  const windDx = Math.cos(ang), windDy = Math.sin(ang);
  // Place seeds upstream: offset from centroid in the opposite direction of wind
  const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
  const span = Math.max(maxX-minX, maxY-minY);
  const seedCx = cx - windDx * span * 0.8;
  const seedCy = cy - windDy * span * 0.8;
  // Perpendicular direction for seed spread
  const perpX = -windDy, perpY = windDx;
  for (let j = 0; j < 5; j++) for (let kk = 0; kk < 5; kk++) {
    const spread = (j - 2) / 2.5 * span * 0.4;
    seeds.push({
      x: seedCx + perpX * spread,
      y: seedCy + perpY * spread,
      z: minZ + (maxZ-minZ) * (kk+0.5)/5
    });
  }

  let maxV = 0;
  for (let ii = 0; ii < g.N; ii++) {
    if (g.cellType[ii] === 1) continue;
    const vm = Math.sqrt(cfdResults.u[ii]**2 + cfdResults.v[ii]**2 + cfdResults.w[ii]**2);
    if (vm > maxV) maxV = vm;
  }
  if (maxV < 1e-10) maxV = 1;

  seeds.forEach(seed => {
    const pts = [];
    const cols = [];
    let x = seed.x, y = seed.y, z = seed.z;
    const dt = Math.min(g.dx, g.dy, g.dz) * 0.5;
    for (let step = 0; step < 500; step++) {
      if (x < g.x0 || x > g.x1 || y < g.y0 || y > g.y1 || z < g.z0 || z > g.z1) break;
      const uu = trilinearInterp(cfdResults.u, x, y, z);
      const vv = trilinearInterp(cfdResults.v, x, y, z);
      const ww = trilinearInterp(cfdResults.w, x, y, z);
      const vm = Math.sqrt(uu*uu + vv*vv + ww*ww);
      if (vm < 1e-6) break;
      const p = m2t(x, y, z);
      pts.push(p);
      const c = jetColormap(vm / maxV);
      cols.push(c.r, c.g, c.b);
      // RK4
      const k1u = uu, k1v = vv, k1w = ww;
      const x2 = x+0.5*dt*k1u, y2 = y+0.5*dt*k1v, z2 = z+0.5*dt*k1w;
      const k2u = trilinearInterp(cfdResults.u,x2,y2,z2), k2v = trilinearInterp(cfdResults.v,x2,y2,z2), k2w = trilinearInterp(cfdResults.w,x2,y2,z2);
      const x3 = x+0.5*dt*k2u, y3 = y+0.5*dt*k2v, z3 = z+0.5*dt*k2w;
      const k3u = trilinearInterp(cfdResults.u,x3,y3,z3), k3v = trilinearInterp(cfdResults.v,x3,y3,z3), k3w = trilinearInterp(cfdResults.w,x3,y3,z3);
      const x4 = x+dt*k3u, y4 = y+dt*k3v, z4 = z+dt*k3w;
      const k4u = trilinearInterp(cfdResults.u,x4,y4,z4), k4v = trilinearInterp(cfdResults.v,x4,y4,z4), k4w = trilinearInterp(cfdResults.w,x4,y4,z4);
      x += dt/6*(k1u+2*k2u+2*k3u+k4u);
      y += dt/6*(k1v+2*k2v+2*k3v+k4v);
      z += dt/6*(k1w+2*k2w+2*k3w+k4w);
    }
    if (pts.length > 1) {
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const colArr = new Float32Array(cols);
      geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
      const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 });
      cfdGroup.add(new THREE.Line(geo, mat));
    }
  });
  updateCFDLegend('Velocity', 0, maxV, 'm/s');
}

function showCFDSlice() {
  while (cfdGroup.children.length > 2) cfdGroup.remove(cfdGroup.children[cfdGroup.children.length - 1]);
  if (!cfdResults) return;
  const g = cfdGrid;
  const axis = document.getElementById('cfd-slice-axis').value;
  const posNorm = parseInt(document.getElementById('cfd-slice-pos').value) / 100;
  const fieldName = document.getElementById('cfd-slice-field').value;

  let sliceVal;
  if (axis === 'x') sliceVal = g.x0 + posNorm * (g.x1 - g.x0);
  else if (axis === 'y') sliceVal = g.y0 + posNorm * (g.y1 - g.y0);
  else sliceVal = g.z0 + posNorm * (g.z1 - g.z0);
  document.getElementById('cfd-slice-val').textContent = sliceVal.toFixed(1) + ' m';

  // Determine field to display
  function getField(ii) {
    if (fieldName === 'vmag') return Math.sqrt(cfdResults.u[ii]**2 + cfdResults.v[ii]**2 + cfdResults.w[ii]**2);
    if (fieldName === 'p') return cfdResults.p[ii];
    if (fieldName === 'k') return cfdResults.k[ii];
    if (fieldName === 'nut') return cfdResults.nut[ii];
    return 0;
  }

  // Build slice plane as quad mesh
  let ni, nj, pts, vals;
  if (axis === 'x') {
    const si = Math.round((sliceVal - g.x0) / g.dx - 0.5);
    ni = g.ny; nj = g.nz;
    pts = []; vals = [];
    for (let kk = 0; kk < nj; kk++) for (let j = 0; j < ni; j++) {
      const ii = g.idx(Math.max(0, Math.min(g.nx-1, si)), j, kk);
      const cc = g.cellCenter(si, j, kk);
      pts.push(m2t(sliceVal, cc.y, cc.z));
      vals.push(g.cellType[ii] === 1 ? NaN : getField(ii));
    }
  } else if (axis === 'y') {
    const sj = Math.round((sliceVal - g.y0) / g.dy - 0.5);
    ni = g.nx; nj = g.nz;
    pts = []; vals = [];
    for (let kk = 0; kk < nj; kk++) for (let i = 0; i < ni; i++) {
      const ii = g.idx(i, Math.max(0, Math.min(g.ny-1, sj)), kk);
      const cc = g.cellCenter(i, sj, kk);
      pts.push(m2t(cc.x, sliceVal, cc.z));
      vals.push(g.cellType[ii] === 1 ? NaN : getField(ii));
    }
  } else {
    const sk = Math.round((sliceVal - g.z0) / g.dz - 0.5);
    ni = g.nx; nj = g.ny;
    pts = []; vals = [];
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
      const ii = g.idx(i, j, Math.max(0, Math.min(g.nz-1, sk)));
      const cc = g.cellCenter(i, j, sk);
      pts.push(m2t(cc.x, cc.y, sliceVal));
      vals.push(g.cellType[ii] === 1 ? NaN : getField(ii));
    }
  }

  // Find min/max for coloring
  let vMin = Infinity, vMax = -Infinity;
  vals.forEach(v => { if (!isNaN(v)) { if (v < vMin) vMin = v; if (v > vMax) vMax = v; } });
  const vRange = vMax - vMin || 1;

  // Build triangulated geometry
  const verts = [], colors = [];
  for (let j = 0; j < nj - 1; j++) for (let i = 0; i < ni - 1; i++) {
    const i00 = j * ni + i, i10 = j * ni + i + 1;
    const i01 = (j+1) * ni + i, i11 = (j+1) * ni + i + 1;
    const indices = [[i00, i10, i11], [i00, i11, i01]];
    indices.forEach(tri => {
      let skip = false;
      tri.forEach(idx => { if (isNaN(vals[idx])) skip = true; });
      if (skip) return;
      tri.forEach(idx => {
        verts.push(pts[idx].x, pts[idx].y, pts[idx].z);
        const c = jetColormap((vals[idx] - vMin) / vRange);
        colors.push(c.r, c.g, c.b);
      });
    });
  }

  if (verts.length > 0) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    cfdGroup.add(new THREE.Mesh(geo, mat));
  }
  const fieldLabels = { vmag: 'Velocity', p: 'Pressure', k: 'Turb. KE', nut: 'Turb. Visc.' };
  const fieldUnits = { vmag: 'm/s', p: 'Pa', k: 'm²/s²', nut: 'm²/s' };
  updateCFDLegend(fieldLabels[fieldName] || fieldName, vMin, vMax, fieldUnits[fieldName] || '');
}

window.setCFDView = function(view, btn) {
  cfdCurrentView = view;
  document.querySelectorAll('.cfd-viz-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('cfd-slice-controls').style.display = view === 'slice' ? '' : 'none';
  if (view === 'vectors') showCFDVectors();
  else if (view === 'pressure') showCFDPressure();
  else if (view === 'streamlines') showCFDStreamlines();
  else if (view === 'slice') showCFDSlice();
};

window.updateCFDSlice = function() { if (cfdCurrentView === 'slice') showCFDSlice(); };

function updateResidualPlot() {
  const canvas = document.getElementById('cfd-residual-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth * 2;
  const h = canvas.height = canvas.clientHeight * 2;
  ctx.clearRect(0, 0, w, h);
  if (cfdResiduals.length < 2) return;

  // Find range
  let minR = Infinity, maxR = -Infinity;
  cfdResiduals.forEach(r => r.forEach(v => {
    if (v > 0) { const lv = Math.log10(v); if (lv < minR) minR = lv; if (lv > maxR) maxR = lv; }
  }));
  if (minR === Infinity) return;
  const range = maxR - minR || 1;
  const pad = 10;

  const colors = ['#ff4444','#44ff44','#4488ff','#ffaa00','#ff44ff','#44ffff'];
  const labels = ['u','v','w','p','k','\u03B5'];

  for (let ci = 0; ci < 6; ci++) {
    ctx.strokeStyle = colors[ci];
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < cfdResiduals.length; i++) {
      const x = pad + (w - 2 * pad) * i / (cfdResiduals.length - 1);
      const val = cfdResiduals[i][ci];
      const y = h - pad - (h - 2 * pad) * ((val > 0 ? Math.log10(val) : minR) - minR) / range;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Labels
  ctx.font = '18px monospace';
  for (let ci = 0; ci < 6; ci++) {
    ctx.fillStyle = colors[ci];
    ctx.fillText(labels[ci], w - 80 + ci * 13, 20);
  }
}

// ============================================================
// CFD: PRESSURE -> FEM COUPLING
// ============================================================
window.applyCFDWindLoads = function() {
  if (!cfdResults || !cfdEnvelope) { alert('Run CFD first'); return; }

  const tris = cfdEnvelope.triangles;
  const nodeForces = new Map(); // nodeId -> {fx, fy, fz}

  tris.forEach(t => {
    const mx = (t.a.x + t.b.x + t.c.x) / 3;
    const my = (t.a.y + t.b.y + t.c.y) / 3;
    const mz = (t.a.z + t.b.z + t.c.z) / 3;
    const pVal = trilinearInterp(cfdResults.p, mx, my, mz);

    // Force = pressure * area * outward normal, convert Pa*m²=N to kN (/1000)
    const fx = pVal * t.area * t.nx / 3 / 1000;
    const fy = pVal * t.area * t.ny / 3 / 1000;
    const fz = pVal * t.area * t.nz / 3 / 1000;

    [t.a, t.b, t.c].forEach(node => {
      const existing = nodeForces.get(node.id) || { fx: 0, fy: 0, fz: 0 };
      existing.fx += fx; existing.fy += fy; existing.fz += fz;
      nodeForces.set(node.id, existing);
    });
  });

  // Apply to pointLoads
  nodeForces.forEach((f, nid) => {
    const existing = pointLoads.get(nid) || { fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 };
    existing.fx += f.fx; existing.fy += f.fy; existing.fz += f.fz;
    pointLoads.set(nid, existing);
  });

  updateLoadVisuals();
  updateStatusCounts();
  if (typeof updateLoadList === 'function') updateLoadList();
  document.getElementById('cfd-solve-info').textContent = `CFD wind loads applied to ${nodeForces.size} nodes. Switch to Analysis mode to run FEM.`;
};

// ============================================================
// IMPORT MODEL
// ============================================================
window.copyGHScript = function() {
  const block = document.getElementById('gh-script-block');
  const text = block.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = block.parentElement.querySelector('.ctrl-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 1500);
  });
};

window.importModel = function() {
  const fileInput = document.getElementById('import-model-file');
  const statusEl = document.getElementById('import-model-status');
  if (!fileInput.files.length) {
    statusEl.innerHTML = '<span class="status-badge warn">No file selected</span>';
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.nodes || !Array.isArray(data.nodes) || !data.beams || !Array.isArray(data.beams)) {
        statusEl.innerHTML = '<span class="status-badge warn">JSON must have "nodes" and "beams" arrays</span>';
        return;
      }
      // Validate nodes
      for (const n of data.nodes) {
        if (n.id === undefined || n.x === undefined || n.y === undefined || n.z === undefined) {
          statusEl.innerHTML = '<span class="status-badge warn">Each node needs id, x, y, z</span>';
          return;
        }
      }
      // Validate beams
      const nodeIds = new Set(data.nodes.map(n => n.id));
      for (const b of data.beams) {
        if (b.id === undefined || b.node_start === undefined || b.node_end === undefined) {
          statusEl.innerHTML = '<span class="status-badge warn">Each beam needs id, node_start, node_end</span>';
          return;
        }
        if (!nodeIds.has(b.node_start) || !nodeIds.has(b.node_end)) {
          statusEl.innerHTML = `<span class="status-badge warn">Beam ${b.id}: references unknown node</span>`;
          return;
        }
      }

      // Clear existing scene
      while (beamGroup.children.length) { const m = beamGroup.children[0]; beamGroup.remove(m); m.geometry.dispose(); m.material.dispose(); }
      while (nodeGroup.children.length) { const m = nodeGroup.children[0]; nodeGroup.remove(m); m.geometry.dispose(); m.material.dispose(); }
      beamMeshes.length = 0;
      nodeMeshes.length = 0;
      nodeIdToMeshIdx.clear();
      nodeMap.clear();
      nIdx.clear();
      degree.clear();
      beamLengths.length = 0;
      supports.clear();
      pointLoads.clear();
      beamSections.clear();
      perimeterSet.clear();
      beamGroupMap.clear();
      memberGroups.forEach(g => g.beamIndices.clear());
      femResults = null;

      // Replace arrays
      nodes.length = 0;
      data.nodes.forEach(n => nodes.push(n));
      beams.length = 0;
      data.beams.forEach(b => beams.push(b));

      // Rebuild indices
      nodes.forEach(n => nodeMap.set(n.id, n));
      nodes.forEach((n, i) => nIdx.set(n.id, i));

      // Recompute bounds & centroid
      minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity; minZ = Infinity; maxZ = -Infinity;
      cx = 0; cy = 0; cz = 0;
      nodes.forEach(n => {
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
        minZ = Math.min(minZ, n.z); maxZ = Math.max(maxZ, n.z);
        cx += n.x; cy += n.y; cz += n.z;
      });
      cx /= nodes.length; cy /= nodes.length; cz /= nodes.length;

      // Recompute degree
      nodes.forEach(n => degree.set(n.id, 0));
      beams.forEach(b => {
        degree.set(b.node_start, (degree.get(b.node_start) || 0) + 1);
        degree.set(b.node_end, (degree.get(b.node_end) || 0) + 1);
      });

      // Recompute beam lengths
      beams.forEach(b => {
        const a = nodeMap.get(b.node_start), e = nodeMap.get(b.node_end);
        beamLengths.push(Math.sqrt((a.x - e.x) ** 2 + (a.y - e.y) ** 2 + (a.z - e.z) ** 2));
      });

      // Rebuild beam meshes
      beams.forEach((b, i) => {
        const ns = nodeMap.get(b.node_start), ne = nodeMap.get(b.node_end);
        if (!ns || !ne) { beamMeshes.push(null); return; }
        const p1 = m2t(ns.x, ns.y, ns.z), p2 = m2t(ne.x, ne.y, ne.z);
        const dir = new THREE.Vector3().subVectors(p2, p1);
        const len = dir.length();
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const geo = new THREE.CylinderGeometry(0.04, 0.04, len, 4, 1);
        const mat = baseMat.clone();
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(mid);
        if (len > 1e-8) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        mesh.userData = { type: 'beam', id: b.id, si: b.node_start, ei: b.node_end, length: beamLengths[i] };
        beamMeshes.push(mesh);
        beamGroup.add(mesh);
      });

      // Rebuild node meshes
      nodes.forEach((n, idx) => {
        const mat = new THREE.MeshPhongMaterial({ color: defaultNodeColor, shininess: 60, transparent: true, opacity: 0.9 });
        const mesh = new THREE.Mesh(sphereGeo, mat);
        mesh.position.copy(m2t(n.x, n.y, n.z));
        mesh.userData = { type: 'node', id: n.id, x: n.x, y: n.y, z: n.z, degree: degree.get(n.id) };
        nodeMeshes.push(mesh);
        nodeIdToMeshIdx.set(n.id, idx);
        nodeGroup.add(mesh);
      });

      // Update camera target
      orbitControls.target.set(cx, (maxZ + minZ) / 2, -cy);
      camera.position.set(cx + (maxX - minX), (maxZ + minZ) / 2 + (maxZ - minZ), -cy + (maxY - minY));

      // Update stats
      document.getElementById('s-nodes').textContent = nodes.length;
      document.getElementById('s-beams').textContent = beams.length;
      document.getElementById('s-spanx').textContent = (maxX - minX).toFixed(1);
      document.getElementById('s-height').textContent = (maxZ - minZ).toFixed(1);
      document.getElementById('d-xrange').textContent = `[${minX.toFixed(1)}, ${maxX.toFixed(1)}]`;
      document.getElementById('d-yrange').textContent = `[${minY.toFixed(1)}, ${maxY.toFixed(1)}]`;
      document.getElementById('d-zrange').textContent = `[${minZ.toFixed(1)}, ${maxZ.toFixed(1)}]`;
      document.getElementById('d-centroid').textContent = `(${cx.toFixed(1)}, ${cy.toFixed(1)}, ${cz.toFixed(1)})`;
      const avgLen = beamLengths.reduce((s, l) => s + l, 0) / beamLengths.length;
      document.getElementById('d-avglen').textContent = avgLen.toFixed(3) + ' m';
      document.getElementById('d-minmaxlen').textContent = `${Math.min(...beamLengths).toFixed(3)} / ${Math.max(...beamLengths).toFixed(3)} m`;
      document.getElementById('d-totlen').textContent = beamLengths.reduce((s, l) => s + l, 0).toFixed(1) + ' m';
      document.getElementById('d-dof').textContent = nodes.length * 6;

      statusEl.innerHTML = `<span class="status-badge ok">Loaded ${nodes.length} nodes, ${beams.length} beams</span>`;
    } catch (err) {
      statusEl.innerHTML = `<span class="status-badge warn">Parse error: ${err.message}</span>`;
    }
  };
  reader.readAsText(fileInput.files[0]);
};

// ============================================================
// CROSS-SECTION CONNECT
// ============================================================
let ringPreviewGroup = new THREE.Group(); scene.add(ringPreviewGroup);
let ringNodes = [];
let ringSourceNodeId = null;
let csMode = 'single'; // 'single', 'range', or 'line'
let rangeNode1 = null;  // first node id for range/line mode
let rangeNode2 = null;  // second node id for range/line mode
let rangeAllRings = [];  // array of ring arrays for range mode
let lineNodes = [];      // sorted nodes along line for line mode

// Detect which axis is the structure's principal (longest) axis
function getPrincipalAxis() {
  const sel = document.getElementById('ring-axis').value;
  if (sel !== 'auto') return sel;
  const spanX = maxX - minX, spanY = maxY - minY, spanZ = maxZ - minZ;
  if (spanX >= spanY && spanX >= spanZ) return 'x';
  if (spanY >= spanX && spanY >= spanZ) return 'y';
  return 'z';
}

window.setCSMode = function(mode) {
  csMode = mode;
  document.getElementById('btn-cs-single').classList.toggle('active', mode === 'single');
  document.getElementById('btn-cs-range').classList.toggle('active', mode === 'range');
  document.getElementById('btn-cs-line').classList.toggle('active', mode === 'line');
  clearRingPreview();
};

function updateRingConnectInfo() {
  const axis = getPrincipalAxis();
  const axisNames = { x: 'X (span)', y: 'Y (depth)', z: 'Z (height)' };
  document.getElementById('ring-axis-info').textContent = `Slicing \u22A5 to ${axisNames[axis] || axis} axis`;
  if (csMode === 'line') {
    if (rangeNode1 === null) {
      document.getElementById('ring-connect-info').textContent = 'Click first node...';
    } else if (rangeNode2 === null) {
      document.getElementById('ring-connect-info').textContent = `Node #${rangeNode1} selected — click second node...`;
    } else {
      document.getElementById('ring-connect-info').textContent = `#${rangeNode1} → #${rangeNode2} — ${lineNodes.length} nodes along line`;
    }
  } else if (csMode === 'range') {
    if (rangeNode1 === null) {
      document.getElementById('ring-connect-info').textContent = 'Click first node (range start)...';
    } else if (rangeNode2 === null) {
      const src = nodeMap.get(rangeNode1);
      document.getElementById('ring-connect-info').textContent = `Start: Node #${rangeNode1} at ${axis.toUpperCase()}=${src[axis].toFixed(2)} — click second node...`;
    } else {
      const s1 = nodeMap.get(rangeNode1), s2 = nodeMap.get(rangeNode2);
      document.getElementById('ring-connect-info').textContent = `Range: ${axis.toUpperCase()} ${Math.min(s1[axis],s2[axis]).toFixed(2)} → ${Math.max(s1[axis],s2[axis]).toFixed(2)} — ${rangeAllRings.length} sections`;
    }
  } else {
    if (ringSourceNodeId !== null) {
      const src = nodeMap.get(ringSourceNodeId);
      const pos = src ? src[axis].toFixed(2) : '?';
      document.getElementById('ring-connect-info').textContent = `Node #${ringSourceNodeId} at ${axis.toUpperCase()}=${pos} — ${ringNodes.length} nodes in cross-section`;
    } else {
      document.getElementById('ring-connect-info').textContent = 'Click a node to start...';
    }
  }
}

function detectRing(nodeId) {
  const srcNode = nodeMap.get(nodeId);
  if (!srcNode) return [];
  const tol = parseFloat(document.getElementById('ring-z-tol').value) || 0.5;
  const axis = getPrincipalAxis();
  const target = srcNode[axis];

  // Find all nodes at the same position along the principal axis
  const ring = nodes.filter(n => Math.abs(n[axis] - target) <= tol);

  // Sort by angle in the cross-section plane (the other two axes)
  // Determine which two axes form the cross-section plane
  let a1, a2;
  if (axis === 'x') { a1 = 'y'; a2 = 'z'; }
  else if (axis === 'y') { a1 = 'x'; a2 = 'z'; }
  else { a1 = 'x'; a2 = 'y'; }

  // Centroid of ring in the cross-section plane
  const c1 = ring.reduce((s, n) => s + n[a1], 0) / ring.length;
  const c2 = ring.reduce((s, n) => s + n[a2], 0) / ring.length;

  // Sort by angle around the centroid
  ring.sort((a, b) => Math.atan2(a[a2] - c2, a[a1] - c1) - Math.atan2(b[a2] - c2, b[a1] - c1));

  // Find the largest angular gap and rotate the array so the gap is at the ends
  // This puts the shell opening between last and first node
  if (ring.length > 2) {
    let maxGap = -1, maxIdx = 0;
    for (let i = 0; i < ring.length; i++) {
      const cur = ring[i], nxt = ring[(i + 1) % ring.length];
      const d = (cur[a1]-nxt[a1])**2 + (cur[a2]-nxt[a2])**2;
      if (d > maxGap) { maxGap = d; maxIdx = i; }
    }
    // Rotate so the gap falls between last and first element
    const rotated = ring.slice(maxIdx + 1).concat(ring.slice(0, maxIdx + 1));
    ring.length = 0;
    rotated.forEach(n => ring.push(n));
  }
  return ring;
}

function previewRing(ring) {
  while (ringPreviewGroup.children.length) {
    const m = ringPreviewGroup.children[0]; ringPreviewGroup.remove(m); m.geometry.dispose(); m.material.dispose();
  }
  if (ring.length < 2) return;

  const previewMat = new THREE.MeshPhongMaterial({ color: 0x44ffaa, transparent: true, opacity: 0.6 });

  // Connect consecutive neighbors (gap already at the ends from detectRing)
  for (let i = 0; i < ring.length - 1; i++) {
    const n1 = ring[i], n2 = ring[i + 1];
    const exists = beams.some(b => b && ((b.node_start === n1.id && b.node_end === n2.id) || (b.node_start === n2.id && b.node_end === n1.id)));
    if (exists) continue;
    const p1 = m2t(n1.x, n1.y, n1.z), p2 = m2t(n2.x, n2.y, n2.z);
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    if (len < 1e-8) continue;
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const geo = new THREE.CylinderGeometry(0.05, 0.05, len, 4, 1);
    const mesh = new THREE.Mesh(geo, previewMat.clone());
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    ringPreviewGroup.add(mesh);
  }

  // Highlight ring nodes
  ring.forEach(n => {
    const mi = nodeIdToMeshIdx.get(n.id);
    if (mi !== undefined) nodeMeshes[mi].material.emissive.set(0x225533);
  });

  document.getElementById('ring-preview-count').textContent = `${ring.length} nodes, ${ringPreviewGroup.children.length} new members to create`;
  document.getElementById('btn-ring-connect').disabled = ringPreviewGroup.children.length === 0;
}

function detectAndPreviewLine() {
  const n1 = nodeMap.get(rangeNode1), n2 = nodeMap.get(rangeNode2);
  if (!n1 || !n2) return;

  // Direction vector from n1 to n2
  const dx = n2.x - n1.x, dy = n2.y - n1.y, dz = n2.z - n1.z;
  const lineLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (lineLen < 1e-8) return;
  const ux = dx / lineLen, uy = dy / lineLen, uz = dz / lineLen;

  // Find all nodes close to the line between n1 and n2
  const tol = parseFloat(document.getElementById('ring-z-tol').value) || 0.5;
  lineNodes = [];
  nodes.forEach(n => {
    // Vector from n1 to this node
    const vx = n.x - n1.x, vy = n.y - n1.y, vz = n.z - n1.z;
    // Projection along line direction
    const proj = vx * ux + vy * uy + vz * uz;
    // Skip if outside the segment (with small margin)
    if (proj < -tol || proj > lineLen + tol) return;
    // Perpendicular distance to line
    const cx = vy * uz - vz * uy, cy = vz * ux - vx * uz, cz = vx * uy - vy * ux;
    const perpDist = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (perpDist <= tol) {
      lineNodes.push({ node: n, proj });
    }
  });

  // Sort by projection along the line
  lineNodes.sort((a, b) => a.proj - b.proj);
  lineNodes = lineNodes.map(e => e.node);

  // Preview
  while (ringPreviewGroup.children.length) {
    const m = ringPreviewGroup.children[0]; ringPreviewGroup.remove(m); m.geometry.dispose(); m.material.dispose();
  }
  const previewMat = new THREE.MeshPhongMaterial({ color: 0x44ffaa, transparent: true, opacity: 0.6 });
  let totalNew = 0;
  for (let i = 0; i < lineNodes.length - 1; i++) {
    const a = lineNodes[i], b = lineNodes[i + 1];
    const exists = beams.some(bm => bm && ((bm.node_start === a.id && bm.node_end === b.id) || (bm.node_start === b.id && bm.node_end === a.id)));
    if (exists) continue;
    const p1 = m2t(a.x, a.y, a.z), p2 = m2t(b.x, b.y, b.z);
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    if (len < 1e-8) continue;
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    const geo = new THREE.CylinderGeometry(0.05, 0.05, len, 4, 1);
    const mesh = new THREE.Mesh(geo, previewMat.clone());
    mesh.position.copy(mid);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    ringPreviewGroup.add(mesh);
    totalNew++;
  }
  lineNodes.forEach(n => {
    const mi = nodeIdToMeshIdx.get(n.id);
    if (mi !== undefined) nodeMeshes[mi].material.emissive.set(0x225533);
  });
  document.getElementById('ring-preview-count').textContent = `${lineNodes.length} nodes, ${totalNew} new members`;
  document.getElementById('btn-ring-connect').disabled = totalNew === 0;
}

function detectAndPreviewRange() {
  const axis = getPrincipalAxis();
  const tol = parseFloat(document.getElementById('ring-z-tol').value) || 0.5;
  const s1 = nodeMap.get(rangeNode1), s2 = nodeMap.get(rangeNode2);
  const lo = Math.min(s1[axis], s2[axis]);
  const hi = Math.max(s1[axis], s2[axis]);

  // Find all unique cross-section positions within range
  const positions = new Set();
  nodes.forEach(n => {
    if (n[axis] >= lo - tol && n[axis] <= hi + tol) {
      // Round to tolerance to group nearby nodes
      positions.add(Math.round(n[axis] / tol) * tol);
    }
  });

  // For each unique position, detect the ring
  rangeAllRings = [];
  for (const pos of [...positions].sort((a, b) => a - b)) {
    // Find a representative node at this position
    const rep = nodes.find(n => Math.abs(n[axis] - pos) <= tol);
    if (!rep) continue;
    const ring = detectRing(rep.id);
    if (ring.length >= 2) rangeAllRings.push(ring);
  }

  // Preview all rings
  while (ringPreviewGroup.children.length) {
    const m = ringPreviewGroup.children[0]; ringPreviewGroup.remove(m); m.geometry.dispose(); m.material.dispose();
  }
  const previewMat = new THREE.MeshPhongMaterial({ color: 0x44ffaa, transparent: true, opacity: 0.6 });
  let totalNew = 0;
  for (const ring of rangeAllRings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const n1 = ring[i], n2 = ring[i + 1];
      const exists = beams.some(b => b && ((b.node_start === n1.id && b.node_end === n2.id) || (b.node_start === n2.id && b.node_end === n1.id)));
      if (exists) continue;
      const p1 = m2t(n1.x, n1.y, n1.z), p2 = m2t(n2.x, n2.y, n2.z);
      const dir = new THREE.Vector3().subVectors(p2, p1);
      const len = dir.length();
      if (len < 1e-8) continue;
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const geo = new THREE.CylinderGeometry(0.05, 0.05, len, 4, 1);
      const mesh = new THREE.Mesh(geo, previewMat.clone());
      mesh.position.copy(mid);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      ringPreviewGroup.add(mesh);
      totalNew++;
    }
    ring.forEach(n => {
      const mi = nodeIdToMeshIdx.get(n.id);
      if (mi !== undefined) nodeMeshes[mi].material.emissive.set(0x225533);
    });
  }
  document.getElementById('ring-preview-count').textContent = `${rangeAllRings.length} sections, ${totalNew} new members`;
  document.getElementById('btn-ring-connect').disabled = totalNew === 0;
}

window.executeRingConnect = function() {
  let created = 0;
  if (csMode === 'line') {
    for (let i = 0; i < lineNodes.length - 1; i++) {
      const n1 = lineNodes[i], n2 = lineNodes[i + 1];
      const exists = beams.some(b => b && ((b.node_start === n1.id && b.node_end === n2.id) || (b.node_start === n2.id && b.node_end === n1.id)));
      if (exists) continue;
      createNewBeam(n1.id, n2.id);
      created++;
    }
  } else if (csMode === 'range') {
    for (const ring of rangeAllRings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const n1 = ring[i], n2 = ring[i + 1];
        const exists = beams.some(b => b && ((b.node_start === n1.id && b.node_end === n2.id) || (b.node_start === n2.id && b.node_end === n1.id)));
        if (exists) continue;
        createNewBeam(n1.id, n2.id);
        created++;
      }
    }
  } else {
    if (ringNodes.length < 2) return;
    for (let i = 0; i < ringNodes.length - 1; i++) {
      const n1 = ringNodes[i], n2 = ringNodes[i + 1];
      const exists = beams.some(b => b && ((b.node_start === n1.id && b.node_end === n2.id) || (b.node_start === n2.id && b.node_end === n1.id)));
      if (exists) continue;
      createNewBeam(n1.id, n2.id);
      created++;
    }
  }
  clearRingPreview();
  document.getElementById('ring-connect-info').textContent = `Created ${created} members. Click another node...`;
  document.getElementById('s-beams').textContent = beams.filter(b => b).length;
};

window.clearRingPreview = function() {
  while (ringPreviewGroup.children.length) {
    const m = ringPreviewGroup.children[0]; ringPreviewGroup.remove(m); m.geometry.dispose(); m.material.dispose();
  }
  // Reset emissive for single mode nodes
  ringNodes.forEach(n => {
    const mi = nodeIdToMeshIdx.get(n.id);
    if (mi !== undefined) nodeMeshes[mi].material.emissive.set(0x000000);
  });
  // Reset emissive for range mode nodes
  for (const ring of rangeAllRings) {
    ring.forEach(n => {
      const mi = nodeIdToMeshIdx.get(n.id);
      if (mi !== undefined) nodeMeshes[mi].material.emissive.set(0x000000);
    });
  }
  // Reset emissive for line mode nodes
  lineNodes.forEach(n => {
    const mi = nodeIdToMeshIdx.get(n.id);
    if (mi !== undefined) nodeMeshes[mi].material.emissive.set(0x000000);
  });
  ringNodes = [];
  ringSourceNodeId = null;
  rangeNode1 = null;
  rangeNode2 = null;
  rangeAllRings = [];
  lineNodes = [];
  document.getElementById('ring-preview-count').textContent = '';
  document.getElementById('btn-ring-connect').disabled = true;
  updateRingConnectInfo();
};

// ============================================================
// ROBOT STRUCTURAL ANALYSIS INTEGRATION
// ============================================================
function updateRobotSummary() {
  saveActiveLoadCase();
  document.getElementById('rb-nodes').textContent = nodes.length;
  document.getElementById('rb-beams').textContent = beams.filter(b => b).length;
  document.getElementById('rb-supports').textContent = supports.size;
  document.getElementById('rb-lcs').textContent = loadCases.length;
  document.getElementById('rb-sections').textContent = beamSections.size;
}

window.exportRobotJSON = function() {
  saveActiveLoadCase();
  const globalSec = { D: parseFloat(document.getElementById('chs-D').value), t: parseFloat(document.getElementById('chs-t').value) };
  const E = parseFloat(document.getElementById('mat-E').value);
  const rho = parseFloat(document.getElementById('mat-rho').value) || 7850;
  let G = parseFloat(document.getElementById('mat-G').value);
  if (isNaN(G) || G <= 0) G = 0;

  const sectionsObj = {};
  beamSections.forEach((v, k) => { sectionsObj[k] = { D: v.D, t: v.t }; });
  const supportsObj = {};
  supports.forEach((v, k) => { supportsObj[k] = { type: v.type, dir: v.dir || null }; });
  const lcData = loadCases.map(lc => {
    const pl = {};
    lc.pointLoads.forEach((v, k) => { pl[k] = v; });
    return { id: lc.id, name: lc.name, nature: lc.nature, selfWeight: lc.selfWeight, liveLoadIntensity: lc.liveLoadIntensity, pointLoads: pl, windPressure: lc.windLoad.pressure, windDir: lc.windLoad.dir };
  });
  const activeBeams = beams.filter(b => b).map(b => ({ id: b.id, node_start: b.node_start, node_end: b.node_end }));

  // Envelope triangles (if generated)
  let envelope = null;
  if (cfdEnvelope && cfdEnvelope.triangles) {
    envelope = {
      triangles: cfdEnvelope.triangles.map(t => ({
        a: t.a.id, b: t.b.id, c: t.c.id,
        nx: t.nx, ny: t.ny, nz: t.nz, area: t.area
      }))
    };
  }

  const data = {
    version: '1.0',
    nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y, z: n.z })),
    beams: activeBeams,
    globalSection: globalSec,
    beamSections: sectionsObj,
    material: { E, rho, G },
    supports: supportsObj,
    loadCases: lcData,
    envelope: envelope
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'diagrid_model.json';
  a.click();
};

window.exportToRobot = function() {
  saveActiveLoadCase();

  // Gather model data
  const globalSec = { D: parseFloat(document.getElementById('chs-D').value), t: parseFloat(document.getElementById('chs-t').value) };
  const E = parseFloat(document.getElementById('mat-E').value);
  const rho = parseFloat(document.getElementById('mat-rho').value) || 7850;
  let G = parseFloat(document.getElementById('mat-G').value);
  if (isNaN(G) || G <= 0) G = 0;

  const sectionsObj = {};
  beamSections.forEach((v, k) => { sectionsObj[k] = { D: v.D, t: v.t }; });

  const supportsObj = {};
  supports.forEach((v, k) => { supportsObj[k] = { type: v.type, dir: v.dir }; });

  const lcData = loadCases.map(lc => {
    const pl = {};
    lc.pointLoads.forEach((v, k) => { pl[k] = v; });
    return { id: lc.id, name: lc.name, nature: lc.nature, selfWeight: lc.selfWeight, liveLoadIntensity: lc.liveLoadIntensity, pointLoads: pl, windPressure: lc.windLoad.pressure, windDir: lc.windLoad.dir };
  });

  const activeBeams = beams.filter(b => b).map(b => ({ id: b.id, node_start: b.node_start, node_end: b.node_end }));

  // Envelope triangles for cladding panels
  let envelopeData = [];
  if (cfdEnvelope && cfdEnvelope.triangles) {
    envelopeData = cfdEnvelope.triangles.map((t, i) => ({
      id: i, a: t.a.id, b: t.b.id, c: t.c.id
    }));
  }

  const ROBOT_SCRIPT_VERSION = '3.0.0';
  const toPy = (obj) => JSON.stringify(obj).replace(/\bfalse\b/g, 'False').replace(/\btrue\b/g, 'True').replace(/\bnull\b/g, 'None');

  const script = `"""
Diagrid Model -> Robot Structural Analysis Professional
========================================================
Auto-generated by Diagrid Beam Model Viewer
Script version: ${ROBOT_SCRIPT_VERSION}
Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}
Run: pip install pywin32 && python robot_export.py

This script will:
  1. Open Robot and create a new 3D frame model
  2. Add all nodes, bars, sections (from DB), materials, supports
  3. Create load cases with all loads (including point loads)
  4. Run linear static analysis
  5. Export results to robot_results.json

All Robot COM values use SI units (N, m, Pa).
"""
import json, sys, time, os
import win32com.client.dynamic
import pythoncom

try:
    pythoncom.CoInitialize()
except:
    pass

# ================================================================
# MODEL DATA
# ================================================================
NODES = ${toPy(nodes.map(n => ({ id: n.id, x: n.x, y: n.y, z: n.z })))}

BEAMS = ${toPy(activeBeams)}

GLOBAL_SECTION = ${toPy(globalSec)}

BEAM_SECTIONS = ${toPy(sectionsObj)}

MATERIAL = {"E": ${E}, "rho": ${rho}, "G": ${G || 0}}

SUPPORTS = ${toPy(supportsObj)}

LOAD_CASES = ${toPy(lcData)}

# ================================================================
# ROBOT COM CONSTANTS (from Robot API PDF p68-69)
# ================================================================
I_PT_FRAME_3D = 7
I_LT_SUPPORT = 0
I_LT_BAR_SECTION = 3
I_LT_MATERIAL = 8
I_CN_PERMANENT = 1
I_CN_EXPLOATATION = 2
I_CN_WIND = 3
I_CN_ACCIDENTAL = 6
I_CAT_STATIC_LINEAR = 1
# Load record types (IRobotLoadRecordType)
I_LRT_NODE_FORCE = 0
I_LRT_BAR_UNIFORM = 5
I_LRT_DEAD = 7

NATURE_MAP = {"dead": I_CN_PERMANENT, "live": I_CN_EXPLOATATION, "wind": I_CN_WIND, "custom": I_CN_ACCIDENTAL}

SCRIPT_VERSION = "${ROBOT_SCRIPT_VERSION}"

OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "robot_results.json")

def main():
    print("=" * 60)
    print(f"  Diagrid Model -> Robot v{SCRIPT_VERSION}")
    print("=" * 60)

    print("\\nConnecting to Robot...")
    try:
        robot = win32com.client.dynamic.Dispatch("Robot.Application")
    except Exception as e:
        print(f"ERROR: Could not connect to Robot. Is it installed?\\n{e}")
        sys.exit(1)

    robot.Visible = 1
    robot.Interactive = 0
    try:
        robot.Project.Close()
    except:
        pass
    robot.Project.New(I_PT_FRAME_3D)
    time.sleep(2)
    robot.Interactive = 1
    print(f"  Created new 3D Frame project")

    struct = robot.Project.Structure
    labels = struct.Labels
    mat_name = "S355"

    # --- Material from Robot database ---
    print("\\nDefining material...")
    try:
        mat_label = labels.Create(I_LT_MATERIAL, mat_name)
        mat_data = mat_label.Data
        if not mat_data.LoadFromDBase("S355"):
            # Fallback: try generic steel
            mat_data.LoadFromDBase("Steel")
        labels.Store(mat_label)
        print(f"  Material: {mat_name} (E={mat_data.E})")
    except Exception as e:
        print(f"  Material warning: {e}")
        mat_name = "STEEL"

    # --- Sections from Robot database ---
    print("\\nDefining sections...")
    created_sections = {}

    def ensure_section(D_mm, t_mm):
        label_name = f"CHS {D_mm:.1f}x{t_mm:.1f}"
        if label_name in created_sections:
            return created_sections[label_name]

        D_m = D_mm / 1000.0
        t_m = t_mm / 1000.0

        sec_label = labels.Create(I_LT_BAR_SECTION, label_name)
        sec_data = sec_label.Data

        # Try loading from Robot's section database
        # Robot DB uses format "CHS {D:.1f}x{t:.1f}" (e.g. "CHS 219.1x8.0")
        db_names = [
            f"CHS {D_mm:.1f}x{t_mm:.1f}",
            f"TRON {D_mm:.1f}*{t_mm:.1f}",
            f"CHS {D_mm:.0f}x{t_mm:.0f}",
            f"TRON {D_mm:.0f}*{t_mm:.0f}",
        ]
        loaded = False
        for db_name in db_names:
            try:
                if sec_data.LoadFromDBase(db_name):
                    loaded = True
                    print(f"  Section: {label_name} (DB: {db_name})")
                    break
            except:
                pass

        if not loaded:
            print(f"  WARNING: Section {label_name} not found in Robot database")
            print(f"    Tried: {db_names}")
            print(f"    Section will use Robot default properties")

        sec_data.MaterialName = mat_name
        labels.Store(sec_label)
        created_sections[label_name] = label_name
        return label_name

    global_sec_name = ensure_section(GLOBAL_SECTION["D"], GLOBAL_SECTION["t"])
    override_sec_names = {}
    for bi_str, sec in BEAM_SECTIONS.items():
        override_sec_names[int(bi_str)] = ensure_section(sec["D"], sec["t"])

    # --- Nodes ---
    print(f"\\nCreating {len(NODES)} nodes...")
    nodes_server = struct.Nodes
    node_id_map = {}
    for n in NODES:
        rid = n["id"] + 1
        node_id_map[n["id"]] = rid
        nodes_server.Create(rid, n["x"], n["y"], n["z"])

    # --- Bars ---
    print(f"Creating {len(BEAMS)} bars...")
    bars_server = struct.Bars
    errors = 0
    for idx, b in enumerate(BEAMS):
        rid = b["id"] + 1
        try:
            bars_server.Create(rid, node_id_map[b["node_start"]], node_id_map[b["node_end"]])
            bar = bars_server.Get(rid)
            bar.SetLabel(I_LT_BAR_SECTION, override_sec_names.get(idx, global_sec_name))
            bar.SetLabel(I_LT_MATERIAL, mat_name)
        except Exception as e:
            errors += 1
            if errors <= 3: print(f"  Bar {rid} error: {e}")
    print(f"  Created {len(BEAMS) - errors}/{len(BEAMS)} bars")

    # --- Supports ---
    print(f"Applying {len(SUPPORTS)} supports...")
    support_labels_created = set()
    for nid_str, sup in SUPPORTS.items():
        nid = int(nid_str)
        stype = sup["type"]
        sdir = sup.get("dir") or "z"

        if stype == "fixed": sup_name = "Fixed"
        elif stype == "pinned": sup_name = "Pinned"
        else: sup_name = f"Roller_{sdir}"

        if sup_name not in support_labels_created:
            try:
                sl = labels.Create(I_LT_SUPPORT, sup_name)
                sd = sl.Data
                if stype == "fixed":
                    sd.UX = True; sd.UY = True; sd.UZ = True
                    sd.RX = True; sd.RY = True; sd.RZ = True
                elif stype == "pinned":
                    sd.UX = True; sd.UY = True; sd.UZ = True
                    sd.RX = False; sd.RY = False; sd.RZ = False
                elif stype == "roller":
                    sd.UX = sdir == "x"; sd.UY = sdir == "y"; sd.UZ = sdir == "z"
                    sd.RX = False; sd.RY = False; sd.RZ = False
                labels.Store(sl)
                support_labels_created.add(sup_name)
            except:
                support_labels_created.add(sup_name)

        rid = node_id_map.get(nid)
        if rid:
            nodes_server.Get(rid).SetLabel(I_LT_SUPPORT, sup_name)

    # --- Load Cases (all units SI: N, m, N/m) ---
    print(f"Creating {len(LOAD_CASES)} load cases...")
    cases = struct.Cases
    all_bars = " ".join(str(b["id"] + 1) for b in BEAMS)

    for lc in LOAD_CASES:
        case_id = lc["id"]
        nature = NATURE_MAP.get(lc["nature"], I_CN_PERMANENT)
        case = cases.CreateSimple(case_id, lc["name"], nature, I_CAT_STATIC_LINEAR)
        records = case.Records

        # Self-weight
        if lc.get("selfWeight"):
            rec = records.Create(I_LRT_DEAD)
            rec.Objects.FromText("all")
            print(f"  LC{case_id} '{lc['name']}': self-weight")

        # Uniform live load on all bars (kN/m -> N/m for SI)
        if lc.get("liveLoadIntensity", 0) > 0:
            intensity_Npm = lc["liveLoadIntensity"] * 1000  # kN/m -> N/m
            rec = records.Create(I_LRT_BAR_UNIFORM)
            rec.SetValue(2, -intensity_Npm)  # PZ in N/m
            rec.Objects.FromText(all_bars)
            print(f"  LC{case_id} '{lc['name']}': live load {lc['liveLoadIntensity']} kN/m")

        # Point loads (now works with correct I_LRT_NODE_FORCE=0)
        if lc.get("pointLoads"):
            count = 0
            for nid_str, pl in lc["pointLoads"].items():
                nid = int(nid_str)
                rid = node_id_map.get(nid)
                if not rid:
                    continue
                rec = records.Create(I_LRT_NODE_FORCE)
                rec.Objects.FromText(str(rid))
                rec.SetValue(0, pl.get("fx", 0) * 1000)  # kN -> N
                rec.SetValue(1, pl.get("fy", 0) * 1000)
                rec.SetValue(2, pl.get("fz", 0) * 1000)
                rec.SetValue(3, pl.get("mx", 0) * 1000)  # kN.m -> N.m
                rec.SetValue(4, pl.get("my", 0) * 1000)
                rec.SetValue(5, pl.get("mz", 0) * 1000)
                count += 1
            if count > 0:
                print(f"  LC{case_id} '{lc['name']}': {count} point loads")

        # Wind load as uniform bar load (kN/m -> N/m)
        if lc.get("windPressure", 0) > 0:
            wp_Npm = lc["windPressure"] * 1000  # kN/m -> N/m
            wd = lc.get("windDir", "x")
            sign = -1 if wd.startswith("-") else 1
            axis = wd.replace("-", "")
            rec = records.Create(I_LRT_BAR_UNIFORM)
            dof = {"x": 0, "y": 1, "z": 2}.get(axis, 0)
            rec.SetValue(dof, sign * wp_Npm)
            rec.Objects.FromText(all_bars)
            print(f"  LC{case_id} '{lc['name']}': wind {lc['windPressure']} kN/m in {wd}")

    # --- Solve ---
    print("\\nRunning analysis...")
    robot.Interactive = 0
    t0 = time.time()
    calc = robot.Project.CalcEngine
    calc.GenerateModel()
    calc.Calculate()
    time.sleep(3)
    t1 = time.time()
    robot.Interactive = 1
    print(f"Analysis completed in {t1 - t0:.1f} seconds")

    avail = struct.Results.Available
    print(f"Results available: {avail}")
    if not avail:
        print("WARNING: No results available! Check for errors in Robot.")

    # --- Extract Results (all SI: N, m, N.m) ---
    print("\\nExtracting results...")
    results = {
        "source": "robot",
        "units": {"force": "kN", "length": "m", "moment": "kN.m"},
        "model": {
            "nodeCount": len(NODES),
            "beamCount": len(BEAMS),
            "loadCases": [{"id": lc["id"], "name": lc["name"]} for lc in LOAD_CASES]
        },
        "cases": []
    }

    for lc in LOAD_CASES:
        case_id = lc["id"]
        case_result = {
            "id": case_id,
            "name": lc["name"],
            "displacements": [],
            "memberForces": [],
            "reactions": {}
        }

        # Node displacements (m -> m, rad -> rad)
        err_count = 0
        for n in NODES:
            rid = node_id_map[n["id"]]
            try:
                d = struct.Results.Nodes.Displacements.Value(rid, case_id)
                case_result["displacements"].append({
                    "nodeId": n["id"],
                    "ux": float(d.UX), "uy": float(d.UY), "uz": float(d.UZ),
                    "rx": float(d.RX), "ry": float(d.RY), "rz": float(d.RZ)
                })
            except:
                err_count += 1
                case_result["displacements"].append({
                    "nodeId": n["id"], "ux": 0, "uy": 0, "uz": 0, "rx": 0, "ry": 0, "rz": 0
                })
        if err_count > 0:
            print(f"  LC{case_id}: {err_count}/{len(NODES)} displacement errors")

        # Bar forces (N -> kN, N.m -> kN.m)
        f_err = 0
        for b in BEAMS:
            rid = b["id"] + 1
            try:
                f0 = struct.Results.Bars.Forces.Value(rid, case_id, 0)
                f1 = struct.Results.Bars.Forces.Value(rid, case_id, 1)
                case_result["memberForces"].append({
                    "beamId": b["id"],
                    "axial": float(f0.FX) / 1000,
                    "shearY": float(f0.FY) / 1000, "shearZ": float(f0.FZ) / 1000,
                    "torsion": float(f0.MX) / 1000,
                    "momentY_start": float(f0.MY) / 1000, "momentY_end": float(f1.MY) / 1000,
                    "momentZ_start": float(f0.MZ) / 1000, "momentZ_end": float(f1.MZ) / 1000
                })
            except:
                f_err += 1
                case_result["memberForces"].append({
                    "beamId": b["id"],
                    "axial": 0, "shearY": 0, "shearZ": 0, "torsion": 0,
                    "momentY_start": 0, "momentY_end": 0, "momentZ_start": 0, "momentZ_end": 0
                })
        if f_err > 0:
            print(f"  LC{case_id}: {f_err}/{len(BEAMS)} force errors")

        # Reactions at supported nodes (N -> kN, N.m -> kN.m)
        for nid_str in SUPPORTS:
            nid = int(nid_str)
            rid = node_id_map.get(nid)
            if not rid:
                continue
            try:
                r = struct.Results.Nodes.Reactions.Value(rid, case_id)
                case_result["reactions"][str(nid)] = {
                    "fx": float(r.FX) / 1000, "fy": float(r.FY) / 1000, "fz": float(r.FZ) / 1000,
                    "mx": float(r.MX) / 1000, "my": float(r.MY) / 1000, "mz": float(r.MZ) / 1000
                }
            except:
                case_result["reactions"][str(nid)] = {
                    "fx": 0, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": 0
                }

        results["cases"].append(case_result)

    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\\n{'=' * 60}")
    print(f"  Results written to: {OUTPUT_FILE}")
    print(f"  {len(NODES)} nodes, {len(BEAMS)} bars, {len(SUPPORTS)} supports")
    print(f"  {len(LOAD_CASES)} load cases")
    print(f"{'=' * 60}")
    print("\\nRobot model remains open for inspection.")

    try:
        pythoncom.CoUninitialize()
    except:
        pass

if __name__ == "__main__":
    main()
`;

  // Download as file
  const blob = new Blob([script], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'robot_export.py';
  a.click();
  URL.revokeObjectURL(url);
};

window.importRobotResults = function() {
  const fileInput = document.getElementById('robot-results-file');
  const statusEl = document.getElementById('robot-import-status');
  if (!fileInput.files.length) {
    statusEl.innerHTML = '<span class="status-badge warn">No file selected</span>';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.cases || !data.cases.length) {
        statusEl.innerHTML = '<span class="status-badge warn">No results found in file</span>';
        return;
      }

      // Build a combined result from all cases (envelope of max values)
      const nDof = nodes.length * 6;
      const displacements = new Float64Array(nDof);
      let maxU = 0, maxUz = 0, maxAxial = 0, maxMoment = 0;

      // Sum displacements across all cases
      for (const caseResult of data.cases) {
        for (const d of caseResult.displacements) {
          const idx = nIdx.get(d.nodeId);
          if (idx === undefined) continue;
          displacements[idx * 6] += d.ux;
          displacements[idx * 6 + 1] += d.uy;
          displacements[idx * 6 + 2] += d.uz;
          displacements[idx * 6 + 3] += d.rx;
          displacements[idx * 6 + 4] += d.ry;
          displacements[idx * 6 + 5] += d.rz;
        }
      }

      // Compute max displacement
      for (let i = 0; i < nodes.length; i++) {
        const ux = displacements[i * 6], uy = displacements[i * 6 + 1], uz = displacements[i * 6 + 2];
        const mag = Math.sqrt(ux * ux + uy * uy + uz * uz);
        if (mag > maxU) maxU = mag;
        if (Math.abs(uz) > Math.abs(maxUz)) maxUz = uz;
      }

      // Sum member forces across all cases
      const memberForces = beams.map((b, bi) => {
        if (!b) return null;
        let axial = 0, shearY = 0, shearZ = 0, torsion = 0, momentY = 0, momentZ = 0;
        for (const caseResult of data.cases) {
          const mf = caseResult.memberForces.find(m => m.beamId === b.id);
          if (mf) {
            axial += mf.axial || 0;
            shearY += mf.shearY || 0;
            shearZ += mf.shearZ || 0;
            torsion += mf.torsion || 0;
            momentY += Math.max(Math.abs(mf.momentY_start || 0), Math.abs(mf.momentY_end || 0));
            momentZ += Math.max(Math.abs(mf.momentZ_start || 0), Math.abs(mf.momentZ_end || 0));
          }
        }
        const maxMom = Math.sqrt(momentY * momentY + momentZ * momentZ);
        return { axial, shearY, shearZ, torsion, momentY, momentZ, maxMoment: maxMom };
      });

      memberForces.forEach(mf => {
        if (!mf) return;
        if (Math.abs(mf.axial) > Math.abs(maxAxial)) maxAxial = mf.axial;
        if (mf.maxMoment > maxMoment) maxMoment = mf.maxMoment;
      });

      // Compute reactions
      let sumRx = 0, sumRy = 0, sumRz = 0;
      for (const caseResult of data.cases) {
        for (const nid in caseResult.reactions) {
          const r = caseResult.reactions[nid];
          sumRx += r.fx || 0;
          sumRy += r.fy || 0;
          sumRz += r.fz || 0;
        }
      }

      // Compute applied force sum
      const Fapplied = computeTotalForceVector();
      let sumFz = 0;
      for (let i = 0; i < nodes.length; i++) sumFz += Fapplied[i * 6 + 2];

      femResults = {
        displacements, memberForces, maxU, maxUz, maxAxial, maxMoment,
        sumRx, sumRy, sumRz, sumFz,
        iterations: 0, residual: 0, solveTime: 0,
        source: 'robot',
        robotCases: data.cases
      };

      // Update analysis display
      document.getElementById('r-iter').textContent = 'Robot';
      document.getElementById('r-resid').textContent = 'N/A';
      document.getElementById('r-time').textContent = 'External';
      document.getElementById('r-maxu').textContent = (maxU * 1000).toFixed(3);
      document.getElementById('r-maxuz').textContent = (maxUz * 1000).toFixed(3);
      document.getElementById('r-maxaxial').textContent = maxAxial.toFixed(2);
      document.getElementById('r-maxmoment').textContent = maxMoment.toFixed(3);
      document.getElementById('r-rx').textContent = sumRx.toFixed(2) + ' kN';
      document.getElementById('r-ry').textContent = sumRy.toFixed(2) + ' kN';
      document.getElementById('r-rz').textContent = sumRz.toFixed(2) + ' kN';
      document.getElementById('r-afz').textContent = sumFz.toFixed(2) + ' kN';
      document.getElementById('analysis-precheck').classList.add('hidden');
      document.getElementById('analysis-results').classList.remove('hidden');

      showDeformedShape(parseInt(document.getElementById('def-scale').value));
      statusEl.innerHTML = `<span class="status-badge ok">Imported ${data.cases.length} load case(s) from Robot</span>`;
      setMode('analysis');

    } catch (err) {
      statusEl.innerHTML = `<span class="status-badge warn">Error: ${err.message}</span>`;
    }
  };
  reader.readAsText(fileInput.files[0]);
};

function animate() {
  requestAnimationFrame(animate);
  orbitControls.update();
  renderer.render(scene, camera);
  if (nlVisible || blVisible) updateLabelPositions();
}
animate();
updateStatusCounts();
