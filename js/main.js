import { Engine } from "./engine.js";
import { mat4Perspective, mat4LookAt, mat4Multiply, mat4Compose, mat4ShadowY, lerp, clamp } from "./math3d.js";
import { geo, box } from "./meshes.js";
import { buildWorld, ZONES, BOUNDS, PIER } from "./world.js";
import { buildCarMeshes, Car } from "./car.js";
import { AudioSys } from "./audio.js";
import { loadGLB, vertsBounds } from "./glb.js";
import { Achievements } from "./achievements.js";

const canvas = document.getElementById("game");
const params = new URLSearchParams(location.search);

let engine;
try {
  engine = new Engine(canvas);
} catch (e) {
  document.getElementById("nogl").hidden = false;
  document.getElementById("loading").hidden = true;
  throw e;
}

engine.setFog([0.92, 0.72, 0.68], 0.00004);

const LIGHT = [0.72, 0.5, 0.3]; // must match engine's sun
const LIGHT_LEN = Math.hypot(...LIGHT);
const LIGHT_N = LIGHT.map((v) => v / LIGHT_LEN);
/* One projected shadow pass, stencil-deduplicated so overlapping casters
   never double-darken. (Multi-pass jitter for a penumbra was tried and
   renders wrong on this path, so the crisp single pass stays.) */
const SHADOW_MATS = [mat4ShadowY(LIGHT, 0.02)];
const shadowMat = SHADOW_MATS[0];
const SHADOW = { override: [0.2, 0.13, 0.38], alpha: 0.48 }; // purple dusk shadows

/* load Hakan's GLB models (graceful fallback to primitives) */
const loadCard = document.querySelector("#loading .load-card");
const setLoad = (msg) => { if (loadCard) loadCard.textContent = msg; };

const models = {};
let carGLB = null;
setLoad("Modeller yükleniyor…");

/* community tree models (CC-BY, see README credits) */
async function loadTreeType(url, targetH) {
  const g = await loadGLB(url, engine);
  const b = vertsBounds(g.nodes.map((n) => n.verts));
  const s = targetH / (b.maxY - b.minY);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  // group nodes by shared texture and merge each group into ONE mesh, so a
  // 300-node diorama becomes 1-2 draw calls instead of 300
  const groups = new Map();
  for (const n of g.nodes) {
    const key = n.texture || "none";
    if (!groups.has(key)) groups.set(key, { texture: n.texture, verts: [] });
    const dst = groups.get(key).verts;
    const v = n.verts;
    for (let i = 0; i < v.length; i += 11) {
      dst.push((v[i] - cx) * s, (v[i + 1] - b.minY) * s, (v[i + 2] - cz) * s,
        v[i + 3], v[i + 4], v[i + 5], v[i + 6], v[i + 7], v[i + 8], v[i + 9], v[i + 10]);
    }
  }
  return [...groups.values()].map((grp) => ({
    mesh: engine.meshFromGeo({ verts: grp.verts }), texture: grp.texture,
  }));
}
const treeTypes = [];

/* pre-baked props: GLB textures baked to vertex colors offline (tiny JSON) */
const propTypes = {};
async function loadBaked(url, targetH) {
  // eslint-disable-next-line no-use-before-define
  const g = await (await fetch(url)).json();
  const b = vertsBounds([g.verts]);
  const s = targetH / (b.maxY - b.minY);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const v = Float32Array.from(g.verts);
  for (let i = 0; i < v.length; i += 11) {
    v[i] = (v[i] - cx) * s;
    v[i + 1] = (v[i + 1] - b.minY) * s;
    v[i + 2] = (v[i + 2] - cz) * s;
  }
  return [{ mesh: engine.meshFromGeo({ verts: v }), texture: null }];
}
/* fetch + decode everything concurrently (much faster than sequential) */
const [rGalata, rCar, rTree, rLamp, rGrass, rHouse] = await Promise.allSettled([
  loadGLB("assets/galata.glb", engine),
  loadGLB("assets/car.glb", engine),
  loadTreeType("assets/tree1.glb", 4.6),
  loadBaked("assets/lamp.json", 2.9),
  loadBaked("assets/grass.json", 0.5),
  loadTreeType("assets/house.glb", 4.4),
]);
if (rGalata.status === "fulfilled") {
  models.galata = { nodes: rGalata.value.nodes, bounds: vertsBounds(rGalata.value.nodes.map((n) => n.verts)) };
} else console.warn("galata.glb yüklenemedi", rGalata.reason);
if (rCar.status === "fulfilled") carGLB = rCar.value;
else console.warn("car.glb yüklenemedi", rCar.reason);
if (rTree.status === "fulfilled") treeTypes.push(rTree.value);
else console.warn("tree1.glb yüklenemedi", rTree.reason);
if (rLamp.status === "fulfilled") propTypes.lamp = rLamp.value;
else console.warn("lamp yüklenemedi", rLamp.reason);
if (rGrass.status === "fulfilled") propTypes.grass = rGrass.value;
else console.warn("grass yüklenemedi", rGrass.reason);
if (rHouse.status === "fulfilled") propTypes.house = rHouse.value;
else console.warn("house yüklenemedi", rHouse.reason);
models.treeCount = treeTypes.length;
models.hasLamp = !!propTypes.lamp;
models.hasGrass = !!propTypes.grass;
models.hasHouse = !!propTypes.house;
models.hasBench = false;

setLoad("Dünya inşa ediliyor…");
const world = buildWorld(engine, models);

/* static GLB instances (trees + props) with precomputed matrices */
const instanced = [];
for (const t of world.glbTrees) {
  if (treeTypes[t.t]) instanced.push({ parts: treeTypes[t.t], m: mat4Compose(t.x, 0, t.z, t.yaw, 0, 0, t.s) });
}
for (const p of world.glbProps) {
  if (propTypes[p.type]) instanced.push({ parts: propTypes[p.type], m: mat4Compose(p.x, 0, p.z, p.yaw, 0, 0, p.s || 1) });
}
if (params.has("tex")) {
  const dc = world.debugCanvas;
  dc.style.cssText = "position:fixed;inset:0;width:100vw;height:auto;z-index:99;background:#fff";
  document.body.appendChild(dc);
}
const carMeshes = buildCarMeshes(engine, carGLB);
const car = new Car();
const audio = new AudioSys();
const ach = new Achievements(audio);

/* tiny unit meshes for particles & skid marks */
const cubeG = geo(); box(cubeG, 1, 1, 1, [1, 1, 1], { centered: true });
const cubeMesh = engine.meshFromGeo(cubeG);
const quadG = geo(); box(quadG, 0.16, 0.012, 0.55, [0.2, 0.21, 0.24], { centered: true });
const quadMesh = engine.meshFromGeo(quadG);

/* soft radial glow sprite for lanterns & headlights */
const glowCnv = document.createElement("canvas");
glowCnv.width = glowCnv.height = 64;
{
  const gcx = glowCnv.getContext("2d");
  const gr = gcx.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, "rgba(255,255,255,0.9)");
  gr.addColorStop(0.4, "rgba(255,255,255,0.32)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  gcx.fillStyle = gr;
  gcx.fillRect(0, 0, 64, 64);
}
const glowTexture = engine.textureFromCanvas(glowCnv);
const glowG = geo();
// centered camera-facing quad
{
  const x = 0.5;
  const e = 0;
  glowG.verts.push(
    -x, -x, e, 0, 0, 1, 1, 1, 1, 0, 0,
    x, -x, e, 0, 0, 1, 1, 1, 1, 1, 0,
    x, x, e, 0, 0, 1, 1, 1, 1, 1, 1,
    -x, -x, e, 0, 0, 1, 1, 1, 1, 0, 0,
    x, x, e, 0, 0, 1, 1, 1, 1, 1, 1,
    -x, x, e, 0, 0, 1, 1, 1, 1, 0, 1,
  );
}
const glowMesh = engine.meshFromGeo(glowG);

function drawGlow(x, y, z, r, color, alpha = 0.55) {
  const yaw = Math.atan2(cam.x - x, cam.z - z);
  engine.draw(glowMesh, mat4Compose(x, y, z, yaw, 0, 0, r), {
    texture: glowTexture, override: color, alpha, additive: true, noDepthWrite: true,
  });
}

/* debug: ?car=x,z,deg places the car for screenshots */
if (params.get("car")) {
  const [cx, cz, cd] = params.get("car").split(",").map(Number);
  car.reset(cx, cz, ((cd || 0) * Math.PI) / 180);
}

/* ---------- input ---------- */
const input = { steer: 0, throttle: 0, brake: false };
const keys = new Set();
let started = params.has("car") || params.has("shot");
if (started) {
  document.getElementById("intro").classList.add("hidden");
  document.body.classList.add("noanim");
}

window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === "r") { car.reset(); resetDynamics(); }
  if (e.key.toLowerCase() === "m") setMuted(audio.toggleMute());
  if (e.key === "Escape") { closePanel(); ach.toggle(false); }
  start();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

/* debug: ?drive=seconds holds full throttle (for automated screenshots) */
let autoDrive = parseFloat(params.get("drive") || "0");

function readKeys() {
  if (autoDrive > 0) { input.throttle = 1; input.steer = parseFloat(params.get("steer") || "0"); input.brake = params.has("drift"); return; }
  const up = keys.has("w") || keys.has("arrowup");
  const dn = keys.has("s") || keys.has("arrowdown");
  const lf = keys.has("a") || keys.has("arrowleft");
  const rt = keys.has("d") || keys.has("arrowright");
  input.throttle = up ? 1 : dn ? -1 : touch.throttle;
  input.steer = (lf ? -1 : 0) + (rt ? 1 : 0) + touch.steer;
  input.steer = clamp(input.steer, -1, 1);
  input.brake = keys.has(" ");
}

/* touch joystick */
const touch = { steer: 0, throttle: 0 };
const stick = document.getElementById("stick");
const knob = document.getElementById("knob");
if (stick) {
  let active = null;
  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`; };
  stick.addEventListener("pointerdown", (e) => { active = e.pointerId; stick.setPointerCapture(active); start(); });
  stick.addEventListener("pointermove", (e) => {
    if (active !== e.pointerId) return;
    const r = stick.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    touch.steer = dx;
    touch.throttle = -dy;
    setKnob(dx, dy);
  });
  const end = (e) => { if (active === e.pointerId) { active = null; touch.steer = 0; touch.throttle = 0; setKnob(0, 0); } };
  stick.addEventListener("pointerup", end);
  stick.addEventListener("pointercancel", end);
}
document.getElementById("resetBtn")?.addEventListener("click", () => { car.reset(); resetDynamics(); });

const muteBtn = document.getElementById("muteBtn");
function setMuted(m) { muteBtn.textContent = m ? "🔇" : "🔊"; }
muteBtn.addEventListener("click", () => { audio.init(); setMuted(audio.toggleMute()); });
setMuted(audio.muted);

function start() {
  if (!started) {
    started = true;
    document.getElementById("intro").classList.add("hidden");
    ach.bump("start");
  }
  audio.init();
}
document.getElementById("intro").addEventListener("pointerdown", start);

/* ---------- particles (exhaust, confetti) ---------- */
const particles = [];
function spawnParticle(x, y, z, vx, vy, vz, life, size, color) {
  if (particles.length > 220) particles.shift();
  particles.push({ x, y, z, vx, vy, vz, age: 0, life, size, color });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) { particles.splice(i, 1); continue; }
    p.vy -= 3.5 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.y < 0.05) { p.y = 0.05; p.vy = Math.abs(p.vy) * 0.3; }
  }
}

/* ---------- skid marks ---------- */
const skids = [];
let skidTimer = 0;
function addSkids(dt) {
  const fwd = Math.abs(car.speed);
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  const rx = fz, rz = -fx;
  const lat = car.vx * rx + car.vz * rz;
  const drifting = input.brake && fwd > 4 && Math.abs(lat) > 1.6;
  if (!drifting) return;
  skidTimer -= dt;
  if (skidTimer > 0) return;
  skidTimer = 0.028;
  for (const side of [-0.52, 0.52]) {
    const cy = Math.cos(car.yaw), sy = Math.sin(car.yaw);
    const px = car.x + side * cy + (-0.68) * sy;
    const pz = car.z - side * sy + (-0.68) * cy;
    if (skids.length > 260) skids.shift();
    skids.push({ x: px, z: pz, yaw: car.yaw });
  }
}

/* ---------- dynamics physics ---------- */
function resetDynamics() {
  for (const d of world.dynamics) {
    d.x = d.x0; d.z = d.z0; d.y = 0; d.rest = 0;
    d.yaw = d.yaw0; d.pitch = 0; d.roll = 0;
    d.vx = d.vy = d.vz = d.wyaw = d.wpitch = 0;
  }
  skids.length = 0;
}

function updateDynamics(dt) {
  const carSpeed = Math.hypot(car.vx, car.vz);
  for (const d of world.dynamics) {
    const dx = d.x - car.x, dz = d.z - car.z;
    const dist = Math.hypot(dx, dz);
    const minD = d.r + 0.85;
    if (dist < minD && carSpeed > 0.5) {
      const nx = dx / (dist || 1), nz = dz / (dist || 1);
      const push = (carSpeed * 0.6 + 1.0) / d.mass;
      d.vx = car.vx * 0.5 + nx * push * 0.4;
      d.vz = car.vz * 0.5 + nz * push * 0.4;
      d.vy = Math.min(4, push * 0.35 + 1.0);
      d.wyaw = (Math.random() - 0.5) * 7;
      d.wpitch = 3 + Math.random() * 5;
      car.vx *= 0.94; car.vz *= 0.94;
      audio.thump(carSpeed / 8);
      if (!d.knocked) {
        d.knocked = true;
        ach.bump("knock");
        if (d.kind === "letter") ach.mark("letters", d.id);
        if (d.kind === "pin") ach.mark("pins", d.id);
      }
    }
    const moving = Math.abs(d.vx) + Math.abs(d.vy) + Math.abs(d.vz) > 0.01 || d.y > d.rest + 0.001;
    if (!moving) continue;
    d.vy -= 21 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    d.yaw += d.wyaw * dt; d.pitch += d.wpitch * dt;
  }

  /* ---- object vs object: impulses, chain reactions and stacking ---- */
  const list = world.dynamics;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      // only collide if they overlap vertically as well as horizontally
      const aTop = a.y + a.h, bTop = b.y + b.h;
      if (a.y > bTop - 0.06 || b.y > aTop - 0.06) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      let dist = Math.hypot(dx, dz);
      const minD = a.r + b.r;
      if (dist >= minD) continue;
      if (dist < 0.0001) { dx = 0.01; dz = 0; dist = 0.01; }
      const nx = dx / dist, nz = dz / dist;

      // push apart, heavier objects give way less
      const total = a.mass + b.mass;
      const overlap = minD - dist;
      a.x -= nx * overlap * (b.mass / total); a.z -= nz * overlap * (b.mass / total);
      b.x += nx * overlap * (a.mass / total); b.z += nz * overlap * (a.mass / total);

      // exchange momentum along the contact normal
      const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rel < 0) {
        const imp = (-(1 + 0.35) * rel) / total;
        a.vx -= imp * b.mass * nx; a.vz -= imp * b.mass * nz;
        b.vx += imp * a.mass * nx; b.vz += imp * a.mass * nz;
        // a solid knock also sets things spinning and topples them
        const hit = Math.abs(rel);
        if (hit > 0.6) {
          a.wyaw -= rel * 1.2; b.wyaw += rel * 1.2;
          a.wpitch += hit * 0.9; b.wpitch += hit * 0.9;
          if (hit > 1.2) audio.thump(hit / 6);
          for (const o of [a, b]) {
            if (!o.knocked) {
              o.knocked = true;
              ach.bump("knock");
              if (o.kind === "letter") ach.mark("letters", o.id);
              if (o.kind === "pin") ach.mark("pins", o.id);
            }
          }
        }
      }
    }
  }

  /* ---- resting: land on the ground or on top of whatever is below ---- */
  for (const d of list) {
    let support = 0;
    for (const o of list) {
      if (o === d) continue;
      const oTop = o.y + o.h;
      if (oTop > d.y + d.h * 0.5) continue;          // not below us
      if (Math.hypot(o.x - d.x, o.z - d.z) > (o.r + d.r) * 0.8) continue;
      if (oTop > support) support = oTop;
    }
    d.rest = support;
    if (d.y <= support) {
      d.y = support;
      if (d.vy < -2.5) d.vy = -d.vy * 0.32;          // bounce
      else {
        d.vy = 0;
        const fr = support > 0 ? 9 : 6;              // more grip when stacked
        d.vx *= Math.max(0, 1 - fr * dt);
        d.vz *= Math.max(0, 1 - fr * dt);
        d.wyaw *= Math.max(0, 1 - 4 * dt);
        d.wpitch *= Math.max(0, 1 - 4 * dt);
        if (Math.hypot(d.vx, d.vz) < 0.1) { d.vx = d.vz = 0; d.wyaw = 0; d.wpitch = 0; }
      }
    }
  }
}

/* ---------- car vs world ---------- */
function collideCar() {
  const onPierLane = car.z > PIER.minZ && car.z < PIER.maxZ;
  const maxX = onPierLane ? PIER.maxX - 0.6 : BOUNDS.maxX - 0.6;
  const hitWall = (v) => { if (Math.abs(v) > 3) audio.thump(Math.abs(v) / 8); };
  if (car.x < BOUNDS.minX + 0.6) { hitWall(car.vx); car.x = BOUNDS.minX + 0.6; car.vx *= -0.35; }
  if (car.x > maxX) { hitWall(car.vx); car.x = maxX; car.vx *= -0.35; }
  if (car.z < BOUNDS.minZ + 0.6) { hitWall(car.vz); car.z = BOUNDS.minZ + 0.6; car.vz *= -0.35; }
  if (car.z > BOUNDS.maxZ - 0.6) { hitWall(car.vz); car.z = BOUNDS.maxZ - 0.6; car.vz *= -0.35; }

  const solids = world.colliders.concat([{ x: world.tram.x, z: world.tram.z, r: 2.5 }]);
  for (const c of solids) {
    const dx = car.x - c.x, dz = car.z - c.z;
    const dist = Math.hypot(dx, dz);
    const minD = c.r + 0.7;
    if (dist < minD && dist > 0.0001) {
      const nx = dx / dist, nz = dz / dist;
      car.x = c.x + nx * minD;
      car.z = c.z + nz * minD;
      const vn = car.vx * nx + car.vz * nz;
      if (vn < 0) {
        if (vn < -3) audio.thump(-vn / 8);
        car.vx -= 1.4 * vn * nx;
        car.vz -= 1.4 * vn * nz;
      }
    }
  }
}

/* ---------- zones / panels ---------- */
let activeZone = null;
const panelEl = document.getElementById("panel");
const panelBody = document.getElementById("panelBody");
const zoneToast = document.getElementById("zoneToast");

function openPanel(id) {
  const tpl = document.getElementById("content-" + id);
  if (!tpl) return;
  panelBody.innerHTML = "";
  panelBody.appendChild(tpl.content.cloneNode(true));
  panelEl.classList.add("open");
}
function closePanel() { panelEl.classList.remove("open"); }
document.getElementById("panelClose").addEventListener("click", closePanel);

function updateZones() {
  let inside = null;
  for (const z of ZONES) {
    if (Math.hypot(car.x - z.x, car.z - z.z) < z.r) { inside = z; break; }
  }
  if (inside && activeZone !== inside.id) {
    activeZone = inside.id;
    ach.mark("zones", inside.id);
    openPanel(inside.id);
    zoneToast.textContent = inside.label;
    zoneToast.classList.add("show");
    setTimeout(() => zoneToast.classList.remove("show"), 1600);
    audio.chime();
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 4;
      spawnParticle(car.x, 0.5, car.z,
        Math.cos(a) * sp, 3.5 + Math.random() * 3.5, Math.sin(a) * sp,
        0.9 + Math.random() * 0.7, 0.1 + Math.random() * 0.12,
        inside.color.map((c) => clamp(c + (Math.random() - 0.3) * 0.3, 0, 1)));
    }
  } else if (!inside && activeZone) {
    activeZone = null;
    closePanel();
  }
}

/* ---------- camera ---------- */
const cam = { x: 0, y: 7, z: 14, tx: 0, ty: 0, tz: 0 };
let introT = 0;
const freeCam = params.get("cam") ? params.get("cam").split(",").map(Number) : null;

function updateCamera(dt) {
  let ex, ey, ez, tx, ty, tz;
  if (freeCam) {
    [cam.x, cam.y, cam.z, cam.tx, cam.ty, cam.tz] = freeCam;
    return;
  }
  if (!started) {
    introT += dt;
    const a = introT * 0.18;
    ex = Math.sin(a) * 16; ez = Math.cos(a) * 16; ey = 8.5;
    tx = 0; ty = 1; tz = 0;
  } else {
    const back = 7.2, height = 4.2;
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    ex = car.x - fx * back;
    ez = car.z - fz * back;
    ey = height;
    tx = car.x + fx * 3 + car.vx * 0.12;
    tz = car.z + fz * 3 + car.vz * 0.12;
    ty = 0.8;
  }
  const k = started ? Math.min(1, 5 * dt) : 1;
  cam.x = lerp(cam.x, ex, k); cam.y = lerp(cam.y, ey, k); cam.z = lerp(cam.z, ez, k);
  cam.tx = lerp(cam.tx, tx, k); cam.ty = lerp(cam.ty, ty, k); cam.tz = lerp(cam.tz, tz, k);
}

/* ---------- minimap ---------- */
const mmCanvas = document.getElementById("minimap");
const mm = mmCanvas ? mmCanvas.getContext("2d") : null;
const MM = { pad: 16 };

function drawMinimap() {
  if (!mm) return;
  const S = mmCanvas.width;
  mm.clearRect(0, 0, S, S);
  // world → minimap (include the pier strip to the east)
  const wx0 = BOUNDS.minX - 2, wx1 = PIER.maxX + 2;
  const wz0 = BOUNDS.minZ - 2, wz1 = BOUNDS.maxZ + 2;
  const k = Math.min((S - MM.pad * 2) / (wx1 - wx0), (S - MM.pad * 2) / (wz1 - wz0));
  const ox = (S - (wx1 - wx0) * k) / 2, oz = (S - (wz1 - wz0) * k) / 2;
  const px = (x) => ox + (x - wx0) * k;
  const pz = (z) => oz + (z - wz0) * k;

  // land plate + sea strip
  mm.fillStyle = "rgba(226,160,109,0.5)";
  mm.fillRect(px(BOUNDS.minX), pz(BOUNDS.minZ), (BOUNDS.maxX - BOUNDS.minX) * k, (BOUNDS.maxZ - BOUNDS.minZ) * k);
  mm.fillStyle = "rgba(67,173,164,0.55)";
  mm.fillRect(px(BOUNDS.maxX), pz(wz0), (wx1 - BOUNDS.maxX) * k, (wz1 - wz0) * k);

  // roads
  mm.strokeStyle = "rgba(255,236,200,0.55)";
  mm.lineWidth = 2.5;
  for (const [[ax, az], [bx, bz]] of [[[-40, 0], [32, 0]], [[0, -32], [0, 32]], [[-26, -22], [-26, 22]], [[15, -24], [15, -1]], [[1, 9], [24, 9]]]) {
    mm.beginPath(); mm.moveTo(px(ax), pz(az)); mm.lineTo(px(bx), pz(bz)); mm.stroke();
  }

  // zones: visited ones fill in, unvisited ones pulse to invite a visit
  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 420);
  for (const z of ZONES) {
    const col = z.color.map((v) => Math.round(v * 255));
    const seen = ach.state.sets.zones && ach.state.sets.zones[z.id];
    mm.beginPath();
    mm.arc(px(z.x), pz(z.z), z.r * k, 0, Math.PI * 2);
    mm.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${seen ? 0.5 : 0.18 + pulse * 0.22})`;
    mm.fill();
    mm.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},0.95)`;
    mm.lineWidth = seen ? 3 : 2;
    mm.stroke();
    if (!seen) {
      mm.beginPath();
      mm.arc(px(z.x), pz(z.z), z.r * k * (1 + pulse * 0.28), 0, Math.PI * 2);
      mm.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.5 * (1 - pulse)})`;
      mm.lineWidth = 2;
      mm.stroke();
    }
  }

  // car: a heading arrow
  const cx = px(car.x), cy = pz(car.z);
  mm.save();
  mm.translate(cx, cy);
  mm.rotate(-car.yaw + Math.PI);
  mm.fillStyle = "#ff5a4a";
  mm.strokeStyle = "rgba(255,255,255,0.9)";
  mm.lineWidth = 2;
  mm.beginPath();
  mm.moveTo(0, -11); mm.lineTo(8, 9); mm.lineTo(0, 4); mm.lineTo(-8, 9);
  mm.closePath(); mm.fill(); mm.stroke();
  mm.restore();
}

/* ---------- HUD ---------- */
const speedEl = document.getElementById("speed");
let achDist = 0;
if (params.has("ach")) ach.toggle(true);

/* ---------- movers ---------- */
function updateMovers(dt, time) {
  world.ferry.z -= dt * 1.2;
  if (world.ferry.z < -40) world.ferry.z = 42;

  const t = world.tram;
  t.x += t.dir * t.speed * dt;
  if (t.x > 28) t.dir = -1;
  if (t.x < -36) t.dir = 1;
}

/* ---------- exhaust ---------- */
let exhaustTimer = 0;
function updateExhaust(dt) {
  if (input.throttle <= 0 || !started) return;
  exhaustTimer -= dt;
  if (exhaustTimer > 0) return;
  exhaustTimer = 0.07;
  const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
  spawnParticle(
    car.x - fx * 1.15, 0.25, car.z - fz * 1.15,
    -fx * 0.8 + (Math.random() - 0.5), 0.9 + Math.random() * 0.5, -fz * 0.8 + (Math.random() - 0.5),
    0.7 + Math.random() * 0.3, 0.09 + Math.random() * 0.08, [0.62, 0.63, 0.66]);
}

/* ---------- main loop ---------- */
let last = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;
  const time = now / 1000;

  if (started) {
    if (autoDrive > 0) autoDrive -= dt;
    readKeys();
    car.update(input, dt);
    collideCar();
    updateDynamics(dt);
    updateZones();
    addSkids(dt);
    updateExhaust(dt);
    // achievement trackers
    const spd = Math.abs(car.speed);
    achDist += spd * dt;
    if (achDist > 25) { ach.bump("dist", achDist); achDist = 0; }
    if (spd * 4.5 >= 60) ach.top("speed", 1);
    if (car.x > BOUNDS.maxX + 0.5) ach.top("pier", 1);
  }
  updateCamera(dt);
  updateMovers(dt, time);
  updateParticles(dt);
  audio.engine(clamp(Math.abs(car.speed) / 15, 0, 1), dt);

  const aspect = engine.resize();
  const fov = Math.PI / 3.4 + clamp(Math.abs(car.speed) / 15, 0, 1) * 0.1;
  const proj = mat4Perspective(fov, aspect, 0.1, 300);
  const view = mat4LookAt([cam.x, cam.y, cam.z], [cam.tx, cam.ty, cam.tz], [0, 1, 0]);
  const vp = mat4Multiply(proj, view);

  engine.begin(vp, [cam.x, cam.y, cam.z]);
  /* debug: ?only=N caps the draw stages for bisecting visual artifacts */
  const only = parseInt(params.get("only") || "99", 10);

  /* 0 — sunset sky dome with a real sun, halo and drifting cloud bands */
  engine.setTime(time);
  engine.drawSky([0.42, 0.47, 0.88], [1.0, 0.74, 0.58], {
    eye: [cam.x, cam.y, cam.z], target: [cam.tx, cam.ty, cam.tz],
    fov, aspect, sun: LIGHT_N, time,
  });

  /* 1 — painted ground, then the living sea on top of the painted water */
  engine.draw(world.groundMesh, mat4Compose(0, 0, 0), { texture: world.groundTexture });
  engine.draw(world.waterMesh, mat4Compose(0, 0, 0), { water: true });

  /* 2 — skid marks */
  for (const s of skids) {
    engine.draw(quadMesh, mat4Compose(s.x, 0.018, s.z, s.yaw, 0, 0, 1), { alpha: 0.3, noDepthWrite: true, override: [0.2, 0.21, 0.24] });
  }

  const cm = car.matrices(carMeshes.fromGLB ? carMeshes.wheelPos : undefined);

  /* 3 — projected shadows (each pixel darkened once via stencil) */
  if (!params.has("nosh")) {
  engine.beginShadows(SHADOW_MATS.length);
  for (const sm of SHADOW_MATS) {
    engine.draw(world.propsMesh, sm, SHADOW);
    for (const s of world.signs) engine.draw(s.mesh, mat4Multiply(sm, s.model), SHADOW);
    for (const d of world.dynamics) {
      engine.draw(d.mesh, mat4Multiply(sm, mat4Compose(d.x, d.y, d.z, d.yaw, d.pitch, d.roll, d.scale)), SHADOW);
    }
    engine.draw(carMeshes.body, mat4Multiply(sm, cm.body), SHADOW);
    engine.draw(world.tram.mesh, mat4Multiply(sm, mat4Compose(world.tram.x, 0, world.tram.z)), SHADOW);
    for (const inst of instanced) {
      const m = mat4Multiply(sm, inst.m);
      for (const p of inst.parts) engine.draw(p.mesh, m, p.texture ? { ...SHADOW, texture: p.texture } : SHADOW);
    }
  }
  engine.endShadows();
  }

  /* 4 — solid world */
  if (only >= 2) engine.draw(world.propsMesh, mat4Compose(0, 0, 0));
  for (const inst of instanced) {
    for (const p of inst.parts) engine.draw(p.mesh, inst.m, p.texture ? { texture: p.texture } : {});
  }
  if (only >= 3) engine.draw(world.skyMesh, mat4Compose(0, 0, 0));
  if (only >= 4) for (const s of world.signs) engine.draw(s.mesh, s.model, { texture: s.texture });
  if (only < 5) { requestAnimationFrame(frame); return; }

  /* timeline year plates (flat road decals) */
  for (const f of world.flats) engine.draw(f.mesh, f.model, { texture: f.texture });

  /* flowing pulse markers travelling along each career lane */
  for (const seg of world.laneSegments) {
    const span = seg.z1 - seg.z0;
    for (let k = 0; k < 3; k++) {
      const t = ((time * 0.22 + k / 3) % 1);
      const pz = seg.z0 + span * t;
      const fade = Math.sin(t * Math.PI); // dim at both ends
      drawGlow(seg.x, 0.12, pz, 0.5 + fade * 0.3, seg.color, 0.35 * fade + 0.15);
    }
  }

  /* interactive milestone cards: camera-facing, grow + brighten near the car.
     Sorted far→near so nearer cards paint on top. */
  const msByDist = world.milestones
    .map((m) => ({ m, d: Math.hypot(car.x - m.x, car.z - m.z) }))
    .sort((a, b) => b.d - a.d);
  for (const { m, d } of msByDist) {
    const near = clamp(1 - (d - 2) / 7, 0, 1);          // 1 when close, 0 when far
    const yaw = Math.atan2(cam.x - m.x, cam.z - m.z);
    const bob = Math.sin(time * 1.4 + m.x) * 0.06;
    const y = m.baseY + near * 0.5 + bob;
    const scale = 0.5 + near * 0.62;                     // distant cards shrink
    engine.draw(m.mesh, mat4Compose(m.x, y, m.z, yaw, 0, 0, scale), { texture: m.texDim, noDepthWrite: true });
    if (near > 0.01) {
      engine.draw(m.mesh, mat4Compose(m.x, y, m.z, yaw, 0, 0, scale * 1.001),
        { texture: m.texBright, alpha: near, noDepthWrite: true });
    }
    if (near > 0.55) drawGlow(m.x, y - 0.85, m.z, 1.0, m.color, (near - 0.55) * 0.6);
  }

  /* flag with a gentle flutter */
  engine.draw(world.flag.mesh,
    mat4Compose(world.flag.x, world.flag.y, world.flag.z, Math.sin(time * 1.7) * 0.18 - 0.4),
    { texture: world.flag.texture });

  for (const d of world.dynamics) {
    engine.draw(d.mesh, mat4Compose(d.x, d.y, d.z, d.yaw, d.pitch, d.roll, d.scale), d.texture ? { texture: d.texture } : {});
  }

  /* ferry rides the same swell the water shader draws, and leaves a wake */
  {
    const f = world.ferry;
    const swellAt = (x, z) =>
      Math.sin(x * 0.42 + time * 0.85) * 0.34 +
      Math.sin(z * 0.31 - time * 0.63 + x * 0.12) * 0.34 +
      Math.sin(x * 0.7 + z * 0.55 + time * 1.35) * 0.2;
    const s0 = swellAt(f.x, f.z);
    const pitch = (swellAt(f.x, f.z - 2.4) - swellAt(f.x, f.z + 2.4)) * 0.06;
    const roll = (swellAt(f.x - 1, f.z) - swellAt(f.x + 1, f.z)) * 0.05;
    engine.draw(f.mesh, mat4Compose(f.x, -0.2 + s0 * 0.09, f.z, f.yaw, pitch, roll));
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      drawGlow(f.x + (i % 2 ? 0.8 : -0.8), 0.06, f.z + 3.2 + i * 1.5,
        1.0 + i * 0.5, [0.95, 1.0, 1.0], 0.22 * (1 - t));
    }
  }
  engine.draw(world.tram.mesh, mat4Compose(world.tram.x, 0, world.tram.z));

  /* seagulls circling over the water */
  for (let i = 0; i < 3; i++) {
    const a = time * (0.35 + i * 0.07) + i * 2.1;
    const gx = 44 + Math.cos(a) * (6 + i * 3);
    const gz = 4 + Math.sin(a) * (8 + i * 2);
    const gy = 6 + i * 1.4 + Math.sin(time * 2 + i) * 0.5;
    engine.draw(world.gullMesh, mat4Compose(gx, gy, gz, -a - Math.PI / 2, 0, Math.sin(time * 6 + i) * 0.25, 1.1));
  }

  /* car */
  if (carMeshes.fromGLB) {
    engine.draw(carMeshes.body, cm.body, { texture: carMeshes.bodyTexture });
    cm.wheels.forEach((w, i) => {
      const side = carMeshes.wheelPos[i][0] < 0 ? carMeshes.wheelR : carMeshes.wheelL;
      engine.draw(side.mesh, w, { texture: side.texture });
    });
  } else {
    engine.draw(carMeshes.body, cm.body);
    for (const w of cm.wheels) engine.draw(carMeshes.wheel, w);
  }

  /* glows: lanterns + headlights + taillights */
  for (const g of world.glowPts) drawGlow(g.x, g.y, g.z, g.r, g.color, 0.5);
  {
    const fx = Math.sin(car.yaw), fz = Math.cos(car.yaw);
    const rxv = fz, rzv = -fx;
    for (const side of [-0.36, 0.36]) {
      drawGlow(car.x + fx * 1.12 + rxv * side, 0.62, car.z + fz * 1.12 + rzv * side, 0.55, [1, 0.85, 0.5], 0.5);
    }
    if (input.brake) {
      for (const side of [-0.36, 0.36]) {
        drawGlow(car.x - fx * 1.12 + rxv * side, 0.62, car.z - fz * 1.12 + rzv * side, 0.45, [1, 0.25, 0.2], 0.5);
      }
    }
  }

  /* particles */
  for (const p of particles) {
    const t01 = p.age / p.life;
    engine.draw(cubeMesh, mat4Compose(p.x, p.y, p.z, p.age * 3, p.age * 2, 0, p.size * (1 + t01)), {
      override: p.color, alpha: 0.85 * (1 - t01), noDepthWrite: true,
    });
  }

  /* final touch — warm grade + vignette, then the minimap */
  engine.drawVignette();
  drawMinimap();

  if (speedEl) speedEl.textContent = Math.round(Math.abs(car.speed) * 4.5) + " km/h";

  requestAnimationFrame(frame);
}

/* debug: ?warp=seconds pre-simulates physics deterministically */
const warp = parseFloat(params.get("warp") || "0");
if (warp > 0) {
  const step = 1 / 60;
  for (let t = 0; t < warp; t += step) {
    if (autoDrive > 0) autoDrive -= step;
    readKeys();
    car.update(input, step);
    collideCar();
    updateDynamics(step);
    updateZones();
    addSkids(step);
    updateMovers(step, t);
  }
  updateCamera(1);
}

document.getElementById("loading").classList.add("hidden");
requestAnimationFrame(frame);
