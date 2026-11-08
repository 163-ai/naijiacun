import { readFile, writeFile, mkdir, copyFile, rm, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.dirname(extensionDir);
const outputDir = path.resolve(extensionDir, 'dist');
if (path.dirname(outputDir) !== extensionDir || path.basename(outputDir) !== 'dist') throw new Error('构建输出必须是 browser-extension/dist');

const context = vm.createContext({ window: {} });
vm.runInContext(`${await readFile(path.join(repoDir, 'js/data.js'), 'utf8')}\n;globalThis.villagers = PEOPLE;`, context, { timeout: 1000 });
vm.runInContext(await readFile(path.join(repoDir, 'js/3d-models.js'), 'utf8'), context, { timeout: 1000 });
const cleanPath = value => value.split('?')[0];
const catalog = context.villagers.map(person => {
  const entry = { id: person.id, name: person.name, image: cleanPath(person.id === 'xiaocao' ? 'assets/characters/xiaocao-cutout.webp' : person.petImage || person.image) };
  const model = context.window.N3D_MODELS[person.id];
  if (model) entry.model = cleanPath(model.file);
  return entry;
});
if (catalog.length !== 10 || catalog.filter(item => item.model).length !== 9) throw new Error('需要十位村民、九款真实模型');

const extensionFiles = ['manifest.json', 'content-entry.js', 'service-worker.js', 'overlay.js', 'state.js', 'meshopt-proxy.js', 'model-buffer.js', 'popup.html', 'popup.js', 'popup.css'];
const sharedFiles = [
  'js/pet-renderer.js', 'js/pet-motion.js', 'js/pet-laugh.js',
  'vendor/three/three.module.min.js', 'vendor/three/three.core.min.js',
  'vendor/three/GLTFLoader.js', 'vendor/three/BufferGeometryUtils.js', 'vendor/three/THREE-LICENSE.txt',
  'vendor/meshopt/meshopt_decoder.module.js', 'vendor/meshopt/LICENSE.md',
  ...catalog.flatMap(item => [item.image, ...(item.model ? [item.model] : [])])
];
// Validate every source before replacing the previous, ready-to-load build.
for (const file of extensionFiles) await stat(path.join(extensionDir, file));
for (const file of sharedFiles) {
  if (file.includes('..') || path.isAbsolute(file)) throw new Error(`资源路径无效：${file}`);
  await stat(path.join(repoDir, file));
}
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
async function copy(sourceRoot, relativePath) {
  const target = path.join(outputDir, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(sourceRoot, relativePath), target);
}
for (const file of extensionFiles) await copy(extensionDir, file);
for (const file of new Set(sharedFiles)) await copy(repoDir, file);
for (const file of ['vendor/three/GLTFLoader.js', 'vendor/three/BufferGeometryUtils.js']) {
  const target = path.join(outputDir, file);
  const source = await readFile(target, 'utf8');
  await writeFile(target, source.replace(/from 'three'/g, "from './three.module.min.js'"));
}
await writeFile(path.join(outputDir, 'catalog.js'), `// 仅保留桌宠必需的本地形象路径。由 build.mjs 生成。\nexport const CATALOG = ${JSON.stringify(catalog, null, 2)};\n`);
await writeFile(path.join(outputDir, 'README.txt'), '奶家村跨网页桌宠\n在 Chrome/Edge 扩展管理页打开开发者模式，选择“加载已解压的扩展程序”，选中本目录。\n安装前已打开的普通网页请刷新一次。点扩展图标打开小口袋，再点“请到网页上”。\n九位村民支持真实 3D，小草是透明平面；拖动身体安放，右键打开设置，透明处可点击网页。\n本目录已包含代码与模型，使用时不需要 Node、Python 或其他运行环境。\n');
let bytes = 0;
let count = 0;
async function measure(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await measure(full);
    else { bytes += (await stat(full)).size; count++; }
  }
}
await measure(outputDir);
console.log(`已构建 ${catalog.length} 位村民 / ${catalog.filter(item => item.model).length} 款 3D：${outputDir}`);
console.log(`${count} 个文件，${(bytes / 1024 / 1024).toFixed(1)} MiB。加载此目录即可；使用时无需额外运行环境。`);
