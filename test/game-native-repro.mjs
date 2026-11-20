#!/usr/bin/env node
/**
 * game-native-repro.mjs —— 真实 GLB 全链路复现游戏症状
 *
 * 与 native-motion.test.mjs 的区别：那个用手工搭的假场景；这里用真 GLTFLoader
 * 解析站点真实资产（meshopt 压缩、真实层级、真实 bindMatrix），完全复刻游戏
 * buildRig 的调用方式（共享源 + nativeClone 双实例 + root 缩放），然后按 three
 * 的蒙皮公式算最终顶点世界坐标，量化三类症状：
 *   · 躺平：包围盒高宽比 < 0.8
 *   · 下陷：min.y < -0.15（归一化空间脚底应为 0）
 *   · 拉伸：单顶点位移超过身高一半（穿模粘连的典型特征）
 *
 * 用法：node test/game-native-repro.mjs [模型名...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WORKSPACE = path.resolve(ROOT, '..');
const THREE_URL = pathToFileURL(
  path.join(WORKSPACE, 'naijiacun-rig', 'node_modules', 'three', 'build', 'three.module.js')
).href;
const T = await import(THREE_URL);
const { GLTFLoader } = await import(
  pathToFileURL(path.join(WORKSPACE, 'naijiacun-rig', 'node_modules', 'three', 'examples', 'jsm', 'loaders', 'GLTFLoader.js')).href
);
const { MeshoptDecoder } = await import(
  pathToFileURL(path.join(ROOT, 'vendor', 'meshopt', 'meshopt_decoder.module.js')).href
);

const read = (f) => fs.readFileSync(f, 'utf8');
const dataUrl = (src) => 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
const swap = (src, from, to) => src.split(`'${from}'`).join(JSON.stringify(to));
const JS = (f) => path.join(ROOT, 'js', f);

const laughUrl = dataUrl(read(JS('pet-laugh.js')));
const rigUrl = dataUrl(swap(read(JS('pet-rig.js')), '../vendor/three/three.module.min.js', THREE_URL));
const skelUrl = dataUrl(swap(read(JS('pet-skeleton-anim.js')), '../vendor/three/three.module.min.js', THREE_URL));
const skelUtilsUrl = dataUrl(read(path.join(ROOT, 'vendor', 'three', 'SkeletonUtils.js')).split("'three'").join(JSON.stringify(THREE_URL)));
let motionSrc = swap(read(JS('pet-motion.js')), '../vendor/three/three.module.min.js', THREE_URL);
motionSrc = swap(motionSrc, './pet-laugh.js?v=site-pets-1', laughUrl);
motionSrc = swap(motionSrc, './pet-rig.js?v=rig-1', rigUrl);
motionSrc = swap(motionSrc, './pet-skeleton-anim.js?v=skel-2', skelUrl);
motionSrc = swap(motionSrc, '../vendor/three/SkeletonUtils.js?v=skel-1', skelUtilsUrl);
const { createPetMotion } = await import(dataUrl(motionSrc));
const { makeNativeAnimator } = await import(skelUrl);

async function loadGLB(file) {
  /* node 下没有 DOM：剥掉材质/贴图只留几何、骨骼、动画，再重新打包 GLB 解析 */
  const buf = fs.readFileSync(file);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const chunk = buf.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').replace(/\0+$/, ''));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len; off += (4 - off % 4) % 4;
  }
  delete json.images; delete json.textures; delete json.samplers; delete json.materials;
  delete json.extensionsUsed;
  for (const mesh of json.meshes || [])
    for (const prim of mesh.primitives || []) delete prim.material;
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const pad = (n) => Buffer.alloc((4 - n % 4) % 4, 0x20);
  const jPad = pad(jsonBuf.length), bPad = bin ? pad(bin.length) : Buffer.alloc(0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + jPad.length + (bin ? 8 + bin.length + bPad.length : 0), 8);
  const jc = Buffer.alloc(8); jc.writeUInt32LE(jsonBuf.length + jPad.length, 0); jc.writeUInt32LE(0x4e4f534a, 4);
  const parts = [header, jc, jsonBuf, jPad];
  if (bin) { const bc = Buffer.alloc(8); bc.writeUInt32LE(bin.length + bPad.length, 0); bc.writeUInt32LE(0x004e4942, 4); parts.push(bc, bin, bPad); }
  const ab = Buffer.concat(parts).buffer.slice(0, Buffer.concat(parts).byteLength);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(ab, '');
  gltf.scene.userData.clips = gltf.animations || [];
  return gltf;
}

/* 按 three 蒙皮着色器公式算最终世界坐标顶点（抽样） */
function skinnedWorldPoints(mesh, maxSamples = 1500) {
  const geom = mesh.geometry;
  const pos = geom.attributes.position, si = geom.attributes.skinIndex, sw = geom.attributes.skinWeight;
  mesh.updateMatrixWorld(true);
  const bind = mesh.bindMatrix, bindInv = mesh.bindMatrixInverse;
  const bones = mesh.skeleton.bones, inverses = mesh.skeleton.boneInverses;
  mesh.skeleton.update();
  const out = [];
  const stride = Math.max(1, Math.floor(pos.count / maxSamples));
  const v = new T.Vector4(), tmp = new T.Vector4(), acc = new T.Vector4();
  for (let i = 0; i < pos.count; i += stride) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i), 1).applyMatrix4(bind);
    acc.set(0, 0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (w === 0) continue;
      tmp.copy(v).applyMatrix4(inverses[si.getComponent(i, k)]).applyMatrix4(bones[si.getComponent(i, k)].matrixWorld);
      acc.addScaledVector(tmp, w);
    }
    acc.applyMatrix4(bindInv);
    acc.applyMatrix4(mesh.matrixWorld);
    out.push(new T.Vector3(acc.x / (acc.w || 1), acc.y / (acc.w || 1), acc.z / (acc.w || 1)));
  }
  return out;
}

function bboxOf(points) {
  const box = new T.Box3();
  for (const p of points) box.expandByPoint(p);
  return box;
}

function collectMeshes(root) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return meshes;
}

function report(label, points, problems) {
  const box = bboxOf(points);
  const size = box.getSize(new T.Vector3());
  const upright = size.y / Math.max(size.x, size.z, 1e-6);
  if (box.min.y < -0.15) problems.push(`下陷 min.y=${box.min.y.toFixed(3)}`);
  if (upright < 0.8 && size.y > 0.1) problems.push(`躺平 高宽比=${upright.toFixed(2)}`);
  return { box, size, upright };
}

async function testModel(name) {
  const file = path.join(ROOT, 'assets', 'models', name + '.glb');
  if (!fs.existsSync(file)) return console.log(`-- ${name}: 文件不存在，跳过`);
  console.log(`\n======== ${name} ========`);
  const src = (await loadGLB(file)).scene;
  const problems = [];

  /* 完全复刻 game2d.buildRig：共享源 + nativeClone，两个角色 */
  const rig1 = createPetMotion(src, name, { rig: { mode: 'native', idleClip: 'idle' }, nativeClone: true });
  const rig2 = createPetMotion(src, name, { rig: { mode: 'native', idleClip: 'idle' }, nativeClone: true });
  rig1.root.scale.setScalar(0.9); rig2.root.scale.setScalar(0.9);

  const kind = rig2.kind, native = rig2.native;
  console.log(`rig.kind=${kind} native=${native} clip=${rig2.clip}`);

  const mesh2 = collectMeshes(rig2.root);
  if (native) {
    /* 纯静止（mixer 未动）：验证 rebind 后蒙皮是否=原始网格 */
    rig2.root.updateMatrixWorld(true);
    const purePts = mesh2.flatMap((m) => skinnedWorldPoints(m));
    const p = bboxOf(purePts);
    console.log(`pure  (mixer前) bbox y=[${p.min.y.toFixed(2)},${p.max.y.toFixed(2)}]`);

    /* 归一化参数与 naive 估计 */
    const holder = rig2.root.children.find((c) => c.type === 'Group' || c.type === 'Object3D');
    const srcNode = holder && holder.children[0];
    console.log(`source.position.y=${srcNode ? srcNode.position.y.toFixed(3) : '?'}（floorY 应等于 naive mesh min）`);

    /* idle 轨道里根节点（Rig）是否被旋转/位移 */
    const clips = src.userData.clips || [];
    for (const clip of clips) {
      const rootTracks = clip.tracks.filter((t) => {
        const nodeName = t.name.split('.')[0];
        const node = src.getObjectByName(nodeName);
        return node && (node === src || !node.isBone && !node.isMesh);
      });
      for (const t of rootTracks) {
        const isQ = /\.quaternion$/.test(t.name);
        const v0 = isQ ? [t.values[0], t.values[1], t.values[2], t.values[3]] : [t.values[0], t.values[1], t.values[2]];
        console.log(`clip[${clip.name}] 根轨道 ${t.name} frame0=${v0.map((x) => +x.toFixed(3)).join(',')}`);
      }
    }

    /* 静止：首帧 update('idle') */
    rig2.update(0, 'idle');
    rig2.root.updateMatrixWorld(true);
    const restPts = mesh2.flatMap((m) => skinnedWorldPoints(m));
    const r = report('rest', restPts, problems);
    console.log(`rest  bbox y=[${r.box.min.y.toFixed(2)},${r.box.max.y.toFixed(2)}] h=${r.size.y.toFixed(2)} w=${r.size.x.toFixed(2)} upright=${r.upright.toFixed(2)}`);

    /* 走路 0.55s（半步相位） */
    rig2.update(0.55, 'walk');
    rig2.root.updateMatrixWorld(true);
    const walkPts = mesh2.flatMap((m) => skinnedWorldPoints(m));
    const w = report('walk', walkPts, problems);
    console.log(`walk  bbox y=[${w.box.min.y.toFixed(2)},${w.box.max.y.toFixed(2)}] h=${w.size.y.toFixed(2)} upright=${w.upright.toFixed(2)}`);

    /* 拉伸检测：rest→walk 每个抽样点位移 */
    let maxDisp = 0;
    for (let i = 0; i < Math.min(restPts.length, walkPts.length); i++) {
      const d = restPts[i].distanceTo(walkPts[i]);
      if (d > maxDisp) maxDisp = d;
    }
    if (maxDisp > r.size.y * 0.5) problems.push(`顶点拉伸 max=${maxDisp.toFixed(2)}（身高一半=${(r.size.y / 2).toFixed(2)}）`);
    else console.log(`walk  最大顶点位移 ${maxDisp.toFixed(3)}（阈值 ${(r.size.y / 2).toFixed(2)}）正常`);
  } else {
    problems.push('走了程序化绑骨（未进 native）');
  }

  console.log(problems.length ? `❌ ${problems.join('；')}` : '✅ 正常');
  return { name, problems };
}

const models = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['nailong', 'nailong-waving', 'naiwa', 'naicha', 'niulai', 'xiaoqi', 'baobaolong', 'capybara', 'feidudu', 'naidan'];
const results = [];
for (const m of models) results.push(await testModel(m));
const bad = results.filter(Boolean).filter((r) => r.problems.length);
console.log(`\n======== 汇总：${results.filter(Boolean).length - bad.length}/${results.filter(Boolean).length} 通过 ========`);
if (bad.length) for (const b of bad) console.log(`❌ ${b.name}: ${b.problems.join('；')}`);
process.exit(0);
