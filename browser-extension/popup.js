import { CATALOG } from './catalog.js';

const $ = selector => document.querySelector(selector);
const request = (type, patch) => chrome.runtime.sendMessage({ channel: 'NAIJIACUN_EXTENSION', type, patch });
let state;
let pageAvailable = false;
let operation = Promise.resolve();
for (const item of CATALOG) $('#villager').add(new Option(item.name, item.id));

function render(next) {
  state = next;
  $('#villager').value = state.id;
  $('#size').value = state.size;
  $('#size-value').textContent = `${Math.round(state.size)} px`;
  $('#activity').checked = state.activity;
  $('#motion').value = state.motion;
  for (const control of document.querySelectorAll('input,select,button')) control.disabled = false;
  const hasModel = Boolean(CATALOG.find(item => item.id === state.id).model);
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.disabled = button.dataset.mode === '3d' && !hasModel;
    button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
  }
  $('#mode-note').textContent = hasModel ? '3D 使用本地立体模型；首次显示请稍等。' : '小草使用透明平面形象，保留「太棒了」牌子。';
  $('#status').textContent = state.enabled ? `${CATALOG.find(item => item.id === state.id).name} ${state.activity ? '正在陪你逛网页' : '已暂停活动'}` : '村民在口袋里休息';
  $('#start').textContent = state.enabled ? '继续陪伴' : '请到网页上';
  $('#stop').disabled = !state.enabled;
}

function change(patch) {
  operation = operation.catch(() => {}).then(async () => {
    const result = await request('SET_STATE', patch);
    if (result.ok) render(result.state);
    else $('#status').textContent = result.error || '暂时无法保存，请重新打开小口袋。';
  }).catch(() => { $('#status').textContent = '扩展连接已更新，请重新打开小口袋。'; });
}

$('#villager').addEventListener('change', event => change({ id: event.target.value }));
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => change({ mode: button.dataset.mode }));
$('#size').addEventListener('input', event => { $('#size-value').textContent = `${event.target.value} px`; });
$('#size').addEventListener('change', event => change({ size: Number(event.target.value) }));
$('#activity').addEventListener('change', event => change({ activity: event.target.checked }));
$('#motion').addEventListener('change', event => change({ motion: event.target.value, activity: true }));
$('#start').addEventListener('click', () => {
  change({ enabled: true });
  if (!pageAvailable) $('#page-note').textContent = '设置已保存。打开普通网页即可陪伴；已打开的旧网页请刷新一次。';
});
$('#stop').addEventListener('click', () => change({ enabled: false }));
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.petState) render(changes.petState.newValue); });

try {
  const result = await request('GET_STATE');
  if (result.ok) render(result.state);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    const status = await chrome.tabs.sendMessage(tab.id, { channel: 'NAIJIACUN_EXTENSION', type: 'PAGE_STATUS' });
    pageAvailable = Boolean(status?.ok);
  } catch { /* Browser internal pages and pages opened before install have no receiver. */ }
  $('#page-note').textContent = pageAvailable ? '会跟随普通网页；后台标签页暂停，回来时恢复。' : '当前页暂不能显示。打开普通网页；安装前已打开的网页请刷新一次。';
} catch {
  $('#status').textContent = '小口袋暂未连接，请重新打开。';
}
