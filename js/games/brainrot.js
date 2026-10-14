// ブレインロット: フィールドの生き物を集めると、回収した分だけ収入が増える
(function (g) {
  const C = g.Common;

  function create(cfg) {
    const rng = C.mulberry32(cfg.seed);
    const p = cfg.palette;
    const d = cfg.difficulty;
    const v = cfg.variant;
    // 収入は回収数に比例して増えるため、目標は2次関数的にクリア時間が伸びる（x60で数分規模）
    const goal = Math.round((300 + d * 2200) * 60);
    const spawnEvery = 2.2 - 1.2 * d - (v === 2 ? 0.6 : 0);
    const rareChance = [0.05, 0.1, 0.02, 0.15, 0.08][v];

    const player = { x: C.W / 2, y: C.H / 2 };
    const wild = [];
    let collected = 0;
    let rate = 0;
    let score = 0;
    let spawnTimer = 0;
    let state = 'playing';

    function spawn() {
      const rare = rng() < rareChance;
      const base = 4 + rng() * 4;
      wild.push({
        x: 40 + rng() * (C.W - 80),
        y: 60 + rng() * (C.H - 110),
        vx: (rng() - 0.5) * 50,
        vy: (rng() - 0.5) * 50,
        life: 7 + rng() * 4,
        name: cfg.names[Math.floor(rng() * cfg.names.length)],
        rare,
        value: base * (1 + d) * (rare ? 10 : 1),
        color: rare ? '#f1c40f' : p.accent,
      });
    }

    function update(dt, input) {
      if (state !== 'playing') return;
      const a = C.axis(input.keys);
      player.x = C.clamp(player.x + a.x * 220 * dt, 20, C.W - 20);
      player.y = C.clamp(player.y + a.y * 220 * dt, 50, C.H - 50);

      spawnTimer += dt;
      if (spawnTimer >= spawnEvery && wild.length < 12) {
        spawnTimer = 0;
        spawn();
      }

      for (let i = wild.length - 1; i >= 0; i--) {
        const w = wild[i];
        w.x = C.clamp(w.x + w.vx * dt, 20, C.W - 20);
        w.y = C.clamp(w.y + w.vy * dt, 50, C.H - 50);
        w.life -= dt;
        if (w.life <= 0) {
          wild.splice(i, 1);
        } else if (C.dist(player.x, player.y, w.x, w.y) < 30) {
          rate += w.value;
          collected++;
          wild.splice(i, 1);
        }
      }

      score += rate * dt;
      if (score >= goal) {
        score = goal;
        state = 'won';
      }
    }

    function draw(ctx) {
      ctx.fillStyle = p.sky;
      ctx.fillRect(0, 0, C.W, C.H);
      ctx.fillStyle = p.ground;
      ctx.fillRect(0, C.H - 40, C.W, 40);

      for (const w of wild) {
        const blink = w.life < 1.5 && Math.floor(w.life * 8) % 2 === 0;
        if (blink) continue;
        C.block(ctx, w.x - 14, w.y - 14, 28, 28, w.color);
        C.eyes(ctx, w.x, w.y);
        C.text(ctx, w.name, w.x, w.y - 20, p.dark, 11);
      }

      C.block(ctx, player.x - 13, player.y - 13, 26, 26, p.block);
      C.eyes(ctx, player.x, player.y);
    }

    function status() {
      return {
        progress: score / goal,
        label: `スコア ${Math.floor(score)} / ${goal} ・ 収入 ${rate.toFixed(1)}/秒 ・ 回収 ${collected}`,
        state,
      };
    }

    // テスト（tests/playtest.js）用
    function inspect() {
      return { player, wild, rate, score, goal };
    }

    return { update, draw, status, inspect };
  }

  g.GAME_TYPES.brainrot = {
    label: 'ブレインロット',
    help: '矢印キー / WASDで移動し、生き物に近づいて回収。回収した分だけ収入が増えます。',
    create,
  };
})(window);
