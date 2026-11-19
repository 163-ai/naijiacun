import * as T from '../vendor/three/three.module.min.js';
import { getLaughPose } from './pet-laugh.js?v=site-pets-1';
import {
  mapBones, anatomyFromBones, validAnatomy, mergeAnatomy, defaultHumanoidAnatomy,
  humanoidScore, HUMAN_RIG_THRESHOLD, isRigKind
} from './pet-rig.js?v=rig-1';

const smooth = (a, b, x) => T.MathUtils.smoothstep(x, a, b);
// Measurements are fractions of each model's standing height. The waving hand,
// short dinosaur legs, uniform, and seated feet need different joint locations.
const ANATOMY = {
  // armLimit：手臂骨骼旋转的「解剖学安全上限」（弧度）。这些模型是单网格静态 GLB，
  // 手臂和躯干在同一张网格上连成一体，绑定权重必然在肩根留一圈过渡顶点。
  // 关键不在摆幅比例，而在「绝对角度」：一旦绕肩转过 ~0.4rad，肩根过渡顶点就
  // 被拽离身体、翻折成尖片（wavePose 的 -2.5rad 出拳/挥手必然穿模）。
  // 因此按模型实测，给每根手臂骨设一个硬上限，所有动画姿势应用后统一钳制。
  //   · nailong 挥手版双臂外张、与躯干分界清楚 → 可大幅摆动（±2.6）
  //   · nailongStand / naiwa / naicha / niulai / xiaoqi 贴身短臂 → ±0.4 左右
  nailong: { hip: .19, knee: .085, legX: .205, legTop: .26, head: .63, shoulders: [[-.225, .57, 0], [.23, .52, 0]], hands: [[-.49, .72, .02], [.44, .34, .02]], armRadius: .095, armGate: .25, armLimit: 2.6 },
  // 站立版奶龙（nailong.glb，游戏主角用）：双手贴身斜向外垂下——肩在身高 .53、
  // 手在 .19（2026-11-09 按模型逐层实测：外侧凸起 y.3~.7、偏背面 z -0.33~0.05）。
  // 手臂贴身 → 肩根过渡顶点多，实测旋转超过 ±0.45rad 就开始翻折穿模。
  nailongStand: { hip: .19, knee: .085, legX: .205, legTop: .26, head: .63, shoulders: [[-.23, .53, -.02], [.23, .53, -.02]], hands: [[-.335, .19, -.07], [.335, .19, -.07]], armRadius: .11, armGate: .27, armLimit: .42, armOut: .46 },
  naiwa: { hip: .28, knee: .13, legX: .14, legTop: .33, head: .67, shoulders: [[-.19, .61, 0], [.19, .61, 0]], hands: [[-.235, .32, .025], [.235, .32, .025]], armRadius: .06, armGate: .22, armLimit: .42, armOut: .26 },
  baobaolong: { hip: .17, knee: .075, legX: .18, legTop: .24, head: .57, shoulders: [[-.27, .49, 0], [.27, .49, 0]], hands: [[-.33, .24, .06], [.33, .24, .06]], armRadius: .09, armGate: .26, wings: true, armLimit: .5, armOut: .32 },
  xiaoqi: { hip: .40, knee: .20, legX: .08, legTop: .43, head: .72, shoulders: [[-.105, .62, 0], [.105, .62, 0]], hands: [[-.13, .40, .025], [.13, .40, .025]], armRadius: .05, armGate: .13, armLimit: .5, armOut: .28 },
  niulai: { hip: .36, knee: .17, legX: .12, legTop: .41, head: .71, shoulders: [[-.18, .62, 0], [.18, .62, 0]], hands: [[-.22, .33, .025], [.22, .33, .025]], armRadius: .06, armGate: .20, armLimit: .42, armOut: .30 },
  naicha: { hip: .18, knee: .075, legX: .155, legTop: .24, head: .64, shoulders: [[-.22, .55, 0], [.22, .55, 0]], hands: [[-.29, .22, .035], [.29, .22, .035]], armRadius: .065, armGate: .235, armLimit: .42, armOut: .42 }
};

function segmentDistance(x, y, z, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const t = T.MathUtils.clamp(((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t, z - a[2] - dz * t);
}

function makeBones(config, kind) {
  const bones = [], named = {};
  function bone(name, position, parent = 'body') {
    const b = new T.Bone(); b.name = name;
    b.position.fromArray(position);
    if (named[parent]) { b.position.sub(named[parent].userData.pivot); named[parent].add(b); }
    b.userData.pivot = new T.Vector3().fromArray(position);
    named[name] = b; bones.push(b);
    return b;
  }
  bone('body', [0, 0, 0], null);
  if (kind !== 'roll') bone('head', [0, kind === 'biped' ? config.head * 2 : 1.25, 0]);
  // 手臂安全上限写到骨骼上，动画控制器逐骨钳制。没有配置的类型（hop/bowl）
  // 用宽松默认，不限制它们原本就独立的手脚。
  const armLimit = config && config.armLimit != null ? config.armLimit : 2.6;
  const armOut = config && config.armOut != null ? config.armOut : Math.min(.68, armLimit * 1.1);
  const markArm = name => { if (named[name]) { named[name].userData.armLimit = armLimit; named[name].userData.armOut = armOut; } };
  if (kind === 'biped') {
    for (let side = 0; side < 2; side++) {
      const s = side === 0 ? -1 : 1, suffix = side === 0 ? 'Left' : 'Right';
      bone('hip' + suffix, [s * config.legX * 2, config.hip * 2, 0]);
      bone('knee' + suffix, [s * config.legX * 2, config.knee * 2, .025], 'hip' + suffix);
      bone('arm' + suffix, config.shoulders[side].map(v => v * 2));
    }
    markArm('armLeft'); markArm('armRight');
  } else if (kind === 'hop') {
    bone('footLeft', [-.40, .24, .22]); bone('footRight', [.40, .24, .22]);
    bone('armLeft', [-.32, .88, .25]); bone('armRight', [.32, .88, .25]);
    markArm('armLeft'); markArm('armRight');
  } else if (kind === 'bowl') {
    bone('pawLeft', [-.48, 1.02, .53]); bone('pawRight', [.48, 1.02, .53]);
    markArm('pawLeft'); markArm('pawRight');
  }
  return { bones, named };
}

function weightsAt(x, y, z, config, kind, output) {
  output.fill(0);
  const fy = y / 2, fx = x / 2, fz = z / 2;
  if (kind === 'biped') {
    const side = x < 0 ? 0 : 1, hipIndex = side === 0 ? 2 : 5;
    // The crotch fades into the pelvis rather than pulling the belly into a leg.
    const leg = (1 - smooth(config.hip - .015, config.legTop, fy)) * smooth(.025, config.legX * .6, Math.abs(fx));
    if (leg > 0) {
      const knee = 1 - smooth(config.knee * .65, config.knee * 1.55, fy);
      output[hipIndex] = leg * (1 - knee); output[hipIndex + 1] = leg * knee;
    }
    const a = config.shoulders[side], b = config.hands[side];
    // Lateral gate keeps chest, hair, horns and the egg-shell cap out of arms.
    let arm = (1 - smooth(config.armRadius * .6, config.armRadius * 1.4, segmentDistance(fx, fy, fz, a, b))) * smooth(config.armGate - .035, config.armGate + .025, Math.abs(fx));
    if (config.wings && fy > .43) arm = 0;
    output[hipIndex + 2] = arm;
    const head = smooth(config.head - .045, config.head + .035, fy) * (1 - arm);
    output[1] = head;
  } else if (kind === 'hop') {
    // Large seated feet have their own pivots; belly and tail remain the body.
    const foot = (1 - smooth(.17, .28, fy)) * smooth(.10, .20, Math.abs(fx)) * smooth(-.10, .02, fz);
    output[x < 0 ? 2 : 3] = foot;
    const arm = smooth(.12, .18, Math.abs(fx)) * smooth(.30, .36, fy) * (1 - smooth(.47, .53, fy)) * smooth(.04, .15, fz) * (1 - foot);
    output[x < 0 ? 4 : 5] = arm;
    output[1] = smooth(.54, .64, fy) * (1 - arm);
  } else if (kind === 'bowl') {
    // The red bowl occupies the lower half. It stays entirely on the body bone.
    const aboveRim = smooth(.505, .555, fy);
    const paw = aboveRim * smooth(.17, .25, Math.abs(fx)) * (1 - smooth(.57, .65, fy)) * smooth(.12, .22, fz);
    output[x < 0 ? 2 : 3] = paw;
    output[1] = aboveRim * (1 - paw);
  }
  let sum = output.reduce((a, b) => a + b, 0);
  if (sum > 1) { for (let i = 1; i < output.length; i++) output[i] /= sum; sum = 1; }
  output[0] = 1 - sum;
}

/**
 * 烘焙顶点时有两个坑，都在量化模型（KHR_mesh_quantization + meshopt）上踩过：
 * 1. 本工程这份 three 的 `getX()` 已经做过反归一化（内部按 normalized 除以 32767），
 *    拿到的是真实坐标，千万别再自己除一遍，否则整只模型会缩成 6e-5。
 * 2. `Box3.setFromObject()` 会优先用 GLTFLoader 从 accessor min/max 写好的
 *    `geometry.boundingBox`，那是量化空间（±32767）的值；拿它算归一化会把
 *    2 单位高的模型错算成 65534 高，顶点全被压到 y≈1 的薄片，
 *    head 骨的权重区间（fy≈0.585~0.665）于是永远取不到顶点——就是"无头圆盘"。
 * 因此这里改为：先把顶点烘焙成 Float32 实测包围盒，再做归一化与权重。
 */
/* ---------------- 绑骨参数解析 ----------------
 * 一个角色的「怎么动」由三层数据决定，优先级从高到低：
 *   1. 本文件 ANATOMY 里的实测值（现有 9 个模型，逐模型量出来的，谁也不能覆盖）；
 *   2. 模型登记 entry.anatomy —— forge 入库时自动写入 js/3d-rig.js；
 *   3. 模型自带骨骼的位置反推（humanoid 命名能被识别出来时）；
 *   4. 站立人形默认比例（比「当蛋滚」强，但明确标记为 default，方便排查）。
 * 只有明确声明 rig.mode === 'native' 的角色才走「原生骨骼 + 自带动画」，
 * 其余一律沿用原来的程序化绑骨，保证老模型逐帧不变。 */

const LEGACY_KIND = { feidudu: 'hop', capybara: 'bowl' };

/** 抽样包围盒：只用来判断「像不像站立人形」并算归一化参数 */
function quickBounds(source) {
  const box = new T.Box3(), probe = new T.Vector3();
  source.updateMatrixWorld(true);
  source.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    const position = object.geometry.attributes && object.geometry.attributes.position;
    if (!position) return;
    const stride = Math.max(1, Math.floor(position.count / 4000));
    for (let i = 0; i < position.count; i += stride) {
      probe.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(object.matrixWorld);
      box.expandByPoint(probe);
    }
  });
  return box;
}

function resolveRig(source, id, def) {
  const rigDef = def && def.rig && typeof def.rig === 'object' ? def.rig : null;
  const box = quickBounds(source);
  const size = box.getSize(new T.Vector3());
  const tf = {
    scale: size.y > 1e-6 ? 2 / size.y : 1,
    centerX: (box.min.x + box.max.x) / 2,
    centerZ: (box.min.z + box.max.z) / 2,
    floorY: box.min.y
  };
  const mapped = mapBones(source);
  /* 站立人形：比宽度、厚度都明显高。四足/蛋形/碗里的卡皮巴拉不会被误判 */
  const standing = size.y >= Math.max(size.x, size.z) * 1.02;

  const declaredKind = rigDef && isRigKind(rigDef.kind) ? rigDef.kind : null;
  const legacyKind = ANATOMY[id] ? null : LEGACY_KIND[id] || null;

  let anatomy = ANATOMY[id] || null;
  let anatomyFrom = anatomy ? 'measured' : null;
  let kind = declaredKind || legacyKind || null;

  if (!kind) {
    if (!anatomy && def && validAnatomy(def.anatomy)) {
      anatomy = mergeAnatomy(defaultHumanoidAnatomy(), def.anatomy);
      anatomyFrom = 'declared';
    }
    if (!anatomy && humanoidScore(mapped.bones) >= HUMAN_RIG_THRESHOLD) {
      const derived = anatomyFromBones(mapped, tf);
      if (derived) { anatomy = derived; anatomyFrom = 'derived'; }
    }
    if (anatomy) kind = 'biped';
    else if (standing) { anatomy = defaultHumanoidAnatomy(); anatomyFrom = 'default'; kind = 'biped'; }
    else kind = 'roll';
  }
  if (kind === 'biped' && !anatomy) { anatomy = defaultHumanoidAnatomy(); anatomyFrom = 'default'; }

  return { rigDef, anatomy, anatomyFrom, kind, box, size, tf, mapped };
}

/** Bake all node transforms before binding, so every joint uses one coordinate space. */
export function createPetMotion(source, id, defIn) {
  source.updateMatrixWorld(true);
  const pack = typeof window !== 'undefined' ? window.N3D_MODELS : null;
  const def = defIn || (pack && pack[id]) || null;
  const resolved = resolveRig(source, id, def);
  if (resolved.rigDef && resolved.rigDef.mode === 'native') return createNativeMotion(source, id, resolved);
  const config = resolved.anatomy, kind = resolved.kind;
  const { bones, named } = makeBones(config, kind), root = new T.Group();
  root.name = 'pet-' + id; root.add(bones[0]); root.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(bones), parts = [], rawBounds = new T.Box3(), probe = new T.Vector3();
  source.traverse(object => {
    if (!object.isMesh) return;
    const geometry = object.geometry, position = geometry.attributes.position;
    if (!position) return;
    const sourceNormal = geometry.attributes.normal, world = object.matrixWorld;
    const count = position.count;
    const points = new Float32Array(count * 3), normals = sourceNormal ? new Float32Array(count * 3) : null;
    const normalMatrix = sourceNormal ? new T.Matrix3().getNormalMatrix(world) : null;
    for (let i = 0; i < count; i++) {
      probe.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(world);
      points[i * 3] = probe.x; points[i * 3 + 1] = probe.y; points[i * 3 + 2] = probe.z;
      rawBounds.expandByPoint(probe);
      if (normals) {
        probe.set(sourceNormal.getX(i), sourceNormal.getY(i), sourceNormal.getZ(i)).applyMatrix3(normalMatrix).normalize();
        normals[i * 3] = probe.x; normals[i * 3 + 1] = probe.y; normals[i * 3 + 2] = probe.z;
      }
    }
    parts.push({ geometry, object, sourceNormal, points, normals, count });
  });
  // 包围盒按真实顶点实测，不用 setFromObject（它会拿到量化空间的 boundingBox）。
  const size = rawBounds.getSize(new T.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('模型没有可显示的网格');
  const scale = 2 / size.y, centerX = (rawBounds.min.x + rawBounds.max.x) / 2;
  const centerZ = (rawBounds.min.z + rawBounds.max.z) / 2, floorY = rawBounds.min.y;
  const weight = new Array(bones.length).fill(0), meshes = [], boneHits = new Array(bones.length).fill(0);
  for (const part of parts) {
    const count = part.count, points = new Float32Array(count * 3);
    const indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const x = (part.points[i * 3] - centerX) * scale;
      const y = (part.points[i * 3 + 1] - floorY) * scale;
      const z = (part.points[i * 3 + 2] - centerZ) * scale;
      points[i * 3] = x; points[i * 3 + 1] = y; points[i * 3 + 2] = z;
      weightsAt(x, y, z, config, kind, weight);
      const influences = weight.map((w, index) => [index, w]).filter(v => v[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = influences.reduce((n, influence) => n + influence[1], 0) || 1;
      influences.forEach(([index, value], j) => { indices[i * 4 + j] = index; weights[i * 4 + j] = value / sum; });
      if (influences.length) boneHits[influences[0][0]]++;
    }
    const geometry = new T.BufferGeometry();
    for (const name in part.geometry.attributes) geometry.setAttribute(name, part.geometry.attributes[name]);
    geometry.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    if (part.normals) geometry.setAttribute('normal', new T.Float32BufferAttribute(part.normals, 3));
    geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
    geometry.setIndex(part.geometry.index); geometry.groups = part.geometry.groups.map(group => ({ ...group }));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new T.SkinnedMesh(geometry, part.object.material);
    mesh.name = part.object.name; mesh.frustumCulled = false; mesh.bind(skeleton, new T.Matrix4());
    root.add(mesh); meshes.push(mesh);
  }
  root.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(root), restPositions = bones.map(b => b.position.clone());
  let time = 0;
  function reset() {
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.setScalar(1);
    bones.forEach((bone, i) => { bone.rotation.set(0, 0, 0); bone.position.copy(restPositions[i]); });
  }
  /** 供调试/自检使用：每根骨骼拿到多少个顶点、归一化前后的实测范围。 */
  function stats() {
    return {
      kind, anatomyFrom: resolved.anatomyFrom, verts: parts.reduce((n, part) => n + part.count, 0),
      rawHeight: +size.y.toFixed(3),
      bindBounds: { min: [+rawBounds.min.x.toFixed(3), +rawBounds.min.y.toFixed(3), +rawBounds.min.z.toFixed(3)], max: [+rawBounds.max.x.toFixed(3), +rawBounds.max.y.toFixed(3), +rawBounds.max.z.toFixed(3)] },
      bones: bones.map((bone, index) => ({ name: bone.name, hits: boneHits[index] }))
    };
  }
  function update(dt, motion = 'idle') {    time += Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, .1));
    reset();
    if (motion === 'idle') { root.updateMatrixWorld(true); return; }
    if (motion === 'dragged') {
      root.rotation.z = .09 * Math.sin(time * 5);
      if (named.armLeft) named.armLeft.rotation.z = -.12;
      if (named.armRight) named.armRight.rotation.z = .12;
    } else {
      const run = motion === 'run', phase = time * Math.PI * 2 * (run ? 2.8 : 1.65), step = Math.sin(phase);
      if (kind === 'biped') {
        const amplitude = run ? .65 : .38;
        named.hipLeft.rotation.x = step * amplitude; named.hipRight.rotation.x = -step * amplitude;
        named.kneeLeft.rotation.x = Math.max(0, -step) * (run ? .9 : .55);
        named.kneeRight.rotation.x = Math.max(0, step) * (run ? .9 : .55);
        named.armLeft.rotation.x = -step * (run ? .48 : .28); named.armRight.rotation.x = step * (run ? .48 : .28);
        named.head.rotation.y = step * .025;
        root.position.y = Math.abs(Math.cos(phase)) * (run ? .07 : .028);
        root.rotation.z = step * .018;
      } else if (kind === 'hop') {
        const hop = Math.max(0, step);
        root.position.y = hop * (run ? .26 : .15);
        named.footLeft.rotation.x = named.footRight.rotation.x = -.38 * step;
        named.armLeft.rotation.x = named.armRight.rotation.x = .28 * step;
        named.head.rotation.x = -.045 * step;
      } else if (kind === 'bowl') {
        root.position.y = Math.abs(step) * (run ? .075 : .035);
        named.head.rotation.y = step * .12; named.head.rotation.x = Math.cos(phase) * .045;
        named.pawLeft.rotation.x = step * .20; named.pawRight.rotation.x = -step * .20;
      } else {
        // Egg-shaped role rolls around its own center; it has no invented limbs.
        root.rotation.z = step * (run ? .32 : .18);
        root.position.x = Math.sin(root.rotation.z);
        root.position.y = Math.abs(step) * (run ? .16 : .065) + 1 - Math.cos(root.rotation.z);
      }
    }
    root.updateMatrixWorld(true);
  }
  const halfSize = bounds.getSize(new T.Vector3()).multiplyScalar(.5), bodyCenter = bounds.getCenter(new T.Vector3());
  const rotation = new T.Matrix4(), transformedCenter = new T.Vector3();
  function laugh(t) {
    reset();
    const pose = getLaughPose(t), angle = Math.max(0, pose.lean);
    root.rotation.set(-angle + pose.shake, pose.turn, pose.roll);
    root.scale.set(1 + pose.squash * .7, 1 - pose.squash, 1 + pose.squash * .7);
    const e = rotation.makeRotationFromEuler(root.rotation).elements;
    const extent = Math.abs(e[1]) * halfSize.x * root.scale.x + Math.abs(e[5]) * halfSize.y * root.scale.y + Math.abs(e[9]) * halfSize.z * root.scale.z;
    transformedCenter.copy(bodyCenter).multiply(root.scale).applyMatrix4(rotation);
    root.position.set(bodyCenter.x, bounds.min.y + extent + pose.lift, bodyCenter.z - halfSize.y * Math.sin(angle) * .55).sub(transformedCenter);
    root.updateMatrixWorld(true);
  }
  // 手臂安全上限已写在每根手臂骨的 userData.armLimit 上，creature.js 逐骨钳制。
  // armSwing 兼容字段：给外部只读代码一个「相对摆幅」的粗略表示（1=可不限制）。
  const limit = config && config.armLimit != null ? config.armLimit : 2.6;
  root.userData.armSwing = limit >= 2 ? 1 : +(limit / 2.6).toFixed(3);
  return { root, bones: named, skeleton, meshes, bounds, kind, boneSpace: 1, armLimit: limit, armSwing: root.userData.armSwing, reset, update, laugh, stats, get time() { return time; } };
}

/* ---------------- 原生骨骼模式 ----------------
 * 适用：entry.rig.mode === 'native' —— forge 入库时明确声明的角色，模型自带一套
 * 真实骨骼（本地几何绑骨 / Meshy），通常还带一段 idle 动画。
 *
 * 为什么不走程序化绑骨：程序化绑骨会把顶点按世界坐标重新烤一遍、丢掉原骨架，
 * 模型自带的骨骼和动画就全废了——这正是「绑过骨但站上展台还是不动」的根因。
 *
 * 代价（必须知道）：原生骨骼的静止朝向由导出器决定，直接写 rotation.x 没有意义，
 * 所以这里不接管四肢的逐骨姿势，只播模型自带的 clip，外加根节点层面的大动作。
 * 需要逐骨程序化姿势（走/跑/出拳）的场合仍然走程序化绑骨，由调用方决定。
 *
 * 另一个前提：原生模式会「接管」传入的 gltf.scene（把它挂进自己的根节点），
 * 因此同一个 scene 只能喂给一个 rig。调用方若共享源场景，请显式声明 procedural。
 */
function pickClip(source, rigDef) {
  const clips = (source.userData && source.userData.clips) || [];
  const usable = clips.filter((clip) => {
    const tracks = (clip.tracks || []).filter((track) => /\.quaternion$/.test(track.name) || /morphTargetInfluences$/.test(track.name));
    /* 只留旋转/表情轨道：.position 轨道多半是根位移（走一段再瞬移回原点），
       在站内定点的角色身上直接播会漂走。 */
    clip.tracks = tracks;
    return tracks.length > 0;
  });
  if (!usable.length) return null;
  const prefer = rigDef && rigDef.idleClip;
  if (prefer) {
    const hit = usable.find((clip) => clip.name === prefer);
    if (hit) return hit;
  }
  return usable.find((clip) => /idle|breath|stand|loop|rest/i.test(clip.name)) || usable[0];
}

function createNativeMotion(source, id, resolved) {
  const { tf, size } = resolved;
  const root = new T.Group();
  root.name = 'pet-' + id;
  const holder = new T.Group();
  holder.scale.setScalar(tf.scale);
  root.add(holder);
  holder.add(source);
  /* 与程序化绑骨同一套归一化：高 2 单位、脚在 y=0、XZ 居中、面朝 +Z */
  source.position.set(
    source.position.x - tf.centerX,
    source.position.y - tf.floorY,
    source.position.z - tf.centerZ
  );
  root.updateMatrixWorld(true);

  /* 重算逆绑定矩阵（rebind）。
     现象：这批 GLB 的 skeleton 根节点比导出 IBM 时的位置整体高 1 单位，静止时
     蒙皮把所有顶点再抬高 1.0 —— 角色悬空一格、头被裁出画面（"无头" bug）。
     根因是 IBM 与静止位姿不一致；与其重导资产，不如在绑定时直接以当前
     （归一化后的）骨骼世界矩阵为准重建 boneInverses —— 静止时 boneMatrix
     恒为单位阵，蒙皮结果 = 原始网格，任何 IBM 漂移都自动归零；
     之后的 clip 旋转则以静止位姿为基准，动作照常。 */
  source.traverse((object) => {
    if (!object.isSkinnedMesh || !object.skeleton) return;
    const skeleton = object.skeleton;
    const ok = skeleton.bones.every((bone) => bone.matrixWorld);
    if (ok) {
      skeleton.boneInverses = skeleton.bones.map(
        (bone) => new T.Matrix4().copy(bone.matrixWorld).invert()
      );
      skeleton.update();
    }
  });

  const sw = size.x * tf.scale, sd = size.z * tf.scale;
  const bounds = new T.Box3(new T.Vector3(-sw / 2, 0, -sd / 2), new T.Vector3(sw / 2, 2, sd / 2));

  /* 对外暴露的骨骼字典：把这套原生骨骼翻译成程序化绑骨那套键名
     （body / head / armLeft / hipLeft…）。两套绑骨对外同一个形状，
     动作系统和装备挂点就不用分情况判断。 */
  const canon = resolved.mapped.bones;
  const bones = {};
  const put = (key, ...names) => {
    for (const name of names) { if (canon[name]) { bones[key] = canon[name]; return; } }
  };
  put('body', 'Hips', 'Spine');
  put('head', 'Head', 'Neck');
  put('hipLeft', 'LeftUpLeg', 'LeftLeg');
  put('hipRight', 'RightUpLeg', 'RightLeg');
  put('kneeLeft', 'LeftLeg', 'LeftUpLeg');
  put('kneeRight', 'RightLeg', 'RightUpLeg');
  put('footLeft', 'LeftFoot', 'LeftLeg');
  put('footRight', 'RightFoot', 'RightLeg');
  put('armLeft', 'LeftArm', 'LeftForeArm', 'LeftShoulder');
  put('armRight', 'RightArm', 'RightForeArm', 'RightShoulder');
  /* 程序化绑骨的骨骼建在「身高 2 单位」的空间里，原生骨骼还在模型自己的单位里，
     两者差一个 tf.scale。挂件用它对偏移和大小做换算，才不会有十倍的尺寸差。 */
  const boneSpace = 1 / tf.scale;

  const clip = pickClip(source, resolved.rigDef);
  const mixer = clip ? new T.AnimationMixer(source) : null;
  const action = mixer ? mixer.clipAction(clip) : null;
  if (action) { action.setLoop(T.LoopRepeat, Infinity); action.play(); mixer.update(0); }

  const rest = { position: root.position.clone(), rotation: root.rotation.clone(), scale: root.scale.clone() };
  let time = 0;

  function reset() {
    root.position.copy(rest.position);
    root.rotation.copy(rest.rotation);
    root.scale.copy(rest.scale);
    if (mixer) mixer.timeScale = 1;
    root.updateMatrixWorld(true);
  }

  function update(dt, motion = 'idle') {
    const step = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, .1));
    time += step;
    /* 先复位整体变换：上一帧可能是 laugh() 留下的后仰姿态，不复位就会一直躺着 */
    reset();
    const walking = motion === 'walk' || motion === 'run';
    if (mixer) {
      mixer.timeScale = motion === 'run' ? 1.9 : motion === 'walk' ? 1.35 : 1;
      mixer.update(step);
    }
    /* 自带 clip 里没有走/跑时，只给根节点一点颠簸与侧摆：看得出在移动，
       也不假装有腿部动作（假装出来的姿势会把原生骨骼扭成麻花）。 */
    root.position.y = walking ? Math.abs(Math.sin(time * (motion === 'run' ? 13 : 9))) * (motion === 'run' ? .035 : .018) : 0;
    root.rotation.z = walking ? Math.sin(time * (motion === 'run' ? 6.5 : 4.5)) * .012 : 0;
    root.updateMatrixWorld(true);
  }

  /* 「笑到躺下」与程序化绑骨完全同一套演法，只是把整体旋转作用在根节点上 */
  const halfSize = bounds.getSize(new T.Vector3()).multiplyScalar(.5), bodyCenter = bounds.getCenter(new T.Vector3());
  const rotation = new T.Matrix4(), transformedCenter = new T.Vector3();
  function laugh(t) {
    reset();
    const pose = getLaughPose(t), angle = Math.max(0, pose.lean);
    root.rotation.set(-angle + pose.shake, pose.turn, pose.roll);
    root.scale.set(1 + pose.squash * .7, 1 - pose.squash, 1 + pose.squash * .7);
    const e = rotation.makeRotationFromEuler(root.rotation).elements;
    const extent = Math.abs(e[1]) * halfSize.x * root.scale.x + Math.abs(e[5]) * halfSize.y * root.scale.y + Math.abs(e[9]) * halfSize.z * root.scale.z;
    transformedCenter.copy(bodyCenter).multiply(root.scale).applyMatrix4(rotation);
    root.position.set(bodyCenter.x, bounds.min.y + extent + pose.lift, bodyCenter.z - halfSize.y * Math.sin(angle) * .55).sub(transformedCenter);
    root.updateMatrixWorld(true);
  }

  function stats() {
    return {
      kind: 'native',
      anatomyFrom: 'native-skeleton',
      clips: clip ? [clip.name] : [],
      bones: Object.keys(resolved.mapped.bones),
      bindBounds: { min: [-sw / 2, 0, -sd / 2], max: [sw / 2, 2, sd / 2] }
    };
  }

  return {
    root, bones, skeleton: null, meshes: [], bounds, kind: 'native',
    native: true, mixer, boneSpace, clip: clip ? clip.name : null, armLimit: 2.6, armSwing: 1,
    reset, update, laugh, stats, get time() { return time; }
  };
}
