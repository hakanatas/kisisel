/* ============================================================
   Interactive journey scene — a cyclist rides through a layered
   landscape as you scroll. Day/night follows the theme toggle.
   Pure canvas, no dependencies.
   ============================================================ */

(function () {
  const canvas = document.getElementById("scene");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0, H = 0, DPR = 1;
  let scrollY = 0;
  let time = 0;
  let nightT = root.dataset.theme === "dark" ? 1 : 0; // 0 = day, 1 = night

  const SPEED = 1.4;              // world px per scroll px
  const KM_PER_WORLD = 0.0006;    // odometer scale

  /* ---------- palette (day, night) ---------- */
  const P = {
    skyTop:    [[132, 200, 240], [8, 12, 34]],
    skyBottom: [[233, 246, 255], [30, 42, 74]],
    sun:       [[255, 214, 90],  [244, 241, 222]],
    farRidge:  [[156, 195, 221], [26, 42, 70]],
    midHill:   [[121, 184, 132], [22, 52, 66]],
    field:     [[142, 201, 122], [18, 56, 44]],
    road:      [[90, 100, 114],  [40, 46, 60]],
    roadEdge:  [[232, 228, 216], [130, 140, 160]],
    canopy:    [[63, 143, 95],   [26, 74, 58]],
    pine:      [[47, 122, 87],   [20, 64, 52]],
    trunk:     [[122, 91, 62],   [52, 48, 60]],
    bush:      [[86, 158, 96],   [14, 44, 36]],
    cloud:     [[255, 255, 255], [52, 62, 92]],
    rider:     [[43, 47, 56],    [16, 20, 30]],
    jersey:    [[232, 176, 75],  [232, 176, 75]],
    signBoard: [[248, 246, 238], [36, 44, 62]],
    signText:  [[60, 64, 74],    [214, 220, 232]],
    post:      [[110, 96, 80],   [58, 62, 76]],
  };

  function col(name, a) {
    const [d, n] = P[name];
    const r = Math.round(d[0] + (n[0] - d[0]) * nightT);
    const g = Math.round(d[1] + (n[1] - d[1]) * nightT);
    const b = Math.round(d[2] + (n[2] - d[2]) * nightT);
    return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
  }

  const hash = (n) => {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  };

  /* ---------- layout-dependent values ---------- */
  let roadY, riderScale, signs = [];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    roadY = H * 0.82;
    riderScale = Math.max(0.95, Math.min(1.6, H / 820) * 1.4);
    computeSigns();
  }

  /* Signposts appear in the scenery just before each section arrives. */
  function computeSigns() {
    signs = [];
    document.querySelectorAll("[data-sign]").forEach((el) => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      signs.push({
        world: (top - H * 0.55) * SPEED + W * 0.72,
        label: el.dataset.sign,
      });
    });
  }

  /* ---------- sky ---------- */
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, col("skyTop"));
    g.addColorStop(1, col("skyBottom"));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawStars() {
    if (nightT < 0.02) return;
    for (let i = 0; i < 110; i++) {
      const x = hash(i * 3 + 1) * W;
      const y = hash(i * 7 + 2) * H * 0.55;
      const tw = 0.5 + 0.5 * Math.sin(time * (1 + hash(i) * 2) + i);
      ctx.fillStyle = `rgba(255,255,255,${(0.25 + 0.55 * tw) * nightT})`;
      const r = 0.6 + hash(i * 13) * 1.2;
      ctx.fillRect(x, y, r, r);
    }
  }

  /* sky color at a given vertical position (for the moon's crescent cut) */
  function skyAt(t) {
    const top = P.skyTop, bot = P.skyBottom;
    const d = [0, 1, 2].map((i) => top[0][i] + (bot[0][i] - top[0][i]) * t);
    const n = [0, 1, 2].map((i) => top[1][i] + (bot[1][i] - top[1][i]) * t);
    const c = [0, 1, 2].map((i) => Math.round(d[i] + (n[i] - d[i]) * nightT));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function drawSunMoon() {
    const x = W * 0.78, y = H * 0.2, r = 34;
    // sun
    if (nightT < 0.98) {
      const a = 1 - nightT;
      const glow = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 4);
      glow.addColorStop(0, `rgba(255,214,90,${0.35 * a})`);
      glow.addColorStop(1, "rgba(255,214,90,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
      ctx.globalAlpha = a;
      ctx.fillStyle = col("sun");
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // moon (crescent)
    if (nightT > 0.02) {
      ctx.globalAlpha = nightT;
      ctx.fillStyle = "rgba(244,241,222,1)";
      ctx.beginPath();
      ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skyAt(y / H);
      ctx.beginPath();
      ctx.arc(x - r * 0.28, y - r * 0.2, r * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawClouds(wx) {
    const band = 1600;
    ctx.fillStyle = col("cloud", 0.85 - nightT * 0.25);
    for (let i = 0; i < 7; i++) {
      const base = hash(i * 31 + 5) * band;
      let x = base - ((wx * 0.12 + time * 12 + i * 40) % band);
      if (x < -220) x += band;
      const y = H * (0.12 + hash(i * 17) * 0.22);
      const s = 0.7 + hash(i * 11) * 0.8;
      cloud(x, y, s);
    }
  }

  function cloud(x, y, s) {
    ctx.beginPath();
    ctx.ellipse(x, y, 46 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 30 * s, y + 2 * s, 30 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 32 * s, y + 3 * s, 26 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 4 * s, y - 10 * s, 26 * s, 13 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBirds() {
    const a = 1 - nightT;
    if (a < 0.05) return;
    ctx.strokeStyle = `rgba(40,50,60,${0.7 * a})`;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const span = W + 400;
      const x = ((time * (26 + i * 8) + i * 500) % span) - 200;
      const y = H * (0.16 + i * 0.05) + Math.sin(time * 2 + i) * 12;
      const flap = Math.sin(time * 9 + i * 2) * 4;
      ctx.beginPath();
      ctx.moveTo(x - 7, y - flap);
      ctx.quadraticCurveTo(x - 2, y + 2, x, y);
      ctx.quadraticCurveTo(x + 2, y + 2, x + 7, y - flap);
      ctx.stroke();
    }
  }

  /* ---------- terrain ---------- */
  function ridge(wx, parallax, baseY, a1, f1, a2, f2, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) {
      const gx = x + wx * parallax;
      const y = baseY - (Math.sin(gx * f1) * a1 + Math.sin(gx * f2 + 1.7) * a2 + a1 + a2) * 0.6;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawRoad(wx) {
    const rh = 30;
    ctx.fillStyle = col("road");
    ctx.fillRect(0, roadY, W, rh);
    ctx.fillStyle = col("roadEdge", 0.9);
    ctx.fillRect(0, roadY + 1.5, W, 1.5);
    ctx.fillRect(0, roadY + rh - 3, W, 1.5);
    // center dashes
    ctx.fillStyle = col("roadEdge", 0.75);
    const dashW = 34, gap = 46, period = dashW + gap;
    let off = -(wx % period);
    for (let x = off; x < W; x += period) {
      ctx.fillRect(x, roadY + rh / 2 - 1.5, dashW, 3);
    }
  }

  /* ---------- roadside items ---------- */
  function drawScenery(wx) {
    const spacing = 170;
    const k0 = Math.floor((wx - 200) / spacing);
    const k1 = Math.ceil((wx + W + 200) / spacing);
    for (let k = k0; k <= k1; k++) {
      const r = hash(k);
      if (r > 0.72) continue; // gap
      const x = k * spacing + hash(k * 3) * 90 - wx;
      const s = 0.7 + hash(k * 7) * 0.6;
      if (r < 0.3) tree(x, roadY - 2, s);
      else if (r < 0.52) pine(x, roadY - 2, s);
      else if (r < 0.62) bushBack(x, roadY - 2, s);
      else lamp(x, roadY - 2, s);
    }
    // signposts
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const sgn of signs) {
      const x = sgn.world - wx;
      if (x < -160 || x > W + 160) continue;
      signpost(x, roadY - 2, sgn.label);
    }
  }

  function tree(x, y, s) {
    ctx.fillStyle = col("trunk");
    ctx.fillRect(x - 3 * s, y - 34 * s, 6 * s, 34 * s);
    ctx.fillStyle = col("canopy");
    ctx.beginPath();
    ctx.arc(x, y - 52 * s, 22 * s, 0, Math.PI * 2);
    ctx.arc(x - 14 * s, y - 40 * s, 15 * s, 0, Math.PI * 2);
    ctx.arc(x + 14 * s, y - 40 * s, 15 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function pine(x, y, s) {
    ctx.fillStyle = col("trunk");
    ctx.fillRect(x - 2.5 * s, y - 16 * s, 5 * s, 16 * s);
    ctx.fillStyle = col("pine");
    for (let i = 0; i < 3; i++) {
      const w = (30 - i * 7) * s, ty = y - (16 + i * 16) * s;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, ty);
      ctx.lineTo(x + w / 2, ty);
      ctx.lineTo(x, ty - 22 * s);
      ctx.closePath();
      ctx.fill();
    }
  }

  function bushBack(x, y, s) {
    ctx.fillStyle = col("bush");
    ctx.beginPath();
    ctx.arc(x, y - 7 * s, 11 * s, 0, Math.PI * 2);
    ctx.arc(x + 11 * s, y - 5 * s, 8 * s, 0, Math.PI * 2);
    ctx.arc(x - 11 * s, y - 5 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function lamp(x, y, s) {
    ctx.fillStyle = col("post");
    ctx.fillRect(x - 2, y - 64 * s, 4, 64 * s);
    ctx.fillRect(x - 2, y - 64 * s, 14 * s, 3);
    const lx = x + 12 * s, ly = y - 60 * s;
    ctx.fillStyle = nightT > 0.3 ? "rgba(255,216,120,0.95)" : col("post");
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fill();
    if (nightT > 0.05) {
      const g = ctx.createRadialGradient(lx, ly, 2, lx, ly, 55);
      g.addColorStop(0, `rgba(255,216,120,${0.3 * nightT})`);
      g.addColorStop(1, "rgba(255,216,120,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, ly, 55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function signpost(x, y, label) {
    ctx.font = "600 11px Inter, system-ui, sans-serif";
    const tw = ctx.measureText(label).width;
    const bw = Math.max(tw + 22, 64), bh = 24;
    ctx.fillStyle = col("post");
    ctx.fillRect(x - 2.5, y - 58, 5, 58);
    ctx.fillStyle = col("signBoard");
    ctx.strokeStyle = col("post");
    ctx.lineWidth = 1.5;
    roundRect(x - bw / 2, y - 58 - bh, bw, bh, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = col("signText");
    ctx.fillText(label, x, y - 58 - bh / 2 + 1);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBushesFront(wx) {
    const spacing = 260;
    const par = 1.18;
    const k0 = Math.floor((wx * par - 100) / spacing);
    const k1 = Math.ceil((wx * par + W + 100) / spacing);
    ctx.fillStyle = col("bush", 0.95);
    for (let k = k0; k <= k1; k++) {
      if (hash(k * 5 + 9) > 0.6) continue;
      const x = k * spacing + hash(k * 9) * 120 - wx * par;
      const s = 0.9 + hash(k * 4) * 0.9;
      const y = roadY + 44;
      ctx.beginPath();
      ctx.arc(x, y, 16 * s, 0, Math.PI * 2);
      ctx.arc(x + 16 * s, y + 3, 12 * s, 0, Math.PI * 2);
      ctx.arc(x - 16 * s, y + 3, 12 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ---------- cyclist ---------- */
  function drawCyclist(wx) {
    const s = riderScale;
    const cx = W * 0.62;
    const cy = roadY + 3 - Math.abs(Math.sin(wx * 0.05)) * 1.6 * s;
    const wheelR = 13 * s;
    const spin = wx / wheelR + time * 1.2; // wheels idle gently too
    const crank = spin * 0.55;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineCap = "round";

    // headlight beam at night
    if (nightT > 0.05) {
      const g = ctx.createRadialGradient(24 * s, -14 * s, 4, 24 * s, -14 * s, 130 * s);
      g.addColorStop(0, `rgba(255,224,140,${0.28 * nightT})`);
      g.addColorStop(1, "rgba(255,224,140,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(22 * s, -16 * s);
      ctx.lineTo(150 * s, -34 * s);
      ctx.lineTo(150 * s, 8 * s);
      ctx.closePath();
      ctx.fill();
    }

    const rider = col("rider");

    // wheels
    for (const wxl of [-20, 20]) {
      const hx = wxl * s;
      ctx.strokeStyle = rider;
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.arc(hx, -wheelR, wheelR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1 * s;
      ctx.strokeStyle = col("rider", 0.65);
      for (let i = 0; i < 5; i++) {
        const a = spin + (i * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.moveTo(hx, -wheelR);
        ctx.lineTo(hx + Math.cos(a) * wheelR * 0.9, -wheelR + Math.sin(a) * wheelR * 0.9);
        ctx.stroke();
      }
    }

    // frame
    const rear = { x: -20 * s, y: -wheelR };
    const front = { x: 20 * s, y: -wheelR };
    const bb = { x: 0, y: -wheelR * 0.55 };           // bottom bracket
    const seat = { x: -9 * s, y: -34 * s };
    const head = { x: 13 * s, y: -33 * s };            // head tube top
    ctx.strokeStyle = rider;
    ctx.lineWidth = 2.6 * s;
    ctx.beginPath();
    ctx.moveTo(rear.x, rear.y); ctx.lineTo(bb.x, bb.y); ctx.lineTo(front.x, front.y);
    ctx.moveTo(rear.x, rear.y); ctx.lineTo(seat.x, seat.y); ctx.lineTo(bb.x, bb.y);
    ctx.moveTo(seat.x, seat.y); ctx.lineTo(head.x, head.y);
    ctx.moveTo(head.x, head.y); ctx.lineTo(front.x, front.y);
    ctx.stroke();
    // handlebar
    ctx.beginPath();
    ctx.moveTo(head.x, head.y); ctx.lineTo(head.x + 5 * s, head.y - 3 * s);
    ctx.stroke();

    // pedals + legs
    const hip = { x: seat.x + 1 * s, y: seat.y - 2 * s };
    for (const phase of [0, Math.PI]) {
      const px = bb.x + Math.cos(crank + phase) * 7 * s;
      const py = bb.y + Math.sin(crank + phase) * 7 * s;
      // crank
      ctx.strokeStyle = rider;
      ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.moveTo(bb.x, bb.y); ctx.lineTo(px, py); ctx.stroke();
      // leg with simple bent knee
      const mx = (hip.x + px) / 2 - 6 * s;
      const my = (hip.y + py) / 2 - 2 * s;
      ctx.strokeStyle = rider;
      ctx.lineWidth = 3.4 * s;
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
      ctx.quadraticCurveTo(mx, my, px, py);
      ctx.stroke();
    }

    // torso (jersey accent)
    const shoulder = { x: 7 * s, y: -47 * s };
    ctx.strokeStyle = col("jersey");
    ctx.lineWidth = 4.6 * s;
    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(shoulder.x, shoulder.y);
    ctx.stroke();
    // arm
    ctx.strokeStyle = rider;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.quadraticCurveTo(11 * s, -39 * s, head.x + 4 * s, head.y - 2 * s);
    ctx.stroke();
    // head + helmet
    ctx.fillStyle = rider;
    ctx.beginPath();
    ctx.arc(11 * s, -54 * s, 4.6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = col("jersey");
    ctx.beginPath();
    ctx.arc(11 * s, -55 * s, 4.8 * s, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();

    ctx.restore();
  }

  /* ---------- odometer ---------- */
  const odo = document.getElementById("odometer");
  function updateOdometer(wx) {
    if (!odo) return;
    odo.textContent = (wx * KM_PER_WORLD).toFixed(2) + " km";
  }

  /* ---------- main loop ---------- */
  function frame(now) {
    time = now / 1000;
    const target = root.dataset.theme === "dark" ? 1 : 0;
    nightT += (target - nightT) * 0.045;
    if (Math.abs(target - nightT) < 0.002) nightT = target;

    const wx = scrollY * SPEED;

    drawSky();
    drawStars();
    drawSunMoon();
    drawClouds(wx);
    drawBirds();
    ridge(wx, 0.15, H * 0.6, 46, 0.0016, 20, 0.0043, col("farRidge"));
    ridge(wx, 0.4, H * 0.72, 34, 0.0022, 13, 0.006, col("midHill"));
    // field
    ctx.fillStyle = col("field");
    ctx.fillRect(0, roadY - 26, W, H - roadY + 26);
    drawScenery(wx);
    drawRoad(wx);
    drawCyclist(wx);
    drawBushesFront(wx);
    updateOdometer(wx);

    if (!reduceMotion) requestAnimationFrame(frame);
  }

  window.addEventListener("scroll", () => {
    scrollY = window.scrollY;
    if (reduceMotion) requestAnimationFrame(frame);
  }, { passive: true });

  window.addEventListener("resize", () => {
    resize();
    if (reduceMotion) requestAnimationFrame(frame);
  });

  // Signs depend on fonts/layout settling.
  window.addEventListener("load", computeSigns);

  scrollY = window.scrollY;
  resize();
  requestAnimationFrame(frame);
})();
