import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeState, sanitizePatch } from '../state.js';

const catalog = [{ id: 'nailong', model: 'assets/models/nailong.glb' }, { id: 'xiaocao' }];

test('page input cannot introduce an unknown character, arbitrary URL, or invalid mode', () => {
  assert.deepEqual(sanitizePatch({ id: 'https://evil.test/model.glb', mode: 'javascript', enabled: true, url: 'https://evil.test' }, catalog), { enabled: true });
  assert.deepEqual(sanitizePatch({ id: 'nailong', mode: '3d', size: 9999, x: -2, y: 2, motion: 'run', activity: false }, catalog), { id: 'nailong', mode: '3d', size: 360, x: 0, y: 1, motion: 'run', activity: false });
});

test('a 2D-only villager always restores truthfully and normalized positions survive navigation', () => {
  const state = normalizeState({ enabled: true, id: 'xiaocao', mode: '3d', x: .2, y: .8, size: 170 }, catalog);
  assert.equal(state.mode, '2d');
  assert.equal(state.x, .2);
  assert.equal(state.y, .8);
  assert.equal(state.size, 170);
  assert.equal(normalizeState({ id: 'missing', size: NaN }, catalog).id, 'nailong');
});
