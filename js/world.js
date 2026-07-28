/* World builder: Istanbul-flavoured playground.
   Geometry is split into three merged meshes:
     ground — flat stuff that receives shadows (terrain, roads, markings)
     props  — everything that casts a projected shadow
     sky    — clouds & far-shore scenery (no shadows)
   Plus: textured signs, knockable dynamics, colliders, zones, ferry,
   tram and the flag. */

import { geo, box, cylinder, disc, pushQuad, billboardQuad, transformGeo, mergeInto, blobTreeGeo, grassTuftGeo, lanternGeo, voxelLetterGeo, benchGeo, pinGeo, coneGeo } from "./meshes.js";
import { mat4Compose } from "./math3d.js";
import { textCanvas } from "./engine.js";

export const BOUNDS = { minX: -41, maxX: 33, minZ: -33, maxZ: 33 };
export const PIER = { minX: 33, maxX: 43.5, minZ: 5.5, maxZ: 10.5 };

const SAND = [0.87, 0.83, 0.72];
const ROAD = [0.45, 0.47, 0.51];
const CURB = [0.78, 0.76, 0.7];
const LINE = [0.92, 0.9, 0.84];
const WATER = [0.27, 0.56, 0.66];
const WOOD = [0.64, 0.48, 0.3];
const STONE = [0.78, 0.75, 0.69];
const TERRA = [0.66, 0.36, 0.29];

/* career timeline lanes along the Experience street (x≈15, z −2 → −24) */
const tlZ = (year) => -2 - (year - 2007) * 1.16;
const LANES = [
  { x: 12.1, c: [255, 209, 102], from: 2007, to: 2010, title: "MATH TEACHER", org: "Uğur & İstek", years: "2007 — 2010", note: "Geometry · uni prep" },
  { x: 13.1, c: [255, 159, 91], from: 2011, to: 2016, title: "ED-TECH LEAD", org: "ALKEV Schools", years: "2011 — 2016", note: "Digital Authorship curriculum" },
  { x: 14.1, c: [255, 123, 172], from: 2013, to: 2014, title: "PROJECT COORD.", org: "Yaratıcı Zihinler", years: "2013 — 2014", note: "Game & crypto workshops" },
  { x: 15.1, c: [180, 135, 255], from: 2014, to: 2019, title: "EDUCATION CURATOR", org: "Maker Hareketi", years: "2014 — 2019", note: "Democratizing making" },
  { x: 16.1, c: [111, 216, 229], from: 2016, to: 2018, title: "TEACHER", org: "Enka Schools", years: "2016 — 2018", note: "Math & technology" },
  { x: 17.1, c: [242, 240, 255], from: 2018, to: 2026.3, title: "HEAD OF DEPT.", org: "ALKEV Schools", years: "2018 — now", note: "Projects & technology" },
  { x: 18.1, c: [142, 224, 138], from: 2023, to: 2026.3, title: "FTC MENTOR", org: "Team #24230", years: "2023 — now", note: "FIRST Tech Challenge" },
];

export const ZONES = [
  { id: "about", label: "About Me", x: -26, z: -20, r: 6.5, color: [0.36, 0.68, 0.64] },
  { id: "experience", label: "Experience", x: 15, z: -22, r: 6.5, color: [0.93, 0.62, 0.28] },
  { id: "projects", label: "Projects", x: -26, z: 20, r: 6.5, color: [0.62, 0.52, 0.85] },
  { id: "contact", label: "Contact", x: 24, z: 9, r: 6.0, color: [0.47, 0.74, 0.47] },
];

export function buildWorld(engine, models = {}) {
  const ground = geo();
  const props = geo();
  const sky = geo();
  const colliders = [];
  const collide = (x, z, r) => colliders.push({ x, z, r });

  /* ================= GROUND — one big painted texture =================
     Everything flat (terrain, water, roads, markings, zone discs) is
     painted on a canvas: soft edges, gradients and grain instead of
     hard polygon boundaries. */
  const GX0 = -52, GX1 = 98, GZ0 = -44, GZ1 = 44;
  const GW = 2048, GH = 1200;
  const gc = document.createElement("canvas");
  gc.width = GW; gc.height = GH;
  const c = gc.getContext("2d");
  c.setTransform(GW / (GX1 - GX0), 0, 0, GH / (GZ1 - GZ0), (-GX0 * GW) / (GX1 - GX0), (-GZ0 * GH) / (GZ1 - GZ0));
  c.lineJoin = "round";

  // sunset plaza base: warm terracotta with a light pool in the middle
  c.fillStyle = "#e2a06d";
  c.fillRect(GX0, GZ0, GX1 - GX0, GZ1 - GZ0);
  let rg = c.createRadialGradient(-2, 0, 4, -2, 0, 58);
  rg.addColorStop(0, "rgba(255,214,160,0.55)");
  rg.addColorStop(1, "rgba(255,214,160,0)");
  c.fillStyle = rg;
  c.fillRect(GX0, GZ0, GX1 - GX0, GZ1 - GZ0);

  // subtle floor tiles with per-tile tint variation
  const tileHash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5; return s - Math.floor(s); };
  const TILE = 2.4;
  for (let tx = Math.floor(GX0 / TILE); tx * TILE < 34; tx++) {
    for (let tz = Math.floor(GZ0 / TILE); tz * TILE < GZ1; tz++) {
      const t = tileHash(tx, tz);
      if (t > 0.5) {
        c.fillStyle = t > 0.75 ? "rgba(255,230,190,0.1)" : "rgba(120,50,45,0.07)";
        c.fillRect(tx * TILE, tz * TILE, TILE, TILE);
      }
    }
  }
  c.strokeStyle = "rgba(120,50,45,0.16)";
  c.lineWidth = 0.07;
  for (let x = Math.ceil(GX0 / TILE) * TILE; x < 34; x += TILE) {
    c.beginPath(); c.moveTo(x, GZ0); c.lineTo(x, GZ1); c.stroke();
  }
  for (let z = Math.ceil(GZ0 / TILE) * TILE; z < GZ1; z += TILE) {
    c.beginPath(); c.moveTo(GX0, z); c.lineTo(34, z); c.stroke();
  }

  // water: teal with foam along the shore
  const wg = c.createLinearGradient(33, 0, 78, 0);
  wg.addColorStop(0, "#e2a06d");
  wg.addColorStop(0.03, "#8fd0b8");
  wg.addColorStop(0.08, "#43ada4");
  wg.addColorStop(0.7, "#2f8a92");
  wg.addColorStop(1, "#2a7684");
  c.fillStyle = wg;
  c.fillRect(33, GZ0, 74 - 33, GZ1 - GZ0);
  c.fillStyle = "#d9a271";
  c.fillRect(74, GZ0, GX1 - 74, GZ1 - GZ0);
  // foam: wavy white shoreline strokes
  c.strokeStyle = "rgba(255,255,250,0.85)";
  c.lineCap = "round";
  c.lineWidth = 0.3;
  c.beginPath();
  for (let z = GZ0; z <= GZ1; z += 2) {
    const fx = 34.6 + Math.sin(z * 0.5) * 0.35;
    z === GZ0 ? c.moveTo(fx, z) : c.lineTo(fx, z);
  }
  c.stroke();
  c.strokeStyle = "rgba(255,255,250,0.35)";
  c.lineWidth = 0.2;
  c.beginPath();
  for (let z = GZ0; z <= GZ1; z += 2) {
    const fx = 36.2 + Math.sin(z * 0.4 + 2) * 0.5;
    z === GZ0 ? c.moveTo(fx, z) : c.lineTo(fx, z);
  }
  c.stroke();
  // waves
  c.strokeStyle = "rgba(240,255,252,0.5)";
  for (let i = 0; i < 34; i++) {
    const wx = 38 + ((i * 37) % 33);
    const wz = -41 + ((i * 61) % 82);
    c.lineWidth = 0.16 + (i % 3) * 0.05;
    c.beginPath();
    c.moveTo(wx, wz);
    c.quadraticCurveTo(wx + 0.9, wz - 0.25, wx + 1.8, wz);
    c.stroke();
  }

  // grass lawns: saturated olive blobs
  const patches = [[-30, -24, 14], [-30, 22, 13], [18, -24, 12], [8, 26, 10], [-6, -30, 8]];
  for (const [px, pz, pr] of patches) {
    for (const [rr, col] of [[pr, "rgba(116,138,34,0.9)"], [pr * 0.7, "rgba(102,126,30,0.8)"], [pr * 0.45, "rgba(130,148,40,0.7)"]]) {
      const gg2 = c.createRadialGradient(px, pz, rr * 0.25, px, pz, rr);
      gg2.addColorStop(0, col);
      gg2.addColorStop(1, "rgba(116,138,34,0)");
      c.fillStyle = gg2;
      c.fillRect(px - rr, pz - rr, rr * 2, rr * 2);
    }
  }

  // pads
  const pad = (px, pz, pr, col) => {
    const pg = c.createRadialGradient(px, pz, pr * 0.5, px, pz, pr);
    pg.addColorStop(0, col);
    pg.addColorStop(0.85, col);
    pg.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = pg;
    c.fillRect(px - pr, pz - pr, pr * 2, pr * 2);
  };
  pad(8, 24, 4.8, "rgba(210,200,175,0.9)");
  pad(-33, 26, 4.4, "rgba(182,172,152,0.95)");
  pad(47, 20, 2.8, "rgba(207,197,178,1)"); // Kız Kulesi islet

  // dirt paths (Bruno-style light trails, no asphalt)
  const roads = [
    [[-40, 0], [32, 0]],
    [[0, -32], [0, 32]],
    [[-26, -22], [-26, 22]],
    [[15, -24], [15, -1]],
    [[1, 9], [24, 9]],
  ];
  c.lineCap = "round";
  for (const [[ax, az], [bx, bz]] of roads) {
    c.strokeStyle = "rgba(180,110,70,0.5)";
    c.lineWidth = 3.9;
    c.beginPath(); c.moveTo(ax, az); c.lineTo(bx, bz); c.stroke();
  }
  for (const [[ax, az], [bx, bz]] of roads) {
    c.strokeStyle = "#f2cf98";
    c.lineWidth = 3.3;
    c.beginPath(); c.moveTo(ax, az); c.lineTo(bx, bz); c.stroke();
  }
  for (const [[ax, az], [bx, bz]] of roads) {
    c.strokeStyle = "rgba(255,236,200,0.5)";
    c.lineWidth = 2.0;
    c.beginPath(); c.moveTo(ax, az); c.lineTo(bx, bz); c.stroke();
  }
  // tram rails on the east-west path
  c.strokeStyle = "rgba(90,60,55,0.8)";
  c.lineWidth = 0.13;
  for (const off of [-0.68, 0.68]) {
    c.beginPath(); c.moveTo(-40, off); c.lineTo(32, off); c.stroke();
  }
  // scattered pebbles along paths
  c.fillStyle = "rgba(255,250,240,0.5)";
  for (let i = 0; i < 90; i++) {
    const t = tileHash(i, 7);
    const road = roads[i % roads.length];
    const [[ax, az], [bx, bz]] = road;
    const px = ax + (bx - ax) * tileHash(i, 3) + (tileHash(i, 5) - 0.5) * 4.6;
    const pz = az + (bz - az) * tileHash(i, 3) + (tileHash(i, 11) - 0.5) * 4.6;
    c.fillRect(px, pz, 0.12 + t * 0.1, 0.1 + t * 0.08);
  }

  // ===== career timeline paint: glowing lanes + endpoint squares =====
  for (const ln of LANES) {
    const z0 = tlZ(ln.from), z1 = tlZ(ln.to);
    const [cr, cg, cb] = ln.c;
    c.lineCap = "round";
    c.strokeStyle = `rgba(${cr},${cg},${cb},0.22)`;
    c.lineWidth = 0.55;
    c.beginPath(); c.moveTo(ln.x, z0); c.lineTo(ln.x, z1); c.stroke();
    c.strokeStyle = `rgba(${cr},${cg},${cb},0.95)`;
    c.lineWidth = 0.16;
    c.beginPath(); c.moveTo(ln.x, z0); c.lineTo(ln.x, z1); c.stroke();
    for (const ze of ln.to > 2026 ? [z0] : [z0, z1]) {
      c.fillStyle = `rgba(${cr},${cg},${cb},0.95)`;
      c.strokeStyle = `rgba(${cr},${cg},${cb},0.5)`;
      c.lineWidth = 0.1;
      c.fillRect(ln.x - 0.22, ze - 0.22, 0.44, 0.44);
      c.strokeRect(ln.x - 0.38, ze - 0.38, 0.76, 0.76);
    }
  }

  // zone discs: soft colored glow + ring
  for (const z of ZONES) {
    const col = z.color.map((v) => Math.round(v * 255));
    const zg = c.createRadialGradient(z.x, z.z, 1, z.x, z.z, z.r);
    zg.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},0.28)`);
    zg.addColorStop(0.75, `rgba(${col[0]},${col[1]},${col[2]},0.16)`);
    zg.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    c.fillStyle = zg;
    c.fillRect(z.x - z.r, z.z - z.r, z.r * 2, z.r * 2);
    c.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},0.8)`;
    c.lineWidth = 0.28;
    c.beginPath(); c.arc(z.x, z.z, z.r - 0.4, 0, Math.PI * 2); c.stroke();
  }

  // pier planks
  c.fillStyle = "#8a6a44";
  c.fillRect(PIER.minX, PIER.minZ, PIER.maxX - PIER.minX, PIER.maxZ - PIER.minZ);
  c.strokeStyle = "rgba(70,52,32,0.6)";
  c.lineWidth = 0.1;
  for (let x = PIER.minX + 0.8; x < PIER.maxX; x += 0.8) {
    c.beginPath(); c.moveTo(x, PIER.minZ); c.lineTo(x, PIER.maxZ); c.stroke();
  }

  // painted hints & flourishes
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = "rgba(255,248,235,0.65)";
  c.font = "700 1.6px 'DejaVu Sans', Arial, sans-serif";
  c.fillText("EXPLORE MY WORLD", 0, -16.5);
  c.fillStyle = "rgba(255,248,235,0.5)";
  c.font = "700 1.1px 'DejaVu Sans', Arial, sans-serif";
  c.fillText("→ PROJECTS", -20, 5.2);
  c.fillText("ABOUT ←", -19.5, -5);
  c.fillText("EXPERIENCE →", 9, -13);
  c.fillText("CONTACT →", 12, 6);
  c.save();
  c.translate(12, 22);
  c.rotate(-0.12);
  c.fillStyle = "rgba(120,45,90,0.15)";
  c.font = "800 6.5px 'DejaVu Sans', Arial, sans-serif";
  c.fillText("İSTANBUL", 0, 0);
  c.restore();

  // confetti squares sprinkled on the plaza (Bruno detail)
  const hash = (n) => { const s = Math.sin(n * 91.7) * 43758.5; return s - Math.floor(s); };
  for (let i = 0; i < 120; i++) {
    const nx = -44 + hash(i * 3 + 9) * 76;
    const nz = GZ0 + 4 + hash(i * 7 + 4) * 82;
    c.fillStyle = ["rgba(210,60,60,0.5)", "rgba(255,255,255,0.55)", "rgba(90,60,160,0.4)"][i % 3];
    c.save();
    c.translate(nx, nz);
    c.rotate(hash(i) * 3);
    c.fillRect(0, 0, 0.22, 0.22);
    c.restore();
  }

  // dusk gradient toward the water (district hue shift)
  const dusk = c.createLinearGradient(14, 0, 54, 0);
  dusk.addColorStop(0, "rgba(96,60,160,0)");
  dusk.addColorStop(1, "rgba(96,60,160,0.16)");
  c.fillStyle = dusk;
  c.fillRect(14, GZ0, GX1 - 14, GZ1 - GZ0);

  // grain + warm purple edge vignette
  for (let i = 0; i < 2600; i++) {
    const nx = GX0 + hash(i * 3 + 1) * (GX1 - GX0);
    const nz = GZ0 + hash(i * 7 + 2) * (GZ1 - GZ0);
    c.fillStyle = hash(i) > 0.5 ? "rgba(90,30,40,0.05)" : "rgba(255,240,210,0.07)";
    const sz = 0.08 + hash(i * 13) * 0.18;
    c.fillRect(nx, nz, sz, sz);
  }
  const edge = c.createRadialGradient(0, 0, 40, 0, 0, 95);
  edge.addColorStop(0, "rgba(80,40,100,0)");
  edge.addColorStop(1, "rgba(80,40,100,0.25)");
  c.fillStyle = edge;
  c.fillRect(GX0, GZ0, GX1 - GX0, GZ1 - GZ0);

  // the single ground quad (v flipped to match UNPACK_FLIP_Y)
  pushQuad(ground,
    [GX0, 0, GZ0], [GX0, 0, GZ1], [GX1, 0, GZ1], [GX1, 0, GZ0],
    [1, 1, 1], [[0, 1], [0, 0], [1, 0], [1, 1]]);
  const groundTexture = engine.textureFromCanvas(gc, 0, !new URLSearchParams(location.search).has("nomip"));

  /* flowers stay 3D so they cast tiny shadows */
  const flowerCols = [[0.95, 0.45, 0.5], [0.98, 0.8, 0.3], [0.85, 0.55, 0.9], [0.98, 0.95, 0.9]];
  patches.forEach(([px, pz, pr], pi) => {
    for (let i = 0; i < 10; i++) {
      const a = hash(pi * 31 + i) * Math.PI * 2;
      const rr = Math.sqrt(hash(pi * 57 + i * 3)) * (pr - 1.5);
      const fx = px + Math.cos(a) * rr, fz = pz + Math.sin(a) * rr;
      const fcol = flowerCols[(pi + i) % flowerCols.length];
      box(props, 0.1, 0.16, 0.1, fcol, { cx: fx, cz: fz });
      box(props, 0.05, 0.1, 0.05, [0.3, 0.55, 0.3], { cx: fx + 0.06, cy: 0, cz: fz + 0.06 });
    }
  });

  /* ================= PROPS (shadow casters) ================= */
  const post = (x, z) => { box(props, 0.18, 0.9, 0.18, WOOD, { cx: x, cz: z }); };
  const rail = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const r = geo();
    box(r, 0.08, 0.1, len, [0.7, 0.55, 0.36], { cy: 0.62 });
    transformGeo(r, mat4Compose((x0 + x1) / 2, 0, (z0 + z1) / 2, ry));
    props.verts.push(...r.verts);
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

  for (const px of [PIER.minX + 1, PIER.maxX - 0.6]) {
    for (const pz of [PIER.minZ + 0.4, PIER.maxZ - 0.4]) {
      cylinder(props, 0.16, 0.14, 0.7, 6, [0.4, 0.3, 0.2], { cx: px, cz: pz });
    }
  }

  /* Galata Tower — real model when provided (Hakan's GLB), primitives otherwise */
  const TX = -33, TZ = 26;
  if (models.galata) {
    const b = models.galata.bounds;
    const height = b.maxY - b.minY;
    const s = 13 / height;
    for (const n of models.galata.nodes) {
      const v = Float32Array.from(n.verts);
      for (let i = 0; i < v.length; i += 11) {
        v[i] = (v[i] - (b.minX + b.maxX) / 2) * s + TX;
        v[i + 1] = (v[i + 1] - b.minY) * s;
        v[i + 2] = (v[i + 2] - (b.minZ + b.maxZ) / 2) * s + TZ;
      }
      // no spread: these arrays are big enough to overflow the call stack
      for (let i = 0; i < v.length; i++) props.verts.push(v[i]);
    }
  } else {
    cylinder(props, 2.5, 2.2, 7.2, 12, STONE, { cx: TX, cz: TZ });
    cylinder(props, 2.75, 2.75, 0.7, 12, [0.72, 0.68, 0.62], { cx: TX, cy: 7.2, cz: TZ });
    cylinder(props, 2.1, 1.9, 1.3, 12, STONE, { cx: TX, cy: 7.9, cz: TZ });
    cylinder(props, 2.35, 0, 2.6, 12, TERRA, { cx: TX, cy: 9.2, cz: TZ });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const wgeo = geo();
      box(wgeo, 0.4, 0.7, 0.12, [0.3, 0.32, 0.4], { cy: 7.35 });
      transformGeo(wgeo, mat4Compose(TX + Math.cos(a) * 2.72, 0, TZ + Math.sin(a) * 2.72, -a + Math.PI / 2));
      props.verts.push(...wgeo.verts);
    }
  }
  collide(TX, TZ, 3.1);

  /* office blocks */
  const bld = (x, z, w, h, d, bodyCol, ry = 0) => {
    const b = geo();
    box(b, w, h, d, bodyCol);
    const rows = Math.floor(h / 1.1), cols = Math.floor(w / 1.0);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        box(b, 0.5, 0.55, 0.08, [0.55, 0.72, 0.8], {
          cx: -w / 2 + (c + 0.5) * (w / cols), cy: 0.45 + r * 1.1, cz: d / 2,
        });
      }
    }
    box(b, w * 0.5, 0.9, 0.08, [0.4, 0.32, 0.3], { cy: 0, cz: d / 2 });
    transformGeo(b, mat4Compose(x, 0, z, ry));
    props.verts.push(...b.verts);
    collide(x, z, Math.max(w, d) * 0.62);
  };
  const glbPropsPending = [];
  // real building models where we have them, boxes as the fallback
  const cityRow = [
    ["bld1", 20, -28.5, Math.PI, 3.2],       // real model where one fits
    ["cafe", 20.5, 12, 0.4, 2.2],            // tea garden by the shore
    ["scooter1", 18.4, 10.2, 1.9, 0.7],      // courier scooter parked at the tea garden
    ["scooter2", -22.6, -13.4, -0.7, 0.7],   // another one by the park bench
    ["tower", 10.5, -29, Math.PI, 2.8],      // Kenney tower block
    ["shop", 25.5, -25.5, Math.PI * 0.92, 2.4],
    ["light", 2.6, 2.6, -Math.PI * 0.75, 0.3],   // traffic lights at the junction
    ["light", -2.6, -2.6, Math.PI * 0.25, 0.3],
    ["sign", 2.7, -2.7, Math.PI * 0.25, 0.3],
    ["sign", 16.9, -1.9, -Math.PI * 0.4, 0.3],
    ["bike", -24.6, 20.9, 0.9, 0.5],         // parked by the Projects plaza
    ["bike", 3.4, 12.6, -1.2, 0.5],
  ];
  for (const [key, bx, bz, byaw, br] of cityRow) {
    if (models[key]) { glbPropsPending.push({ type: key, x: bx, z: bz, yaw: byaw, s: 1 }); collide(bx, bz, br); }
  }
  if (!models.bld1) bld(20, -28, 4.5, 4.4, 3.4, [0.85, 0.62, 0.5], Math.PI);
  if (!models.tower) bld(10, -29, 3.6, 3.3, 3.2, [0.6, 0.68, 0.78], Math.PI);
  if (!models.shop) bld(25.5, -25, 3.2, 5.5, 3.0, [0.8, 0.76, 0.66], Math.PI * 0.9);

  /* blossom & autumn blob trees */
  const trees = [
    [-31, -25, 1.3, "pink"], [-27, -27, 1.1, "orange"], [-21, -25.5, 1.2, "pink"], [-33, -18, 1.0, "yellow"],
    [-20, -14, 1.15, "green"], [-32, -12, 1.25, "pink"],
    [-12, 4, 1.1, "orange"], [-6, -4.5, 1.0, "pink"], [8, 4.5, 1.2, "yellow"], [18, -4, 1.0, "orange"],
    [4, 14, 1.1, "pink"], [-4, 22, 1.2, "green"], [4, -14, 1.05, "yellow"], [-14, -4, 1.0, "pink"],
    [-36, 8, 1.2, "orange"], [28, -12, 1.1, "pink"], [28, 20, 1.0, "orange"], [-16, 28, 1.15, "yellow"],
    [12, 30, 1.1, "pink"], [-36, -30, 1.2, "green"], [-22, -18.5, 1.15, "pink"], [-30, -22, 0.95, "orange"],
  ];
  /* a handful of spots get real GLB trees when available */
  const glbTrees = [];
  const glbSpots = new Set([0, 2, 8, 10, 14, 17]);
  trees.forEach(([x, z, s, pal], ti) => {
    if (models.treeCount && glbSpots.has(ti)) {
      glbTrees.push({ t: glbTrees.length % models.treeCount, x, z, s: 0.85 + (ti % 3) * 0.15, yaw: ti * 1.7 });
    } else {
      mergeInto(props, blobTreeGeo(ti * 7.3, s, pal), x, 0, z);
    }
    collide(x, z, 0.5);
  });
  const glbProps = glbPropsPending;
  const glowPts = [];
  const benchSpots = [[-24, -14.5, Math.PI], [18, 12.5, -Math.PI / 2], [-30, 16.5, 0.6]];
  for (const [bx, bz, byaw] of benchSpots) {
    if (models.hasBench) glbProps.push({ type: "bench", x: bx, z: bz, yaw: byaw, s: 1 });
    else mergeInto(props, benchGeo(), bx, 0, bz, byaw);
    collide(bx, bz, 0.8);
  }
  if (models.hasLamp) {
    for (const [lx, lz] of [[-14, -3.2], [14, 3.2], [3.2, 18], [-26, -8], [12.5, -20]]) {
      glbProps.push({ type: "lamp", x: lx, z: lz, yaw: Math.atan2(-lx, -lz), s: 1 });
      collide(lx, lz, 0.3);
      glowPts.push({ x: lx, y: 2.55, z: lz, r: 1.4, color: [1, 0.78, 0.4] });
    }
  }
  if (models.hasGrass) {
    const gh = (n) => { const s = Math.sin(n * 137.3) * 43758.5; return s - Math.floor(s); };
    const lawns = [[-30, -24, 12], [-30, 22, 11], [18, -24, 10], [8, 26, 8], [-6, -30, 6]];
    lawns.forEach(([px, pz, pr], li) => {
      for (let i = 0; i < 6; i++) {
        const a = gh(li * 53 + i * 7) * Math.PI * 2;
        const rr = Math.sqrt(gh(li * 91 + i * 13)) * (pr - 1.2);
        glbProps.push({
          type: "grass",
          x: px + Math.cos(a) * rr, z: pz + Math.sin(a) * rr,
          yaw: gh(i * 3 + li) * Math.PI * 2, s: 0.8 + gh(li + i * 17) * 0.8,
        });
      }
    });
  }
  /* pale rocks */
  for (const [x, z, s] of [[-9, 27, 1], [22, 27, 0.8], [-38, -8, 1.2], [30, -7, 0.7], [6, -20, 0.6], [-15, 12, 0.55]]) {
    box(props, 0.8 * s, 0.5 * s, 0.6 * s, [0.88, 0.85, 0.82], { cx: x, cz: z });
    box(props, 0.5 * s, 0.7 * s, 0.45 * s, [0.93, 0.9, 0.87], { cx: x + 0.3 * s, cz: z + 0.2 * s });
    collide(x, z, 0.7 * s);
  }

  /* spiky grass tufts everywhere (the Bruno signature) */
  const tuftHash = (n) => { const s = Math.sin(n * 127.1) * 43758.5; return s - Math.floor(s); };
  patches.forEach(([px, pz, pr], pi) => {
    const count = Math.round(pr * pr * 0.55);
    for (let i = 0; i < count; i++) {
      const a = tuftHash(pi * 131 + i * 3) * Math.PI * 2;
      const rr = Math.sqrt(tuftHash(pi * 57 + i * 7)) * (pr - 0.8);
      const gx = px + Math.cos(a) * rr, gz = pz + Math.sin(a) * rr;
      const col = tuftHash(pi + i * 13) > 0.88
        ? [0.9, 0.5, 0.55]                       // occasional pink shrub
        : [0.58 + tuftHash(i) * 0.14, 0.6 + tuftHash(i * 3) * 0.12, 0.22];
      mergeInto(props, grassTuftGeo(pi * 997 + i, 0.9 + tuftHash(i * 5) * 0.7, col), gx, 0, gz);
    }
  });
  // sparse tufts along the paths
  for (let i = 0; i < 70; i++) {
    const gx = -40 + tuftHash(i * 17 + 3) * 72;
    const gz = -32 + tuftHash(i * 29 + 5) * 64;
    mergeInto(props, grassTuftGeo(i * 31, 0.7 + tuftHash(i) * 0.5, [0.62, 0.58, 0.24]), gx, 0, gz);
  }

  /* glowing lanterns */
  const lamps = [[-3.2, -10], [3.2, 10], [-10, 3.2], [10, -3.2], [17.2, -16], [-24, 4], [22, 12.5], [-26, -12], [8, 20]];
  for (const [x, z] of lamps) {
    const l = lanternGeo();
    transformGeo(l, mat4Compose(x, 0, z, Math.atan2(-x, -z)));
    props.verts.push(...l.verts);
    collide(x, z, 0.28);
    glowPts.push({ x, y: 1.95, z, r: 1.5, color: [1, 0.72, 0.3] });
  }

  /* simit cart with simits */
  const cart = geo();
  box(cart, 1.5, 0.9, 0.8, [0.75, 0.2, 0.2], { cy: 0.35 });
  box(cart, 1.6, 0.08, 0.9, [0.85, 0.7, 0.45], { cy: 1.25 });
  for (let i = 0; i < 5; i++) {
    cylinder(cart, 0.11, 0.11, 0.06, 8, [0.78, 0.5, 0.2], { cx: -0.55 + i * 0.28, cy: 1.33, cz: 0.1 });
  }
  cylinder(cart, 0.05, 0.04, 1.15, 5, [0.4, 0.3, 0.2], { cx: 0.55, cy: 1.28 });
  cylinder(cart, 0.9, 0, 0.4, 8, [0.9, 0.55, 0.25], { cx: 0.55, cy: 2.35 });
  for (const wx of [-0.5, 0.5]) {
    const wl = geo();
    cylinder(wl, 0.28, 0.28, 0.1, 10, [0.3, 0.25, 0.2]);
    transformGeo(wl, mat4Compose(wx, 0.28, 0.45, 0, 0, Math.PI / 2));
    cart.verts.push(...wl.verts);
  }
  transformGeo(cart, mat4Compose(21, 0, 13.5, Math.PI * 0.15));
  props.verts.push(...cart.verts);
  collide(21, 13.5, 1.2);

  /* yalı — Bosphorus waterfront house on stilts */
  {
    const yali = geo();
    const WALL = [0.93, 0.88, 0.78];
    const TRIM = [0.62, 0.3, 0.26];
    const ROOF = [0.72, 0.28, 0.22];
    const WIN = [0.32, 0.3, 0.46];
    // stilts over the water
    for (const [sx, sz] of [[-1.9, -1.1], [1.9, -1.1], [-1.9, 1.1], [1.9, 1.1], [0, 0]]) {
      cylinder(yali, 0.16, 0.13, 1.0, 6, [0.42, 0.3, 0.24], { cx: sx, cy: -0.6, cz: sz });
    }
    box(yali, 4.6, 0.18, 3.0, [0.55, 0.4, 0.28], { cy: 0.32 });          // deck
    box(yali, 4.0, 1.5, 2.4, WALL, { cy: 0.5 });                         // ground floor
    box(yali, 4.4, 1.4, 2.6, WALL, { cy: 2.0 });                         // upper floor (overhang)
    box(yali, 1.5, 1.1, 0.5, WALL, { cy: 2.15, cz: 1.5 });               // cumba bay window
    box(yali, 1.1, 0.7, 0.1, WIN, { cy: 2.35, cz: 1.78 });
    // window rows
    for (const wx of [-1.5, -0.5, 0.5, 1.5]) {
      box(yali, 0.6, 0.8, 0.08, WIN, { cx: wx, cy: 0.85, cz: 1.22 });
      box(yali, 0.6, 0.8, 0.08, WIN, { cx: wx, cy: 2.25, cz: 1.32 });
    }
    box(yali, 0.7, 1.1, 0.08, TRIM, { cx: 0, cy: 0.5, cz: 1.23 });       // door
    // trim + roof
    box(yali, 4.5, 0.14, 2.7, TRIM, { cy: 1.55 });
    box(yali, 4.7, 0.14, 2.9, TRIM, { cy: 3.4 });
    cylinder(yali, 2.9, 0, 1.3, 4, ROOF, { cy: 3.54 });
    box(yali, 0.4, 0.7, 0.4, [0.8, 0.75, 0.68], { cx: 1.4, cy: 3.9 });   // chimney
    transformGeo(yali, mat4Compose(37.5, 0.6, -8, -Math.PI / 2 - 0.15));
    props.verts.push(...yali.verts);
    collide(37.5, -8, 3.2);
    glowPts.push({ x: 36.4, y: 2.6, z: -8, r: 1.3, color: [1, 0.75, 0.35] });
  }

  /* Kız Kulesi */
  const KX = 47, KZ = 20;
  cylinder(props, 1.0, 0.9, 2.8, 10, [0.93, 0.91, 0.86], { cx: KX, cz: KZ });
  cylinder(props, 1.15, 1.15, 0.35, 10, [0.85, 0.82, 0.76], { cx: KX, cy: 2.8, cz: KZ });
  cylinder(props, 0.55, 0.5, 1.1, 8, [0.93, 0.91, 0.86], { cx: KX, cy: 3.15, cz: KZ });
  cylinder(props, 0.62, 0, 0.9, 8, [0.4, 0.44, 0.5], { cx: KX, cy: 4.25, cz: KZ });

  /* Bosphorus bridge */
  const BZ = -26;
  box(props, 30, 0.5, 2.6, [0.55, 0.57, 0.62], { cx: 48, cy: 3.2, cz: BZ });
  for (const tx of [40, 56]) {
    for (const dz of [-1.1, 1.1]) box(props, 0.7, 9.5, 0.7, [0.75, 0.3, 0.28], { cx: tx, cz: BZ + dz });
    box(props, 3.4, 0.5, 0.6, [0.75, 0.3, 0.28], { cx: tx, cy: 8.6, cz: BZ });
    box(props, 3.4, 0.5, 0.6, [0.75, 0.3, 0.28], { cx: tx, cy: 5.2, cz: BZ });
  }
  const cable = (x0, y0, x1, y1) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const seg = geo();
    box(seg, len, 0.14, 0.14, [0.35, 0.36, 0.4], { centered: true });
    transformGeo(seg, mat4Compose((x0 + x1) / 2, (y0 + y1) / 2, BZ, 0, 0, Math.atan2(y1 - y0, x1 - x0)));
    props.verts.push(...seg.verts);
  };
  cable(33, 5.5, 40, 9.3); cable(40, 9.3, 48, 5.8); cable(48, 5.8, 56, 9.3); cable(56, 9.3, 63, 5.5);
  for (let x = 36; x <= 60; x += 4) cable(x, 3.4, x, 7.4);

  /* flag pole (flag itself is a separate wobbling mesh) */
  cylinder(props, 0.07, 0.05, 4.6, 6, [0.75, 0.75, 0.78], { cx: 4.5, cz: -12 });
  collide(4.5, -12, 0.3);

  /* ================= SKY (no shadow) ================= */
  const cloud = (x, y, z, s) => {
    const c = geo();
    box(c, 3.2 * s, 0.9 * s, 1.6 * s, [0.98, 0.98, 1], { centered: true });
    box(c, 1.8 * s, 1.4 * s, 1.2 * s, [0.98, 0.98, 1], { cx: 0.6 * s, centered: true });
    box(c, 1.6 * s, 1.0 * s, 1.0 * s, [0.95, 0.96, 1], { cx: -1.2 * s, cy: 0.2 * s, centered: true });
    transformGeo(c, mat4Compose(x, y, z));
    sky.verts.push(...c.verts);
  };
  cloud(-20, 15, -30, 1.6); cloud(15, 18, 25, 2.0); cloud(40, 16, 0, 1.7);
  cloud(-38, 17, 15, 1.4); cloud(60, 19, -14, 2.2); cloud(8, 21, -6, 1.2);

  /* ===== animated sea surface (shader-driven), routed around the pier ===== */
  const water = geo();
  const waterQuad = (x0, z0, x1, z1) => {
    pushQuad(water, [x0, 0.03, z0], [x0, 0.03, z1], [x1, 0.03, z1], [x1, 0.03, z0], [1, 1, 1]);
  };
  waterQuad(33.6, -44, 74, PIER.minZ);            // north of the pier
  waterQuad(33.6, PIER.maxZ, 74, 44);             // south of the pier
  waterQuad(PIER.maxX, PIER.minZ, 74, PIER.maxZ); // east of the pier
  const waterMesh = engine.meshFromGeo(water);

  /* Kız Kulesi islet has to sit above the new sea surface */
  disc(props, 2.9, 12, [0.86, 0.82, 0.73], { cx: 47, cy: 0.06, cz: 20 });
  disc(props, 3.3, 12, [0.93, 0.9, 0.82], { cx: 47, cy: 0.04, cz: 20 });

  /* ===== far shore: an Istanbul silhouette in dusk haze ===== */
  const SIL = [0.62, 0.46, 0.6];        // hazy purple, reads as distance
  const SIL2 = [0.68, 0.5, 0.58];
  const DOME = [0.58, 0.44, 0.58];
  const farB = (z, w, h, c2) => box(sky, w, h, 3.2, c2, { cx: 77 + (z % 3), cz: z });
  farB(-34, 4, 3.0, SIL); farB(-28, 3, 4.6, SIL2); farB(-19, 5, 2.4, SIL);
  farB(-11, 3, 3.8, SIL2); farB(2, 4, 2.8, SIL); farB(9, 3, 4.4, SIL2);
  farB(28, 5, 2.6, SIL); farB(36, 3, 3.6, SIL2);

  /* a mosque: central dome, half domes and twin minarets */
  const mosque = (mz, s) => {
    const m = geo();
    box(m, 5.2 * s, 2.0 * s, 4.2 * s, SIL);
    cylinder(m, 2.0 * s, 1.85 * s, 0.5 * s, 14, DOME, { cy: 2.0 * s });
    // dome: stacked rings approximating a hemisphere
    for (let i = 0; i < 6; i++) {
      const t0 = i / 6, t1 = (i + 1) / 6;
      const r0 = Math.cos(t0 * Math.PI / 2) * 1.85 * s;
      const r1 = Math.cos(t1 * Math.PI / 2) * 1.85 * s;
      cylinder(m, r0, r1, (Math.sin(t1 * Math.PI / 2) - Math.sin(t0 * Math.PI / 2)) * 1.5 * s, 14, DOME,
        { cy: 2.5 * s + Math.sin(t0 * Math.PI / 2) * 1.5 * s });
    }
    cylinder(m, 0.06 * s, 0.04 * s, 0.7 * s, 5, [0.75, 0.62, 0.7], { cy: 4.0 * s });
    for (const mx of [-2.9 * s, 2.9 * s]) {
      cylinder(m, 0.26 * s, 0.2 * s, 6.2 * s, 8, SIL2, { cx: mx });
      cylinder(m, 0.34 * s, 0.34 * s, 0.16 * s, 8, DOME, { cx: mx, cy: 4.2 * s });
      cylinder(m, 0.2 * s, 0, 1.1 * s, 8, DOME, { cx: mx, cy: 6.2 * s });
      cylinder(m, 0.04 * s, 0.03 * s, 0.5 * s, 4, [0.75, 0.62, 0.7], { cx: mx, cy: 7.3 * s });
    }
    transformGeo(m, mat4Compose(78, 0, mz, -Math.PI / 2));
    sky.verts.push(...m.verts);
  };
  mosque(-2, 1.05);
  mosque(20, 0.8);
  cylinder(sky, 0.9, 0.8, 6, 8, SIL2, { cx: 77, cz: -41 });
  cylinder(sky, 1.1, 0, 1.8, 8, DOME, { cx: 77, cy: 6, cz: -41 });

  /* baked vertical ambient occlusion: props darken toward the ground */
  const applyAO = (g, maxH) => {
    const v = g.verts;
    for (let i = 0; i < v.length; i += 11) {
      const f = 0.7 + 0.3 * Math.min(1, Math.max(0, v[i + 1] / maxH));
      v[i + 6] *= f; v[i + 7] *= f; v[i + 8] *= f;
    }
  };
  applyAO(props, 2.4);

  const groundMesh = engine.meshFromGeo(ground);
  const propsMesh = engine.meshFromGeo(props);
  const skyMesh = engine.meshFromGeo(sky);

  /* ================= SIGNS ================= */
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
    const len = Math.hypot(zn.x, zn.z) || 1;
    const dx = zn.x / len, dz = zn.z / len;
    makeSign([zn.label], zn.x + dx * (zn.r + 1.4), zn.z + dz * (zn.r + 1.4), Math.atan2(-(zn.x + dx), -(zn.z + dz)));
  }
  makeSign(["⚓ Ferry to the Bosphorus"], 31, 4, Math.PI / 2, { w: 3.6, h: 1.1, y: 1.2, bg: "#dff0f2" });

  /* ===== timeline extras: year plates on the road + floating labels ===== */
  const flats = [];
  const makeYearPlate = (text, x, z) => {
    const fg2 = geo();
    box(fg2, 1.8, 0.07, 1.05, [0.14, 0.13, 0.18], { cx: 0, cz: 0 });
    pushQuad(fg2,
      [-0.8, 0.085, -0.42], [-0.8, 0.085, 0.42], [0.8, 0.085, 0.42], [0.8, 0.085, -0.42],
      [1, 1, 1], [[0, 1], [0, 0], [1, 0], [1, 1]]);
    const { canvas } = textCanvas([text], { size: 110, bg: "#242030", fg: "#f2f0ff", ratio: 2, pad: 0.14 });
    flats.push({ mesh: engine.meshFromGeo(fg2), texture: engine.textureFromCanvas(canvas), model: mat4Compose(x, 0, z) });
  };
  for (const yr of [2007, 2011, 2015, 2019, 2023]) makeYearPlate(String(yr), 15.1, tlZ(yr) + 0.9);
  makeYearPlate("TODAY", 15.1, -24.6);

  /* Rich milestone card texture: colored title + white detail lines on a
     rounded translucent panel, with a small accent tab. Two versions per
     card (dim = far, bright = near) so proximity can cross-fade them. */
  const makeCard = (ln, bright) => {
    const W = 512, H = 224, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const x = cv.getContext("2d");
    const [cr, cg, cb] = ln.c;
    const a = bright ? 0.96 : 0.66;
    const round = (rx, ry, rw, rh, rr) => {
      x.beginPath();
      x.moveTo(rx + rr, ry);
      x.arcTo(rx + rw, ry, rx + rw, ry + rh, rr);
      x.arcTo(rx + rw, ry + rh, rx, ry + rh, rr);
      x.arcTo(rx, ry + rh, rx, ry, rr);
      x.arcTo(rx, ry, rx + rw, ry, rr);
      x.closePath();
    };
    x.fillStyle = `rgba(20,16,30,${a})`;
    round(8, 8, W - 16, H - 16, 22); x.fill();
    if (bright) { x.lineWidth = 3; x.strokeStyle = `rgba(${cr},${cg},${cb},0.9)`; x.stroke(); }
    // accent tab
    x.fillStyle = `rgb(${cr},${cg},${cb})`;
    round(26, 30, 12, H - 60, 6); x.fill();
    x.textAlign = "left";
    x.textBaseline = "middle";
    x.fillStyle = bright ? `rgb(${cr},${cg},${cb})` : `rgba(${cr},${cg},${cb},0.82)`;
    x.font = "700 46px 'DejaVu Sans', Arial, sans-serif";
    x.fillText(ln.title, 58, 54);
    x.fillStyle = bright ? "rgba(245,242,255,0.95)" : "rgba(220,215,235,0.7)";
    x.font = "600 32px 'DejaVu Sans', Arial, sans-serif";
    x.fillText(ln.org, 58, 104);
    x.font = "500 30px 'DejaVu Sans', Arial, sans-serif";
    x.fillStyle = bright ? "rgba(210,205,230,0.9)" : "rgba(190,185,210,0.6)";
    x.fillText(ln.years, 58, 146);
    x.font = "italic 500 27px 'DejaVu Sans', Arial, sans-serif";
    x.fillStyle = bright ? `rgba(${cr},${cg},${cb},0.85)` : `rgba(${cr},${cg},${cb},0.5)`;
    x.fillText(ln.note, 58, 186);
    return engine.textureFromCanvas(cv);
  };

  // one shared centered SINGLE-SIDED quad (front face only) so the mirrored
  // back can never overpaint the text; billboarded to face the camera
  const cardGeo = geo();
  {
    const hw = 1.9, hh = 0.83;
    pushQuad(cardGeo, [-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0],
      [1, 1, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  const cardMesh = engine.meshFromGeo(cardGeo);

  const milestones = [];
  LANES.forEach((ln, li) => {
    const [cr, cg, cb] = ln.c;
    milestones.push({
      x: ln.x, z: tlZ(ln.from) + 0.2,
      baseY: 1.5 + (li % 4) * 0.72,
      mesh: cardMesh,
      texDim: makeCard(ln, false),
      texBright: makeCard(ln, true),
      color: [cr / 255, cg / 255, cb / 255],
    });
    // glowing pylon at the lane start
    box(props, 0.22, 1.05, 0.22, [0.16, 0.15, 0.22], { cx: ln.x, cz: tlZ(ln.from) + 0.55 });
    glowPts.push({ x: ln.x, y: 1.0, z: tlZ(ln.from) + 0.55, r: 0.9, color: [cr / 255, cg / 255, cb / 255] });
  });

  /* lane segments for flowing pulse markers (drawn dynamically) */
  const laneSegments = LANES.map((ln) => ({
    x: ln.x, z0: tlZ(ln.from), z1: tlZ(ln.to), color: [ln.c[0] / 255, ln.c[1] / 255, ln.c[2] / 255],
  }));

  /* Turkish flag — crescent & star on a canvas texture */
  const flagCnv = document.createElement("canvas");
  flagCnv.width = 300; flagCnv.height = 200;
  const fc = flagCnv.getContext("2d");
  fc.fillStyle = "#E30A17"; fc.fillRect(0, 0, 300, 200);
  fc.fillStyle = "#fff";
  fc.beginPath(); fc.arc(120, 100, 50, 0, Math.PI * 2); fc.fill();
  fc.fillStyle = "#E30A17";
  fc.beginPath(); fc.arc(132, 100, 40, 0, Math.PI * 2); fc.fill();
  fc.fillStyle = "#fff";
  fc.save(); fc.translate(185, 100); fc.rotate(-Math.PI / 2);
  fc.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI) / 5;
    fc.lineTo(Math.sin(a) * 25, -Math.cos(a) * 25);
  }
  fc.closePath(); fc.fill(); fc.restore();
  const flagGeo = geo();
  billboardQuad(flagGeo, 1.5, 1.0, [1, 1, 1], { cx: 0.78, cy: -1.05 });
  const flag = {
    mesh: engine.meshFromGeo(flagGeo),
    texture: engine.textureFromCanvas(flagCnv),
    x: 4.5, y: 4.55, z: -12,
  };

  /* ================= DYNAMICS ================= */
  const dynamics = [];
  const addDyn = (mesh, x, z, opts = {}) => {
    dynamics.push({
      kind: opts.kind || "obj", id: dynamics.length, knocked: false, rest: 0,
      mesh, texture: opts.texture || null,
      x, y: 0, z, yaw: opts.yaw || 0, pitch: 0, roll: 0,
      vx: 0, vy: 0, vz: 0, wyaw: 0, wpitch: 0,
      r: opts.r || 0.4, h: opts.h || 1, mass: opts.mass || 1,
      x0: x, z0: z, yaw0: opts.yaw || 0,
      scale: opts.scale || 1,
    });
  };

  /* chunky 3D name letters standing on the plaza */
  const letterGeoFor = (ch) => {
    const lg = voxelLetterGeo(ch, 0.3, 0.44, [1.0, 0.99, 0.96]);
    // gentle purple AO only at the very base
    const v = lg.verts;
    for (let i = 0; i < v.length; i += 11) {
      const f = Math.min(1, Math.max(0, v[i + 1] / 0.8));
      v[i + 6] *= 0.78 + 0.22 * f;
      v[i + 7] *= 0.74 + 0.26 * f;
      v[i + 8] *= 0.9 + 0.1 * f;
    }
    return engine.meshFromGeo(lg);
  };
  // one long line, with a word gap — like the BRUNO SIMON letters
  "HAKAN ATAS".split("").forEach((ch, i) => {
    if (ch === " ") return;
    addDyn(letterGeoFor(ch), -9.3 + i * 2.05, -6.5, { r: 0.85, h: 2.1, mass: 1.3, kind: "letter" });
  });

  const pinMesh = engine.meshFromGeo(pinGeo());
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i <= r; i++) {
      addDyn(pinMesh, 8 - r * 0.9, 23 + (i - r / 2) * 1.0, { r: 0.3, h: 0.7, mass: 0.35, kind: "pin" });
    }
  }

  const coneMesh = engine.meshFromGeo(coneGeo());
  for (const [x, z] of [[13, -14], [15.5, -12.5], [18, -14.5], [16, -17]]) {
    addDyn(coneMesh, x, z, { r: 0.32, h: 0.6, mass: 0.3 });
  }

  const crateG = geo();
  box(crateG, 0.85, 0.85, 0.85, [0.72, 0.55, 0.33]);
  box(crateG, 0.9, 0.12, 0.9, [0.6, 0.45, 0.26], { cy: 0.36 });
  const crateMesh = engine.meshFromGeo(crateG);
  for (const [x, z] of [[27, 6.2], [27.8, 7.1], [27.3, 12.3]]) {
    addDyn(crateMesh, x, z, { r: 0.55, h: 0.85, mass: 1.4 });
  }

  /* ================= MOVERS ================= */
  const fg = geo();
  box(fg, 5.4, 0.7, 1.9, [0.2, 0.24, 0.3]);
  box(fg, 4.4, 0.8, 1.5, [0.95, 0.94, 0.9], { cy: 0.7 });
  box(fg, 2.6, 0.6, 1.1, [0.95, 0.94, 0.9], { cy: 1.5 });
  cylinder(fg, 0.18, 0.15, 0.9, 6, [0.85, 0.65, 0.2], { cx: 0.8, cy: 1.9 });
  const ferry = { mesh: engine.meshFromGeo(fg), x: 50, z: 30, yaw: Math.PI };

  /* nostalgic red tram */
  const tg = geo();
  const TRED = [0.72, 0.14, 0.16];
  box(tg, 4.6, 0.5, 1.7, TRED, { cy: 0.25 });
  box(tg, 4.4, 1.3, 1.6, TRED, { cy: 0.75 });
  box(tg, 4.5, 0.16, 1.7, [0.9, 0.88, 0.8], { cy: 2.05 });
  box(tg, 4.7, 0.12, 1.2, [0.35, 0.3, 0.28], { cy: 2.2 });
  for (let i = 0; i < 4; i++) {
    box(tg, 0.7, 0.6, 0.06, [0.75, 0.85, 0.9], { cx: -1.6 + i * 1.07, cy: 1.15, cz: 0.78 });
    box(tg, 0.7, 0.6, 0.06, [0.75, 0.85, 0.9], { cx: -1.6 + i * 1.07, cy: 1.15, cz: -0.78 });
  }
  box(tg, 0.06, 1.0, 0.06, [0.2, 0.2, 0.22], { cy: 2.25 });
  box(tg, 1.2, 0.06, 0.06, [0.2, 0.2, 0.22], { cy: 3.2 });
  for (const wx of [-1.5, 1.5]) {
    for (const wz of [-0.6, 0.6]) {
      const wl = geo();
      cylinder(wl, 0.26, 0.26, 0.12, 8, [0.15, 0.15, 0.18]);
      transformGeo(wl, mat4Compose(wx, 0.26, wz, 0, 0, Math.PI / 2));
      tg.verts.push(...wl.verts);
    }
  }
  const tram = { mesh: engine.meshFromGeo(tg), x: -20, z: 0, dir: 1, speed: 3.2 };

  /* seagull */
  const gg = geo();
  box(gg, 0.3, 0.12, 0.12, [0.95, 0.95, 0.96], { centered: true });
  box(gg, 0.5, 0.04, 0.16, [0.9, 0.9, 0.92], { cx: 0.35, cy: 0.04, centered: true });
  box(gg, 0.5, 0.04, 0.16, [0.9, 0.9, 0.92], { cx: -0.35, cy: 0.04, centered: true });
  box(gg, 0.1, 0.06, 0.06, [0.95, 0.7, 0.2], { cx: 0.2, cy: 0, centered: true });
  const gullMesh = engine.meshFromGeo(gg);

  /* forest house diorama — a little home base on the west side */
  if (models.hasHouse) {
    glbProps.push({ type: "house", x: -38, z: 4, yaw: 0.7, s: 1 });
    collide(-38, 4, 3.6);
  }

  return { groundMesh, groundTexture, waterMesh, propsMesh, skyMesh, signs, flats, milestones, laneSegments, flag, dynamics, colliders, ferry, tram, gullMesh, glowPts, glbTrees, glbProps, debugCanvas: gc };
}
