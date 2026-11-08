import { getLaughPose, LAUGH_DURATION } from './pet-laugh.js?v=site-pets-1';

let modules3D;
function load3D() {
  modules3D ||= Promise.all([
    import('../vendor/three/three.module.min.js'),
    import('../vendor/three/GLTFLoader.js'),
    import('./pet-motion.js?v=site-pets-1')
  ]).then(([T, loader, motion]) => ({ T, GLTFLoader: loader.GLTFLoader, createPetMotion: motion.createPetMotion }))
    .catch(error => { modules3D = null; throw error; });
  return modules3D;
}

function disposeModel(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set(), bitmaps = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.skeleton) skeletons.add(object.skeleton);
    for (const material of object.material ? [].concat(object.material) : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose());
  textures.forEach(texture => {
    const data = texture.source?.data;
    if (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap) bitmaps.add(data);
    texture.dispose();
  });
  skeletons.forEach(value => value.dispose()); bitmaps.forEach(value => value.close());
}

/** Shared, explicitly ticked transparent pet. This class never starts a RAF. */
export class PetRenderer {
  constructor(host, { catalog, resolveAsset = path => path, meshoptDecoder }) {
    this.host = host; this.catalog = catalog; this.resolveAsset = resolveAsset;
    this._meshoptDecoder = meshoptDecoder;
    this.id = ''; this.mode = '2d'; this._requestedMode = '2d';
    this._motion = 'idle'; this._facing = 1; this._time = 0; this._version = 0; this._destroyed = false;
    this._action = null; this._actionBox = null;
    this._pixel = new Uint8Array(4);
    this.host.style.position = 'relative';
    this.setSize(180);
  }

  async setCharacter(id, mode = this._requestedMode) {
    if (!this.catalog.some(person => person.id === id)) throw new Error('没有找到这个村民');
    if (mode !== '2d' && mode !== '3d') throw new Error('不支持的桌宠模式');
    if (this.id === id && this._requestedMode === mode && (this._rig || this._image)) return this.mode;
    this.id = id; this._requestedMode = mode;
    return this._load();
  }

  async setMode(mode) {
    if (mode !== '2d' && mode !== '3d') throw new Error('不支持的桌宠模式');
    const sameRequest = this._requestedMode === mode;
    this._requestedMode = mode;
    if (sameRequest && (this._rig || this._image)) return this.mode;
    if (this.id) await this._load();
    return this.mode;
  }

  setMotion(motion) {
    if (!['idle', 'walk', 'run', 'dragged'].includes(motion)) throw new Error('不支持的桌宠动作');
    if (motion === 'dragged' && this._action) { this._action = null; this._fitCamera(); }
    this._motion = motion;
  }

  playAction(name) {
    if (name !== 'laugh' || this._destroyed || (!this._rig && !this._image)) return false;
    this._action = { name, time: 0 }; this.update(0); return true;
  }

  get action() { return this._action?.name || null; }

  setFacing(direction) { this._facing = direction < 0 ? -1 : 1; }

  setSize(height) {
    this._height = Math.min(720, Math.max(48, Number(height) || 180));
    this._width = this._height * .9;
    this.host.style.width = this._width + 'px'; this.host.style.height = this._height + 'px';
    if (this._renderer) {
      this._renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
      this._renderer.setSize(this._width, this._height, false);
      this._fitCamera(); this.update(0);
    }
  }

  _clear() {
    this._action = null; this._imageMatrix = null;
    this._abort?.abort(); this._abort = null;
    if (this._rig) { this._scene.remove(this._pivot); disposeModel(this._rig.root); }
    this._rig = this._pivot = null;
    if (this._image) { this._image.src = ''; this._image.remove(); this._image = null; }
    this._mask = this._maskContext = this._imageAlpha = null;
    if (this._renderer) {
      this._renderer.dispose(); this._renderer.forceContextLoss(); this._renderer.domElement.remove();
      this._renderer = this._scene = this._camera = null;
    }
  }

  async _load() {
    const version = ++this._version;
    this._clear();
    if (this._destroyed) return this.mode;
    const person = this.catalog.find(entry => entry.id === this.id);
    this.mode = this._requestedMode === '3d' && person.model ? '3d' : '2d';
    if (this.mode === '2d') {
      const image = new Image(), imageURL = new URL(this.resolveAsset(person.image), globalThis.location.href);
      if (imageURL.origin !== globalThis.location.origin) image.crossOrigin = 'anonymous';
      image.decoding = 'async'; image.alt = '';
      image.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;user-select:none;transform-origin:50% 95%;';
      image.src = imageURL.href;
      try { await image.decode(); }
      catch (error) {
        if (this._destroyed || version !== this._version) return this.mode;
        throw error;
      }
      if (this._destroyed || version !== this._version) { image.src = ''; return this.mode; }
      this._image = image; this.host.append(image);
      this._mask = document.createElement('canvas');
      this._mask.width = image.naturalWidth; this._mask.height = image.naturalHeight;
      this._maskContext = this._mask.getContext('2d', { willReadFrequently: true });
      this._maskContext.drawImage(image, 0, 0);
      this._imageAlpha = this._maskContext.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data;
      this.update(0);
      return this.mode;
    }
    const controller = new AbortController(); this._abort = controller;
    const url = this.resolveAsset(person.model);
    let bytes, modules, decoder;
    try {
      [bytes, modules, decoder] = await Promise.all([
        fetch(url, { signal: controller.signal }).then(response => {
          if (!response.ok) throw new Error('3D 模型加载失败：' + response.status);
          return response.arrayBuffer();
        }),
        load3D(),
        this._meshoptDecoder || import('../vendor/meshopt/meshopt_decoder.module.js').then(module => module.MeshoptDecoder)
      ]);
    } catch (error) {
      controller.abort();
      if (this._destroyed || version !== this._version || error.name === 'AbortError') return this.mode;
      throw error;
    }
    if (this._destroyed || version !== this._version) return this.mode;
    const { T, GLTFLoader, createPetMotion } = modules;
    this._three = T; this._actionBox ||= new T.Box3();
    const loader = new GLTFLoader().setMeshoptDecoder(decoder);
    let gltf;
    try { gltf = await loader.parseAsync(bytes, new URL('.', new URL(url, globalThis.location.href)).href); }
    catch (error) { if (this._destroyed || version !== this._version) return this.mode; throw error; }
    if (this._destroyed || version !== this._version) { disposeModel(gltf.scene); return this.mode; }
    let rig;
    try { rig = createPetMotion(gltf.scene, person.id); }
    catch (error) { disposeModel(gltf.scene); throw error; }
    if (this._destroyed || version !== this._version) { disposeModel(rig.root); return this.mode; }
    this._abort = null;
    try {
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
      this._renderer = renderer; this._rig = rig;
      renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
      this.host.append(renderer.domElement);
      this._scene = new T.Scene();
      this._camera = new T.OrthographicCamera(-1, 1, 1, -1, .01, 100);
      this._scene.add(new T.HemisphereLight(0xffffff, 0xb0a28b, 2.2));
      const key = new T.DirectionalLight(0xfff4e7, 2.5); key.position.set(3, 5, 4); this._scene.add(key);
      const fill = new T.DirectionalLight(0xdbe9ff, 1.8); fill.position.set(-4, 2, -4); this._scene.add(fill);
      this._pivot = new T.Group(); this._pivot.add(rig.root); this._scene.add(this._pivot);
      this.setSize(this._height);
    } catch (error) {
      if (!this._rig) disposeModel(rig.root);
      this._clear();
      throw error;
    }
    return this.mode;
  }

  _fitCamera(actionBounds) {
    if (!this._rig || !this._camera) return;
    const T = this._three;
    const size = this._rig.bounds.getSize(new T.Vector3());
    // Enough room for raised hands, long feet, the hop apex and a quarter turn.
    const width = Math.hypot(size.x, size.z) * 1.12;
    let height = Math.max(2.42, width / .9);
    if (actionBounds) height = Math.max(height,
      Math.max(Math.abs(actionBounds.min.x), Math.abs(actionBounds.max.x)) * 2.12 / .9,
      Math.max(Math.abs(actionBounds.min.y - 1.12), Math.abs(actionBounds.max.y - 1.12)) * 2.12);
    const camera = this._camera;
    camera.left = -height * .45; camera.right = height * .45;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.position.set(0, 1.12, 8); camera.lookAt(0, 1.12, 0); camera.updateProjectionMatrix();
  }

  update(dtSeconds) {
    if (this._destroyed) return;
    const dt = Math.max(0, Math.min(Number.isFinite(dtSeconds) ? dtSeconds : 0, .1));
    this._time += dt;
    if (this._action) {
      this._action.time += dt;
      if (this._action.time >= LAUGH_DURATION - 1e-8) { this._action = null; this._fitCamera(); }
    }
    if (this.mode === '3d' && this._rig && this._renderer) {
      this._pivot.rotation.y = this._facing * .38;
      if (this._action) {
        this._rig.laugh(this._action.time); this._pivot.updateMatrixWorld(true);
        this._fitCamera(this._actionBox.copy(this._rig.bounds).applyMatrix4(this._rig.root.matrixWorld));
      } else this._rig.update(dt, this._motion);
      this._renderer.render(this._scene, this._camera);
    } else if (this._image) {
      // Flat mode deliberately retains its original cutout. Tiny hops signal
      // movement without pretending the portrait has a 3D skeleton.
      const moving = this._motion === 'walk' || this._motion === 'run';
      this._imageOffset = moving && !this._action ? -Math.abs(Math.sin(this._time * (this._motion === 'run' ? 15 : 9))) * this._height * .025 : 0;
      const width = this._width, height = this._height, facing = this.id === 'xiaocao' ? 1 : this._facing;
      let angle = 0, sx = 1, sy = 1, centerY = height / 2 + this._imageOffset;
      if (this._action) {
        const pose = getLaughPose(this._action.time);
        angle = pose.roll + pose.shake; sx = 1 + pose.squash * .7; sy = (1 - pose.squash) * Math.cos(pose.lean);
        const extentX = Math.abs(Math.cos(angle)) * width * sx / 2 + Math.abs(Math.sin(angle)) * height * sy / 2;
        const extentY = Math.abs(Math.sin(angle)) * width * sx / 2 + Math.abs(Math.cos(angle)) * height * sy / 2;
        const fit = Math.min(1, width / (extentX * 2), height / (extentY * 2));
        sx *= fit; sy *= fit; centerY = height - extentY * fit - pose.lift * height / 2;
      }
      this._imageMatrix = new DOMMatrix().translate(width / 2, centerY).rotate(angle * 180 / Math.PI).scale(facing * sx, sy).translate(-width / 2, -height / 2);
      this._image.style.transformOrigin = '0 0'; this._image.style.transform = this._imageMatrix.toString();
    }
  }

  hitTest(clientX, clientY) {
    if (this._destroyed) return false;
    const element = this.mode === '3d' ? this._renderer?.domElement : this._image;
    if (!element) return false;
    if (this.mode === '3d') {
      const rect = element.getBoundingClientRect();
      if (clientX < rect.left || clientY < rect.top || clientX >= rect.right || clientY >= rect.bottom || !rect.width || !rect.height) return false;
      const gl = this._renderer.getContext();
      const x = Math.floor((clientX - rect.left) / rect.width * gl.drawingBufferWidth);
      const y = gl.drawingBufferHeight - 1 - Math.floor((clientY - rect.top) / rect.height * gl.drawingBufferHeight);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this._pixel);
      return this._pixel[3] > 16;
    }
    const rect = this.host.getBoundingClientRect();
    if (!rect.width || !rect.height || !this._imageMatrix) return false;
    const matrix = new DOMMatrix(this._image.style.transform), painted = element.getBoundingClientRect();
    matrix.e = painted.left - rect.left - Math.min(0, matrix.a * rect.width, matrix.c * rect.height, matrix.a * rect.width + matrix.c * rect.height);
    matrix.f = painted.top - rect.top - Math.min(0, matrix.b * rect.width, matrix.d * rect.height, matrix.b * rect.width + matrix.d * rect.height);
    const point = new DOMPoint(clientX - rect.left, clientY - rect.top).matrixTransform(matrix.inverse());
    const image = this._image, scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    const x = point.x - (rect.width - width) / 2;
    const y = point.y - (rect.height - height) / 2;
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const ix = Math.min(image.naturalWidth - 1, Math.floor(x / scale)), iy = Math.floor(y / scale);
    return this._imageAlpha[(iy * image.naturalWidth + ix) * 4 + 3] > 16;
  }

  destroy() { this._destroyed = true; ++this._version; this._clear(); }
}
