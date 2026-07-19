/* The toy car: mesh parts + arcade driving physics. */

import { geo, box, cylinder, transformGeo } from "./meshes.js";
import { mat4Compose, clamp } from "./math3d.js";

export function buildCarMeshes(engine) {
  const bodyG = geo();
  const RED = [0.85, 0.24, 0.2];
  const DARK = [0.16, 0.17, 0.2];
  const GLASS = [0.62, 0.78, 0.86];

  box(bodyG, 1.1, 0.34, 2.05, RED, { cy: 0.24 });                 // chassis
  box(bodyG, 1.02, 0.1, 2.1, DARK, { cy: 0.16 });                 // skirt
  box(bodyG, 0.92, 0.42, 1.05, RED, { cy: 0.58, cz: -0.12 });     // cabin
  box(bodyG, 0.84, 0.3, 0.95, GLASS, { cy: 0.62, cz: -0.12 });    // windows
  box(bodyG, 0.92, 0.1, 1.15, RED, { cy: 0.9, cz: -0.12 });       // roof
  box(bodyG, 1.0, 0.18, 0.5, RED, { cy: 0.44, cz: 0.75 });        // hood
  box(bodyG, 0.16, 0.12, 0.06, [1, 0.9, 0.6], { cx: -0.34, cy: 0.34, cz: 1.03 }); // headlights
  box(bodyG, 0.16, 0.12, 0.06, [1, 0.9, 0.6], { cx: 0.34, cy: 0.34, cz: 1.03 });
  box(bodyG, 0.16, 0.1, 0.05, [0.9, 0.2, 0.15], { cx: -0.34, cy: 0.36, cz: -1.03 }); // taillights
  box(bodyG, 0.16, 0.1, 0.05, [0.9, 0.2, 0.15], { cx: 0.34, cy: 0.36, cz: -1.03 });
  box(bodyG, 0.5, 0.06, 0.12, [0.9, 0.88, 0.8], { cy: 0.3, cz: 1.06 });  // bumper

  const wheelG = geo();
  const wl = geo();
  cylinder(wl, 0.24, 0.24, 0.18, 10, DARK, { cap: true });
  cylinder(wl, 0.12, 0.12, 0.19, 8, [0.75, 0.75, 0.78], { cy: -0.005 });
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
    const steerPow = clamp(Math.abs(fwd) / 5, 0, 1) * Math.sign(fwd || 1);
    this.yaw += input.steer * 1.9 * steerPow * dt;

    // recompose velocity (heading may have changed)
    const fx2 = Math.sin(this.yaw), fz2 = Math.cos(this.yaw);
    const rx2 = fz2, rz2 = -fx2;
    this.vx = fx2 * fwd + rx2 * lat;
    this.vz = fz2 * fwd + rz2 * lat;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // cosmetics
    this.wheelSpin += fwd * dt / 0.24;
    this.steerVisual += (input.steer * 0.45 - this.steerVisual) * Math.min(1, 12 * dt);
    this.roll += (-input.steer * clamp(fwd / MAXF, -1, 1) * 0.055 - this.roll) * Math.min(1, 8 * dt);
    this.pitch += (clamp((this.prevFwd ?? 0) - fwd, -1, 1) * 0.12 - this.pitch) * Math.min(1, 6 * dt);
    this.prevFwd = fwd;
  }

  /* model matrices for body + 4 wheels */
  matrices() {
    const m = [];
    const body = mat4Compose(this.x, 0.06 + 0, this.z, this.yaw, this.pitch, this.roll);
    const wheelPos = [
      [-0.52, 0.24, 0.68, true], [0.52, 0.24, 0.68, true],   // front
      [-0.52, 0.24, -0.68, false], [0.52, 0.24, -0.68, false], // rear
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
