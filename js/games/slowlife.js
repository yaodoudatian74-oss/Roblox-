// スローライフ: 畑に種を植えて、ゆっくり育てて収穫する。失敗はなく、ゆったり遊べる
(function (g) {
  const C = g.Common;
  const COLS = 9;
  const ROWS = 5;
  const CELL = 64;
  const OX = 112;
  const OY = 90;
  const SEED_COST = 3;

  function create(cfg) {
    const p = cfg.palette;
    const d = cfg.difficulty;
    const v = cfg.variant;
    const weather = [
      { name: 'はれ', mul: 1.0 },
      { name: 'くもり', mul: 0.8 },
      { name: 'あめ', mul: 1.5 },
      { name: 'ひかり', mul: 1.2 },
      { name: 'そよ風', mul: 1.0 },
    ][v];
    const goal = Math.round(150 + d * 1500);
    const crops = [0, 1, 2, 3, 4].map((k) => ({
      name: cfg.names[(v * 2 + k) % cfg.names.length],
      value: 6 + k * 4,
      time: (18 + k * 6) * (1 + d),
      color: ['#7bed9f', '#ffa502', '#eccc68', '#ff6348', '#a29bfe'][k],
    }));

    const tiles = new Array(COLS * ROWS).fill(null).map(() => ({ crop: -1, grow: 0 }));
    let coins = 10;
    let earned = 0;
    let sel = 0;
    let state = 'playing';

    function tileAt(x, y) {
      const c = Math.floor((x - OX) / CELL);
      const r = Math.floor((y - OY) / CELL);
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
      return r * COLS + c;
    }

    function click(x, y) {
      if (state !== 'playing') return;
      const i = tileAt(x, y);
      if (i >= 0) {
        const t = tiles[i];
        if (t.crop < 0) {
          if (coins >= SEED_COST) {
            coins -= SEED_COST;
            t.crop = sel;
            t.grow = 0;
          }
        } else if (t.grow >= 1) {
          const value = crops[t.crop].value;
          coins += value;
          earned += value;
          t.crop = -1;
          t.grow = 0;
          if (earned >= goal) {
            earned = goal;
            state = 'won';
          }
        }
        return;
      }
      // 下部の作物メニューをクリックして選択
      for (let k = 0; k < crops.length; k++) {
        const sx = 100 + k * 120;
        if (x >= sx && x <= sx + 110 && y >= 440 && y <= 480) sel = k;
      }
    }

    function keydown(code) {
      const m = /^Digit([1-5])$/.exec(code);
      if (m) sel = Number(m[1]) - 1;
    }

    function update(dt) {
      if (state !== 'playing') return;
      for (const t of tiles) {
        if (t.crop >= 0 && t.grow < 1) {
          t.grow = Math.min(1, t.grow + (dt * weather.mul) / crops[t.crop].time);
        }
      }
    }

    function draw(ctx) {
      ctx.fillStyle = p.sky;
      ctx.fillRect(0, 0, C.W, C.H);
      ctx.fillStyle = p.ground;
      ctx.fillRect(0, C.H - 40, C.W, 40);

      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        const x = OX + (i % COLS) * CELL;
        const y = OY + Math.floor(i / COLS) * CELL;
        C.block(ctx, x + 2, y + 2, CELL - 4, CELL - 4, '#8d6e63');
        if (t.crop < 0) continue;
        const crop = crops[t.crop];
        const ripe = t.grow >= 1;
        const r = 4 + 16 * t.grow;
        ctx.fillStyle = ripe ? crop.color : '#2ecc71';
        ctx.beginPath();
        ctx.arc(x + CELL / 2, y + CELL / 2, r, 0, Math.PI * 2);
        ctx.fill();
        if (ripe) C.text(ctx, crop.name, x + CELL / 2, y + CELL - 6, '#2d3436', 9);
        else C.bar(ctx, x + 8, y + CELL - 12, CELL - 16, t.grow, '#fff');
      }

      crops.forEach((crop, k) => {
        const sx = 100 + k * 120;
        C.block(ctx, sx, 440, 110, 40, crop.color);
        if (k === sel) {
          ctx.strokeStyle = '#2d3436';
          ctx.lineWidth = 3;
          ctx.strokeRect(sx - 2, 438, 114, 44);
        }
        C.text(ctx, `${k + 1}: ${crop.name} (${crop.value}円)`, sx + 55, 465, '#2d3436', 11);
      });

      C.text(ctx, `天気: ${weather.name}`, 20, 30, p.dark, 14, 'left');
      C.text(ctx, '数字キーで作物を選び、空きマスで植える ・ 実った作物をクリックで収穫', C.W / 2, 30, p.dark, 13);
    }

    function status() {
      return {
        progress: earned / goal,
        label: `コイン ${coins} ・ 累計 ${Math.floor(earned)} / ${goal} ・ 天気 ${weather.name}`,
        state,
      };
    }

    return { update, draw, click, keydown, status };
  }

  g.GAME_TYPES.slowlife = {
    label: 'スローライフ',
    help: '数字キーで作物を選び、空きマスで植えます。実った作物をクリックで収穫しましょう。',
    create,
  };
})(window);
