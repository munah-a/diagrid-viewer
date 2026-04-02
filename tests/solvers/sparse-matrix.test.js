import { describe, it, expect } from 'vitest';
import { SparseMatrix } from '../../src/solvers/sparse-matrix.js';

describe('SparseMatrix', () => {
  it('stores and retrieves diagonal entries', () => {
    const M = new SparseMatrix(3);
    M.add(0, 0, 4);
    M.add(1, 1, 3);
    M.add(2, 2, 5);
    expect(M.getDiag(0)).toBe(4);
    expect(M.getDiag(1)).toBe(3);
    expect(M.getDiag(2)).toBe(5);
  });

  it('accumulates values at same position', () => {
    const M = new SparseMatrix(2);
    M.add(0, 0, 3);
    M.add(0, 0, 7);
    expect(M.getDiag(0)).toBe(10);
  });

  it('ignores near-zero values', () => {
    const M = new SparseMatrix(2);
    M.add(0, 0, 1e-21);
    expect(M.getDiag(0)).toBe(0);
  });

  it('multiplies vector correctly', () => {
    // M = [4, -1, 0; -1, 3, 1; 0, 1, 5]
    const M = new SparseMatrix(3);
    M.add(0, 0, 4);
    M.add(0, 1, -1);
    M.add(1, 0, -1);
    M.add(1, 1, 3);
    M.add(1, 2, 1);
    M.add(2, 1, 1);
    M.add(2, 2, 5);

    const x = new Float64Array([1, 2, 3]);
    const y = new Float64Array(3);
    M.mulVec(x, y);

    // [4-2, -1+6+3, 2+15] = [2, 8, 17]
    expect(y[0]).toBeCloseTo(2, 10);
    expect(y[1]).toBeCloseTo(8, 10);
    expect(y[2]).toBeCloseTo(17, 10);
  });

  it('setRowCol enforces boundary condition', () => {
    const M = new SparseMatrix(3);
    M.add(0, 0, 4);
    M.add(0, 1, -1);
    M.add(1, 0, -1);
    M.add(1, 1, 3);
    M.add(1, 2, 1);
    M.add(2, 1, 1);
    M.add(2, 2, 5);

    M.setRowCol(1, 1e15);

    // Row 1 should only have diagonal
    expect(M.getDiag(1)).toBe(1e15);

    // Column 1 entries in other rows should be deleted
    const y = new Float64Array(3);
    M.mulVec(new Float64Array([0, 1, 0]), y);
    expect(y[0]).toBe(0); // M[0][1] cleared
    expect(y[1]).toBe(1e15); // M[1][1] = penalty
    expect(y[2]).toBe(0); // M[2][1] cleared
  });

  it('returns 0 for unset diagonal', () => {
    const M = new SparseMatrix(5);
    expect(M.getDiag(3)).toBe(0);
  });
});
