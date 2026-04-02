import { describe, it, expect } from 'vitest';
import { computeCHSProps, SECTION_PRESETS, MATERIAL_PRESETS } from '../../src/solvers/section-props.js';

describe('computeCHSProps', () => {
  it('computes CHS 324x10 properties correctly', () => {
    const sec = computeCHSProps(323.9, 10);
    // A = pi/4 * (0.3239^2 - 0.3039^2)
    expect(sec.A).toBeCloseTo(9.862e-3, 4);
    // Iy = Iz (circular section)
    expect(sec.Iy).toBe(sec.Iz);
    // J = 2*I for circular hollow section
    expect(sec.J).toBeCloseTo(2 * sec.Iy, 6);
    // Dimensions in metres
    expect(sec.D).toBeCloseTo(0.3239, 4);
    expect(sec.t).toBeCloseTo(0.01, 4);
  });

  it('computes CHS 219x8 properties correctly', () => {
    const sec = computeCHSProps(219.1, 8);
    const Do = 0.2191, Di = 0.2031;
    const A_expected = (Math.PI / 4) * (Do ** 2 - Di ** 2);
    expect(sec.A).toBeCloseTo(A_expected, 6);
  });

  it('handles zero wall thickness', () => {
    const sec = computeCHSProps(200, 0);
    expect(sec.A).toBe(0);
    expect(sec.Iy).toBe(0);
  });

  it('presets have correct format', () => {
    expect(SECTION_PRESETS.chs219.D).toBe(219.1);
    expect(SECTION_PRESETS.chs219.t).toBe(8);
    expect(SECTION_PRESETS.chs324.D).toBe(323.9);
    expect(SECTION_PRESETS.chs324.t).toBe(10);
  });

  it('material presets have expected values', () => {
    expect(MATERIAL_PRESETS.steel.E).toBe(200);
    expect(MATERIAL_PRESETS.steel.rho).toBe(7850);
    expect(MATERIAL_PRESETS.aluminum.E).toBe(69);
  });
});
