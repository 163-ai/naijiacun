/* 真机验证：拿一个「已经绑过骨的 GLB」走一遍站点的绑骨入口，确认不是只有单测里的假骨架能跑。
 *
 * 用法：
 *   node tools/test-real-rigged-glb.mjs <模型.glb>
 *   NAJ_TEST_GLB=<模型.glb> node tools/test-real-rigged-glb.mjs
 *
 * 模型从哪来：forge 用本地几何绑骨 / Meshy 自动绑骨产出的 GLB 都行。
 * 传的路径不存在时直接跳过（返回 0），不会让 CI 变红——仓库里不放模型文件。
 *
 * 验证的是三件事：
 *   1. 各家骨骼命名（Mixamo / 本地绑骨 / VRM / 带前缀）都能被 js/pet-rig.js 认出来；
 *   2. 原生模式（rig.mode='native'）能接管模型自带的 idle，骨骼真的在动；
 *   3. 对外暴露的 bones 用程序化绑骨那套键名（装备挂点靠它）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const glb = process.argv[2] || process.env.NAJ_TEST_GLB;
if (!glb || !fs.existsSync(glb)) {
  console.log(`跳过：没有给可用的 GLB（${glb || '未指定'}）`);
  process.exit(0);
}

/* Node 里没有 DOM：给 GLTFLoader 补最小桩，只为解出骨骼与动画。
   贴图内容与本次验证无关，桩成 2×2 的空图即可。 */
globalThis.self = globalThis;
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:stub';
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {};
globalThis.createImageBitmap = async () => ({ width: 2, height: 2, close() {} });

/* GLTFLoader 里写的是 from 'three'（浏览器靠 importmap），Node 里得改成相对路径。
   复制到临时目录做，不动仓库里的文件。 */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'naj-real-glb-'));
fs.mkdirSync(path.join(tmp, 'js'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'vendor', 'three'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'vendor', 'meshopt'), { recursive: true });
for (const name of ['pet-motion.js', 'pet-rig.js', 'pet-laugh.js']) {
  fs.copyFileSync(path.join(root, 'js', name), path.join(tmp, 'js', name));
}
for (const name of ['three.module.min.js', 'three.core.min.js', 'GLTFLoader.js', 'BufferGeometryUtils.js']) {
  const source = path.join(root, 'vendor', 'three', name);
  if (!fs.existsSync(source)) continue;
  const target = path.join(tmp, 'vendor', 'three', name);
  const text = fs.readFileSync(source, 'utf8');
  fs.writeFileSync(target, text.replace(/from 'three'/g, "from './three.module.min.js'"));
}
const decoderSource = path.join(root, 'vendor', 'meshopt', 'meshopt_decoder.module.js');
if (fs.existsSync(decoderSource)) {
  fs.copyFileSync(decoderSource, path.join(tmp, 'vendor', 'meshopt', 'meshopt_decoder.module.js'));
}
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');

const T = await import(pathToFileURL(path.join(tmp, 'vendor', 'three', 'three.module.min.js')).href);
const { GLTFLoader } = await import(pathToFileURL(path.join(tmp, 'vendor', 'three', 'GLTFLoader.js')).href);
const { mapBones } = await import(pathToFileURL(path.join(tmp, 'js', 'pet-rig.js')).href);
const { createPetMotion } = await import(pathToFileURL(path.join(tmp, 'js', 'pet-motion.js')).href);

let fail = 0;
const note = (ok, label, value) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${value === undefined ? '' : ' = ' + value}`);
  if (!ok) fail++;
};

const bytes = fs.readFileSync(glb);
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const loader = new GLTFLoader();
const decoderPath = path.join(tmp, 'vendor', 'meshopt', 'meshopt_decoder.module.js');
if (fs.existsSync(decoderPath)) {
  const { MeshoptDecoder } = await import(pathToFileURL(decoderPath).href);
  await MeshoptDecoder.ready;
  loader.setMeshoptDecoder(MeshoptDecoder);
}
const gltf = await loader.parseAsync(buffer, './');

const rawNames = [];
gltf.scene.traverse((o) => { if (o.isBone) rawNames.push(o.name); });
note(rawNames.length > 0, 'GLB 里有骨骼', rawNames.length);
console.log(`     原始骨名示例：${rawNames.slice(0, 6).join(', ')}`);

const mapped = mapBones(gltf.scene);
note(!!mapped.bones.Hips, '认得出 Hips');
note(!!mapped.bones.Head, '认得出 Head');
note(!!mapped.bones.LeftArm && !!mapped.bones.RightArm, '认得出左右大臂');

/* 站点实际调用方式：scene + id + 契约条目 */
gltf.scene.userData.clips = gltf.animations || [];
const rig = createPetMotion(gltf.scene, 'realcheck', {
  rig: { mode: 'native', kind: 'biped', idleClip: gltf.animations[0]?.name },
  anatomy: null
});
note(rig.kind === 'native', '原生模式已接管', rig.kind);
note(!!rig.bones.body && !!rig.bones.head, 'bones 用程序化绑骨的键名（body/head）', rig.bones.body?.name);
note(!!rig.bones.armLeft && !!rig.bones.armRight, 'bones 有左右臂（装备挂点要用）', rig.bones.armRight?.name);
note(!!rig.bones.hipLeft && !!rig.bones.kneeLeft, 'bones 有左腿（hip/knee）');
note(typeof rig.boneSpace === 'number' && rig.boneSpace > 0, 'boneSpace 已提供（挂件换算比例）', Number(rig.boneSpace).toFixed(2));

const clipName = rig.clip;
note(!!clipName, '选中了 idle 片段', String(clipName));
if (clipName) {
  const bone = rig.bones.body || rig.bones.head;
  const before = bone.quaternion.clone();
  rig.update(0.35, 'idle');
  const after = bone.quaternion;
  const delta = Math.abs(before.x - after.x) + Math.abs(before.y - after.y)
    + Math.abs(before.z - after.z) + Math.abs(before.w - after.w);
  note(delta > 1e-5, 'idle 推进后骨骼姿态真的变了', delta.toExponential(2));
}

rig.laugh(0.6);
note(Number.isFinite(rig.root.rotation.x), 'laugh 与 mixer 不打架', Number(rig.root.rotation.x).toFixed(3));
rig.reset();
note(rig.root.position.y === 0, 'reset 后根节点归位');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? `\n${fail} 项失败` : '\nALL PASS');
process.exit(fail ? 1 : 0);
