import { describe, it, expect } from 'vitest';
import { build3DFrameLocalK, buildRotationMatrix, transformKtoGlobal } from '../../src/solvers/fem-core.js';
import { SparseMatrix } from '../../src/solvers/sparse-matrix.js';
import { solveCG } from '../../src/solvers/conjugate-gradient.js';
import { computeCHSProps } from '../../src/solvers/section-props.js';

// Helper: assemble and solve a mini FEM model
function assembleAndSolve(nodes, elements, supports, forces, E, G, sec) {
  const { A, Iy, Iz, J } = sec;
  const nDof = nodes.length * 6;
  const K = new SparseMatrix(nDof);
  const F = new Float64Array(nDof);
  const nIdx = new Map();
  nodes.forEach((n, i) => nIdx.set(n.id, i));

  for (const el of elements) {
    const n1 = nodes[nIdx.get(el.n1)];
    const n2 = nodes[nIdx.get(el.n2)];
    const dx = n2.x - n1.x, dy = n2.y - n1.y, dz = n2.z - n1.z;
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const Kl = build3DFrameLocalK(L, E, A, Iy, Iz, G, J);
    const R3 = buildRotationMatrix(n1, n2);
    const Kg = transformKtoGlobal(Kl, R3);
    const si = nIdx.get(el.n1), ei = nIdx.get(el.n2);
    const dofs = [];
    for (let d = 0; d < 6; d++) dofs.push(si * 6 + d);
    for (let d = 0; d < 6; d++) dofs.push(ei * 6 + d);
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) K.add(dofs[i], dofs[j], Kg[i][j]);
  }

  for (const f of forces) {
    const idx = nIdx.get(f.node);
    if (f.fx) F[idx * 6] += f.fx;
    if (f.fy) F[idx * 6 + 1] += f.fy;
    if (f.fz) F[idx * 6 + 2] += f.fz;
    if (f.mx) F[idx * 6 + 3] += f.mx;
    if (f.my) F[idx * 6 + 4] += f.my;
    if (f.mz) F[idx * 6 + 5] += f.mz;
  }

  const Fapplied = new Float64Array(F);
  const restrained = new Set();
  for (const s of supports) {
    const base = nIdx.get(s.node) * 6;
    if (s.type === 'fixed') for (let d = 0; d < 6; d++) restrained.add(base + d);
    else if (s.type === 'pinned') { restrained.add(base); restrained.add(base + 1); restrained.add(base + 2); }
  }
  restrained.forEach((idx) => { K.setRowCol(idx, 1e15); F[idx] = 0; });

  const result = solveCG(K, F);

  const memberForces = elements.map((el) => {
    const n1 = nodes[nIdx.get(el.n1)], n2 = nodes[nIdx.get(el.n2)];
    const dx = n2.x - n1.x, dy = n2.y - n1.y, dz = n2.z - n1.z;
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const Kl = build3DFrameLocalK(L, E, A, Iy, Iz, G, J);
    const R3 = buildRotationMatrix(n1, n2);
    const T = Array.from({ length: 12 }, () => new Float64Array(12));
    for (let b = 0; b < 4; b++) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) T[b * 3 + i][b * 3 + j] = R3[i][j];
    const si = nIdx.get(el.n1), ei = nIdx.get(el.n2);
    const ug = new Float64Array(12);
    for (let d = 0; d < 6; d++) { ug[d] = result.x[si * 6 + d]; ug[6 + d] = result.x[ei * 6 + d]; }
    const ul = new Float64Array(12);
    for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += T[i][j] * ug[j]; ul[i] = s; }
    const fl = new Float64Array(12);
    for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += Kl[i][j] * ul[j]; fl[i] = s; }
    return { axial: fl[0], shearY: fl[1], shearZ: fl[2], torsion: fl[3], momentY_1: fl[4], momentZ_1: fl[5], momentY_2: fl[10], momentZ_2: fl[11] };
  });

  return { displacements: result.x, memberForces, iterations: result.iterations, residual: result.residual, Fapplied, nIdx, restrained };
}

describe('build3DFrameLocalK', () => {
  const L = 3.0, E = 200e6, G = 77e6;
  const sec = computeCHSProps(323.9, 10);

  it('is symmetric', () => {
    const Kl = build3DFrameLocalK(L, E, sec.A, sec.Iy, sec.Iz, G, sec.J);
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 12; j++)
        expect(Math.abs(Kl[i][j] - Kl[j][i])).toBeLessThan(1e-6);
  });

  it('has correct diagonal terms', () => {
    const Kl = build3DFrameLocalK(L, E, sec.A, sec.Iy, sec.Iz, G, sec.J);
    expect(Kl[0][0]).toBeCloseTo(E * sec.A / L, 2);
    expect(Kl[3][3]).toBeCloseTo(G * sec.J / L, 2);
    expect(Kl[2][2]).toBeCloseTo(12 * E * sec.Iy / (L ** 3), 2);
    expect(Kl[1][1]).toBeCloseTo(12 * E * sec.Iz / (L ** 3), 2);
    expect(Kl[4][4]).toBeCloseTo(4 * E * sec.Iy / L, 2);
    expect(Kl[5][5]).toBeCloseTo(4 * E * sec.Iz / L, 2);
  });

  it('produces zero forces for rigid body translation', () => {
    const Kl = build3DFrameLocalK(L, E, sec.A, sec.Iy, sec.Iz, G, sec.J);
    // Uniform x-translation
    const u = new Float64Array([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]);
    const f = new Float64Array(12);
    for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += Kl[i][j] * u[j]; f[i] = s; }
    for (let i = 0; i < 12; i++) expect(Math.abs(f[i])).toBeLessThan(1e-4);
  });

  it('is positive semi-definite', () => {
    const Kl = build3DFrameLocalK(L, E, sec.A, sec.Iy, sec.Iz, G, sec.J);
    for (let trial = 0; trial < 10; trial++) {
      const u = new Float64Array(12);
      for (let i = 0; i < 12; i++) u[i] = Math.random() * 2 - 1;
      const Ku = new Float64Array(12);
      for (let i = 0; i < 12; i++) { let s = 0; for (let j = 0; j < 12; j++) s += Kl[i][j] * u[j]; Ku[i] = s; }
      let uKu = 0;
      for (let i = 0; i < 12; i++) uKu += u[i] * Ku[i];
      expect(uKu).toBeGreaterThanOrEqual(-1e-6);
    }
  });
});

describe('buildRotationMatrix', () => {
  const cases = [
    { name: 'X-aligned', n1: { x: 0, y: 0, z: 0 }, n2: { x: 5, y: 0, z: 0 } },
    { name: 'Y-aligned', n1: { x: 0, y: 0, z: 0 }, n2: { x: 0, y: 3, z: 0 } },
    { name: 'Z-aligned', n1: { x: 0, y: 0, z: 0 }, n2: { x: 0, y: 0, z: 4 } },
    { name: '45-deg XY', n1: { x: 0, y: 0, z: 0 }, n2: { x: 3, y: 3, z: 0 } },
    { name: 'diagonal XYZ', n1: { x: 1, y: 2, z: 3 }, n2: { x: 4, y: 6, z: 7 } },
  ];

  for (const tc of cases) {
    it(`${tc.name}: is orthogonal (R*R^T = I)`, () => {
      const R = buildRotationMatrix(tc.n1, tc.n2);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          let s = 0;
          for (let k = 0; k < 3; k++) s += R[i][k] * R[j][k];
          expect(s).toBeCloseTo(i === j ? 1 : 0, 10);
        }
    });

    it(`${tc.name}: has determinant 1`, () => {
      const R = buildRotationMatrix(tc.n1, tc.n2);
      const det =
        R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) -
        R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) +
        R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);
      expect(det).toBeCloseTo(1, 10);
    });

    it(`${tc.name}: first row is beam direction`, () => {
      const R = buildRotationMatrix(tc.n1, tc.n2);
      const dx = tc.n2.x - tc.n1.x, dy = tc.n2.y - tc.n1.y, dz = tc.n2.z - tc.n1.z;
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      expect(R[0][0]).toBeCloseTo(dx / L, 10);
      expect(R[0][1]).toBeCloseTo(dy / L, 10);
      expect(R[0][2]).toBeCloseTo(dz / L, 10);
    });
  }
});

describe('transformKtoGlobal', () => {
  const L = 4.0, E = 200e6, G = 77e6;
  const sec = computeCHSProps(219, 8);

  it('Kg is symmetric', () => {
    const n1 = { x: 0, y: 0, z: 0 }, n2 = { x: 2, y: 2, z: 2 };
    const Ld = Math.sqrt(12);
    const Kl = build3DFrameLocalK(Ld, E, sec.A, sec.Iy, sec.Iz, G, sec.J);
    const R3 = buildRotationMatrix(n1, n2);
    const Kg = transformKtoGlobal(Kl, R3);
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 12; j++)
        expect(Math.abs(Kg[i][j] - Kg[j][i])).toBeLessThan(1e-4);
  });

  it('preserves axial stiffness for X-aligned beam', () => {
    const n1 = { x: 0, y: 0, z: 0 }, n2 = { x: L, y: 0, z: 0 };
    const Kl = build3DFrameLocalK(L, E, sec.A, sec.Iy, sec.Iz, G, sec.J);
    const R3 = buildRotationMatrix(n1, n2);
    const Kg = transformKtoGlobal(Kl, R3);
    expect(Kg[0][0]).toBeCloseTo(E * sec.A / L, 2);
  });
});

describe('Cantilever beam benchmark', () => {
  const L = 5.0, E = 200e6, G = E / 2.6;
  const sec = computeCHSProps(323.9, 10);
  const P = 100;

  const nodes = [{ id: 0, x: 0, y: 0, z: 0 }, { id: 1, x: L, y: 0, z: 0 }];
  const elements = [{ n1: 0, n2: 1 }];
  const supports = [{ node: 0, type: 'fixed' }];
  const forces = [{ node: 1, fz: P }];

  const result = assembleAndSolve(nodes, elements, supports, forces, E, G, sec);

  it('converges', () => {
    expect(result.residual).toBeLessThan(1e-6);
  });

  it('matches analytical tip deflection: delta = PL^3/(3EI)', () => {
    const delta_analytical = (P * L ** 3) / (3 * E * sec.Iy);
    const delta_fem = result.displacements[1 * 6 + 2];
    expect(Math.abs(delta_fem - delta_analytical) / delta_analytical).toBeLessThan(0.02);
  });

  it('matches analytical tip rotation: theta = PL^2/(2EI)', () => {
    const theta_analytical = (P * L ** 2) / (2 * E * sec.Iy);
    const theta_fem = Math.abs(result.displacements[1 * 6 + 4]);
    expect(Math.abs(theta_fem - theta_analytical) / theta_analytical).toBeLessThan(0.02);
  });

  it('fixed end has zero displacement', () => {
    for (let d = 0; d < 6; d++) expect(Math.abs(result.displacements[d])).toBeLessThan(1e-10);
  });

  it('shear at fixed end equals applied load', () => {
    expect(Math.abs(result.memberForces[0].shearZ)).toBeCloseTo(P, 0);
  });

  it('moment at fixed end equals P*L', () => {
    const M = Math.max(Math.abs(result.memberForces[0].momentY_1), Math.abs(result.memberForces[0].momentY_2));
    expect(M).toBeCloseTo(P * L, 0);
  });
});

describe('Simply-supported beam benchmark', () => {
  const Ltot = 6.0, E = 200e6, G = E / 2.6;
  const sec = computeCHSProps(219, 8);
  const P = 50;

  const nodes = [
    { id: 0, x: 0, y: 0, z: 0 },
    { id: 1, x: Ltot / 2, y: 0, z: 0 },
    { id: 2, x: Ltot, y: 0, z: 0 },
  ];
  const elements = [{ n1: 0, n2: 1 }, { n1: 1, n2: 2 }];
  const supports = [{ node: 0, type: 'pinned' }, { node: 2, type: 'pinned' }];
  const forces = [{ node: 1, fz: -P }];

  const result = assembleAndSolve(nodes, elements, supports, forces, E, G, sec);

  it('converges', () => {
    expect(result.residual).toBeLessThan(1e-6);
  });

  it('matches analytical center deflection: delta = PL^3/(48EI)', () => {
    const delta_analytical = (P * Ltot ** 3) / (48 * E * sec.Iy);
    const delta_fem = Math.abs(result.displacements[1 * 6 + 2]);
    expect(Math.abs(delta_fem - delta_analytical) / delta_analytical).toBeLessThan(0.02);
  });

  it('matches analytical center moment: M = PL/4', () => {
    const M_analytical = (P * Ltot) / 4;
    const M_fem = Math.max(
      Math.abs(result.memberForces[0].momentY_1), Math.abs(result.memberForces[0].momentY_2),
      Math.abs(result.memberForces[1].momentY_1), Math.abs(result.memberForces[1].momentY_2),
    );
    expect(Math.abs(M_fem - M_analytical) / M_analytical).toBeLessThan(0.02);
  });

  it('support translations are zero', () => {
    for (let d = 0; d < 3; d++) {
      expect(Math.abs(result.displacements[0 * 6 + d])).toBeLessThan(1e-10);
      expect(Math.abs(result.displacements[2 * 6 + d])).toBeLessThan(1e-10);
    }
  });
});

describe('Portal frame equilibrium', () => {
  const E = 200e6, G = E / 2.6;
  const sec = computeCHSProps(323.9, 10);

  const nodes = [
    { id: 0, x: 0, y: 0, z: 0 },
    { id: 1, x: 0, y: 0, z: 4 },
    { id: 2, x: 6, y: 0, z: 4 },
    { id: 3, x: 6, y: 0, z: 0 },
  ];
  const elements = [{ n1: 0, n2: 1 }, { n1: 1, n2: 2 }, { n1: 2, n2: 3 }];
  const supports = [{ node: 0, type: 'fixed' }, { node: 3, type: 'fixed' }];
  const forces = [{ node: 1, fx: 20 }, { node: 2, fz: -30 }];

  const result = assembleAndSolve(nodes, elements, supports, forces, E, G, sec);

  it('converges', () => {
    expect(result.residual).toBeLessThan(1e-6);
  });

  it('fixed supports have zero displacement', () => {
    for (let d = 0; d < 6; d++) {
      expect(Math.abs(result.displacements[0 * 6 + d])).toBeLessThan(1e-10);
      expect(Math.abs(result.displacements[3 * 6 + d])).toBeLessThan(1e-10);
    }
  });

  it('node 1 sways right under lateral load', () => {
    expect(result.displacements[1 * 6]).toBeGreaterThan(0);
  });

  it('node 2 deflects down under gravity', () => {
    expect(result.displacements[2 * 6 + 2]).toBeLessThan(0);
  });

  it('global equilibrium: reactions balance applied loads', () => {
    // Rebuild K without penalty to compute true reactions
    const nDof = nodes.length * 6;
    const K = new SparseMatrix(nDof);
    const nIdx = new Map();
    nodes.forEach((n, i) => nIdx.set(n.id, i));

    for (const el of elements) {
      const n1 = nodes[nIdx.get(el.n1)], n2 = nodes[nIdx.get(el.n2)];
      const dx = n2.x - n1.x, dy = n2.y - n1.y, dz = n2.z - n1.z;
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const Kl = build3DFrameLocalK(L, E, sec.A, sec.Iy, sec.Iz, G, sec.J);
      const R3 = buildRotationMatrix(n1, n2);
      const Kg = transformKtoGlobal(Kl, R3);
      const si = nIdx.get(el.n1), ei = nIdx.get(el.n2);
      const dofs = [];
      for (let d = 0; d < 6; d++) dofs.push(si * 6 + d);
      for (let d = 0; d < 6; d++) dofs.push(ei * 6 + d);
      for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) K.add(dofs[i], dofs[j], Kg[i][j]);
    }

    const Ku = new Float64Array(nDof);
    K.mulVec(result.displacements, Ku);

    // Free DOF equilibrium: K*u should equal F_applied
    for (let i = 0; i < nDof; i++) {
      if (!result.restrained.has(i)) {
        expect(Math.abs(Ku[i] - result.Fapplied[i])).toBeLessThan(0.1);
      }
    }

    // Reaction sum: R + F = 0
    let rxSum = 0, rzSum = 0;
    for (const s of supports) {
      const base = nIdx.get(s.node) * 6;
      rxSum += Ku[base];
      rzSum += Ku[base + 2];
    }
    expect(rxSum + 20).toBeCloseTo(0, 0); // Fx applied = 20
    expect(rzSum + (-30)).toBeCloseTo(0, 0); // Fz applied = -30
  });
});
