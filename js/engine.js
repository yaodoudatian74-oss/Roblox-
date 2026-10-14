// メニュー（ジャンル切り替え・検索・一覧）と、ゲーム画面のループ・入力処理
(function (g) {
  const C = g.Common;
  const $ = (id) => document.getElementById(id);
  const canvas = $('screen');
  const ctx = canvas.getContext('2d');
  const keys = new Set();
  const input = { keys };
  const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  let game = null;
  let cfg = null;
  let rafId = 0;
  let last = 0;
  let currentGenre = g.CATALOG_ORDER[0];
  let query = '';

  function renderMenu() {
    const tabs = $('tabs');
    tabs.replaceChildren();
    for (const key of g.CATALOG_ORDER) {
      const b = document.createElement('button');
      b.textContent = g.GAME_TYPES[key].label;
      b.className = 'tab' + (key === currentGenre ? ' active' : '');
      b.onclick = () => {
        currentGenre = key;
        renderMenu();
      };
      tabs.append(b);
    }

    const q = query.trim().toLowerCase();
    const num = /^\d+$/.test(q) ? Number(q) : null; // "003" と "3" はどちらも番号3に一致させる
    const items = g.CATALOG.filter(
      (c) => c.genre === currentGenre && (!q || c.title.toLowerCase().includes(q) || c.no === num)
    );
    const grid = $('grid');
    grid.replaceChildren();
    for (const item of items) {
      const card = document.createElement('button');
      card.className = 'card';
      const no = document.createElement('small');
      no.textContent = `#${String(item.no).padStart(3, '0')}`;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = item.title;
      const stars = document.createElement('span');
      stars.className = 'stars';
      const n = 1 + Math.round(item.difficulty * 4);
      stars.textContent = '★'.repeat(n) + '☆'.repeat(5 - n);
      card.append(no, name, stars);
      card.onclick = () => open(item);
      grid.append(card);
    }
    $('count').textContent = `${items.length}件`;
  }

  function open(item) {
    cfg = item;
    const type = g.GAME_TYPES[item.genre];
    game = type.create(item);
    $('title').textContent = item.title;
    $('help').textContent = type.help;
    keys.clear();
    $('menu').hidden = true;
    $('play').hidden = false;
    cancelAnimationFrame(rafId);
    last = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function restart() {
    if (cfg) open(cfg);
  }

  function back() {
    cancelAnimationFrame(rafId);
    game = null;
    keys.clear();
    $('play').hidden = true;
    $('menu').hidden = false;
    renderMenu();
  }

  function drawOverlay(state) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, C.W, C.H);
    C.text(ctx, state === 'won' ? 'クリア！' : 'やられた…', C.W / 2, C.H / 2 - 10, '#fff', 40);
    C.text(ctx, 'Rキーでやり直し ・ Escで一覧へ', C.W / 2, C.H / 2 + 30, '#fff', 16);
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt, input);
    ctx.clearRect(0, 0, C.W, C.H);
    game.draw(ctx);
    const s = game.status();
    if (s.state !== 'playing') drawOverlay(s.state);
    $('hud').textContent = s.label;
    $('bar').style.width = `${Math.round(Math.min(1, s.progress) * 100)}%`;
    rafId = requestAnimationFrame(loop);
  }

  window.addEventListener('keydown', (e) => {
    if (!game) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    if (e.code === 'Escape') {
      back();
      return;
    }
    if (e.code === 'KeyR' && game.status().state !== 'playing') {
      restart();
      return;
    }
    if (!keys.has(e.code)) {
      keys.add(e.code);
      if (game.keydown) game.keydown(e.code);
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointerdown', (e) => {
    if (!game || !game.click) return;
    const r = canvas.getBoundingClientRect();
    game.click((e.clientX - r.left) * (C.W / r.width), (e.clientY - r.top) * (C.H / r.height));
  });

  $('backBtn').onclick = back;
  $('restartBtn').onclick = restart;
  $('search').oninput = (e) => {
    query = e.target.value;
    renderMenu();
  };

  renderMenu();

  // #brainrot-001 のようなURLで直接ゲームを開ける（URLが変わったときも開く）
  function openFromHash() {
    const item = g.CATALOG.find((c) => c.id === location.hash.slice(1));
    if (item) open(item);
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();
})(window);
