(function () {
  'use strict';

  var page = location.pathname.split('/').pop() || 'index.html';
  var home = page === 'index.html';
  var paths = {
    home: '<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
    book: '<path d="M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Z"/><path d="M12 5v15"/>',
    pet: '<path d="M8 13c-3 2-4 7 0 7 2 0 2-1 4-1s2 1 4 1c4 0 3-5 0-7-2-2-6-2-8 0Z"/><ellipse cx="5" cy="9" rx="2" ry="3"/><ellipse cx="10" cy="5" rx="2" ry="3"/><ellipse cx="16" cy="5" rx="2" ry="3"/><ellipse cx="21" cy="9" rx="2" ry="3"/>',
    chat: '<path d="M21 11a8 8 0 0 1-8 8H7l-4 3v-7a8 8 0 1 1 18-4Z"/><path d="M7 10h10M7 14h6"/>',
    settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m10 3-1 3-3 1-3-1-1 4 3 2-1 3 2 3 3-1 2 3h3l1-3 3-1 3 1 1-4-3-2 1-3-2-3-3 1-2-3Z"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    roof: '<path d="m2 17 10-9 10 9M6 14l6-6 6 6" stroke-width="3"/><path d="M10 6h4v3" stroke-width="2.5"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';
  }
  function link(href, label, active, className) {
    return '<a href="' + href + '"' + (className ? ' class="' + className + '"' : '') + (active ? ' aria-current="page"' : '') + '>' + label + '</a>';
  }
  var links = link('index.html#villagers', '村民图鉴', home) +
    link('index.html#blindbox', '拆盲盒', false) +
    link('pet.html', '桌宠', page === 'pet.html') +
    link('pet3d.html', '3D展台', page === 'pet3d.html') +
    link('chat.html', '聊两句', page === 'chat.html');
  var settings = link('index.html#voice', icon('settings') + '<span>设置</span>', false, 'village-settings');
  document.body.insertAdjacentHTML('afterbegin',
    '<header class="village-nav"><div class="village-nav-inner">' +
    link('index.html', icon('roof') + '<span>奶家村</span>', false, 'village-brand') +
    '<nav class="village-links" aria-label="主要导航">' + links + '</nav>' + settings +
    '<details class="village-menu"><summary aria-label="打开导航">' + icon('menu') + '</summary><nav aria-label="移动导航">' + links + link('gallery.html', '村民总表', false) + settings + '</nav></details></div></header>');

  document.body.insertAdjacentHTML('beforeend', '<nav class="village-bottom-nav" aria-label="快捷导航">' +
    link('index.html', icon('home') + '<span>村口</span>', home && location.hash !== '#villagers') +
    link('index.html#villagers', icon('book') + '<span>图鉴</span>', page === 'gallery.html' || (home && location.hash === '#villagers')) +
    link('pet.html', icon('pet') + '<span>桌宠</span>', page === 'pet.html') +
    link('chat.html', icon('chat') + '<span>聊天</span>', page === 'chat.html') + '</nav>');
  if (!home) {
    document.body.insertAdjacentHTML('beforeend', '<footer class="village-footer"><span>奶家村</span><span>非官方同人整理</span><div>' + link('index.html', '回到村口', false) + link('gallery.html', '村民总表', false) + '</div></footer>');
  }
  var main = document.querySelector('main, .ch-wrap, .p3-wrap, .g-wrap, .pet-head');
  if (main) {
    if (!main.id) main.id = 'village-main';
    var skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = '#' + main.id;
    skip.textContent = '跳到主要内容';
    document.body.insertBefore(skip, document.body.firstChild);
  }
  function openSettings() {
    var button = document.getElementById('cfgBtn') || document.getElementById('voiceBtn');
    if (button) button.click();
    return !!button;
  }
  document.querySelectorAll('.village-nav a, .village-bottom-nav a').forEach(function (anchor) {
    anchor.addEventListener('click', function (event) {
      var href = anchor.getAttribute('href');
      if (href === 'index.html#blindbox' && document.getElementById('randomBtn')) {
        event.preventDefault();
        document.getElementById('randomBtn').click();
      } else if (anchor.classList.contains('village-settings')) {
        if (openSettings()) event.preventDefault();
      }
      var menu = anchor.closest('.village-menu');
      if (menu) menu.open = false;
    });
  });
  function updateBottomNav() {
    if (!home) return;
    var anchors = document.querySelectorAll('.village-bottom-nav a');
    anchors[0].removeAttribute('aria-current');
    anchors[1].removeAttribute('aria-current');
    anchors[location.hash === '#villagers' ? 1 : 0].setAttribute('aria-current', 'page');
  }
  function openFromHash() {
    if (location.hash === '#blindbox' && document.getElementById('randomBtn')) {
      document.getElementById('randomBtn').click();
    } else if (home && location.hash === '#voice') {
      openSettings();
    }
  }
  window.addEventListener('hashchange', function () { updateBottomNav(); openFromHash(); });
  openFromHash();
}());
