import { PetRenderer } from './js/pet-renderer.js';
import { CATALOG } from './catalog.js';
import { createMeshoptProxy } from './meshopt-proxy.js';

export function createOverlay({ request }) {
  const host = document.createElement('div');
  host.id = 'naijiacun-pet-overlay';
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;display:block!important;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :host{color-scheme:light}*{box-sizing:border-box} .stage{position:absolute;left:0;top:0;pointer-events:none;user-select:none;touch-action:none;contain:layout style}
    .stage canvas,.stage img{pointer-events:none!important;user-select:none!important}
    .menu{position:absolute;width:240px;padding:15px;border:1px solid #d4c9b5;border-radius:17px;background:#fffaf0;color:#453c31;box-shadow:0 8px 30px #362b3326;font:13px/1.5 system-ui,'Microsoft YaHei',sans-serif;pointer-events:auto;user-select:none}
    .menu[hidden],.notice[hidden]{display:none}.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}.head strong{font-size:16px}.head button{border:0;background:transparent;padding:0 4px;font-size:20px;color:#756956}
    label{display:block;margin:10px 0 4px}select,button{font:inherit;cursor:pointer}select{width:100%;border:1px solid #d9cdb9;border-radius:8px;padding:6px;background:#fffef9;color:inherit}
    .row{display:flex;gap:6px;margin-top:10px}.row button{flex:1;border:1px solid #d9cdb9;border-radius:9px;padding:6px 3px;background:#fffef9;color:inherit}.row button[aria-pressed=true]{background:#ede2be;border-color:#b59a5a}.row button:disabled{opacity:.45;cursor:default}
    input[type=range]{width:100%;accent-color:#807149}input[type=checkbox]{accent-color:#807149} .check{display:flex;align-items:center;gap:5px}.hint{font-size:11px;color:#81715d;margin:9px 0 0}.stop{width:100%;margin-top:13px;padding:7px;border:1px solid #dfc5ba;border-radius:9px;background:#f5e4da;color:#785044}
    .notice{position:absolute;max-width:260px;padding:9px 12px;border-radius:10px;background:#fffaf0;color:#695543;border:1px solid #dbcbb3;font:12px/1.5 system-ui,sans-serif;pointer-events:none;box-shadow:0 4px 18px #0001}
  `);
  shadow.adoptedStyleSheets = [sheet];
  function element(tag, attributes = {}, children = []) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    return node;
  }
  shadow.append(
    element('div', { class: 'stage', 'aria-hidden': 'true' }),
    element('section', { class: 'menu', role: 'dialog', 'aria-label': '村民桌宠设置', hidden: '' }, [
      element('div', { class: 'head' }, [element('strong', {}, ['村民小口袋']), element('button', { type: 'button', 'data-action': 'close', 'aria-label': '关闭设置' }, ['×'])]),
      element('label', { for: 'villager' }, ['陪伴村民']), element('select', { id: 'villager' }),
      element('div', { class: 'row', 'aria-label': '显示模式' }, [element('button', { type: 'button', 'data-mode': '2d' }, ['平面']), element('button', { type: 'button', 'data-mode': '3d' }, ['真实 3D'])]),
      element('label', { for: 'size' }, ['大小 ', element('output', { id: 'size-value' })]), element('input', { id: 'size', type: 'range', min: '100', max: '360', step: '10' }),
      element('label', { class: 'check' }, [element('input', { id: 'activity', type: 'checkbox' }), ' 自由活动（取消即暂停）']),
      element('label', { for: 'motion' }, ['活动方式']), element('select', { id: 'motion' }, [
        element('option', { value: 'auto' }, ['随心散步']), element('option', { value: 'idle' }, ['原地休息']), element('option', { value: 'walk' }, ['慢慢走']), element('option', { value: 'run' }, ['跑一跑'])
      ]),
      element('p', { class: 'hint', id: 'mode-note' }), element('p', { class: 'hint' }, ['拖动身体安放 · 右键打开口袋', element('br'), '透明处可直接点击网页']),
      element('button', { class: 'stop', type: 'button', 'data-action': 'stop' }, ['收回村民'])
    ]),
    element('div', { class: 'notice', role: 'status', hidden: '' })
  );
  const stage = shadow.querySelector('.stage');
  const menu = shadow.querySelector('.menu');
  const notice = shadow.querySelector('.notice');
  const villager = shadow.querySelector('#villager');
  for (const item of CATALOG) villager.add(new Option(item.name, item.id));
  document.documentElement.append(host);
  const renderer = new PetRenderer(stage, { catalog: CATALOG, resolveAsset: path => chrome.runtime.getURL(path), meshoptDecoder: createMeshoptProxy(() => renderer.id) });
  stage.style.position = 'absolute';
  const controller = new AbortController();
  const { signal } = controller;
  let state;
  let destroyed = false;
  let requestedVisual;
  let applyRevision = 0;
  let left = 0;
  let top = 0;
  let direction = Math.random() < .5 ? -1 : 1;
  let drag;
  let clickGuard;
  let raf = 0;
  let lastFrame = 0;
  let phaseTime = 0;
  let phaseIndex = 0;
  let lastSave = 0;
  let positionDirty = false;
  const phases = [['idle', 4], ['walk', 8], ['idle', 3], ['run', 5], ['walk', 7]];

  const dimensions = () => ({ width: stage.getBoundingClientRect().width || state.size, height: stage.getBoundingClientRect().height || state.size });
  function place(x = left, y = top) {
    const { width, height } = dimensions();
    left = Math.max(0, Math.min(Math.max(0, innerWidth - width), x));
    top = Math.max(0, Math.min(Math.max(0, innerHeight - height), y));
    stage.style.transform = `translate3d(${left}px,${top}px,0)`;
  }
  function restorePosition() {
    const { width, height } = dimensions();
    place(state.x * Math.max(0, innerWidth - width), state.y * Math.max(0, innerHeight - height));
  }
  function savePosition(force = false) {
    if (!state || !positionDirty || (!force && performance.now() - lastSave < 1800)) return;
    const { width, height } = dimensions();
    lastSave = performance.now();
    positionDirty = false;
    const patch = { x: left / Math.max(1, innerWidth - width), y: top / Math.max(1, innerHeight - height) };
    state = { ...state, ...patch };
    void request('SET_STATE', patch).catch(() => {});
  }
  function showNotice(message) {
    notice.textContent = message;
    notice.hidden = false;
    notice.style.left = `${Math.max(8, Math.min(innerWidth - 270, left))}px`;
    notice.style.top = `${Math.max(8, top - 48)}px`;
  }
  function syncMenu() {
    villager.value = state.id;
    shadow.querySelector('#size').value = state.size;
    shadow.querySelector('#size-value').textContent = `${Math.round(state.size)} px`;
    shadow.querySelector('#activity').checked = state.activity;
    shadow.querySelector('#motion').value = state.motion;
    for (const button of shadow.querySelectorAll('[data-mode]')) {
      button.setAttribute('aria-pressed', String(state.mode === button.dataset.mode));
      button.disabled = button.dataset.mode === '3d' && !CATALOG.find(item => item.id === state.id).model;
    }
    shadow.querySelector('#mode-note').textContent = state.id === 'xiaocao' ? '小草使用透明平面形象。' : '3D 使用本地立体模型，首次切换稍等片刻。';
  }
  function openMenu(x, y) {
    syncMenu();
    menu.hidden = false;
    menu.style.left = `${Math.max(8, Math.min(innerWidth - 248, x))}px`;
    menu.style.top = `${Math.max(8, Math.min(innerHeight - menu.offsetHeight - 8, y))}px`;
    villager.focus({ preventScroll: true });
  }
  const hit = event => !destroyed && state && renderer.hitTest(event.clientX, event.clientY);
  const isControl = event => event.composedPath().includes(host) && !menu.hidden;
  async function change(patch) {
    try {
      const result = await request('SET_STATE', patch);
      if (!result.ok) showNotice(result.error || '暂时无法保存，请刷新页面。');
    } catch {
      showNotice('扩展已更新，请刷新页面。');
    }
  }
  villager.addEventListener('change', () => void change({ id: villager.value }), { signal });
  shadow.querySelector('#size').addEventListener('input', event => {
    shadow.querySelector('#size-value').textContent = `${event.target.value} px`;
  }, { signal });
  shadow.querySelector('#size').addEventListener('change', event => void change({ size: Number(event.target.value) }), { signal });
  shadow.querySelector('#activity').addEventListener('change', event => void change({ activity: event.target.checked }), { signal });
  shadow.querySelector('#motion').addEventListener('change', event => void change({ motion: event.target.value, activity: true }), { signal });
  for (const button of shadow.querySelectorAll('[data-mode]')) button.addEventListener('click', () => void change({ mode: button.dataset.mode }), { signal });
  shadow.querySelector('[data-action=close]').addEventListener('click', () => { menu.hidden = true; }, { signal });
  shadow.querySelector('[data-action=stop]').addEventListener('click', () => void request('STOP'), { signal });

  // The stage always has pointer-events:none. Capture only opaque pixels at
  // document level, so holes between legs and all transparent margins reach the page.
  document.addEventListener('pointerdown', event => {
    if (isControl(event)) return;
    if (!menu.hidden) menu.hidden = true;
    if (event.button !== 0 || !hit(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left, top };
    document.documentElement.setPointerCapture(event.pointerId);
    renderer.setMotion('dragged');
  }, { capture: true, passive: false, signal });
  document.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) > 3) direction = dx > 0 ? 1 : -1;
    place(drag.left + dx, drag.top + event.clientY - drag.y);
    positionDirty = true;
    savePosition();
  }, { capture: true, passive: false, signal });
  function release(event) {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    if (event.type === 'pointerup') {
      event.preventDefault();
      event.stopImmediatePropagation();
      clickGuard = { until: performance.now() + 400, x: event.clientX, y: event.clientY };
    }
    if (document.documentElement.hasPointerCapture(drag.pointerId)) document.documentElement.releasePointerCapture(drag.pointerId);
    drag = undefined;
    savePosition(true);
  }
  document.addEventListener('pointerup', release, { capture: true, passive: false, signal });
  document.addEventListener('pointercancel', release, { capture: true, signal });
  window.addEventListener('blur', release, { signal });
  document.addEventListener('click', event => {
    if (clickGuard && performance.now() < clickGuard.until && Math.hypot(event.clientX - clickGuard.x, event.clientY - clickGuard.y) < 8) {
      event.preventDefault(); event.stopImmediatePropagation(); clickGuard = undefined;
    }
  }, { capture: true, signal });
  document.addEventListener('contextmenu', event => {
    if (isControl(event) || !hit(event)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    openMenu(event.clientX, event.clientY);
  }, { capture: true, signal });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') menu.hidden = true; }, { signal });
  window.addEventListener('resize', () => { restorePosition(); menu.hidden = true; }, { signal });

  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (!state || now - lastFrame < 1000 / 30 - .5) return;
    const dt = lastFrame ? Math.min(.1, (now - lastFrame) / 1000) : 1 / 30;
    lastFrame = now;
    let motion = 'idle';
    if (drag) motion = 'dragged';
    else if (state.activity && menu.hidden) {
      if (state.motion === 'auto') {
        phaseTime += dt;
        if (phaseTime > phases[phaseIndex][1]) { phaseTime = 0; phaseIndex = (phaseIndex + 1) % phases.length; }
        motion = phases[phaseIndex][0];
      } else motion = state.motion;
    }
    if (!drag && ['walk', 'run'].includes(motion)) {
      const { width } = dimensions();
      const limit = Math.max(0, innerWidth - width);
      const speed = state.size * (motion === 'run' ? .7 : .28);
      let next = left + direction * speed * dt;
      if (next <= 0 || next >= limit) { direction *= -1; next = Math.max(0, Math.min(limit, next)); }
      place(next, top);
      positionDirty = true;
    }
    renderer.setFacing(direction);
    renderer.setMotion(motion);
    if (state.activity || drag) renderer.update(dt);
    savePosition();
  }
  raf = requestAnimationFrame(frame);

  return {
    async applyState(next) {
      if (destroyed) return;
      const previous = state;
      state = { ...next };
      stage.style.width = `${state.size}px`;
      stage.style.height = `${state.size}px`;
      renderer.setSize(state.size);
      if (!drag && (!previous || previous.x !== state.x || previous.y !== state.y || previous.size !== state.size)) restorePosition();
      syncMenu();
      const visual = `${state.id}/${state.mode}`;
      if (requestedVisual === visual) return;
      requestedVisual = visual;
      const revision = ++applyRevision;
      const desired = { id: state.id, mode: state.mode };
      showNotice(`${CATALOG.find(item => item.id === desired.id).name}正在准备出发…`);
      try {
        await renderer.setCharacter(desired.id);
        if (destroyed || revision !== applyRevision) return;
        const actualMode = await renderer.setMode(desired.mode);
        if (destroyed || revision !== applyRevision) return;
        renderer.update(0);
        restorePosition();
        notice.hidden = true;
        if (actualMode !== desired.mode) {
          showNotice('此设备暂时无法显示 3D，已切换透明平面。');
          void change({ mode: actualMode });
        }
      } catch (error) {
        if (!destroyed && revision === applyRevision) {
          requestedVisual = undefined;
          if (desired.mode === '3d') {
            try {
              await renderer.setMode('2d');
              if (destroyed || revision !== applyRevision) return;
              renderer.update(0);
              showNotice('此设备暂时无法显示 3D，已切换透明平面。');
              void change({ mode: '2d' });
              return;
            } catch { /* Keep the original model error when the cutout also fails. */ }
          }
          showNotice(`村民暂未加载：${error.message}`);
        }
      }
    },
    destroy() {
      if (destroyed) return;
      if (drag) release({ type: 'destroy' });
      savePosition(true);
      destroyed = true;
      ++applyRevision;
      cancelAnimationFrame(raf);
      controller.abort();
      renderer.destroy();
      host.remove();
    }
  };
}
