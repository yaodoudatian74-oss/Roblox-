// タイクーン: 空きマスに建物を置いて自動で稼ぎ、建物を強化して目標額を目指す
(function (g) {
  const C = g.Common;
  const COLS = 8;
  const ROWS = 5;
  const CELL = 70;
  const OX = 120;
  const OY = 55;

  function create(cfg) {
    const p = cfg.palette;
    const d = cfg.difficulty;
    const v = cfg.variant;
    const goal = Math.round(2000 + d * 40000);
    const costMul = 1 + d * 2;

    const types = [0, 1, 2, 3].map((k) => ({
      name: cfg.names[(v * 2 + k) % cfg.names.length],
      cost: Math.round(15 * Math.pow(2.2, k) * costMul),
      cps: (1 + k * 1.5) * (1 + v * 0.1),
      color: [p.accent, p.block, '#a29bfe', '#55efc4'][k],
    }));

    const cells = new Array(COLS * ROWS).fill(null);
    // 最初の建物が買えないと収入がゼロのまま止まるため、最安の建物2つ分を初期資金にする
    let cash = types[0].cost * 2;
    let earned = 0;
    let sel = 0;
    let state = 'playing';

    const upgradeCost = (b) => Math.round(types[b.type].cost * (b.level + 1) * 0.8);
    const income = () =>
      cells.reduce((sum, b) => (b ? sum + types[b.type].cps * (1 + 0.5 * (b.level - 1)) : sum), 0);

    function cellAt(x, y) {
      const c = Math.floor((x - OX) / CELL);
      const r = Math.floor((y - OY) / CELL);
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
      return r * COLS + c;
    }

    function click(x, y) {
      if (state !== 'playing') return;
      const i = cellAt(x, y);
      if (i >= 0) {
        const b = cells[i];
        if (!b) {
          const cost = types[sel].cost;
          if (cash >= cost) {
            cash -= cost;
            cells[i] = { type: sel, level: 1 };
          }
        } else {
          const cost = upgradeCost(b);
          if (cash >= cost) {
            cash -= cost;
            b.level++;
          }
        }
        return;
      }
      // 下部のショップ欄をクリックしたら建物を選択
      for (let k = 0; k < types.length; k++) {
        const sx = 60 + k * 180;
        if (x >= sx && x <= sx + 170 && y >= 425 && y <= 465) sel = k;
      }
    }

    function keydown(code) {
      const m = /^Digit([1-4])$/.exec(code);
      if (m) sel = Number(m[1]) - 1;
    }

    function update(dt) {
      if (state !== 'playing') return;
      const inc = income() * dt;
      cash += inc;
      earned += inc;
      if (earned >= goal) {
        earned = goal;
        state = 'won';
      }
    }

    function draw(ctx) {
      ctx.fillStyle = p.sky;
      ctx.fillRect(0, 0, C.W, C.H);

      for (let i = 0; i < cells.length; i++) {
        const x = OX + (i % COLS) * CELL;
        const y = OY + Math.floor(i / COLS) * CELL;
        C.block(ctx, x + 2, y + 2, CELL - 4, CELL - 4, '#d7ccc8');
        const b = cells[i];
        if (b) {
          const t = types[b.type];
          C.block(ctx, x + 8, y + 8, CELL - 16, CELL - 16, t.color);
          C.text(ctx, t.name, x + CELL / 2, y + CELL / 2 - 2, '#2d3436', 10);
          C.text(ctx, `Lv${b.level}`, x + CELL / 2, y + CELL / 2 + 12, '#2d3436', 11);
        }
      }

      types.forEach((t, k) => {
        const sx = 60 + k * 180;
        C.block(ctx, sx, 425, 170, 40, t.color);
        if (k === sel) {
          ctx.strokeStyle = '#2d3436';
          ctx.lineWidth = 4;
          ctx.strokeRect(sx - 2, 423, 174, 44);
        }
        C.text(ctx, `${k + 1}: ${t.name}  ${t.cost}円`, sx + 85, 450, '#2d3436', 12);
      });

      C.text(ctx, '数字キーで建物を選び、空きマスをクリックで設置 ・ 建物をクリックで強化', C.W / 2, 30, p.dark, 13);
    }

    function status() {
      return {
        progress: earned / goal,
        label: `所持金 ${Math.floor(cash)}円 ・ 収入 ${income().toFixed(1)}/秒 ・ 累計 ${Math.floor(earned)} / ${goal}`,
        state,
      };
    }

    // テスト（tests/playtest.js）用
    function inspect() {
      return { cells, types, cash, sel, income: income(), cellCenter: (i) => [OX + (i % COLS) * CELL + CELL / 2, OY + Math.floor(i / COLS) * CELL + CELL / 2], upgradeCost, COLS, ROWS };
    }

    return { update, draw, click, keydown, status, inspect };
  }

  g.GAME_TYPES.tycoon = {
    label: 'タイクーン',
    help: '数字キーで建物を選び、空きマスをクリックで設置。建物をクリックで強化します。',
    create,
  };
})(window);
