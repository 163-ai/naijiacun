import * as T from '../vendor/three/three.module.min.js';
import { getLaughPose } from './pet-laugh.js?v=site-pets-1';

const smooth = (a, b, x) => T.MathUtils.smoothstep(x, a, b);
// Measurements are fractions of each model's standing height. The waving hand,
// short dinosaur legs, uniform, and seated feet need different joint locations.
const ANATOMY = {
  nailong: { hip: .19, knee: .085, legX: .205, legTop: .26, head: .63, shoulders: [[-.225, .57, 0], [.23, .52, 0]], hands: [[-.49, .72, .02], [.44, .34, .02]], armRadius: .095, armGate: .25 },
  naiwa: { hip: .28, knee: .13, legX: .14, legTop: .33, head: .67, shoulders: [[-.19, .61, 0], [.19, .61, 0]], hands: [[-.235, .32, .025], [.235, .32, .025]], armRadius: .075, armGate: .185 },
  baobaolong: { hip: .17, knee: .075, legX: .18, legTop: .24, head: .57, shoulders: [[-.27, .49, 0], [.27, .49, 0]], hands: [[-.33, .24, .06], [.33, .24, .06]], armRadius: .09, armGate: .26, wings: true },
  xiaoqi: { hip: .40, knee: .20, legX: .08, legTop: .43, head: .72, shoulders: [[-.105, .62, 0], [.105, .62, 0]], hands: [[-.13, .40, .025], [.13, .40, .025]], armRadius: .05, armGate: .105 },
  niulai: { hip: .36, knee: .17, legX: .12, legTop: .41, head: .71, shoulders: [[-.18, .62, 0], [.18, .62, 0]], hands: [[-.22, .33, .025], [.22, .33, .025]], armRadius: .065, armGate: .18 },
  naicha: { hip: .18, knee: .075, legX: .155, legTop: .24, head: .64, shoulders: [[-.22, .55, 0], [.22, .55, 0]], hands: [[-.29, .22, .035], [.29, .22, .035]], armRadius: .085, armGate: .225 }
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
  if (kind === 'biped') {
    for (let side = 0; side < 2; side++) {
      const s = side === 0 ? -1 : 1, suffix = side === 0 ? 'Left' : 'Right';
      bone('hip' + suffix, [s * config.legX * 2, config.hip * 2, 0]);
      bone('knee' + suffix, [s * config.legX * 2, config.knee * 2, .025], 'hip' + suffix);
      bone('arm' + suffix, config.shoulders[side].map(v => v * 2));
    }
  } else if (kind === 'hop') {
    bone('footLeft', [-.40, .24, .22]); bone('footRight', [.40, .24, .22]);
    bone('armLeft', [-.32, .88, .25]); bone('armRight', [.32, .88, .25]);
  } else if (kind === 'bowl') {
    bone('pawLeft', [-.48, 1.02, .53]); bone('pawRight', [.48, 1.02, .53]);
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
/** Bake all node transforms before binding, so every joint uses one coordinate space. */
export function createPetMotion(source, id) {
  source.updateMatrixWorld(true);
  const config = ANATOMY[id], kind = config ? 'biped' : id === 'feidudu' ? 'hop' : id === 'capybara' ? 'bowl' : 'roll';
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
      kind, verts: parts.reduce((n, part) => n + part.count, 0),
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
  return { root, bones: named, skeleton, meshes, bounds, kind, reset, update, laugh, stats, get time() { return time; } };
}
