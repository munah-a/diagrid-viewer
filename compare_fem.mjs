/**
 * Compare our FEM solver results with Robot Structural Analysis.
 * Runs the same diagrid model with same supports and self-weight.
 */
import { readFileSync } from 'fs';
import { build3DFrameLocalK, buildRotationMatrix, transformKtoGlobal } from './src/solvers/fem-core.js';
import { computeCHSProps } from './src/solvers/section-props.js';
import { SparseMatrix } from './src/solvers/sparse-matrix.js';
import { solveCG } from './src/solvers/conjugate-gradient.js';

// Load model
const model = JSON.parse(readFileSync('public/beam_model.json', 'utf8'));
const robotResults = JSON.parse(readFileSync('C:/Users/Hello/Downloads/robot_results.json', 'utf8'));

const nodes = model.nodes;
const beams = model.beams;

console.log(`Model: ${nodes.length} nodes, ${beams.length} beams`);

// Material properties (match Robot S355 DB: E=205 GPa)
const E_GPa = 200;  // Our default
const G_GPa = 77;
const E = E_GPa * 1e6;  // kPa
const G = G_GPa * 1e6;  // kPa
const rho = 7850;  // kg/m^3
const grav = 9.81;

// Section: CHS 219.1x8 (default from the model)
const D_mm = 219.1, t_mm = 8;
const sec = computeCHSProps(D_mm, t_mm);
console.log(`Section: CHS ${D_mm}x${t_mm}`);
console.log(`  A=${sec.A.toExponential(4)}, Iy=${sec.Iy.toExponential(4)}, J=${sec.J.toExponential(4)}`);

// Support nodes (from Robot results)
const supportNodeIds = new Set(Object.keys(robotResults.cases[0].reactions).map(Number));
console.log(`Supports: ${supportNodeIds.size} fixed nodes: ${[...supportNodeIds].join(', ')}`);

// Build node index maps
const nodeMap = new Map();
const nIdx = new Map();
nodes.forEach((n, i) => { nodeMap.set(n.id, n); nIdx.set(n.id, i); });

// Compute beam lengths
const beamLengths = beams.map(b => {
  const n1 = nodeMap.get(b.node_start), n2 = nodeMap.get(b.node_end);
  const dx = n2.x-n1.x, dy = n2.y-n1.y, dz = n2.z-n1.z;
  return Math.sqrt(dx*dx+dy*dy+dz*dz);
});

// Assemble global stiffness matrix
console.log('\nAssembling stiffness matrix...');
const ndof = nodes.length * 6;
const K = new SparseMatrix(ndof);

beams.forEach((b, bi) => {
  const n1 = nodeMap.get(b.node_start), n2 = nodeMap.get(b.node_end);
  const L = beamLengths[bi];
  const Kl = build3DFrameLocalK(L, E, sec.A, sec.Iy, sec.Iz, G, sec.J);
  const R3 = buildRotationMatrix(n1, n2);
  const Kg = transformKtoGlobal(Kl, R3);
  const si = nIdx.get(b.node_start), ei = nIdx.get(b.node_end);
  const dofs = [];
  for (let d = 0; d < 6; d++) dofs.push(si*6+d);
  for (let d = 0; d < 6; d++) dofs.push(ei*6+d);
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 12; j++)
      K.add(dofs[i], dofs[j], Kg[i][j]);
});

// Assemble consistent force vector (self-weight)
console.log('Assembling force vector (consistent self-weight)...');
const F = new Float64Array(ndof);

beams.forEach((b, bi) => {
  const n1 = nodeMap.get(b.node_start), n2 = nodeMap.get(b.node_end);
  const L = beamLengths[bi];
  const R3 = buildRotationMatrix(n1, n2);
  const wkNm = rho * sec.A * grav / 1000;  // kN/m

  // Robot's "Dead Load" = 2.0 kN/m uniform on all bars (no self-weight)
  // 4967.17 kN / 2483.59 m = 2.000 kN/m exactly
  const wx = 0, wy = 0, wz = -2.0; // kN/m uniform gravity load

  // Transform to local
  const wlx = R3[0][0]*wx + R3[0][1]*wy + R3[0][2]*wz;
  const wly = R3[1][0]*wx + R3[1][1]*wy + R3[1][2]*wz;
  const wlz = R3[2][0]*wx + R3[2][1]*wy + R3[2][2]*wz;

  // Consistent nodal loads in local
  const fl = new Float64Array(12);
  const L2_12 = L * L / 12;
  fl[0] = wlx * L / 2;
  fl[1] = wly * L / 2;
  fl[2] = wlz * L / 2;
  fl[4] = wlz * L2_12;      // My1 = +wz*L²/12
  fl[5] = -wly * L2_12;     // Mz1 = -wy*L²/12
  fl[6] = wlx * L / 2;
  fl[7] = wly * L / 2;
  fl[8] = wlz * L / 2;
  fl[10] = -wlz * L2_12;    // My2 = -wz*L²/12
  fl[11] = wly * L2_12;     // Mz2 = +wy*L²/12

  // Build T matrix (12x12 block diagonal)
  const T = Array.from({length:12}, () => new Float64Array(12));
  for (let bl = 0; bl < 4; bl++)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        T[bl*3+i][bl*3+j] = R3[i][j];

  // f_global = T^T * f_local
  const fg = new Float64Array(12);
  for (let i = 0; i < 12; i++) {
    let s = 0;
    for (let k = 0; k < 12; k++) s += T[k][i] * fl[k];
    fg[i] = s;
  }

  const si = nIdx.get(b.node_start), ei = nIdx.get(b.node_end);
  for (let d = 0; d < 6; d++) { F[si*6+d] += fg[d]; F[ei*6+d] += fg[6+d]; }
});

// Total self-weight
let totalFz = 0;
for (let i = 0; i < nodes.length; i++) totalFz += F[i*6+2];
console.log(`Total self-weight: ${totalFz.toFixed(2)} kN (Robot: -4967.17 kN)`);

// Apply boundary conditions (penalty method)
console.log('Applying BCs...');
supportNodeIds.forEach(nid => {
  const idx = nIdx.get(nid);
  for (let d = 0; d < 6; d++) {
    K.setRowCol(idx*6+d, 1e15);
    F[idx*6+d] = 0;
  }
});

// Solve
console.log('Solving...');
const t0 = Date.now();
const result = solveCG(K, F);
const t1 = Date.now();
console.log(`Solved in ${t1-t0}ms, iterations: ${result.iterations}, residual: ${result.residual.toExponential(3)}`);

// ============================================================
// COMPARE WITH ROBOT
// ============================================================
console.log('\n' + '='.repeat(60));
console.log('  COMPARISON: Our FEM vs Robot');
console.log('='.repeat(60));

const robotDisp = new Map();
robotResults.cases[0].displacements.forEach(d => robotDisp.set(d.nodeId, d));

// Find max UZ
let ourMaxUzNode = 0, ourMaxUz = 0;
for (let i = 0; i < nodes.length; i++) {
  const uz = result.x[i*6+2];
  if (Math.abs(uz) > Math.abs(ourMaxUz)) { ourMaxUz = uz; ourMaxUzNode = nodes[i].id; }
}
const robotMaxUz = robotResults.cases[0].displacements.reduce((max, d) =>
  Math.abs(d.uz) > Math.abs(max.uz) ? d : max, {uz:0});

console.log('\n--- Max Vertical Displacement ---');
console.log(`  Our FEM: ${(ourMaxUz*1000).toFixed(2)} mm at node ${ourMaxUzNode}`);
console.log(`  Robot:   ${(robotMaxUz.uz*1000).toFixed(2)} mm at node ${robotMaxUz.nodeId}`);
console.log(`  Ratio:   ${(ourMaxUz / robotMaxUz.uz).toFixed(4)}`);

// Compare displacements at sample nodes
console.log('\n--- Sample Displacements (mm) ---');
console.log('  Node    | Our UX     Our UY     Our UZ    | Robot UX   Robot UY   Robot UZ   | UZ ratio');
const sampleNodes = [0, 3, 100, 200, 300, 400, 500, 516, 600];
for (const nid of sampleNodes) {
  const idx = nIdx.get(nid);
  if (idx === undefined) continue;
  const rd = robotDisp.get(nid);
  if (!rd) continue;
  const oux = result.x[idx*6]*1000, ouy = result.x[idx*6+1]*1000, ouz = result.x[idx*6+2]*1000;
  const rux = rd.ux*1000, ruy = rd.uy*1000, ruz = rd.uz*1000;
  const ratio = ruz !== 0 ? (ouz/ruz).toFixed(3) : 'N/A';
  console.log(`  ${String(nid).padStart(5)} | ${oux.toFixed(3).padStart(10)} ${ouy.toFixed(3).padStart(10)} ${ouz.toFixed(3).padStart(10)} | ${rux.toFixed(3).padStart(10)} ${ruy.toFixed(3).padStart(10)} ${ruz.toFixed(3).padStart(10)} | ${ratio}`);
}

// Compare member forces
const robotForces = new Map();
robotResults.cases[0].memberForces.forEach(mf => robotForces.set(mf.beamId, mf));

console.log('\n--- Sample Member Forces (kN, kN.m) ---');
// Compute member forces for our FEM
const sampleBeams = [0, 100, 200, 500, 855, 882, 1000];
console.log('  Beam | Our Axial   Robot Axial  | Our MY_max  Robot MY_max | Ax ratio');
for (const bi of sampleBeams) {
  const b = beams[bi];
  if (!b) continue;
  const rmf = robotForces.get(b.id);
  if (!rmf) continue;

  // Compute our member forces
  const n1 = nodeMap.get(b.node_start), n2 = nodeMap.get(b.node_end);
  const L = beamLengths[bi];
  const Kl = build3DFrameLocalK(L, E, sec.A, sec.Iy, sec.Iz, G, sec.J);
  const R3 = buildRotationMatrix(n1, n2);
  const T = Array.from({length:12}, () => new Float64Array(12));
  for (let bl = 0; bl < 4; bl++)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        T[bl*3+i][bl*3+j] = R3[i][j];
  const si = nIdx.get(b.node_start), ei = nIdx.get(b.node_end);
  const ug = new Float64Array(12);
  for (let d = 0; d < 6; d++) { ug[d] = result.x[si*6+d]; ug[6+d] = result.x[ei*6+d]; }
  const ul = new Float64Array(12);
  for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += T[i][j]*ug[j]; ul[i] = s; }
  const fl = new Float64Array(12);
  for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += Kl[i][j]*ul[j]; fl[i] = s; }

  const ourAxial = fl[0];
  const ourMyMax = Math.max(Math.abs(fl[4]), Math.abs(fl[10]));
  const robotAxial = rmf.axial;
  const robotMyMax = Math.max(Math.abs(rmf.momentY_start || 0), Math.abs(rmf.momentY_end || 0));
  const axRatio = robotAxial !== 0 ? (ourAxial/robotAxial).toFixed(3) : 'N/A';

  console.log(`  ${String(bi).padStart(4)} | ${ourAxial.toFixed(2).padStart(11)} ${robotAxial.toFixed(2).padStart(12)} | ${ourMyMax.toFixed(2).padStart(11)} ${robotMyMax.toFixed(2).padStart(12)} | ${axRatio}`);
}

// Skip per-support reactions (penalty method makes K*u recovery unreliable)
console.log('\n--- Self-Weight Check ---');
console.log(`  Total applied load FZ: ${totalFz.toFixed(2)} kN`);
console.log(`  Robot total reaction FZ: 4967.17 kN`);

// Overall statistics
console.log('\n--- Displacement Error Statistics ---');
let sumSqErr = 0, sumSqRef = 0, count = 0, maxErr = 0, maxErrNode = 0;
for (let i = 0; i < nodes.length; i++) {
  const nid = nodes[i].id;
  const rd = robotDisp.get(nid);
  if (!rd || supportNodeIds.has(nid)) continue;
  const ouz = result.x[i*6+2];
  const ruz = rd.uz;
  if (Math.abs(ruz) < 1e-10) continue;
  const err = Math.abs(ouz - ruz) / Math.abs(ruz);
  if (err > maxErr) { maxErr = err; maxErrNode = nid; }
  sumSqErr += (ouz - ruz)**2;
  sumSqRef += ruz**2;
  count++;
}
const rmsRatio = Math.sqrt(sumSqErr / sumSqRef);
console.log(`  RMS relative error (UZ): ${(rmsRatio*100).toFixed(2)}%`);
console.log(`  Max relative error: ${(maxErr*100).toFixed(2)}% at node ${maxErrNode}`);
console.log(`  Nodes compared: ${count}`);

console.log('\n' + '='.repeat(60));
