import { fromBase64 } from './model-buffer.js';

// Strict host-page CSP can block even isolated-world WebAssembly in Chromium.
// Ask our own extension worker to decode an exact buffer from its packaged model;
// no compressed bytes, arbitrary URLs, or executable code cross this channel.
export function createMeshoptProxy(getId) {
  return {
    supported: true,
    ready: Promise.resolve(),
    async decodeGltfBufferAsync(count, stride, source, mode, filter) {
      const result = await chrome.runtime.sendMessage({
        channel: 'NAIJIACUN_EXTENSION', type: 'DECODE_MODEL_BLOCK', id: getId(),
        offset: source.byteOffset, length: source.byteLength, count, stride, mode, filter: filter || 'NONE'
      });
      if (!result.ok) throw new Error(result.error || '本地模型解码失败');
      return fromBase64(result.data);
    }
  };
}
