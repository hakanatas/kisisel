import { Engine } from "./engine.js";
import { mat4Perspective, mat4LookAt, mat4Multiply, mat4Compose, mat4ShadowY, lerp, clamp } from "./math3d.js";
import { geo, box } from "./meshes.js";
import { buildWorld, ZONES, BOUNDS, PIER } from "./world.js";
import { buildCarMeshes, Car } from "./car.js";
import { AudioSys } from "./audio.js";

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

engine.setFog([0.8, 0.88, 0.93], 0.00004);

const LIGHT = [0.5, 0.82, 0.28];
const shadowMat = mat4ShadowY(LIGHT, 0.02);
const SHADOW = { override: [0.16, 0.17, 0.22], alpha: 0.38 };

const world = buildWorld(engine);
if (params.has("tex")) {
  const dc = world.debugCanvas;
  dc.style.cssText = "position:fixed;inset:0;width:100vw;height:auto;z-index:99;background:#fff";
  document.body.appendChild(dc);
}
const carMeshes = buildCarMeshes(engine);
const car = new Car();
const audio = new AudioSys();

/* tiny unit meshes for particles & skid marks */
const cubeG = geo(); box(cubeG, 1, 1, 1, [1, 1, 1], { centered: true });
const cubeMesh = engine.meshFromGeo(cubeG);
const quadG = geo(); box(quadG, 0.16, 0.012, 0.55, [0.2, 0.21, 0.24], { centered: true });
const quadMesh = engine.meshFromGeo(quadG);

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
  if (e.key === "Escape") closePanel();
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
    d.x = d.x0; d.z = d.z0; d.y = 0;
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
    }
    const moving = Math.abs(d.vx) + Math.abs(d.vy) + Math.abs(d.vz) > 0.01 || d.y > 0.001;
    if (!moving) continue;
    d.vy -= 21 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    d.yaw += d.wyaw * dt; d.pitch += d.wpitch * dt;
    if (d.y <= 0) {
      d.y = 0;
      if (d.vy < -2.5) d.vy = -d.vy * 0.35;
      else {
        d.vy = 0;
        d.vx *= Math.max(0, 1 - 6 * dt);
        d.vz *= Math.max(0, 1 - 6 * dt);
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

/* ---------- HUD ---------- */
const speedEl = document.getElementById("speed");

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

  /* 0 — sky gradient behind everything */
  engine.drawSky([0.55, 0.75, 0.92], [0.87, 0.9, 0.9]);

  /* 1 — painted ground */
  engine.draw(world.groundMesh, mat4Compose(0, 0, 0), { texture: world.groundTexture });

  /* 2 — skid marks */
  for (const s of skids) {
    engine.draw(quadMesh, mat4Compose(s.x, 0.018, s.z, s.yaw, 0, 0, 1), { alpha: 0.3, noDepthWrite: true, override: [0.2, 0.21, 0.24] });
  }

  const cm = car.matrices();

  /* 3 — projected shadows (each pixel darkened once via stencil) */
  if (!params.has("nosh")) {
  engine.beginShadows();
  engine.draw(world.propsMesh, shadowMat, SHADOW);
  for (const s of world.signs) engine.draw(s.mesh, mat4Multiply(shadowMat, s.model), SHADOW);
  for (const d of world.dynamics) {
    engine.draw(d.mesh, mat4Multiply(shadowMat, mat4Compose(d.x, d.y, d.z, d.yaw, d.pitch, d.roll, d.scale)), SHADOW);
  }
  engine.draw(carMeshes.body, mat4Multiply(shadowMat, cm.body), SHADOW);
  engine.draw(world.tram.mesh, mat4Multiply(shadowMat, mat4Compose(world.tram.x, 0, world.tram.z)), SHADOW);
  engine.endShadows();
  }

  /* 4 — solid world */
  if (only >= 2) engine.draw(world.propsMesh, mat4Compose(0, 0, 0));
  if (only >= 3) engine.draw(world.skyMesh, mat4Compose(0, 0, 0));
  if (only >= 4) for (const s of world.signs) engine.draw(s.mesh, s.model, { texture: s.texture });
  if (only < 5) { requestAnimationFrame(frame); return; }

  /* flag with a gentle flutter */
  engine.draw(world.flag.mesh,
    mat4Compose(world.flag.x, world.flag.y, world.flag.z, Math.sin(time * 1.7) * 0.18 - 0.4),
    { texture: world.flag.texture });

  for (const d of world.dynamics) {
    engine.draw(d.mesh, mat4Compose(d.x, d.y, d.z, d.yaw, d.pitch, d.roll, d.scale), d.texture ? { texture: d.texture } : {});
  }

  engine.draw(world.ferry.mesh, mat4Compose(world.ferry.x, -0.15, world.ferry.z, world.ferry.yaw));
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
  engine.draw(carMeshes.body, cm.body);
  for (const w of cm.wheels) engine.draw(carMeshes.wheel, w);

  /* particles */
  for (const p of particles) {
    const t01 = p.age / p.life;
    engine.draw(cubeMesh, mat4Compose(p.x, p.y, p.z, p.age * 3, p.age * 2, 0, p.size * (1 + t01)), {
      override: p.color, alpha: 0.85 * (1 - t01), noDepthWrite: true,
    });
  }

  /* final touch — vignette */
  engine.drawVignette();

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
