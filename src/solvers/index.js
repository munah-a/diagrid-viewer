// Re-export all solver modules for convenient imports
export { SparseMatrix } from './sparse-matrix.js';
export { solveCG } from './conjugate-gradient.js';
export { build3DFrameLocalK, buildRotationMatrix, transformKtoGlobal } from './fem-core.js';
export { computeCHSProps, SECTION_PRESETS, MATERIAL_PRESETS } from './section-props.js';
