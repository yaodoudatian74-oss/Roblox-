// メニュー（ジャンル・検索・一覧）と、一人称のゲーム画面の進行（入力・ループ・HUD・勝敗）
(function (g) {
  const $ = (id) => document.getElementById(id);
  const W = g.World;
  const R = g.Render;
  const ORDER = g.CATALOG_ORDER;
  const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  let game = null;
  let cfg = null;
  let type = null;
  let rafId = 0;
  let last = 0;
  let inited = false;
  let currentGenre = ORDER[0];
  let query = '';
  let lastState = 'playing';
  let drag = null; // ポインタロックできないときの「ドラッグで見回す」用
  let hintDismissed = false; // 最初のクリックで操作案内を消す
  const input = W.input;

  // ---- メニュー ----
  function renderMenu() {
    const tabs = $('tabs');
    tabs.replaceChildren();
    for (const key of ORDER) {
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
    const num = /^\d+$/.test(q) ? Number(q) : null;
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

  // ---- 開始・終了 ----
  function ensureRenderer() {
    if (inited) return;
    R.init($('screen'));
    inited = true;
  }

  function open(item) {
    ensureRenderer();
    cancelAnimationFrame(rafId);
    cfg = item;
    type = g.GAME_TYPES[item.genre];
    R.unlockAudio();
    R.reset(type.theme(item.palette));
    W.reset({ spawn: type.spawn, G: 24, jump: 8.4, voidY: -20, floor: !type.noFloor });
    input.keys.clear();
    input.pressed.clear();
    input.fire = false;
    game = type.create(item);
    game.build();
    if (type.viewmodel) R.viewmodel(type.viewmodel.kind, type.viewmodel.color);
    lastState = 'playing';
    $('title').textContent = item.title;
    $('help').textContent = type.help + (g.Touch.isTouch() ? ' タッチ: 左下のスティックで移動、右側をなぞって見回す、右下のボタンで操作。' : '');
    g.Touch.show(type.digits || 0);
    $('result').hidden = true;
    $('menu').hidden = true;
    $('play').hidden = false;
    hintDismissed = g.Touch.isTouch(); // タッチ端末では案内を出さない
    last = performance.now();
    rafId = requestAnimationFrame(loop);
    // 画面を表示した直後にキャンバスの実寸を取り直す
    R.resize();
    updateLockHint();
  }

  function restart() {
    if (cfg) open(cfg);
  }

  function back() {
    cancelAnimationFrame(rafId);
    game = null;
    input.keys.clear();
    input.pressed.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    g.Touch.hide();
    $('play').hidden = true;
    $('result').hidden = true;
    $('menu').hidden = false;
    renderMenu();
  }

  // ---- ループ ----
  function loop(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000);
    last = now;

    W.step(dt);
    game.update(dt);
    R.tick(dt);
    R.draw();

    const s = game.status();
    if (s.state !== lastState) {
      lastState = s.state;
      if (s.state === 'won') showResult(true);
      if (s.state === 'lost') showResult(false);
    }
    $('hud').textContent = s.label;
    $('hint').textContent = s.hint || '';
    $('bar').style.width = `${Math.round(Math.min(1, s.progress) * 100)}%`;
    W.endFrame();
    rafId = requestAnimationFrame(loop);
  }

  function showResult(won) {
    $('result-title').textContent = won ? 'クリア！' : 'やられた…';
    $('result-text').textContent = won ? 'おめでとうございます。' : 'Rキーでやり直し、Escで一覧へ戻れます。';
    $('result').hidden = false;
    R.sfx(won ? 'win' : 'lose');
  }

  function updateLockHint() {
    $('lockhint').hidden = !!document.pointerLockElement || !type || hintDismissed || g.Touch.isTouch();
  }

  // ---- 入力 ----
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
    if (!e.repeat) {
      input.pressed.add(e.code);
      if (e.code === 'KeyE') input.fire = true;
    }
    input.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => {
    input.keys.clear();
    drag = null;
  });

  const canvas = $('screen');
  canvas.addEventListener('pointerdown', (e) => {
    if (!game) return;
    R.unlockAudio();
    if (e.pointerType === 'touch') return; // タッチの操作は画面内のボタンで行う
    hintDismissed = true;
    updateLockHint();
    if (!document.pointerLockElement) {
      // 最初のクリックでマウス視点を有効にする（できない環境では下のドラッグで見回す）
      try {
        const req = canvas.requestPointerLock();
        if (req && req.catch) req.catch(() => {});
      } catch (err) {
        // 非対応の環境ではドラッグ操作に任せる
      }
      drag = { x: e.clientX, y: e.clientY, moved: 0 };
      return;
    }
    input.fire = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!game) return;
    if (document.pointerLockElement) {
      input.dx += e.movementX;
      input.dy += e.movementY;
    } else if (drag) {
      input.dx += e.movementX;
      input.dy += e.movementY;
      drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
    }
  });
  window.addEventListener('pointerup', () => {
    if (drag && drag.moved < 6 && game) input.fire = true;
    drag = null;
  });
  document.addEventListener('pointerlockchange', updateLockHint);

  $('backBtn').onclick = back;
  $('restartBtn').onclick = restart;
  $('resultBack').onclick = back;
  $('resultRetry').onclick = restart;
  $('search').oninput = (e) => {
    query = e.target.value;
    renderMenu();
  };

  g.Touch.init();
  renderMenu();

  // #brainrot-001 のようなURLで直接ゲームを開ける（URLが変わったときも開く）
  function openFromHash() {
    const item = g.CATALOG.find((c) => c.id === location.hash.slice(1));
    if (item) open(item);
  }
  window.addEventListener('hashchange', openFromHash);
  openFromHash();
})(window);
