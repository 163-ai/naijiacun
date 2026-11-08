(() => {
  if (window.top !== window || globalThis.__naijiacunPetInstalled) return;
  globalThis.__naijiacunPetInstalled = true;
  let overlay;
  let latest;
  let revision = 0;
  let loading;
  const request = (type, patch) => chrome.runtime.sendMessage({ channel: 'NAIJIACUN_EXTENSION', type, patch });
  const trusted = (location.origin === 'https://163-ai.github.io' || location.origin === 'http://127.0.0.1:8012') && location.pathname.startsWith('/naijiacun/');

  async function applyState(state) {
    latest = state;
    if (trusted && state) window.postMessage({ channel: 'NAIJIACUN_PET_REPLY', type: 'STATE', state, version: chrome.runtime.getManifest().version }, location.origin);
    const currentRevision = ++revision;
    if (!state?.enabled || document.hidden) {
      overlay?.destroy();
      overlay = undefined;
      return;
    }
    try {
      loading ||= import(chrome.runtime.getURL('overlay.js'));
      const { createOverlay } = await loading;
      if (currentRevision !== revision || document.hidden || !latest?.enabled) return;
      overlay ||= createOverlay({ request });
      await overlay.applyState(latest);
    } catch (error) {
      console.warn('[奶家村桌宠] 加载失败', error);
      loading = undefined;
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.petState) void applyState(changes.petState.newValue);
  });
  document.addEventListener('visibilitychange', () => void applyState(latest));
  window.addEventListener('pagehide', () => { overlay?.destroy(); overlay = undefined; ++revision; });
  window.addEventListener('pageshow', () => void request('GET_STATE').then(result => result.ok && applyState(result.state)));
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id === chrome.runtime.id && message?.channel === 'NAIJIACUN_EXTENSION' && message.type === 'PAGE_STATUS') {
      reply({ ok: true, visible: !document.hidden, running: Boolean(overlay), state: latest });
    }
  });

  // The page has no access to extension APIs. Only this exact first-party path
  // can request a start/stop through postMessage; model URLs never enter here.
  if (trusted) window.addEventListener('message', async event => {
    const message = event.data;
    if (event.source !== window || event.origin !== location.origin || message?.channel !== 'NAIJIACUN_PET') return;
    if (!['PING', 'START', 'STOP'].includes(message.type) || typeof message.requestId !== 'string' || message.requestId.length > 160) return;
    let result;
    try {
      if (message.type === 'PING') result = await request('GET_STATE');
      else if (message.type === 'STOP') result = await request('STOP');
      else {
        const { CATALOG } = await import(chrome.runtime.getURL('catalog.js'));
        const payload = message.payload;
        if (!payload || !CATALOG.some(item => item.id === payload.id) || !['2d', '3d'].includes(payload.mode)) {
          result = { ok: false, error: '请选择有效的村民与显示模式' };
        } else {
          const patch = { id: payload.id, mode: payload.mode, enabled: true };
          if (typeof payload.size === 'number' && Number.isFinite(payload.size)) patch.size = payload.size;
          result = await request('SET_STATE', patch);
        }
      }
    } catch {
      result = { ok: false, error: '扩展连接已更新，请刷新本页后重试' };
    }
    window.postMessage({ channel: 'NAIJIACUN_PET_REPLY', requestId: message.requestId, ...result }, location.origin);
  });
  void request('GET_STATE').then(result => result.ok && applyState(result.state)).catch(() => {});
})();
