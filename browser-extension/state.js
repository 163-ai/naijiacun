export const DEFAULT_STATE = Object.freeze({
  enabled: false,
  id: 'nailong',
  mode: '3d',
  size: 200,
  activity: true,
  motion: 'auto',
  x: .82,
  y: .9
});

export function sanitizePatch(input, catalog) {
  const patch = {};
  if (!input || typeof input !== 'object') return patch;
  if (catalog.some(item => item.id === input.id)) patch.id = input.id;
  if (['2d', '3d'].includes(input.mode)) patch.mode = input.mode;
  for (const key of ['enabled', 'activity']) if (typeof input[key] === 'boolean') patch[key] = input[key];
  if (['auto', 'idle', 'walk', 'run'].includes(input.motion)) patch.motion = input.motion;
  for (const [key, low, high] of [['size', 100, 360], ['x', 0, 1], ['y', 0, 1]]) {
    if (typeof input[key] === 'number' && Number.isFinite(input[key])) patch[key] = Math.min(high, Math.max(low, input[key]));
  }
  return patch;
}

export function normalizeState(input, catalog) {
  const state = { ...DEFAULT_STATE, ...sanitizePatch(input, catalog) };
  if (!catalog.some(item => item.id === state.id)) state.id = catalog[0].id;
  if (!catalog.find(item => item.id === state.id).model) state.mode = '2d';
  return state;
}
