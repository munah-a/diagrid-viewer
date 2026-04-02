import { describe, it, expect } from 'vitest';
import { SparseMatrix } from '../../src/solvers/sparse-matrix.js';
import { solveCG } from '../../src/solvers/conjugate-gradient.js';

describe('solveCG', () => {
  it('solves 2x2 system [4,-1;-1,3]*x=[1,2]', () => {
    const K = new SparseMatrix(2);
    K.add(0, 0, 4);
    K.add(0, 1, -1);
    K.add(1, 0, -1);
    K.add(1, 1, 3);

    const F = new Float64Array([1, 2]);
    const result = solveCG(K, F);

    expect(result.x[0]).toBeCloseTo(5 / 11, 6);
    expect(result.x[1]).toBeCloseTo(9 / 11, 6);
    expect(result.residual).toBeLessThan(1e-8);
    expect(result.iterations).toBeLessThan(100);
  });

  it('solves identity system', () => {
    const K = new SparseMatrix(3);
    K.add(0, 0, 1);
    K.add(1, 1, 1);
    K.add(2, 2, 1);

    const F = new Float64Array([3, 5, 7]);
    const result = solveCG(K, F);

    expect(result.x[0]).toBeCloseTo(3, 8);
    expect(result.x[1]).toBeCloseTo(5, 8);
    expect(result.x[2]).toBeCloseTo(7, 8);
  });

  it('solves 50x50 tridiagonal system', () => {
    const n = 50;
    const K = new SparseMatrix(n);
    const F = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      K.add(i, i, 4);
      if (i > 0) K.add(i, i - 1, -1);
      if (i < n - 1) K.add(i, i + 1, -1);
      F[i] = 1;
    }

    const result = solveCG(K, F);
    expect(result.residual).toBeLessThan(1e-8);

    // Verify K*x = F
    const Kx = new Float64Array(n);
    K.mulVec(result.x, Kx);
    for (let i = 0; i < n; i++) {
      expect(Math.abs(Kx[i] - F[i])).toBeLessThan(1e-6);
    }
  });

  it('converges for well-conditioned SPD matrix', () => {
    // Hilbert-like 4x4 diagonally dominant
    const K = new SparseMatrix(4);
    K.add(0, 0, 10);
    K.add(0, 1, 1);
    K.add(1, 0, 1);
    K.add(1, 1, 10);
    K.add(1, 2, 1);
    K.add(2, 1, 1);
    K.add(2, 2, 10);
    K.add(2, 3, 1);
    K.add(3, 2, 1);
    K.add(3, 3, 10);

    const F = new Float64Array([1, 2, 3, 4]);
    const result = solveCG(K, F);

    expect(result.residual).toBeLessThan(1e-8);
    expect(result.iterations).toBeLessThan(50);
  });
});
