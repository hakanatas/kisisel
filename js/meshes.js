/* Geometry builders. Every vertex is [pos3, normal3, color3, uv2] — flat
   shaded (per-face normals). Colors are [r,g,b] in 0..1. */

import { transformPoint, mat4Compose } from "./math3d.js";

export function geo() {
  return { verts: [] };
}

export function pushTri(g, p1, p2, p3, color, uv1 = [0, 0], uv2 = [0, 0], uv3 = [0, 0]) {
  const ux = p2[0] - p1[0], uy = p2[1] - p1[1], uz = p2[2] - p1[2];
  const vx = p3[0] - p1[0], vy = p3[1] - p1[1], vz = p3[2] - p1[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  nx /= l; ny /= l; nz /= l;
  for (const [p, uv] of [[p1, uv1], [p2, uv2], [p3, uv3]]) {
    g.verts.push(p[0], p[1], p[2], nx, ny, nz, color[0], color[1], color[2], uv[0], uv[1]);
  }
}

export function pushQuad(g, p1, p2, p3, p4, color, uvs) {
  if (uvs) {
    pushTri(g, p1, p2, p3, color, uvs[0], uvs[1], uvs[2]);
    pushTri(g, p1, p3, p4, color, uvs[0], uvs[2], uvs[3]);
  } else {
    pushTri(g, p1, p2, p3, color);
    pushTri(g, p1, p3, p4, color);
  }
}

/* Axis-aligned box centered at (0, h/2, 0) — sits on the ground. */
export function box(g, w, h, d, color, { cx = 0, cy = 0, cz = 0, centered = false } = {}) {
  const x = w / 2, z = d / 2;
  const y0 = centered ? -h / 2 : 0;
  const y1 = centered ? h / 2 : h;
  const a = [cx - x, cy + y0, cz - z], b = [cx + x, cy + y0, cz - z];
  const c = [cx + x, cy + y0, cz + z], d2 = [cx - x, cy + y0, cz + z];
  const e = [cx - x, cy + y1, cz - z], f = [cx + x, cy + y1, cz - z];
  const gg = [cx + x, cy + y1, cz + z], h2 = [cx - x, cy + y1, cz + z];
  pushQuad(g, e, f, gg, h2, color);          // top
  pushQuad(g, b, a, d2, c, color);           // bottom
  pushQuad(g, d2, c, gg, h2, color);         // front +z
  pushQuad(g, b, a, e, f, color);            // back -z
  pushQuad(g, a, d2, h2, e, color);          // left
  pushQuad(g, c, b, f, gg, color);           // right
}

/* Cylinder / cone along Y, base at y=0. */
export function cylinder(g, rBottom, rTop, h, seg, color, { cx = 0, cy = 0, cz = 0, cap = true } = {}) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const b0 = [cx + Math.cos(a0) * rBottom, cy, cz + Math.sin(a0) * rBottom];
    const b1 = [cx + Math.cos(a1) * rBottom, cy, cz + Math.sin(a1) * rBottom];
    const t0 = [cx + Math.cos(a0) * rTop, cy + h, cz + Math.sin(a0) * rTop];
    const t1 = [cx + Math.cos(a1) * rTop, cy + h, cz + Math.sin(a1) * rTop];
    pushQuad(g, b1, b0, t0, t1, color);
    if (cap && rTop > 0.001) pushTri(g, [cx, cy + h, cz], t0, t1, color);
    if (cap) pushTri(g, [cx, cy, cz], b1, b0, color);
  }
}

/* Flat disc at height y. */
export function disc(g, r, seg, color, { cx = 0, cy = 0, cz = 0 } = {}) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    pushTri(g, [cx, cy, cz],
      [cx + Math.cos(a1) * r, cy, cz + Math.sin(a1) * r],
      [cx + Math.cos(a0) * r, cy, cz + Math.sin(a0) * r], color);
  }
}

/* Ground-plane rectangle (facing up). */
export function groundRect(g, x0, z0, x1, z1, y, color) {
  pushQuad(g, [x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], color);
}

/* Vertical quad facing +Z with full texture UVs, centered x, base y. */
export function billboardQuad(g, w, h, color, { cx = 0, cy = 0, cz = 0 } = {}) {
  const x = w / 2;
  const e = 0.012; // separate the faces to avoid z-fighting
  pushQuad(g,
    [cx - x, cy, cz + e], [cx + x, cy, cz + e], [cx + x, cy + h, cz + e], [cx - x, cy + h, cz + e],
    color, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  pushQuad(g,
    [cx + x, cy, cz - e], [cx - x, cy, cz - e], [cx - x, cy + h, cz - e], [cx + x, cy + h, cz - e],
    color, [[0, 0], [1, 0], [1, 1], [0, 1]]);
}

/* Apply a transform matrix to a geometry (positions + rotate normals). */
export function transformGeo(g, m) {
  const v = g.verts;
  for (let i = 0; i < v.length; i += 11) {
    const p = transformPoint(m, v[i], v[i + 1], v[i + 2]);
    v[i] = p[0]; v[i + 1] = p[1]; v[i + 2] = p[2];
    const nx = v[i + 3], ny = v[i + 4], nz = v[i + 5];
    v[i + 3] = m[0] * nx + m[4] * ny + m[8] * nz;
    v[i + 4] = m[1] * nx + m[5] * ny + m[9] * nz;
    v[i + 5] = m[2] * nx + m[6] * ny + m[10] * nz;
  }
  return g;
}

export function mergeInto(target, src, tx = 0, ty = 0, tz = 0, ry = 0, s = 1) {
  if (tx || ty || tz || ry || s !== 1) transformGeo(src, mat4Compose(tx, ty, tz, ry, 0, 0, s));
  target.verts.push(...src.verts);
  return target;
}

/* ---------- compound props ---------- */

export function treeGeo(scale = 1, tone = 0) {
  const g = geo();
  const trunk = [0.45, 0.32, 0.22];
  const leaf = [
    [0.28 + tone * 0.1, 0.55, 0.3],
    [0.34, 0.62 + tone * 0.08, 0.33],
  ][Math.round(tone) % 2] || [0.3, 0.58, 0.32];
  cylinder(g, 0.14 * scale, 0.11 * scale, 0.7 * scale, 6, trunk);
  cylinder(g, 0.62 * scale, 0, 1.5 * scale, 7, leaf, { cy: 0.6 * scale });
  return g;
}

export function pineGeo(scale = 1) {
  const g = geo();
  cylinder(g, 0.12 * scale, 0.1 * scale, 0.5 * scale, 6, [0.42, 0.3, 0.2]);
  const green = [0.2, 0.45, 0.3];
  cylinder(g, 0.7 * scale, 0, 1.0 * scale, 7, green, { cy: 0.4 * scale });
  cylinder(g, 0.55 * scale, 0, 0.9 * scale, 7, green, { cy: 0.95 * scale });
  cylinder(g, 0.4 * scale, 0, 0.8 * scale, 7, green, { cy: 1.5 * scale });
  return g;
}

export function lampGeo() {
  const g = geo();
  const dark = [0.2, 0.22, 0.26];
  cylinder(g, 0.07, 0.05, 2.6, 6, dark);
  box(g, 0.5, 0.06, 0.1, dark, { cy: 2.55 });
  box(g, 0.16, 0.12, 0.16, [1.0, 0.85, 0.5], { cx: 0.25, cy: 2.44 });
  return g;
}

export function benchGeo() {
  const g = geo();
  const wood = [0.62, 0.45, 0.28];
  const iron = [0.25, 0.26, 0.3];
  box(g, 1.4, 0.07, 0.42, wood, { cy: 0.42 });
  box(g, 1.4, 0.34, 0.06, wood, { cy: 0.52, cz: -0.2 });
  box(g, 0.08, 0.42, 0.36, iron, { cx: -0.6 });
  box(g, 0.08, 0.42, 0.36, iron, { cx: 0.6 });
  return g;
}

export function pinGeo() {
  const g = geo();
  const white = [0.97, 0.95, 0.9];
  cylinder(g, 0.16, 0.1, 0.34, 8, white);
  cylinder(g, 0.1, 0.13, 0.14, 8, [0.85, 0.2, 0.25], { cy: 0.34 });
  cylinder(g, 0.13, 0.05, 0.22, 8, white, { cy: 0.48 });
  return g;
}

export function coneGeo() {
  const g = geo();
  cylinder(g, 0.26, 0.05, 0.55, 8, [0.95, 0.45, 0.15]);
  box(g, 0.62, 0.05, 0.62, [0.9, 0.42, 0.14]);
  return g;
}
