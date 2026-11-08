import { PetRenderer } from './pet-renderer.js?v=site-pets-1';

export function createSitePet({ catalog, onChange }) {
  const host = document.createElement('div');
  host.id = 'naijiacun-site-pet';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = new URL('../css/site-pet.css?v=site-pets-1', import.meta.url).href;
  shadow.append(style);
  function element(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    for (const child of children) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    return node;
  }
  const button = (action, text) => element('button', { type: 'button', 'data-action': action }, [text]);
  const name = element('span', { class: 'pet-name' });
  const visual = element('div', { class: 'visual', 'aria-hidden': 'true' });
  const placeholder = element('img', { alt: '', 'aria-hidden': 'true', draggable: 'false', hidden: '' });
  placeholder.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;';
  const menuButton = button('menu', '⋯'); menuButton.setAttribute('aria-label', '打开桌宠设置'); menuButton.setAttribute('aria-expanded', 'false');
  const closeButton = button('close', '×'); closeButton.setAttribute('aria-label', '收回村民');
  const tools = element('div', { class: 'tools' }, [name, menuButton, closeButton]);
  const villager = element('select', { id: 'sitePetVillager' });
  catalog.forEach(person => villager.add(new Option(person.name, person.id)));
  const size = element('input', { type: 'range', id: 'sitePetSize', min: '80', max: '300', step: '4' });
  const activity = element('input', { type: 'checkbox', id: 'sitePetActivity' });
  const mode2d = element('button', { type: 'button', 'data-mode': '2d' }, ['平面']);
  const mode3d = element('button', { type: 'button', 'data-mode': '3d' }, ['真实 3D']);
  const notice = element('p', { class: 'notice', role: 'status' });
  const panel = element('section', { class: 'panel', role: 'dialog', 'aria-label': '站内桌宠设置', hidden: '' }, [
    element('header', {}, [element('strong', {}, ['村民小口袋']), button('menu-close', '×')]),
    element('label', { for: 'sitePetVillager' }, ['今天，谁来陪你？']), villager,
    element('div', { class: 'row' }, [mode2d, mode3d]),
    element('label', { for: 'sitePetSize' }, ['形象大小']), size,
    element('label', { class: 'check' }, [activity, ' 自由活动']),
    element('div', { class: 'row' }, [button('laugh', '笑一个'), button('run', '跑一跑')]),
    button('return', '回桌宠小院'),
    notice, button('close', '收回村民')
  ]);
  panel.querySelector('[data-action=menu-close]').setAttribute('aria-label', '关闭设置');
  const shell = element('div', { class: 'shell' }, [visual, placeholder, tools, panel]);
  shadow.append(shell); document.body.append(host);
  const renderer = new PetRenderer(visual, { catalog, resolveAsset: path => new URL(path, document.baseURI).href });
  const abort = new AbortController(), { signal } = abort;
  let state, left = 0, top = 0, facing = 1, drag, clickGuard, dead = false, version = 0, requested;
  let lastFrame = 0, lastSave = 0, dirty = false, phase = 0, phaseTime = 0, laughAudio = null;
  const phases = [['idle', 4], ['walk', 7], ['idle', 2], ['run', 4]];
  const bounds = () => ({ x: Math.max(0, innerWidth - state.size * .9 - 24), y: Math.max(0, innerHeight - state.size - 48 - (innerWidth < 681 && document.querySelector('.village-bottom-nav') ? 84 : 12)) });
  function place(x = left, y = top) {
    const b = bounds(); left = Math.max(12, Math.min(12 + b.x, x)); top = Math.max(42, Math.min(42 + b.y, y));
    shell.style.transform = `translate3d(${left}px,${top}px,0)`;
  }
  function restore() { const b = bounds(); place(12 + b.x * state.x, 42 + b.y * state.y); }
  function save(force = false) {
    if (!dirty || (!force && performance.now() - lastSave < 1800)) return;
    const b = bounds(); lastSave = performance.now(); dirty = false;
    const patch = { x: (left - 12) / Math.max(1, b.x), y: (top - 42) / Math.max(1, b.y) };
    state = { ...state, ...patch }; void onChange(patch, false);
  }
  function sync() {
    const person = catalog.find(person => person.id === state.id);
    name.textContent = person.name; villager.value = state.id; size.value = state.size; activity.checked = state.activity;
    mode2d.setAttribute('aria-pressed', String(state.mode === '2d')); mode3d.setAttribute('aria-pressed', String(state.mode === '3d'));
    mode3d.disabled = !person.model;
  }
  function closeMenu() { panel.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); }
  function positionMenu() {
    const rect = panel.getBoundingClientRect();
    const x = Math.max(12, Math.min(innerWidth - rect.width - 12, left));
    const y = Math.max(12, Math.min(innerHeight - rect.height - 12, top - rect.height - 42));
    shell.style.setProperty('--panel-left', `${x - left}px`); shell.style.setProperty('--panel-top', `${y - top}px`);
  }
  function openMenu() {
    panel.hidden = false; menuButton.setAttribute('aria-expanded', 'true'); positionMenu();
    villager.focus({ preventScroll: true });
  }
  // 闭合 shadow 在 document 监听器中只暴露 host；能命中它的只有工具条和面板。
  const isControl = event => event.composedPath().includes(host);
  const hit = event => state && renderer.hitTest(event.clientX, event.clientY);
  function stopLaughAudio() { if (laughAudio) { laughAudio.pause(); laughAudio = null; } }
  function laugh() {
    if (!renderer.playAction('laugh')) return;
    stopLaughAudio();
    try { if (localStorage.getItem('p3-sound') === 'off') return; } catch (error) { /* 沿用展台默认声音开关。 */ }
    laughAudio = new Audio(new URL('audio/laugh.mp3?v=2', document.baseURI).href);
    void laughAudio.play().catch(() => {});
  }
  shadow.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') void onChange({ enabled: false });
    if (action === 'menu') panel.hidden ? openMenu() : closeMenu();
    if (action === 'menu-close') closeMenu();
    if (action === 'run') { void onChange({ motion: 'run', activity: true }); closeMenu(); }
    if (action === 'laugh') { laugh(); closeMenu(); }
    if (action === 'return') location.href = new URL('pet.html', document.baseURI).href;
  }, { signal });
  panel.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape') { closeMenu(); menuButton.focus(); } }, { signal });
  tools.addEventListener('keydown', event => event.stopPropagation(), { signal });
  villager.addEventListener('change', () => void onChange({ id: villager.value }), { signal });
  size.addEventListener('input', () => void onChange({ size: Number(size.value) }), { signal });
  activity.addEventListener('change', () => void onChange({ activity: activity.checked }), { signal });
  [mode2d, mode3d].forEach(button => button.addEventListener('click', () => void onChange({ mode: button.dataset.mode }), { signal }));
  document.addEventListener('pointerdown', event => {
    if (isControl(event)) return;
    closeMenu();
    if (event.button !== 0 || !hit(event)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    stopLaughAudio();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left, top, at: performance.now(), moved: false };
    document.documentElement.setPointerCapture(event.pointerId);
    renderer.setMotion('dragged');
  }, { capture: true, passive: false, signal });
  document.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const dx = event.clientX - drag.x; if (Math.abs(dx) > 3) facing = dx < 0 ? -1 : 1;
    if (Math.hypot(dx, event.clientY - drag.y) > 6) drag.moved = true;
    place(drag.left + dx, drag.top + event.clientY - drag.y); dirty = true; save();
  }, { capture: true, passive: false, signal });
  function release(event) {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.id)) return;
    const clicked = event.type === 'pointerup' && !drag.moved && performance.now() - drag.at < 450;
    if (event.type === 'pointerup') { event.preventDefault(); event.stopImmediatePropagation(); clickGuard = { x: event.clientX, y: event.clientY, until: performance.now() + 400 }; }
    if (document.documentElement.hasPointerCapture(drag.id)) document.documentElement.releasePointerCapture(drag.id);
    drag = null; save(true); renderer.setMotion('idle'); renderer.update(0);
    if (clicked) laugh();
  }
  document.addEventListener('pointerup', release, { capture: true, passive: false, signal });
  document.addEventListener('pointercancel', release, { capture: true, signal }); window.addEventListener('blur', release, { signal });
  document.addEventListener('click', event => {
    if (clickGuard && performance.now() < clickGuard.until && Math.hypot(event.clientX - clickGuard.x, event.clientY - clickGuard.y) < 8) { event.preventDefault(); event.stopImmediatePropagation(); clickGuard = null; }
  }, { capture: true, signal });
  document.addEventListener('touchstart', event => {
    const touch = event.touches[0]; if (touch && !isControl(event) && hit(touch)) event.preventDefault();
  }, { capture: true, passive: false, signal });
  document.addEventListener('contextmenu', event => { if (!isControl(event) && hit(event)) { event.preventDefault(); event.stopImmediatePropagation(); openMenu(); } }, { capture: true, signal });
  window.addEventListener('resize', () => { if (state) { restore(); closeMenu(); } }, { signal });
  function frame(now) {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (!state || now - lastFrame < 32) return;
    const dt = lastFrame ? Math.min(.1, (now - lastFrame) / 1000) : 1 / 30; lastFrame = now;
    let motion = 'idle';
    if (drag) motion = 'dragged';
    else if (state.activity && panel.hidden) {
      if (state.motion === 'auto') { phaseTime += dt; if (phaseTime > phases[phase][1]) { phaseTime = 0; phase = (phase + 1) % phases.length; } motion = phases[phase][0]; }
      else motion = state.motion;
    }
    if (renderer.action === 'laugh') motion = 'idle';
    if (!drag && ['walk', 'run'].includes(motion)) {
      const b = bounds(), next = left + facing * state.size * (motion === 'run' ? .7 : .28) * dt;
      if (next < 12 || next > 12 + b.x) facing *= -1;
      place(next, top); dirty = true;
    }
    renderer.setFacing(facing); renderer.setMotion(motion);
    if (state.activity || drag || renderer.action) renderer.update(dt);
    save();
  }
  let raf = requestAnimationFrame(frame);
  return {
    async applyState(next) {
      if (dead) return;
      const old = state; state = { ...next };
      shell.style.width = `${state.size * .9}px`; shell.style.height = `${state.size}px`; renderer.setSize(state.size);
      if (!drag && (!old || old.x !== state.x || old.y !== state.y || old.size !== state.size)) restore();
      if (!panel.hidden && old && old.size !== state.size) positionMenu();
      sync();
      const visualKey = `${state.id}/${state.mode}`;
      if (requested === visualKey) return;
      requested = visualKey; const current = ++version, person = catalog.find(person => person.id === state.id);
      stopLaughAudio();
      placeholder.src = new URL(person.image, document.baseURI).href; placeholder.hidden = false;
      notice.textContent = state.mode === '3d' ? '正在准备立体形象…' : '正在请出村民…';
      try {
        await renderer.setCharacter(state.id, state.mode); if (dead || current !== version) return;
        renderer.update(0); placeholder.hidden = true;
        notice.textContent = person.model ? '轻点身体笑一个，按住拖动。只在奶家村内陪伴。' : '小草使用透明 2D 形象，轻点身体也能笑一个。';
      } catch (error) {
        if (dead || current !== version) return;
        requested = undefined;
        if (state.mode === '3d') {
          try {
            await renderer.setMode('2d'); if (dead || current !== version) return;
            state.mode = '2d'; renderer.update(0); placeholder.hidden = true; sync();
            notice.textContent = '3D 暂未加载，已切换平面，可再次点击重试。'; void onChange({ mode: '2d' }, false); return;
          } catch (fallbackError) { /* 保留平面预览，菜单仍可切换或收回。 */ }
        }
        notice.textContent = '形象加载失败，请切换村民或重试。';
      }
    },
    destroy() {
      if (dead) return;
      if (drag) release({ type: 'destroy' }); save(true);
      dead = true; ++version; stopLaughAudio(); abort.abort(); cancelAnimationFrame(raf); renderer.destroy(); host.remove();
    }
  };
}
