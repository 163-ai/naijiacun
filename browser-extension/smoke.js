(() => {
  const status = document.querySelector('#status');
  const send = type => {
    const requestId = `smoke-${Date.now()}-${Math.random()}`;
    status.textContent = `请求 ${type}…`;
    window.postMessage({ channel: 'NAIJIACUN_PET', type, requestId, payload: { id: document.querySelector('#villager').value, mode: document.querySelector('#mode').value } }, location.origin);
  };
  for (const type of ['ping', 'start', 'stop']) document.querySelector(`#${type}`).addEventListener('click', () => send(type.toUpperCase()));
  window.addEventListener('message', event => {
    if (event.source === window && event.origin === location.origin && event.data?.channel === 'NAIJIACUN_PET_REPLY') status.textContent = JSON.stringify(event.data, null, 2);
  });
  for (let index = 0; index < 64; index++) {
    const button = document.createElement('button');
    let count = 0;
    button.textContent = `${index + 1} · 0`;
    button.addEventListener('click', event => {
      button.textContent = `${index + 1} · ${++count}`;
      document.querySelector('#click-log').textContent = `格子 ${index + 1} 点击 ${count} 次（${event.clientX}, ${event.clientY}）`;
    });
    document.querySelector('#grid').append(button);
  }
})();
