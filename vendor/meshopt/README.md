# meshoptimizer decoder

`meshopt_decoder.module.js` 来自 meshoptimizer 0.25.0 npm 包，包含内嵌 WebAssembly，无运行时外部请求。上游：<https://github.com/zeux/meshoptimizer>。许可见同目录 `LICENSE.md`。

`js/pet3d.js` 将解码器传给现有 GLTFLoader，用于模型的 `EXT_meshopt_compression`；模型使用 `filter: NONE`，保留全部几何字节，不进行量化或减面。纹理由已有 GLTFLoader 的 `EXT_texture_webp` 支持读取。
