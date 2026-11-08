export function toBase64(bytes) {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) text += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(text);
}

export function fromBase64(value) {
  const text = atob(value);
  return Uint8Array.from(text, char => char.charCodeAt(0));
}

export function readPackedModel(bytes) {
  const view = new DataView(bytes);
  let json, binary;
  for (let offset = 12; offset < view.byteLength;) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, offset + 8, length)));
    if (type === 0x004e4942) binary = new Uint8Array(bytes, offset + 8, length);
    offset += length + 8;
  }
  return { json, binary };
}

export function selectPackedBlock(model, request) {
  const definition = model.json.bufferViews.map(view => view.extensions?.EXT_meshopt_compression).filter(Boolean).find(view =>
    view.buffer === 0 && view.byteOffset === request.offset && view.byteLength === request.length &&
    view.count === request.count && view.byteStride === request.stride && view.mode === request.mode &&
    (view.filter || 'NONE') === (request.filter || 'NONE')
  );
  if (!definition || definition.count * definition.byteStride > 16 * 1024 * 1024) throw new Error('仅允许解码当前本地模型的已知缓冲');
  return new Uint8Array(model.binary.buffer, model.binary.byteOffset + definition.byteOffset, definition.byteLength);
}
