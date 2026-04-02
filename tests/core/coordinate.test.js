import { describe, it, expect } from 'vitest';
import { m2t, computeBounds } from '../../src/core/coordinate.js';

describe('m2t', () => {
  it('transforms model coords to Three.js coords', () => {
    // Model: X right, Y forward, Z up
    // Three.js: X right, Y up, Z toward camera
    // m2t(x, y, z) -> (x, z, -y)
    const result = m2t(1, 2, 3);
    expect(result.x).toBe(1);
    expect(result.y).toBe(3);
    expect(result.z).toBe(-2);
  });

  it('handles origin', () => {
    const result = m2t(0, 0, 0);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(-0); // -0 from negating 0
  });

  it('handles negative values', () => {
    const result = m2t(-5, -3, -1);
    expect(result.x).toBe(-5);
    expect(result.y).toBe(-1);
    expect(result.z).toBe(3);
  });
});

describe('computeBounds', () => {
  it('computes correct bounds for simple nodes', () => {
    const nodes = [
      { x: -10, y: -5, z: 0 },
      { x: 10, y: 5, z: 20 },
      { x: 0, y: 0, z: 10 },
    ];
    const b = computeBounds(nodes);
    expect(b.minX).toBe(-10);
    expect(b.maxX).toBe(10);
    expect(b.minY).toBe(-5);
    expect(b.maxY).toBe(5);
    expect(b.minZ).toBe(0);
    expect(b.maxZ).toBe(20);
    expect(b.cx).toBe(0);
    expect(b.cy).toBe(0);
    expect(b.cz).toBe(10);
    expect(b.spanX).toBe(20);
    expect(b.spanY).toBe(10);
    expect(b.height).toBe(20);
  });

  it('handles single node', () => {
    const nodes = [{ x: 5, y: 3, z: 7 }];
    const b = computeBounds(nodes);
    expect(b.cx).toBe(5);
    expect(b.spanX).toBe(0);
    expect(b.height).toBe(0);
  });
});
