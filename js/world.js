/* World builder: Istanbul-flavoured playground. Produces the merged
   static mesh, sign boards, dynamic (knockable) objects, colliders,
   zones and the ferry. */

import { geo, box, cylinder, disc, groundRect, billboardQuad, transformGeo, mergeInto, treeGeo, pineGeo, lampGeo, benchGeo, pinGeo, coneGeo, pushQuad } from "./meshes.js";
import { mat4Compose } from "./math3d.js";
import { textCanvas } from "./engine.js";

export const BOUNDS = { minX: -41, maxX: 33, minZ: -33, maxZ: 33 };
export const PIER = { minX: 33, maxX: 43.5, minZ: 5.5, maxZ: 10.5 };

const SAND = [0.87, 0.83, 0.72];
const ROAD = [0.45, 0.47, 0.51];
const LINE = [0.92, 0.9, 0.84];
const WATER = [0.27, 0.56, 0.66];
const WOOD = [0.64, 0.48, 0.3];
const STONE = [0.78, 0.75, 0.69];
const TERRA = [0.66, 0.36, 0.29];

export const ZONES = [
  { id: "about", label: "About Me", x: -26, z: -20, r: 6.5, color: [0.36, 0.68, 0.64] },
  { id: "experience", label: "Experience", x: 15, z: -22, r: 6.5, color: [0.93, 0.62, 0.28] },
  { id: "projects", label: "Projects", x: -26, z: 20, r: 6.5, color: [0.62, 0.52, 0.85] },
  { id: "contact", label: "Contact", x: 24, z: 9, r: 6.0, color: [0.47, 0.74, 0.47] },
];

export function buildWorld(engine) {
  const g = geo();
  const colliders = []; // {x, z, r}
  const collide = (x, z, r) => colliders.push({ x, z, r });

  /* ---------- ground & water ---------- */
  groundRect(g, -52, -44, 34, 44, 0, SAND);
  groundRect(g, 34, -44, 62, 44, -0.04, WATER);
  // subtle grass patches
  const patches = [[-30, -24, 14], [-30, 22, 13], [18, -24, 12], [8, 26, 10], [-6, -30, 8]];
  for (const [px, pz, pr] of patches) disc(g, pr, 12, [0.62, 0.74, 0.5], { cx: px, cy: 0.012, cz: pz });

  /* ---------- roads (cross + spurs) ---------- */
  const roadRect = (x0, z0, x1, z1) => groundRect(g, x0, z0, x1, z1, 0.02, ROAD);
  roadRect(-40, -1.6, 32, 1.6);              // main west-east
  roadRect(-1.6, -32, 1.6, 32);              // main north-south
  roadRect(-27.6, -22, -24.4, -1);           // spur to About
  roadRect(-27.6, 1, -24.4, 22);             // spur to Projects
  roadRect(13.4, -24, 16.6, -1);             // spur to Experience
  roadRect(1, 7.4, 24, 10.6);                // spur to Contact/pier
  // center dashes on main roads
  for (let x = -38; x < 32; x += 4) groundRect(g, x, -0.12, x + 1.7, 0.12, 0.03, LINE);
  for (let z = -30; z < 32; z += 4) groundRect(g, -0.12, z, 0.12, z + 1.7, 0.03, LINE);

  /* ---------- zone discs ---------- */
  for (const z of ZONES) {
    disc(g, z.r, 20, z.color.map((c) => c * 0.55 + 0.4), { cx: z.x, cy: 0.028, cz: z.z });
    disc(g, z.r - 0.7, 20, z.color.map((c) => c * 0.4 + 0.55), { cx: z.x, cy: 0.034, cz: z.z });
  }

  /* ---------- perimeter fence ---------- */
  const post = (x, z) => { box(g, 0.18, 0.9, 0.18, WOOD, { cx: x, cz: z }); };
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const r = geo();
    box(r, 0.08, 0.1, len, [0.7, 0.55, 0.36], { cy: 0.62 });
    transformGeo(r, mat4Compose((x0 + x1) / 2, 0, (z0 + z1) / 2, ry));
    g.verts.push(...r.verts);
  };
  const fenceRun = (x0, z0, x1, z1, step = 3) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) post(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n);
    rail(x0, z0, x1, z1);
  };
  fenceRun(BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxX, BOUNDS.minZ);
  fenceRun(BOUNDS.minX, BOUNDS.maxZ, BOUNDS.maxX, BOUNDS.maxZ);
  fenceRun(BOUNDS.minX, BOUNDS.minZ, BOUNDS.minX, BOUNDS.maxZ);
  fenceRun(BOUNDS.maxX, BOUNDS.minZ, BOUNDS.maxX, PIER.minZ - 0.5);
  fenceRun(BOUNDS.maxX, PIER.maxZ + 0.5, BOUNDS.maxX, BOUNDS.maxZ);

  /* ---------- pier ---------- */
  groundRect(g, PIER.minX, PIER.minZ, PIER.maxX, PIER.maxZ, 0.06, [0.58, 0.44, 0.28]);
  for (let x = PIER.minX + 1; x < PIER.maxX; x += 2) {
    groundRect(g, x, PIER.minZ, x + 0.12, PIER.maxZ, 0.075, [0.5, 0.37, 0.23]);
  }
  for (const px of [PIER.minX + 1, PIER.maxX - 0.6]) {
    for (const pz of [PIER.minZ + 0.4, PIER.maxZ - 0.4]) {
      cylinder(g, 0.16, 0.14, 0.7, 6, [0.4, 0.3, 0.2], { cx: px, cz: pz });
    }
  }

  /* ---------- Galata Tower (Projects) ---------- */
  const TX = -33, TZ = 26;
  cylinder(g, 2.5, 2.2, 7.2, 12, STONE, { cx: TX, cz: TZ });
  cylinder(g, 2.75, 2.75, 0.7, 12, [0.72, 0.68, 0.62], { cx: TX, cy: 7.2, cz: TZ });
  cylinder(g, 2.1, 1.9, 1.3, 12, STONE, { cx: TX, cy: 7.9, cz: TZ });
  cylinder(g, 2.35, 0, 2.6, 12, TERRA, { cx: TX, cy: 9.2, cz: TZ });
  // windows ring
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const wgeo = geo();
    box(wgeo, 0.4, 0.7, 0.12, [0.3, 0.32, 0.4], { cy: 7.35 });
    transformGeo(wgeo, mat4Compose(TX + Math.cos(a) * 2.72, 0, TZ + Math.sin(a) * 2.72, -a + Math.PI / 2));
    g.verts.push(...wgeo.verts);
  }
  disc(g, 4.2, 14, [0.7, 0.67, 0.62], { cx: TX, cy: 0.022, cz: TZ });
  collide(TX, TZ, 3.1);

  /* ---------- Experience: little office block ---------- */
  const bld = (x, z, w, h, d, bodyCol, ry = 0) => {
    const b = geo();
    box(b, w, h, d, bodyCol);
    // windows: front face grid
    const rows = Math.floor(h / 1.1), cols = Math.floor(w / 1.0);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        box(b, 0.5, 0.55, 0.08, [0.55, 0.72, 0.8], {
          cx: -w / 2 + (c + 0.5) * (w / cols),
          cy: 0.45 + r * 1.1,
          cz: d / 2,
        });
      }
    }
    box(b, w * 0.5, 0.9, 0.08, [0.4, 0.32, 0.3], { cy: 0, cz: d / 2, cx: 0 });
    transformGeo(b, mat4Compose(x, 0, z, ry));
    g.verts.push(...b.verts);
    collide(x, z, Math.max(w, d) * 0.62);
  };
  bld(20, -28, 4.5, 4.4, 3.4, [0.85, 0.62, 0.5], Math.PI);
  bld(10, -29, 3.6, 3.3, 3.2, [0.6, 0.68, 0.78], Math.PI);
  bld(25.5, -25, 3.2, 5.5, 3.0, [0.8, 0.76, 0.66], Math.PI * 0.9);

  /* ---------- About: park ---------- */
  const trees = [
    [-31, -25, 1.3, 0], [-27, -27, 1.1, 1], [-21, -25.5, 1.2, 0], [-33, -18, 1.0, 1],
    [-20, -14, 1.15, 0], [-32, -12, 1.25, 1],
  ];
  for (const [x, z, s, t] of trees) { mergeInto(g, treeGeo(s, t), x, 0, z); collide(x, z, 0.5); }
  for (const [x, z, s] of [[-22, -18.5, 1.1], [-30, -22, 0.9]]) { mergeInto(g, pineGeo(s), x, 0, z); collide(x, z, 0.5); }
  mergeInto(g, benchGeo(), -24, 0, -14.5, Math.PI);
  collide(-24, -14.5, 0.8);

  /* ---------- scattered trees along roads ---------- */
  const roadside = [
    [-12, 4, 1.1, 0], [-6, -4.5, 1.0, 1], [8, 4.5, 1.2, 0], [18, -4, 1.0, 1],
    [4, 14, 1.1, 0], [-4, 22, 1.2, 1], [4, -14, 1.05, 0], [-14, -4, 1.0, 1],
    [-36, 8, 1.2, 0], [28, -12, 1.1, 1], [28, 20, 1.0, 0], [-16, 28, 1.15, 1],
    [12, 30, 1.1, 0], [-36, -30, 1.2, 1],
  ];
  for (const [x, z, s, t] of roadside) { mergeInto(g, treeGeo(s, t), x, 0, z); collide(x, z, 0.5); }

  /* ---------- lamps ---------- */
  const lamps = [[-3.2, -10], [3.2, 10], [-10, 3.2], [10, -3.2], [17.2, -16], [-24, 4], [22, 12.5]];
  for (const [x, z] of lamps) {
    const l = lampGeo();
    transformGeo(l, mat4Compose(x, 0, z, Math.atan2(-x, -z)));
    g.verts.push(...l.verts);
    collide(x, z, 0.28);
  }

  /* ---------- simit cart (Contact) ---------- */
  const cart = geo();
  box(cart, 1.5, 0.9, 0.8, [0.75, 0.2, 0.2], { cy: 0.35 });
  box(cart, 1.6, 0.08, 0.9, [0.85, 0.7, 0.45], { cy: 1.25 });
  cylinder(cart, 0.05, 0.04, 1.15, 5, [0.4, 0.3, 0.2], { cx: 0.55, cy: 1.28, cz: 0 });
  cylinder(cart, 0.9, 0, 0.4, 8, [0.9, 0.55, 0.25], { cx: 0.55, cy: 2.35, cz: 0 });
  for (const wx of [-0.5, 0.5]) {
    const wl = geo();
    cylinder(wl, 0.28, 0.28, 0.1, 10, [0.3, 0.25, 0.2]);
    transformGeo(wl, mat4Compose(wx, 0.28, 0.45, 0, 0, Math.PI / 2));
    cart.verts.push(...wl.verts);
  }
  transformGeo(cart, mat4Compose(21, 0, 13.5, Math.PI * 0.15));
  g.verts.push(...cart.verts);
  collide(21, 13.5, 1.2);

  /* ---------- Bosphorus bridge (scenery over water) ---------- */
  const bridge = geo();
  const BZ = -26;
  box(bridge, 30, 0.5, 2.6, [0.55, 0.57, 0.62], { cx: 48, cy: 3.2, cz: BZ });
  for (const tx of [40, 56]) {
    for (const dz of [-1.1, 1.1]) box(bridge, 0.7, 9.5, 0.7, [0.75, 0.3, 0.28], { cx: tx, cz: BZ + dz });
    box(bridge, 3.4, 0.5, 0.6, [0.75, 0.3, 0.28], { cx: tx, cy: 8.6, cz: BZ });
    box(bridge, 3.4, 0.5, 0.6, [0.75, 0.3, 0.28], { cx: tx, cy: 5.2, cz: BZ });
  }
  // main cables: sagging approximated with rotated segments
  const cable = (x0, y0, x1, y1) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const seg = geo();
    box(seg, len, 0.14, 0.14, [0.35, 0.36, 0.4], { centered: true });
    transformGeo(seg, mat4Compose((x0 + x1) / 2, (y0 + y1) / 2, BZ, 0, 0, Math.atan2(y1 - y0, x1 - x0)));
    bridge.verts.push(...seg.verts);
  };
  cable(33, 5.5, 40, 9.3); cable(40, 9.3, 48, 5.8); cable(48, 5.8, 56, 9.3); cable(56, 9.3, 63, 5.5);
  for (let x = 36; x <= 60; x += 4) cable(x, 3.4, x, x < 48 ? 7.4 : 7.4);
  g.verts.push(...bridge.verts);

  /* ---------- Kız Kulesi (Maiden's Tower) ---------- */
  const KX = 47, KZ = 20;
  disc(g, 2.6, 10, [0.8, 0.77, 0.7], { cx: KX, cy: 0.05, cz: KZ });
  cylinder(g, 1.0, 0.9, 2.8, 10, [0.93, 0.91, 0.86], { cx: KX, cz: KZ });
  cylinder(g, 1.15, 1.15, 0.35, 10, [0.85, 0.82, 0.76], { cx: KX, cy: 2.8, cz: KZ });
  cylinder(g, 0.55, 0.5, 1.1, 8, [0.93, 0.91, 0.86], { cx: KX, cy: 3.15, cz: KZ });
  cylinder(g, 0.62, 0, 0.9, 8, [0.4, 0.44, 0.5], { cx: KX, cy: 4.25, cz: KZ });

  /* ---------- waves ---------- */
  for (let i = 0; i < 14; i++) {
    const wx = 36 + ((i * 37) % 24);
    const wz = -40 + ((i * 61) % 80);
    groundRect(g, wx, wz, wx + 1.6, wz + 0.18, -0.02, [0.85, 0.93, 0.95]);
  }

  /* ---------- clouds ---------- */
  const cloud = (x, y, z, s) => {
    const c = geo();
    box(c, 3.2 * s, 0.9 * s, 1.6 * s, [0.98, 0.98, 1], { centered: true });
    box(c, 1.8 * s, 1.4 * s, 1.2 * s, [0.98, 0.98, 1], { cx: 0.6 * s, centered: true });
    box(c, 1.6 * s, 1.0 * s, 1.0 * s, [0.95, 0.96, 1], { cx: -1.2 * s, cy: 0.2 * s, centered: true });
    transformGeo(c, mat4Compose(x, y, z));
    g.verts.push(...c.verts);
  };
  cloud(-20, 15, -30, 1.6); cloud(15, 18, 25, 2.0); cloud(40, 16, 0, 1.7); cloud(-38, 17, 15, 1.4);

  /* ---------- bowling corner ---------- */
  disc(g, 4.5, 14, [0.82, 0.78, 0.7], { cx: 8, cy: 0.02, cz: 24 });

  const staticMesh = engine.meshFromGeo(g);

  /* ---------- signs (textured boards) ---------- */
  const signs = [];
  const makeSign = (lines, x, z, ry, { w = 4.2, h = 1.5, y = 1.5, bg = "#f7f3e8", fg = "#33323b" } = {}) => {
    const sg = geo();
    const postCol = [0.4, 0.32, 0.22];
    box(sg, 0.14, y + 0.1, 0.14, postCol, { cx: -w / 2 + 0.3 });
    box(sg, 0.14, y + 0.1, 0.14, postCol, { cx: w / 2 - 0.3 });
    billboardQuad(sg, w, h, [1, 1, 1], { cy: y });
    const { canvas } = textCanvas(lines, { size: 160, bg, fg, ratio: Math.max(1, Math.round(w / h)) });
    signs.push({
      mesh: engine.meshFromGeo(sg),
      texture: engine.textureFromCanvas(canvas),
      model: mat4Compose(x, 0, z, ry),
    });
  };

  makeSign(["HAKAN ATAS", "Math & CS Teacher · Ed-Tech Developer", "Robotics Mentor — Istanbul"], 0, -12.5, 0, { w: 7, h: 2.3, y: 1.7 });
  makeSign(["Drive around to explore", "WASD / Arrows · R reset"], 5.8, -8, -0.5, { w: 4.6, h: 1.4, y: 1.3, bg: "#ffe9b8" });
  for (const zn of ZONES) {
    // sign sits just beyond the zone disc, facing the map center
    const len = Math.hypot(zn.x, zn.z) || 1;
    const dx = zn.x / len, dz = zn.z / len;
    const sx = zn.x + dx * (zn.r + 1.4);
    const sz = zn.z + dz * (zn.r + 1.4);
    makeSign([zn.label], sx, sz, Math.atan2(-sx, -sz));
  }
  makeSign(["⚓ Ferry to the Bosphorus"], 31, 4, Math.PI / 2, { w: 3.6, h: 1.1, y: 1.2, bg: "#dff0f2" });

  /* ---------- dynamic objects ---------- */
  const dynamics = [];
  const addDyn = (mesh, x, z, opts = {}) => {
    dynamics.push({
      mesh, texture: opts.texture || null,
      x, y: 0, z, yaw: opts.yaw || 0, pitch: 0, roll: 0,
      vx: 0, vy: 0, vz: 0, wyaw: 0, wpitch: 0,
      r: opts.r || 0.4, h: opts.h || 1, mass: opts.mass || 1,
      x0: x, z0: z, yaw0: opts.yaw || 0,
      scale: opts.scale || 1,
    });
  };

  // name letters — knockable cards
  const letterMesh = (ch, color) => {
    const lg = geo();
    box(lg, 1.25, 0.18, 0.5, [0.9, 0.88, 0.82]);
    billboardQuad(lg, 1.15, 1.15, [1, 1, 1], { cy: 0.16 });
    const { canvas } = textCanvas([ch], { size: 128, bg: color, fg: "#ffffff", ratio: 1, pad: 0.1 });
    return { mesh: engine.meshFromGeo(lg), texture: engine.textureFromCanvas(canvas) };
  };
  const palette = ["#e2574c", "#e9a13b", "#4db6ac", "#7986cb", "#66a35a"];
  "HAKAN".split("").forEach((ch, i) => {
    const m = letterMesh(ch, palette[i % palette.length]);
    addDyn(m.mesh, -3.4 + i * 1.7, -6.5, { texture: m.texture, r: 0.7, h: 1.3, mass: 0.7 });
  });
  "ATAS".split("").forEach((ch, i) => {
    const m = letterMesh(ch, palette[(i + 2) % palette.length]);
    addDyn(m.mesh, -2.6 + i * 1.7, -4.3, { texture: m.texture, r: 0.7, h: 1.3, mass: 0.7 });
  });

  // bowling pins (triangle)
  const pinMesh = engine.meshFromGeo(pinGeo());
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i <= r; i++) {
      addDyn(pinMesh, 8 - r * 0.9, 23 + (i - r / 2) * 1.0, { r: 0.3, h: 0.7, mass: 0.35 });
    }
  }

  // traffic cones near Experience
  const coneMesh = engine.meshFromGeo(coneGeo());
  for (const [x, z] of [[13, -14], [15.5, -12.5], [18, -14.5], [16, -17]]) {
    addDyn(coneMesh, x, z, { r: 0.32, h: 0.6, mass: 0.3 });
  }

  // crates near pier
  const crateG = geo();
  box(crateG, 0.85, 0.85, 0.85, [0.72, 0.55, 0.33]);
  box(crateG, 0.9, 0.12, 0.9, [0.6, 0.45, 0.26], { cy: 0.36 });
  const crateMesh = engine.meshFromGeo(crateG);
  for (const [x, z] of [[27, 6.2], [27.8, 7.1], [27.3, 12.3]]) {
    addDyn(crateMesh, x, z, { r: 0.55, h: 0.85, mass: 1.4 });
  }

  /* ---------- ferry ---------- */
  const fg = geo();
  box(fg, 5.4, 0.7, 1.9, [0.2, 0.24, 0.3], { cy: 0, centered: false });
  box(fg, 4.4, 0.8, 1.5, [0.95, 0.94, 0.9], { cy: 0.7 });
  box(fg, 2.6, 0.6, 1.1, [0.95, 0.94, 0.9], { cy: 1.5 });
  cylinder(fg, 0.18, 0.15, 0.9, 6, [0.85, 0.65, 0.2], { cx: 0.8, cy: 1.9 });
  const ferry = { mesh: engine.meshFromGeo(fg), x: 50, z: 30, yaw: Math.PI };

  /* ---------- blob shadow ---------- */
  const sh = geo();
  disc(sh, 1, 14, [0.1, 0.1, 0.12], { cy: 0 });
  const shadowMesh = engine.meshFromGeo(sh);

  return { staticMesh, signs, dynamics, colliders, ferry, shadowMesh };
}
