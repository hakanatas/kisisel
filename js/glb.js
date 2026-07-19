/* Minimal GLB (glTF binary) loader — enough for flat-colored and
   atlas-textured low-poly models. Returns world-space geometry per node,
   compatible with the engine's interleaved vertex format. */

import { mat4Multiply, mat4Identity } from "./math3d.js";

function quatToMat4(q, out) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  out[0] = 1 - (yy + zz); out[1] = xy + wz; out[2] = xz - wy; out[3] = 0;
  out[4] = xy - wz; out[5] = 1 - (xx + zz); out[6] = yz + wx; out[7] = 0;
  out[8] = xz + wy; out[9] = yz - wx; out[10] = 1 - (xx + yy); out[11] = 0;
  out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
  return out;
}

function nodeLocalMatrix(node) {
  if (node.matrix) return new Float32Array(node.matrix);
  const t = node.translation || [0, 0, 0];
  const r = node.rotation || [0, 0, 0, 1];
  const s = node.scale || [1, 1, 1];
  const m = quatToMat4(r, new Float32Array(16));
  for (let c = 0; c < 3; c++) {
    m[c * 4] *= s[c]; m[c * 4 + 1] *= s[c]; m[c * 4 + 2] *= s[c];
  }
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
  return m;
}

export async function loadGLB(url, engine) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not glb");
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const clen = dv.getUint32(off, true);
    const ctype = dv.getUint32(off + 4, true);
    const chunk = buf.slice(off + 8, off + 8 + clen);
    if (ctype === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (ctype === 0x004e4942) bin = chunk;
    off += 8 + clen;
  }

  const readAccessor = (idx) => {
    const acc = json.accessors[idx];
    const bv = json.bufferViews[acc.bufferView];
    const base = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    const compCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
    const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[acc.componentType];
    const compSize = CT.BYTES_PER_ELEMENT;
    const stride = bv.byteStride || compCount * compSize;
    const out = new Float32Array(acc.count * compCount);
    const src = new DataView(bin);
    const get = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" }[acc.componentType];
    const norm = acc.normalized ? { 5121: 255, 5123: 65535, 5120: 127, 5122: 32767 }[acc.componentType] || 1 : 1;
    for (let i = 0; i < acc.count; i++) {
      for (let cix = 0; cix < compCount; cix++) {
        out[i * compCount + cix] = src[get](base + i * stride + cix * compSize, true) / norm;
      }
    }
    return out;
  };

  // decode textures: embedded bufferViews or external uris next to the glb
  const base = url.slice(0, url.lastIndexOf("/") + 1);
  const textures = [];
  if (json.images) {
    for (const img of json.images) {
      try {
        let blob;
        if (img.uri) {
          const res = await fetch(base + decodeURIComponent(img.uri));
          if (!res.ok) throw new Error("texture http " + res.status);
          blob = await res.blob();
        } else {
          const bv = json.bufferViews[img.bufferView];
          blob = new Blob([bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)], { type: img.mimeType });
        }
        let bmp = await createImageBitmap(blob);
        // big Sketchfab textures: downscale before upload to save GPU memory
        if (bmp.width > 1024) {
          const h = Math.round((bmp.height / bmp.width) * 1024);
          bmp = await createImageBitmap(bmp, { resizeWidth: 1024, resizeHeight: h });
        }
        textures.push(engine.textureFromImage(bmp));
      } catch (e) { textures.push(null); }
    }
  }
  const materialInfo = (json.materials || []).map((m) => {
    const pbr = m.pbrMetallicRoughness || {};
    const texIdx = pbr.baseColorTexture ? json.textures[pbr.baseColorTexture.index].source : null;
    return {
      color: pbr.baseColorFactor ? pbr.baseColorFactor.slice(0, 3) : [1, 1, 1],
      texture: texIdx !== null && texIdx !== undefined ? textures[texIdx] : null,
    };
  });

  /* walk the scene, collect per-node world-space geometry */
  const nodesOut = [];
  const walk = (nodeIdx, parentM) => {
    const node = json.nodes[nodeIdx];
    const world = mat4Multiply(parentM, nodeLocalMatrix(node));
    if (node.mesh !== undefined) {
      const mesh = json.meshes[node.mesh];
      for (const prim of mesh.primitives) {
        const pos = readAccessor(prim.attributes.POSITION);
        const nrm = prim.attributes.NORMAL !== undefined ? readAccessor(prim.attributes.NORMAL) : null;
        const uv = prim.attributes.TEXCOORD_0 !== undefined ? readAccessor(prim.attributes.TEXCOORD_0) : null;
        const col0 = prim.attributes.COLOR_0 !== undefined ? readAccessor(prim.attributes.COLOR_0) : null;
        const colStride = col0 ? { VEC3: 3, VEC4: 4 }[json.accessors[prim.attributes.COLOR_0].type] : 0;
        const idxArr = prim.indices !== undefined ? readAccessor(prim.indices) : null;
        const mat = materialInfo[prim.material] || { color: [1, 1, 1], texture: null };
        const count = idxArr ? idxArr.length : pos.length / 3;
        const verts = new Float32Array(count * 11);
        for (let i = 0; i < count; i++) {
          const vi = idxArr ? idxArr[i] : i;
          const px = pos[vi * 3], py = pos[vi * 3 + 1], pz = pos[vi * 3 + 2];
          const wx = world[0] * px + world[4] * py + world[8] * pz + world[12];
          const wy = world[1] * px + world[5] * py + world[9] * pz + world[13];
          const wz = world[2] * px + world[6] * py + world[10] * pz + world[14];
          let nx = 0, ny = 1, nz = 0;
          if (nrm) {
            const lx = nrm[vi * 3], ly = nrm[vi * 3 + 1], lz = nrm[vi * 3 + 2];
            nx = world[0] * lx + world[4] * ly + world[8] * lz;
            ny = world[1] * lx + world[5] * ly + world[9] * lz;
            nz = world[2] * lx + world[6] * ly + world[10] * lz;
            const l = Math.hypot(nx, ny, nz) || 1;
            nx /= l; ny /= l; nz /= l;
          }
          const o = i * 11;
          verts[o] = wx; verts[o + 1] = wy; verts[o + 2] = wz;
          verts[o + 3] = nx; verts[o + 4] = ny; verts[o + 5] = nz;
          verts[o + 6] = mat.color[0]; verts[o + 7] = mat.color[1]; verts[o + 8] = mat.color[2];
          if (col0) {
            verts[o + 6] *= col0[vi * colStride];
            verts[o + 7] *= col0[vi * colStride + 1];
            verts[o + 8] *= col0[vi * colStride + 2];
          }
          verts[o + 9] = uv ? uv[vi * 2] : 0;
          verts[o + 10] = uv ? uv[vi * 2 + 1] : 0;
        }
        nodesOut.push({ name: node.name || "", verts, texture: mat.texture });
      }
    }
    for (const ch of node.children || []) walk(ch, world);
  };
  const scene = json.scenes[json.scene || 0];
  for (const n of scene.nodes) walk(n, mat4Identity());

  return { nodes: nodesOut };
}

/* helpers on raw vert arrays */
export function vertsBounds(list) {
  const b = { minX: 1e9, minY: 1e9, minZ: 1e9, maxX: -1e9, maxY: -1e9, maxZ: -1e9 };
  for (const v of list) {
    for (let i = 0; i < v.length; i += 11) {
      b.minX = Math.min(b.minX, v[i]); b.maxX = Math.max(b.maxX, v[i]);
      b.minY = Math.min(b.minY, v[i + 1]); b.maxY = Math.max(b.maxY, v[i + 1]);
      b.minZ = Math.min(b.minZ, v[i + 2]); b.maxZ = Math.max(b.maxZ, v[i + 2]);
    }
  }
  return b;
}

export function transformVerts(v, { scale = 1, dx = 0, dy = 0, dz = 0 }) {
  for (let i = 0; i < v.length; i += 11) {
    v[i] = v[i] * scale + dx;
    v[i + 1] = v[i + 1] * scale + dy;
    v[i + 2] = v[i + 2] * scale + dz;
  }
  return v;
}
