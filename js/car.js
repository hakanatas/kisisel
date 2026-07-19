/* The toy car: mesh parts + arcade driving physics. */

import { geo, box, cylinder, transformGeo } from "./meshes.js";
import { mat4Compose, clamp } from "./math3d.js";

export function buildCarMeshes(engine) {
  const bodyG = geo();
  const RED = [0.82, 0.18, 0.16];
  const RED2 = [0.6, 0.12, 0.12];
  const DARK = [0.14, 0.13, 0.18];
  const GLASS = [0.32, 0.3, 0.46];

  // off-road truck: high clearance, chunky arches, roof rack
  box(bodyG, 1.16, 0.4, 2.15, RED, { cy: 0.4 });                   // main body
  box(bodyG, 1.06, 0.14, 2.2, DARK, { cy: 0.3 });                  // skirt
  box(bodyG, 0.98, 0.44, 1.0, RED, { cy: 0.78, cz: -0.18 });       // cabin
  box(bodyG, 0.9, 0.3, 0.92, GLASS, { cy: 0.84, cz: -0.18 });      // windows
  box(bodyG, 0.98, 0.1, 1.08, RED2, { cy: 1.2, cz: -0.18 });       // roof
  box(bodyG, 1.02, 0.16, 0.62, RED2, { cy: 0.7, cz: 0.68 });       // hood
  box(bodyG, 0.34, 0.05, 0.4, DARK, { cy: 0.79, cz: 0.66 });       // hood vent
  // wheel arches
  for (const az of [0.72, -0.72]) {
    for (const ax of [-0.62, 0.62]) {
      box(bodyG, 0.24, 0.12, 0.78, DARK, { cx: ax, cy: 0.56, cz: az });
    }
  }
  // roof rack + light bar
  for (const [rx, rz] of [[-0.42, 0.28], [0.42, 0.28], [-0.42, -0.62], [0.42, -0.62]]) {
    box(bodyG, 0.07, 0.16, 0.07, DARK, { cx: rx, cy: 1.25, cz: rz - 0.18 + 0.18 });
  }
  box(bodyG, 0.98, 0.07, 1.0, DARK, { cy: 1.4, cz: -0.16 });
  for (let i = 0; i < 4; i++) {
    box(bodyG, 0.14, 0.1, 0.12, [1, 0.85, 0.4], { cx: -0.33 + i * 0.22, cy: 1.46, cz: 0.3 });
  }
  box(bodyG, 0.2, 0.12, 0.08, [1, 0.88, 0.5], { cx: -0.36, cy: 0.62, cz: 1.1 });  // headlights
  box(bodyG, 0.2, 0.12, 0.08, [1, 0.88, 0.5], { cx: 0.36, cy: 0.62, cz: 1.1 });
  box(bodyG, 0.2, 0.1, 0.06, [0.95, 0.2, 0.18], { cx: -0.36, cy: 0.62, cz: -1.1 }); // taillights
  box(bodyG, 0.2, 0.1, 0.06, [0.95, 0.2, 0.18], { cx: 0.36, cy: 0.62, cz: -1.1 });
  box(bodyG, 0.9, 0.1, 0.14, [0.55, 0.52, 0.58], { cy: 0.42, cz: 1.12 });  // bumpers
  box(bodyG, 0.9, 0.1, 0.12, [0.55, 0.52, 0.58], { cy: 0.42, cz: -1.12 });

  const wheelG = geo();
  const wl = geo();
  cylinder(wl, 0.3, 0.3, 0.24, 10, DARK, { cap: true });
  cylinder(wl, 0.15, 0.15, 0.25, 8, [0.72, 0.2, 0.18], { cy: -0.005 });
  cylinder(wl, 0.06, 0.06, 0.26, 6, [0.85, 0.82, 0.8], { cy: -0.01 });
  transformGeo(wl, mat4Compose(0, 0, 0, 0, 0, Math.PI / 2));
  wheelG.verts.push(...wl.verts);

  return {
    body: engine.meshFromGeo(bodyG),
    wheel: engine.meshFromGeo(wheelG),
  };
}

export class Car {
  constructor() {
    this.reset();
    this.wheelSpin = 0;
    this.steerVisual = 0;
    this.roll = 0;
    this.pitch = 0;
  }

  reset(x = 0, z = 2, yaw = Math.PI) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.vx = 0; this.vz = 0;
  }

  get speed() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    return this.vx * fx + this.vz * fz;
  }

  update(input, dt) {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = fz, rz = -fx; // right vector

    let fwd = this.vx * fx + this.vz * fz;   // signed forward speed
    let lat = this.vx * rx + this.vz * rz;   // lateral speed

    // throttle / brake-reverse
    const MAXF = 15, MAXR = -6;
    if (input.throttle > 0) fwd += 17 * input.throttle * dt;
    if (input.throttle < 0) fwd += 13 * input.throttle * dt;
    fwd = clamp(fwd, MAXR, MAXF);

    // resistance
    const drag = input.brake ? 4.5 : 0.7;
    fwd -= fwd * drag * dt;
    if (Math.abs(fwd) < 0.02 && input.throttle === 0) fwd = 0;

    // tyre grip: bleed lateral velocity (softer while braking = little drifts)
    const grip = input.brake ? 3.2 : 9;
    lat -= lat * Math.min(1, grip * dt);

    // steering scaled by speed, flips in reverse
    // (positive yaw turns toward -x, which reads as screen-left behind the
    // car — so steer right must *decrease* yaw)
    const steerPow = clamp(Math.abs(fwd) / 5, 0, 1) * Math.sign(fwd || 1);
    this.yaw -= input.steer * 1.9 * steerPow * dt;

    // recompose velocity (heading may have changed)
    const fx2 = Math.sin(this.yaw), fz2 = Math.cos(this.yaw);
    const rx2 = fz2, rz2 = -fx2;
    this.vx = fx2 * fwd + rx2 * lat;
    this.vz = fz2 * fwd + rz2 * lat;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // cosmetics
    this.wheelSpin += fwd * dt / 0.24;
    this.steerVisual += (-input.steer * 0.45 - this.steerVisual) * Math.min(1, 12 * dt);
    this.roll += (input.steer * clamp(fwd / MAXF, -1, 1) * 0.055 - this.roll) * Math.min(1, 8 * dt);
    this.pitch += (clamp((this.prevFwd ?? 0) - fwd, -1, 1) * 0.12 - this.pitch) * Math.min(1, 6 * dt);
    this.prevFwd = fwd;
  }

  /* model matrices for body + 4 wheels */
  matrices() {
    const m = [];
    const body = mat4Compose(this.x, 0.06 + 0, this.z, this.yaw, this.pitch, this.roll);
    const wheelPos = [
      [-0.58, 0.3, 0.72, true], [0.58, 0.3, 0.72, true],   // front
      [-0.58, 0.3, -0.72, false], [0.58, 0.3, -0.72, false], // rear
    ];
    const wheels = wheelPos.map(([wx, wy, wz, front]) => {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      const px = this.x + wx * cy + wz * sy;
      const pz = this.z - wx * sy + wz * cy;
      return mat4Compose(px, wy, pz, this.yaw + (front ? this.steerVisual : 0), this.wheelSpin % (Math.PI * 2), 0);
    });
    return { body, wheels };
  }
}
