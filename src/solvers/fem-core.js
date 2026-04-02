/**
 * Core FEM functions for 3D frame elements.
 * Pure computation — no DOM or Three.js dependencies.
 *
 * DOF ordering per node: [Ux, Uy, Uz, Rx, Ry, Rz]
 * Element has 12 DOF (6 per node).
 */

/**
 * Build 12x12 local stiffness matrix for a 3D Euler-Bernoulli beam element.
 *
 * @param {number} L - Element length (m)
 * @param {number} E - Young's modulus (kPa = kN/m^2)
 * @param {number} A - Cross-section area (m^2)
 * @param {number} Iy - Moment of inertia about local y (m^4)
 * @param {number} Iz - Moment of inertia about local z (m^4)
 * @param {number} G - Shear modulus (kPa)
 * @param {number} J - Polar moment of inertia (m^4)
 * @returns {Float64Array[]} 12x12 stiffness matrix
 */
export function build3DFrameLocalK(L, E, A, Iy, Iz, G, J) {
  const K = Array.from({ length: 12 }, () => new Float64Array(12));
  const EA_L = (E * A) / L;
  const GJ_L = (G * J) / L;
  const L2 = L * L;
  const L3 = L * L * L;

  // Axial stiffness (DOF 0, 6)
  K[0][0] = EA_L;
  K[0][6] = -EA_L;
  K[6][0] = -EA_L;
  K[6][6] = EA_L;

  // Torsional stiffness (DOF 3, 9)
  K[3][3] = GJ_L;
  K[3][9] = -GJ_L;
  K[9][3] = -GJ_L;
  K[9][9] = GJ_L;

  // Bending in Y-plane (DOF 2, 4, 8, 10) using Iy
  const c1 = (12 * E * Iy) / L3;
  const c2 = (6 * E * Iy) / L2;
  const c3 = (4 * E * Iy) / L;
  const c4 = (2 * E * Iy) / L;
  K[2][2] = c1;
  K[2][4] = -c2;
  K[2][8] = -c1;
  K[2][10] = -c2;
  K[4][2] = -c2;
  K[4][4] = c3;
  K[4][8] = c2;
  K[4][10] = c4;
  K[8][2] = -c1;
  K[8][4] = c2;
  K[8][8] = c1;
  K[8][10] = c2;
  K[10][2] = -c2;
  K[10][4] = c4;
  K[10][8] = c2;
  K[10][10] = c3;

  // Bending in Z-plane (DOF 1, 5, 7, 11) using Iz
  const d1 = (12 * E * Iz) / L3;
  const d2 = (6 * E * Iz) / L2;
  const d3 = (4 * E * Iz) / L;
  const d4 = (2 * E * Iz) / L;
  K[1][1] = d1;
  K[1][5] = d2;
  K[1][7] = -d1;
  K[1][11] = d2;
  K[5][1] = d2;
  K[5][5] = d3;
  K[5][7] = -d2;
  K[5][11] = d4;
  K[7][1] = -d1;
  K[7][5] = -d2;
  K[7][7] = d1;
  K[7][11] = -d2;
  K[11][1] = d2;
  K[11][5] = d4;
  K[11][7] = -d2;
  K[11][11] = d3;

  return K;
}

/**
 * Build 3x3 rotation matrix from global to local coordinates.
 * Row 0: unit vector along beam axis.
 * Row 1: local y-axis (perpendicular, from cross product with reference).
 * Row 2: local z-axis (completes right-hand system).
 *
 * @param {{ x: number, y: number, z: number }} n1 - Start node
 * @param {{ x: number, y: number, z: number }} n2 - End node
 * @returns {number[][]} 3x3 rotation matrix
 */
export function buildRotationMatrix(n1, n2) {
  const dx = n2.x - n1.x;
  const dy = n2.y - n1.y;
  const dz = n2.z - n1.z;
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const lx = dx / L;
  const ly = dy / L;
  const lz = dz / L;

  // Reference vector: use X-axis if beam is near-vertical, else Z-axis
  let refX, refY, refZ;
  if (Math.abs(lz) > 0.95) {
    refX = 1;
    refY = 0;
    refZ = 0;
  } else {
    refX = 0;
    refY = 0;
    refZ = 1;
  }

  // Local y = ref x localX (cross product)
  let yx = refY * lz - refZ * ly;
  let yy = refZ * lx - refX * lz;
  let yz = refX * ly - refY * lx;
  const ym = Math.sqrt(yx * yx + yy * yy + yz * yz);
  yx /= ym;
  yy /= ym;
  yz /= ym;

  // Local z = localX x localY
  return [
    [lx, ly, lz],
    [yx, yy, yz],
    [ly * yz - lz * yy, lz * yx - lx * yz, lx * yy - ly * yx],
  ];
}

/**
 * Transform 12x12 local stiffness to global coordinates: Kg = T^T * Kl * T
 *
 * @param {Float64Array[]} Kl - 12x12 local stiffness matrix
 * @param {number[][]} R3 - 3x3 rotation matrix
 * @returns {Float64Array[]} 12x12 global stiffness matrix
 */
export function transformKtoGlobal(Kl, R3) {
  // Build 12x12 block-diagonal transformation matrix
  const T = Array.from({ length: 12 }, () => new Float64Array(12));
  for (let b = 0; b < 4; b++)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) T[b * 3 + i][b * 3 + j] = R3[i][j];

  // tmp = Kl * T
  const tmp = Array.from({ length: 12 }, () => new Float64Array(12));
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 12; j++) {
      let s = 0;
      for (let k = 0; k < 12; k++) s += Kl[i][k] * T[k][j];
      tmp[i][j] = s;
    }

  // Kg = T^T * tmp
  const Kg = Array.from({ length: 12 }, () => new Float64Array(12));
  for (let i = 0; i < 12; i++)
    for (let j = 0; j < 12; j++) {
      let s = 0;
      for (let k = 0; k < 12; k++) s += T[k][i] * tmp[k][j];
      Kg[i][j] = s;
    }

  return Kg;
}
