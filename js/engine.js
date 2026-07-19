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
varying float vDist;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  gl_Position = uVP * world;
  vColor = aColor;
  vNormal = normalize(mat3(uModel) * aNormal);
  vUV = aUV;
  vDist = length(gl_Position.xyz);
}
`;

const FRAG = `
precision mediump float;
varying vec3 vColor;
varying vec3 vNormal;
varying vec2 vUV;
varying float vDist;
uniform vec3 uLightDir;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform sampler2D uTex;
uniform float uUseTex;
uniform float uAlpha;
void main() {
  vec3 base = vColor;
  vec4 texel = vec4(1.0);
  if (uUseTex > 0.5) {
    texel = texture2D(uTex, vUV);
    base *= texel.rgb;
  }
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, uLightDir), 0.0);
  float hemi = n.y * 0.5 + 0.5;
  vec3 lit = base * (0.52 + diff * 0.48) * mix(0.82, 1.06, hemi);
  float fog = 1.0 - exp(-vDist * vDist * uFogDensity);
  vec3 col = mix(lit, uFogColor, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(col, uAlpha * texel.a);
}
`;

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: true }) ||
               canvas.getContext("webgl", { antialias: true });
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
    for (const n of ["uVP", "uModel", "uLightDir", "uFogColor", "uFogDensity", "uTex", "uUseTex", "uAlpha"])
      this.uni[n] = gl.getUniformLocation(prog, n);

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
  }

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

  textureFromCanvas(cnv, size) {
    const gl = this.gl;
    if (size) { cnv.width = size; cnv.height = size; const c = cnv.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, size, size); }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cnv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  begin(vp) {
    const gl = this.gl;
    const [r, g, b] = this.fogColor || [0.8, 0.9, 1];
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(this.uni.uVP, false, vp);
  }

  draw(mesh, model, opts = {}) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.uni.uModel, false, model);
    gl.uniform1f(this.uni.uUseTex, opts.texture ? 1 : 0);
    gl.uniform1f(this.uni.uAlpha, opts.alpha !== undefined ? opts.alpha : 1);
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
