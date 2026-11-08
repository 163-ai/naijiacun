import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readPackedModel, selectPackedBlock, toBase64, fromBase64 } from '../model-buffer.js';

test('decoder only accepts an exact compressed block already present in a packaged GLB', async () => {
  const buffer = await readFile(new URL('../../assets/models/naicha.glb', import.meta.url));
  const model = readPackedModel(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  const definition = model.json.bufferViews.find(view => view.extensions?.EXT_meshopt_compression).extensions.EXT_meshopt_compression;
  const request = { offset: definition.byteOffset, length: definition.byteLength, count: definition.count, stride: definition.byteStride, mode: definition.mode, filter: definition.filter || 'NONE' };
  const bytes = selectPackedBlock(model, request);
  assert.equal(bytes.length, definition.byteLength);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
  for (const patch of [{ offset: 1 }, { count: 99999999 }, { length: 1 }, { mode: 'javascript' }, { filter: 'invalid' }]) {
    assert.throws(() => selectPackedBlock(model, { ...request, ...patch }), /仅允许解码/);
  }
});
