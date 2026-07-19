import { Engine } from "./engine.js";
import { mat4Perspective, mat4LookAt, mat4Multiply, mat4Compose, lerp, clamp } from "./math3d.js";
import { buildWorld, ZONES, BOUNDS, PIER } from "./world.js";
import { buildCarMeshes, Car } from "./car.js";

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

engine.setFog([0.8, 0.88, 0.93], 0.000012);

const world = buildWorld(engine);
const carMeshes = buildCarMeshes(engine);
const car = new Car();

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
  document.body.classList.add("noanim"); // instant overlays for screenshots
}

window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === "r") { car.reset(); resetDynamics(); }
  if (e.key === "Escape") closePanel();
  start();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

/* debug: ?drive=seconds holds full throttle (for automated screenshots) */
let autoDrive = parseFloat(params.get("drive") || "0");

function readKeys() {
  if (autoDrive > 0) { input.throttle = 1; input.steer = parseFloat(params.get("steer") || "0"); input.brake = false; return; }
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

function start() {
  if (started) return;
  started = true;
  document.getElementById("intro").classList.add("hidden");
}
document.getElementById("intro").addEventListener("pointerdown", start);

/* ---------- dynamics physics ---------- */
function resetDynamics() {
  for (const d of world.dynamics) {
    d.x = d.x0; d.z = d.z0; d.y = 0;
    d.yaw = d.yaw0; d.pitch = 0; d.roll = 0;
    d.vx = d.vy = d.vz = d.wyaw = d.wpitch = 0;
  }
}

function updateDynamics(dt) {
  const carSpeed = Math.hypot(car.vx, car.vz);
  for (const d of world.dynamics) {
    // car impact
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
      // gentle car slowdown
      car.vx *= 0.94; car.vz *= 0.94;
    }
    // integrate
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
        // settle flat-ish: keep tumbled pose but stop spinning at low energy
        if (Math.hypot(d.vx, d.vz) < 0.1) { d.vx = d.vz = 0; d.wyaw = 0; d.wpitch = 0; }
      }
    }
  }
}

/* ---------- car vs world ---------- */
function collideCar() {
  // bounds (pier extends east)
  const onPierLane = car.z > PIER.minZ && car.z < PIER.maxZ;
  const maxX = onPierLane ? PIER.maxX - 0.6 : BOUNDS.maxX - 0.6;
  const bounce = (axis, lim, dir) => {
    if (dir > 0 ? car[axis] > lim : car[axis] < lim) {
      car[axis] = lim;
      const v = axis === "x" ? "vx" : "vz";
      car[v] *= -0.35;
    }
  };
  bounce("x", BOUNDS.minX + 0.6, -1);
  bounce("x", maxX, 1);
  bounce("z", BOUNDS.minZ + 0.6, -1);
  bounce("z", BOUNDS.maxZ - 0.6, 1);
  // if beyond land edge but not on pier lane, block at land edge
  if (car.x > BOUNDS.maxX - 0.6 && !onPierLane) { car.x = BOUNDS.maxX - 0.6; car.vx *= -0.35; }

  for (const c of world.colliders) {
    const dx = car.x - c.x, dz = car.z - c.z;
    const dist = Math.hypot(dx, dz);
    const minD = c.r + 0.7;
    if (dist < minD && dist > 0.0001) {
      const nx = dx / dist, nz = dz / dist;
      car.x = c.x + nx * minD;
      car.z = c.z + nz * minD;
      const vn = car.vx * nx + car.vz * nz;
      if (vn < 0) { car.vx -= 1.4 * vn * nx; car.vz -= 1.4 * vn * nz; }
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
  } else if (!inside && activeZone) {
    activeZone = null;
    closePanel();
  }
}

/* ---------- camera ---------- */
const cam = { x: 0, y: 7, z: 14, tx: 0, ty: 0, tz: 0 };
let introT = 0;

/* debug: ?cam=x,y,z,tx,ty,tz free camera for screenshots */
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

/* ---------- main loop ---------- */
let last = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
  last = now;

  if (started) {
    if (autoDrive > 0) autoDrive -= dt;
    readKeys();
    car.update(input, dt);
    collideCar();
    updateDynamics(dt);
    updateZones();
  }
  updateCamera(dt);

  // ferry drifts along the shore
  world.ferry.z -= dt * 1.2;
  if (world.ferry.z < -40) world.ferry.z = 42;

  const aspect = engine.resize();
  const proj = mat4Perspective(Math.PI / 3.4, aspect, 0.1, 260);
  const view = mat4LookAt([cam.x, cam.y, cam.z], [cam.tx, cam.ty, cam.tz], [0, 1, 0]);
  const vp = mat4Multiply(proj, view);

  engine.begin(vp);
  engine.draw(world.staticMesh, mat4Compose(0, 0, 0));

  for (const s of world.signs) engine.draw(s.mesh, s.model, { texture: s.texture });

  // shadows first (no depth write)
  const shOpts = { alpha: 0.22, noDepthWrite: true };
  engine.draw(world.shadowMesh, mat4Compose(car.x, 0.015, car.z, car.yaw, 0, 0, 1.15), shOpts);
  for (const d of world.dynamics) {
    const s = d.r * 1.6 * Math.max(0.4, 1 - d.y * 0.18);
    engine.draw(world.shadowMesh, mat4Compose(d.x, 0.015, d.z, 0, 0, 0, s), shOpts);
  }

  for (const d of world.dynamics) {
    engine.draw(d.mesh, mat4Compose(d.x, d.y, d.z, d.yaw, d.pitch, d.roll, d.scale), d.texture ? { texture: d.texture } : {});
  }

  engine.draw(world.ferry.mesh, mat4Compose(world.ferry.x, -0.15, world.ferry.z, world.ferry.yaw));

  const cm = car.matrices();
  engine.draw(carMeshes.body, cm.body);
  for (const w of cm.wheels) engine.draw(carMeshes.wheel, w);

  if (speedEl) speedEl.textContent = Math.round(Math.abs(car.speed) * 4.5) + " km/h";

  requestAnimationFrame(frame);
}

/* debug: ?warp=seconds pre-simulates physics deterministically before the
   first frame (with ?drive/?steer applied) — used for automated testing. */
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
  }
  updateCamera(1); // snap camera
}

document.getElementById("loading").classList.add("hidden");
requestAnimationFrame(frame);
