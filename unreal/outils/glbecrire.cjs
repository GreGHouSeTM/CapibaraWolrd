// Écriture d'un .glb glTF 2.0 simple : un nœud, un maillage, une primitive par matériau.
// prims : [{ pos: Float32Array, nor?, uv0?, uv1?, col?, colN?, idx: Uint32Array, mat: 'nom' }]
const fs = require('fs');
function writeGlb(file, name, prims) {
  const chunks = []; let len = 0;
  const bufferViews = [], accessors = [];
  const add = (arr, type, comp, target, minmax) => {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (len % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); len += pad; }
    bufferViews.push({ buffer: 0, byteOffset: len, byteLength: buf.length, target });
    chunks.push(buf); len += buf.length;
    const n = { VEC2: 2, VEC3: 3, VEC4: 4, SCALAR: 1 }[type];
    const acc = { bufferView: bufferViews.length - 1, componentType: comp, count: arr.length / n, type };
    if (minmax) { const mn = Array(n).fill(Infinity), mx = Array(n).fill(-Infinity); for (let i = 0; i < arr.length; i++) { mn[i % n] = Math.min(mn[i % n], arr[i]); mx[i % n] = Math.max(mx[i % n], arr[i]); } acc.min = mn; acc.max = mx; }
    accessors.push(acc); return accessors.length - 1;
  };
  const mats = [...new Set(prims.map((p) => p.mat))];
  const primitives = prims.map((p) => {
    const at = { POSITION: add(p.pos, 'VEC3', 5126, 34962, true) };
    if (p.nor) at.NORMAL = add(p.nor, 'VEC3', 5126, 34962);
    if (p.uv0) at.TEXCOORD_0 = add(p.uv0, 'VEC2', 5126, 34962);
    if (p.uv1) at.TEXCOORD_1 = add(p.uv1, 'VEC2', 5126, 34962);
    if (p.col) at.COLOR_0 = add(p.col, p.colN === 4 ? 'VEC4' : 'VEC3', 5126, 34962);
    return { attributes: at, indices: add(p.idx, 'SCALAR', 5125, 34963), material: mats.indexOf(p.mat) };
  });
  const json = { asset: { version: '2.0', generator: 'capy-preuve' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0 }],
    meshes: [{ name, primitives }], materials: mats.map((m) => ({ name: m, pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } })),
    buffers: [{ byteLength: len }], bufferViews, accessors };
  let bin = Buffer.concat(chunks, len);
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  bin = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const h = Buffer.alloc(12); h.writeUInt32LE(0x46546c67, 0); h.writeUInt32LE(2, 4); h.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([h, jh, js, bh, bin]));
}
module.exports = { writeGlb };
