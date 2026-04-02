/**
 * Preconditioned Conjugate Gradient solver.
 * Uses diagonal (Jacobi) preconditioner.
 *
 * @param {import('./sparse-matrix.js').SparseMatrix} K - Symmetric positive-definite sparse matrix
 * @param {Float64Array} F - Right-hand side force vector
 * @returns {{ x: Float64Array, iterations: number, residual: number }}
 */
export function solveCG(K, F) {
  const n = K.n;
  const x = new Float64Array(n);
  const r = new Float64Array(n);
  const z = new Float64Array(n);
  const p = new Float64Array(n);
  const Ap = new Float64Array(n);

  // Diagonal preconditioner
  const Minv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const d = K.getDiag(i);
    Minv[i] = d > 1e-20 ? 1 / d : 1;
  }

  // Initialize: r = F, z = M^-1 * r, p = z
  r.set(F);
  for (let i = 0; i < n; i++) z[i] = Minv[i] * r[i];
  p.set(z);

  let rz = 0;
  for (let i = 0; i < n; i++) rz += r[i] * z[i];

  const Fn = Math.sqrt(F.reduce((s, v) => s + v * v, 0)) || 1;
  let iter = 0;
  let residual = 1;

  for (iter = 0; iter < 8000; iter++) {
    K.mulVec(p, Ap);
    let pAp = 0;
    for (let i = 0; i < n; i++) pAp += p[i] * Ap[i];
    if (Math.abs(pAp) < 1e-30) break;

    const alpha = rz / pAp;
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
    }

    residual = Math.sqrt(r.reduce((s, v) => s + v * v, 0)) / Fn;
    if (residual < 1e-8) break;

    for (let i = 0; i < n; i++) z[i] = Minv[i] * r[i];
    let rz2 = 0;
    for (let i = 0; i < n; i++) rz2 += r[i] * z[i];

    const beta = rz2 / (rz || 1e-30);
    for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
    rz = rz2;
  }

  return { x, iterations: iter, residual };
}
