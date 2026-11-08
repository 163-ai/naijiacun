import * as T from '../vendor/three/three.module.min.js';

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

/** Bake all node transforms before binding, so every joint uses one coordinate space. */
export function createPetMotion(source, id) {
  source.updateMatrixWorld(true);
  const originalBounds = new T.Box3().setFromObject(source), size = originalBounds.getSize(new T.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('模型没有可显示的网格');
  const center = originalBounds.getCenter(new T.Vector3());
  const normalize = new T.Matrix4().makeScale(2 / size.y, 2 / size.y, 2 / size.y);
  normalize.multiply(new T.Matrix4().makeTranslation(-center.x, -originalBounds.min.y, -center.z));
  const config = ANATOMY[id], kind = config ? 'biped' : id === 'feidudu' ? 'hop' : id === 'capybara' ? 'bowl' : 'roll';
  const { bones, named } = makeBones(config, kind), root = new T.Group();
  root.name = 'pet-' + id; root.add(bones[0]); root.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(bones), cache = new Map(), originalGeometry = new Set();
  const weight = new Array(bones.length).fill(0), meshes = [];
  source.traverse(object => {
    if (!object.isMesh) return;
    const original = object.geometry, transform = normalize.clone().multiply(object.matrixWorld);
    // GLTF primitives can share the same vertex buffer (the seven paint groups
    // in the waving dragon). Share the baked attributes and compute weights once.
    const key = original.attributes.position.array, matrixKey = transform.elements.join(',');
    if (!cache.has(key)) cache.set(key, new Map());
    const transformed = cache.get(key);
    let baked = transformed.get(matrixKey);
    if (!baked) {
      const positions = original.attributes.position.clone(), normals = original.attributes.normal?.clone();
      positions.applyMatrix4(transform); normals?.applyNormalMatrix(new T.Matrix3().getNormalMatrix(transform));
      const indices = new Uint16Array(positions.count * 4), weights = new Float32Array(positions.count * 4);
      for (let i = 0; i < positions.count; i++) {
        weightsAt(positions.getX(i), positions.getY(i), positions.getZ(i), config, kind, weight);
        const influences = weight.map((w, index) => [index, w]).filter(v => v[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const sum = influences.reduce((n, influence) => n + influence[1], 0);
        influences.forEach(([index, value], j) => { indices[i * 4 + j] = index; weights[i * 4 + j] = value / sum; });
      }
      baked = { position: positions, normal: normals, skinIndex: new T.Uint16BufferAttribute(indices, 4), skinWeight: new T.Float32BufferAttribute(weights, 4) };
      transformed.set(matrixKey, baked);
    }
    const geometry = new T.BufferGeometry();
    for (const name in original.attributes) geometry.setAttribute(name, baked[name] || original.attributes[name]);
    geometry.setAttribute('position', baked.position);
    if (baked.normal) geometry.setAttribute('normal', baked.normal);
    geometry.setAttribute('skinIndex', baked.skinIndex); geometry.setAttribute('skinWeight', baked.skinWeight);
    geometry.setIndex(original.index); geometry.groups = original.groups.map(group => ({ ...group }));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new T.SkinnedMesh(geometry, object.material);
    mesh.name = object.name; mesh.frustumCulled = false; mesh.bind(skeleton, new T.Matrix4());
    root.add(mesh); meshes.push(mesh); originalGeometry.add(original);
  });
  originalGeometry.forEach(geometry => geometry.dispose());
  root.updateMatrixWorld(true);
  const bounds = new T.Box3().setFromObject(root), restPositions = bones.map(b => b.position.clone());
  let time = 0;
  function reset() {
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.setScalar(1);
    bones.forEach((bone, i) => { bone.rotation.set(0, 0, 0); bone.position.copy(restPositions[i]); });
  }
  function update(dt, motion = 'idle') {
    time += Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, .1));
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
  return { root, bones: named, skeleton, meshes, bounds, kind, reset, update, get time() { return time; } };
}
