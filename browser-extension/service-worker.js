import { CATALOG } from './catalog.js';
import { normalizeState, sanitizePatch } from './state.js';
import { MeshoptDecoder } from './vendor/meshopt/meshopt_decoder.module.js';
import { toBase64, readPackedModel, selectPackedBlock } from './model-buffer.js';

let pending = Promise.resolve();
let cachedId;
let cachedModel;

async function getState() {
  return normalizeState((await chrome.storage.local.get('petState')).petState, CATALOG);
}

chrome.runtime.onInstalled.addListener(() => {
  pending = pending.then(async () => {
    await chrome.storage.local.set({ petState: await getState() });
  });
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id || message?.channel !== 'NAIJIACUN_EXTENSION') return;
  if (message.type === 'DECODE_MODEL_BLOCK') {
    if (!Number.isInteger(sender.tab?.id)) return;
    void (async () => {
      const state = await getState();
      const entry = CATALOG.find(item => item.id === message.id && item.model);
      if (!state.enabled || state.id !== message.id || !entry) throw new Error('仅允许解码当前村民的本地模型');
      if (cachedId !== entry.id || !cachedModel) {
        cachedId = entry.id;
        cachedModel = fetch(chrome.runtime.getURL(entry.model)).then(response => response.arrayBuffer()).then(readPackedModel);
      }
      const model = await cachedModel;
      const source = selectPackedBlock(model, message);
      const decoded = await MeshoptDecoder.decodeGltfBufferAsync(message.count, message.stride, source, message.mode, message.filter);
      reply({ ok: true, data: toBase64(decoded) });
    })().catch(error => reply({ ok: false, error: error.message }));
    return true;
  }
  if (!['GET_STATE', 'SET_STATE', 'STOP'].includes(message.type)) return;
  pending = pending.catch(() => {}).then(async () => {
    let state = await getState();
    if (message.type !== 'GET_STATE') {
      const patch = message.type === 'STOP' ? { enabled: false } : sanitizePatch(message.patch, CATALOG);
      state = normalizeState({ ...state, ...patch }, CATALOG);
      await chrome.storage.local.set({ petState: state });
      if (!state.enabled || state.id !== cachedId) { cachedId = undefined; cachedModel = undefined; }
    }
    reply({ ok: true, state, version: chrome.runtime.getManifest().version });
  }).catch(error => reply({ ok: false, error: error.message }));
  return true;
});
