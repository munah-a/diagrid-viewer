/**
 * Coordinate transform from model space to Three.js space.
 * Model: X right, Y forward, Z up (metres)
 * Three.js: X right, Y up, Z toward camera
 *
 * Transform: m2t(x, y, z) -> Vector3(x, z, -y)
 */

/**
 * Convert model coordinates to Three.js coordinates.
 * @param {number} x - Model X
 * @param {number} y - Model Y
 * @param {number} z - Model Z
 * @returns {{ x: number, y: number, z: number }}
 */
export function m2t(x, y, z) {
  return { x, y: z, z: -y };
}

/**
 * Compute bounding box from node array.
 * @param {Array<{x: number, y: number, z: number}>} nodes
 * @returns {{ minX, maxX, minY, maxY, minZ, maxZ, cx, cy, cz, spanX, spanY, height }}
 */
export function computeBounds(nodes) {
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;
  let minZ = Infinity,
    maxZ = -Infinity;

  for (const n of nodes) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
    if (n.z < minZ) minZ = n.z;
    if (n.z > maxZ) maxZ = n.z;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    cz: (minZ + maxZ) / 2,
    spanX: maxX - minX,
    spanY: maxY - minY,
    height: maxZ - minZ,
  };
}
