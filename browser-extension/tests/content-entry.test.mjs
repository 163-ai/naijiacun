import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../content-entry.js', import.meta.url), 'utf8');

function page(url, { hidden = false, enabled = false, framed = false } = {}) {
  const calls = [], replies = [], imports = [], windowEvents = new Map(), documentEvents = new Map();
  let storageChanged;
  const state = { enabled, id: 'nailong', mode: '3d' };
  const context = {
    location: new URL(url),
    console: { warn() {} },
    document: { hidden, addEventListener(name, callback) { documentEvents.set(name, callback); } },
    addEventListener(name, callback) { windowEvents.set(name, callback); },
    postMessage(message) { replies.push(message); },
    chrome: {
      runtime: {
        id: 'test-extension', getManifest: () => ({ version: '1.0.0' }),
        getURL(file) { imports.push(file); return `chrome-extension://test-extension/${file}`; },
        async sendMessage(message) { calls.push(message); return { ok: true, state, version: '1.0.0' }; },
        onMessage: { addListener() {} }
      },
      storage: { onChanged: { addListener(callback) { storageChanged = callback; } } }
    }
  };
  context.window = context;
  context.top = framed ? {} : context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return {
    calls, replies, imports, document: context.document,
    async settle() { await new Promise(resolve => setImmediate(resolve)); },
    async send(type, extra = {}) {
      if (!windowEvents.has('message')) return;
      context.incoming = { origin: context.location.origin, data: { channel: 'NAIJIACUN_PET', type, requestId: 'request-1' }, ...extra };
      context.receive = windowEvents.get('message');
      await vm.runInContext('receive({ ...incoming, source: incoming.source || window })', context);
    },
    visibility() { documentEvents.get('visibilitychange')?.(); },
    update(next) { storageChanged?.({ petState: { newValue: next } }, 'local'); }
  };
}

test('actual content bridge permits only the exact village origins and path', async () => {
  for (const url of ['https://163-ai.github.io/naijiacun/', 'http://127.0.0.1:8012/naijiacun/pet.html']) {
    const target = page(url);
    await target.settle();
    await target.send('STOP');
    assert.equal(target.calls.at(-1).type, 'STOP', url);
    assert.equal(target.replies.at(-1).requestId, 'request-1', url);
  }
  for (const url of ['https://163-ai.github.io/elsewhere/', 'https://163-ai.github.io/naijiacun.evil/', 'https://163-ai.github.io.evil/naijiacun/', 'http://127.0.0.1:8013/naijiacun/', 'https://example.com/']) {
    const target = page(url);
    await target.settle();
    await target.send('STOP');
    assert.equal(target.calls.length, 1, url);
    assert.equal(target.replies.length, 0, url);
  }
});

test('iframe-originated and cross-origin messages cannot control the trusted bridge', async () => {
  const target = page('https://163-ai.github.io/naijiacun/pet.html');
  await target.settle();
  await target.send('STOP', { source: {} });
  await target.send('STOP', { origin: 'https://evil.test' });
  assert.equal(target.calls.length, 1);
  assert.equal(target.replies.length, 1); // Initial trusted-page STATE only.
  const frame = page('https://163-ai.github.io/naijiacun/pet.html', { framed: true });
  await frame.settle();
  assert.equal(frame.calls.length, 0);
});

test('disabled pages and background pages never import the renderer or model', async () => {
  for (const config of [{ enabled: false }, { enabled: true, hidden: true }]) {
    const target = page('https://example.com/', config);
    await target.settle();
    assert.deepEqual(target.imports, []);
  }
  const background = page('https://example.com/', { enabled: true, hidden: true });
  await background.settle();
  background.document.hidden = false;
  background.visibility();
  await background.settle();
  assert.deepEqual(background.imports, ['overlay.js']);
});

test('trusted page receives initial and changed extension state without a request ID', async () => {
  const target = page('https://163-ai.github.io/naijiacun/pet.html');
  await target.settle();
  target.update({ enabled: false, id: 'xiaocao', mode: '2d' });
  await target.settle();
  assert.equal(target.replies.length, 2);
  assert.equal(target.replies[0].type, 'STATE');
  assert.equal(target.replies[1].type, 'STATE');
  assert.equal(target.replies[1].state.id, 'xiaocao');
  assert.equal(target.replies[1].requestId, undefined);
});
