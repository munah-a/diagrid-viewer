/**
 * Sparse matrix using Map-of-Maps storage.
 * Only non-zero entries are stored, enabling efficient large-system assembly.
 */
export class SparseMatrix {
  constructor(n) {
    this.n = n;
    this.rows = new Map();
  }

  /** Add value v to position (i, j). Values below 1e-20 are ignored. */
  add(i, j, v) {
    if (Math.abs(v) < 1e-20) return;
    if (!this.rows.has(i)) this.rows.set(i, new Map());
    const r = this.rows.get(i);
    r.set(j, (r.get(j) || 0) + v);
  }

  /** Multiply: y = this * x */
  mulVec(x, y) {
    y.fill(0);
    this.rows.forEach((cols, i) => {
      let s = 0;
      cols.forEach((v, j) => {
        s += v * x[j];
      });
      y[i] = s;
    });
  }

  /** Get diagonal entry at index i */
  getDiag(i) {
    const r = this.rows.get(i);
    return r ? r.get(i) || 0 : 0;
  }

  /** Enforce boundary condition: set row/col idx to diagonal value dv, clear off-diagonals */
  setRowCol(idx, dv) {
    this.rows.set(idx, new Map([[idx, dv]]));
    this.rows.forEach((cols, i) => {
      if (i !== idx && cols.has(idx)) cols.delete(idx);
    });
  }
}
