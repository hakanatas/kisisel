/* Tiny WebGL renderer: one flat-shaded program, interleaved buffers,
   canvas-generated textures, fog. No dependencies. */

const VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
attribute vec2 aUV;
uniform mat4 uVP;
uniform mat4 uModel;
varying vec3 vColor;
varying vec3 vNormal;
varying vec2 vUV;
varying vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uVP * world;
  vColor = aColor;
  vNormal = normalize(mat3(uModel) * aNormal);
  vUV = aUV;
  vWorld = world.xyz;
}
`;

const FRAG = `
precision mediump float;
varying vec3 vColor;
varying vec3 vNormal;
varying vec2 vUV;
varying vec3 vWorld;
uniform vec3 uEye;
uniform vec3 uLightDir;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform sampler2D uTex;
uniform float uUseTex;
uniform float uAlpha;
uniform vec4 uOverride; // rgb + enable flag: unlit flat color (shadows, fx)
void main() {
  vec3 base = vColor;
  vec4 texel = vec4(1.0);
  if (uUseTex > 0.5) {
    texel = texture2D(uTex, vUV);
    base *= texel.rgb;
  }
  vec3 lit;
  if (uOverride.a > 0.5) {
    lit = uOverride.rgb;
  } else {
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, uLightDir), 0.0);
    float hemi = n.y * 0.5 + 0.5;
    vec3 sun = vec3(1.05, 1.0, 0.9); // warm key light
    lit = base * (vec3(0.52, 0.53, 0.56) + diff * 0.48 * sun) * mix(0.82, 1.06, hemi);
  }
  float dist = distance(vWorld, uEye);
  float fog = 1.0 - exp(-dist * dist * uFogDensity);
  vec3 col = mix(lit, uFogColor, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, uAlpha * texel.a);
}
`;

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: true, stencil: true }) ||
               canvas.getContext("webgl", { antialias: true, stencil: true });
    if (!gl) throw new Error("webgl-unavailable");
    this.gl = gl;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;

    this.attribs = {
      pos: gl.getAttribLocation(prog, "aPos"),
      normal: gl.getAttribLocation(prog, "aNormal"),
      color: gl.getAttribLocation(prog, "aColor"),
      uv: gl.getAttribLocation(prog, "aUV"),
    };
    this.uni = {};
    for (const n of ["uVP", "uModel", "uLightDir", "uFogColor", "uFogDensity", "uTex", "uUseTex", "uAlpha", "uOverride", "uEye"])
      this.uni[n] = gl.getUniformLocation(prog, n);
    gl.uniform4f(this.uni.uOverride, 0, 0, 0, 0);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const dir = [0.5, 0.82, 0.28];
    const l = Math.hypot(...dir);
    gl.uniform3f(this.uni.uLightDir, dir[0] / l, dir[1] / l, dir[2] / l);
    gl.uniform1f(this.uni.uAlpha, 1);
    gl.uniform1f(this.uni.uUseTex, 0);
    gl.uniform1i(this.uni.uTex, 0);

    this.white = this.textureFromCanvas(document.createElement("canvas"), 1);
    this.isGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    this._initScreenProg();
  }

  /* fullscreen pass: sky gradient behind the scene, vignette on top */
  _initScreenProg() {
    const gl = this.gl;
    const vs = `attribute vec2 aP; varying vec2 vP; void main(){ vP = aP; gl_Position = vec4(aP,0.999,1.0); }`;
    const fs = `precision mediump float; varying vec2 vP; uniform float uMode;
      uniform vec3 uTop; uniform vec3 uHorizon;
      void main(){
        if (uMode < 0.5) {
          float t = clamp(vP.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 c = mix(uHorizon, uTop, pow(t, 1.4));
          gl_FragColor = vec4(c, 1.0);
        } else {
          float d = length(vP * vec2(1.0, 0.82));
          float v = smoothstep(0.95, 1.6, d);
          gl_FragColor = vec4(0.08, 0.07, 0.1, v * 0.17);
        }
      }`;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    this.screenProg = p;
    this.screenUni = {
      uMode: gl.getUniformLocation(p, "uMode"),
      uTop: gl.getUniformLocation(p, "uTop"),
      uHorizon: gl.getUniformLocation(p, "uHorizon"),
    };
    this.screenAttrib = gl.getAttribLocation(p, "aP");
    this.screenBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screenBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }

  _screenPass(mode, top, horizon) {
    const gl = this.gl;
    gl.useProgram(this.screenProg);
    gl.uniform1f(this.screenUni.uMode, mode);
    if (top) gl.uniform3f(this.screenUni.uTop, top[0], top[1], top[2]);
    if (horizon) gl.uniform3f(this.screenUni.uHorizon, horizon[0], horizon[1], horizon[2]);
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screenBuf);
    gl.enableVertexAttribArray(this.screenAttrib);
    gl.vertexAttribPointer(this.screenAttrib, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.useProgram(this.prog);
  }

  drawSky(top, horizon) { this._screenPass(0, top, horizon); }
  drawVignette() { this._screenPass(1); }

  setFog(rgb, density) {
    this.gl.uniform3f(this.uni.uFogColor, rgb[0], rgb[1], rgb[2]);
    this.gl.uniform1f(this.uni.uFogDensity, density);
    this.fogColor = rgb;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
    return w / h;
  }

  /* geo = {verts: number[]} interleaved [pos3 normal3 color3 uv2] */
  meshFromGeo(geo) {
    const gl = this.gl;
    const data = geo.verts instanceof Float32Array ? geo.verts : new Float32Array(geo.verts);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { vbo, count: data.length / 11 };
  }

  textureFromCanvas(cnv, size, mips) {
    const gl = this.gl;
    if (size) { cnv.width = size; cnv.height = size; const c = cnv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, size, size); }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv);
    if (mips && this.isGL2) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      // anisotropic filtering keeps the ground crisp at glancing angles
      const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
      if (aniso) {
        const max = gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
        gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
      }
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  begin(vp, eye) {
    const gl = this.gl;
    const [r, g, b] = this.fogColor || [0.8, 0.9, 1];
    gl.clearColor(r, g, b, 1);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.uniformMatrix4fv(this.uni.uVP, false, vp);
    if (eye) gl.uniform3f(this.uni.uEye, eye[0], eye[1], eye[2]);
  }

  /* Shadow pass: everything drawn between begin/end darkens each pixel at
     most once (stencil), so overlapping shadows do not double-darken. */
  beginShadows() {
    const gl = this.gl;
    gl.enable(gl.STENCIL_TEST);
    gl.stencilFunc(gl.EQUAL, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
    gl.depthMask(false);
  }

  endShadows() {
    const gl = this.gl;
    gl.disable(gl.STENCIL_TEST);
    gl.depthMask(true);
  }

  draw(mesh, model, opts = {}) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.uni.uModel, false, model);
    gl.uniform1f(this.uni.uUseTex, opts.texture ? 1 : 0);
    gl.uniform1f(this.uni.uAlpha, opts.alpha !== undefined ? opts.alpha : 1);
    if (opts.override) gl.uniform4f(this.uni.uOverride, opts.override[0], opts.override[1], opts.override[2], 1);
    gl.bindTexture(gl.TEXTURE_2D, opts.texture || this.white);
    if (opts.noDepthWrite) gl.depthMask(false);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    const S = 44; // 11 floats
    const a = this.attribs;
    gl.enableVertexAttribArray(a.pos);
    gl.vertexAttribPointer(a.pos, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(a.normal);
    gl.vertexAttribPointer(a.normal, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(a.color);
    gl.vertexAttribPointer(a.color, 3, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(a.uv);
    gl.vertexAttribPointer(a.uv, 2, gl.FLOAT, false, S, 36);

    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    if (opts.noDepthWrite) gl.depthMask(true);
    if (opts.override) gl.uniform4f(this.uni.uOverride, 0, 0, 0, 0);
  }
}

/* Text → texture helper. Returns {canvas, aspect}. */
export function textCanvas(lines, { size = 256, bg = "#ffffff", fg = "#2b2b33", pad = 0.16, font = "700", ratio = 2 } = {}) {
  const cnv = document.createElement("canvas");
  cnv.width = size * ratio;
  cnv.height = size;
  const c = cnv.getContext("2d");
  c.fillStyle = bg;
  c.fillRect(0, 0, cnv.width, cnv.height);
  c.fillStyle = fg;
  c.textAlign = "center";
  c.textBaseline = "middle";
  const inner = cnv.height * (1 - pad * 2);
  const lineH = inner / lines.length;
  let fs = lineH * 0.78;
  for (const ln of lines) {
    c.font = `${font} ${fs}px "DejaVu Sans", Arial, sans-serif`;
    const w = c.measureText(ln).width;
    const maxW = cnv.width * (1 - pad * 1.2);
    if (w > maxW) fs *= maxW / w;
  }
  c.font = `${font} ${fs}px "DejaVu Sans", Arial, sans-serif`;
  lines.forEach((ln, i) => {
    c.fillText(ln, cnv.width / 2, cnv.height * pad + lineH * (i + 0.5));
  });
  return { canvas: cnv, aspect: cnv.width / cnv.height };
}
