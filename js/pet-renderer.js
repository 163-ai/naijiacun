import * as T from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { createPetMotion } from './pet-motion.js';

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
    this._pixel = new Uint8Array(4);
    this.host.style.position = 'relative';
    this.setSize(180);
  }

  async setCharacter(id) {
    if (!this.catalog.some(person => person.id === id)) throw new Error('没有找到这个村民');
    if (this.id === id && (this._rig || this._image)) return this.mode;
    this.id = id;
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
    this._motion = motion;
  }

  setFacing(direction) { this._facing = direction < 0 ? -1 : 1; }

  setSize(height) {
    this._height = T.MathUtils.clamp(Number(height) || 180, 48, 720);
    this._width = this._height * .9;
    this.host.style.width = this._width + 'px'; this.host.style.height = this._height + 'px';
    if (this._renderer) {
      this._renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 1.5));
      this._renderer.setSize(this._width, this._height, false);
      this._fitCamera(); this.update(0);
    }
  }

  _clear() {
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
      const image = new Image(); image.crossOrigin = 'anonymous'; image.decoding = 'async'; image.alt = '';
      image.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;user-select:none;transform-origin:50% 95%;';
      // Both the website and extension resolve these to their own local origin.
      image.src = this.resolveAsset(person.image);
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
    let bytes;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('3D 模型加载失败：' + response.status);
      bytes = await response.arrayBuffer();
    } catch (error) {
      if (this._destroyed || version !== this._version || error.name === 'AbortError') return this.mode;
      throw error;
    }
    if (this._destroyed || version !== this._version) return this.mode;
    const decoder = this._meshoptDecoder || (await import('../vendor/meshopt/meshopt_decoder.module.js')).MeshoptDecoder;
    if (this._destroyed || version !== this._version) return this.mode;
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

  _fitCamera() {
    if (!this._rig || !this._camera) return;
    const size = this._rig.bounds.getSize(new T.Vector3());
    // Enough room for raised hands, long feet, the hop apex and a quarter turn.
    const width = Math.hypot(size.x, size.z) * 1.12;
    const height = Math.max(2.42, width / .9);
    const camera = this._camera;
    camera.left = -height * .45; camera.right = height * .45;
    camera.top = height / 2; camera.bottom = -height / 2;
    camera.position.set(0, 1.12, 8); camera.lookAt(0, 1.12, 0); camera.updateProjectionMatrix();
  }

  update(dtSeconds) {
    if (this._destroyed) return;
    const dt = Math.max(0, Math.min(Number.isFinite(dtSeconds) ? dtSeconds : 0, .1));
    this._time += dt;
    if (this.mode === '3d' && this._rig && this._renderer) {
      this._rig.update(dt, this._motion);
      this._pivot.rotation.y = this._facing * .38;
      this._renderer.render(this._scene, this._camera);
    } else if (this._image) {
      // Flat mode deliberately retains its original cutout. Tiny hops signal
      // movement without pretending the portrait has a 3D skeleton.
      const moving = this._motion === 'walk' || this._motion === 'run';
      this._imageOffset = moving ? -Math.abs(Math.sin(this._time * (this._motion === 'run' ? 15 : 9))) * this._height * .025 : 0;
      this._image.style.transform = `translateY(${this._imageOffset}px) scaleX(${this.id === 'xiaocao' ? 1 : this._facing})`;
    }
  }

  hitTest(clientX, clientY) {
    if (this._destroyed) return false;
    const element = this.mode === '3d' ? this._renderer?.domElement : this._image;
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (clientX < rect.left || clientY < rect.top || clientX >= rect.right || clientY >= rect.bottom || !rect.width || !rect.height) return false;
    if (this.mode === '3d') {
      const gl = this._renderer.getContext();
      const x = Math.floor((clientX - rect.left) / rect.width * gl.drawingBufferWidth);
      const y = gl.drawingBufferHeight - 1 - Math.floor((clientY - rect.top) / rect.height * gl.drawingBufferHeight);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this._pixel);
      return this._pixel[3] > 16;
    }
    const image = this._image, scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
    let x = clientX - rect.left - (rect.width - width) / 2;
    const y = clientY - rect.top - (rect.height - height) / 2;
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    if (this._facing < 0 && this.id !== 'xiaocao') x = width - x - Number.EPSILON;
    const ix = Math.min(image.naturalWidth - 1, Math.floor(x / scale)), iy = Math.floor(y / scale);
    return this._imageAlpha[(iy * image.naturalWidth + ix) * 4 + 3] > 16;
  }

  destroy() { this._destroyed = true; ++this._version; this._clear(); }
}
