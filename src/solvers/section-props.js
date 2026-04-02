/**
 * Section property calculations for Circular Hollow Sections (CHS).
 * Pure math — no DOM dependencies.
 */

/**
 * Compute CHS cross-section properties.
 *
 * @param {number} D_mm - Outer diameter in mm
 * @param {number} t_mm - Wall thickness in mm
 * @returns {{ A: number, Iy: number, Iz: number, J: number, D: number, t: number }}
 *   A in m^2, Iy/Iz in m^4, J in m^4, D/t in m
 */
export function computeCHSProps(D_mm, t_mm) {
  const Do = D_mm / 1000; // mm -> m
  const Di = Do - (2 * t_mm) / 1000;
  const A = (Math.PI / 4) * (Do * Do - Di * Di);
  const I = (Math.PI / 64) * (Do ** 4 - Di ** 4);
  const J = (Math.PI / 32) * (Do ** 4 - Di ** 4);
  return { A, Iy: I, Iz: I, J, D: Do, t: t_mm / 1000 };
}

/** CHS section presets: { name, D_mm, t_mm } */
export const SECTION_PRESETS = {
  chs219: { name: 'CHS 219x8', D: 219.1, t: 8 },
  chs168: { name: 'CHS 168x6', D: 168.3, t: 6 },
  chs324: { name: 'CHS 324x10', D: 323.9, t: 10 },
};

/** Material presets: { name, E_GPa, rho, G_GPa } */
export const MATERIAL_PRESETS = {
  steel: { name: 'Steel S355', E: 200, rho: 7850, G: 77 },
  aluminum: { name: 'Aluminum 6061', E: 69, rho: 2700, G: 26 },
};
