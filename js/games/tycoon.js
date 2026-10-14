// タイクーン（3D）: 広場のマスに建物を建てて稼ぎ、階数を増やして目標額を目指す
// 照準は視線と地面の交点で判定する（視線が指すマスが操作対象）
(function (g) {
  const C = g.Common;
  const K = g.Kit;
  const W = g.World;
  const R = g.Render;

  const COLS = 8;
  const ROWS = 5;
  const PITCH = 3.55;
  const TILE = 3.2;
  const X0 = -((COLS - 1) / 2) * PITCH;
  const CENTER_Z = -3;

  function cellCenter(i) {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    return [X0 + c * PITCH, CENTER_Z + (r - (ROWS - 1) / 2) * PITCH];
  }

  // 照準の地点から最も近いマス（マスの隙間を狙っても、近いマスが選ばれる）
  function tileAt(x, z) {
    const c = Math.round((x - X0) / PITCH);
    const r = Math.round((z - CENTER_Z) / PITCH + (ROWS - 1) / 2);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    return r * COLS + c;
  }

  function create(cfg) {
    const p = cfg.palette;
    const d = cfg.difficulty;
    const v = cfg.variant;
    const goal = Math.round(2000 + d * 40000);
    const costMul = 1 + d * 2;
    const colors = [p.accent, p.block, '#a29bfe', '#55efc4'];

    const types = [0, 1, 2, 3].map((k) => ({
      name: cfg.names[(v * 2 + k) % cfg.names.length],
      cost: Math.round(15 * Math.pow(2.2, k) * costMul),
      cps: (1 + k * 1.5) * (1 + v * 0.1),
      color: colors[k],
    }));

    const cells = new Array(COLS * ROWS).fill(null); // {type, level, group}
    let cash = types[0].cost * 2;
    let earned = 0;
    let sel = 0;
    let hover = -1;
    let state = 'playing';
    let tick = 0;
    let hoverMesh = null;

    const upgradeCost = (b) => Math.round(types[b.type].cost * (b.level + 1) * 0.8);
    const income = () => cells.reduce((s, b) => (b ? s + types[b.type].cps * (1 + 0.5 * (b.level - 1)) : s), 0);

    function build() {
      // 広場（スタート地点の舗装）と街並みの遠景
      const plaza = R.prop({ kind: 'box', w: 14, h: 0.2, d: 8, color: K.lighten(p.block, 0.4), outline: true });
      R.place(plaza, 0, 0.1, 11);
      for (const [x, z] of [[-6, 14], [6, 14], [-6, 8], [6, 8]]) K.lamp(x, z, p.block);
      // 遠景のビル群（奥の街並み）
      for (let i = 0; i < 6; i++) {
        const h = 9 + ((i * 37) % 11) * 1.6;
        const b = R.prop({ kind: 'box', w: 6 + (i % 3), h, d: 6, color: K.lighten(p.sky, 0.12 + (i % 2) * 0.1), outline: true, shadow: false });
        R.place(b, -30 + i * 12, h / 2, -52 - (i % 2) * 4);
      }
      const trng = C.mulberry32(cfg.seed + 11);
      for (let i = 0; i < 18; i++) {
        const side = i % 2 ? 1 : -1;
        K.tree(trng, side * (22 + trng() * 10), -24 + trng() * 40, [0x4caf50, 0x66bb6a][i % 2]);
      }
      K.clouds(trng, 10);
      K.islands(trng, 6, [p.ground, p.block]);

      // マス（土台のスラブ）
      for (let i = 0; i < COLS * ROWS; i++) {
        const [x, z] = cellCenter(i);
        const slab = R.prop({ kind: 'box', w: TILE, h: 0.14, d: TILE, color: 0xeceff1, rough: 0.6 });
        R.place(slab, x, 0.07, z);
        R.stud(x - 0.8, 0.14, z - 0.8);
        R.stud(x + 0.8, 0.14, z - 0.8);
        R.stud(x - 0.8, 0.14, z + 0.8);
        R.stud(x + 0.8, 0.14, z + 0.8);
      }
      hoverMesh = R.prop({ kind: 'box', w: TILE + 0.2, h: 0.06, d: TILE + 0.2, color: 0xffeaa7, emissive: 0xffeaa7, emissiveIntensity: 1.4, outline: false, shadow: false });
      R.place(hoverMesh, 0, -5, 0, { visible: false });
      R.flushStuds(0xffffff);
    }

    // 建物（階数 = 強化レベル）を作り直す
    function rebuild(i) {
      const b = cells[i];
      if (b && b.group) R.remove(b.group);
      if (!b) return;
      const t = types[b.type];
      const grp = R.group();
      const [x, z] = cellCenter(i);
      const floors = Math.min(b.level, 5);
      let y = 0.14;
      for (let f = 0; f < floors; f++) {
        const body = R.prop({ kind: 'box', w: 2.4, h: 0.95, d: 2.4, color: K.lighten(t.color, f * 0.06), parent: grp });
        R.place(body, 0, y + 0.475, 0);
        for (const sx of [-0.7, 0.7]) {
          const win = R.prop({ kind: 'box', w: 0.5, h: 0.4, d: 0.05, color: 0xfff7d6, emissive: 0xfff3b0, emissiveIntensity: 1.1, outline: false, shadow: false, parent: grp });
          R.place(win, sx, y + 0.5, -1.22);
        }
        y += 0.95;
      }
      const roof = R.prop({ kind: 'cone', r: 1.9, h: 1.2, color: t.color, parent: grp, rough: 0.5 });
      R.place(roof, 0, y + 0.6, 0, { s: [1, 1, 1] });
      const sign = R.prop({ kind: 'box', w: 1.6, h: 0.22, d: 0.08, color: 0xffffff, emissive: t.color, emissiveIntensity: 0.8, outline: false, shadow: false, parent: grp });
      R.place(sign, 0, y + 0.28, -1.22);
      R.glow(0, y + 0.3, -1.4, t.color, 2.2, 0.6, grp);
      R.place(grp, x, 0, z);
      b.group = grp;
    }

    function act() {
      const i = hover;
      if (i < 0) return false;
      const b = cells[i];
      const [x, z] = cellCenter(i);
      if (!b) {
        const t = types[sel];
        if (cash < t.cost) {
          R.sfx('click');
          R.toast(`${t.name}は ${t.cost}円 必要です`);
          return false;
        }
        cash -= t.cost;
        cells[i] = { type: sel, level: 1, group: null };
        rebuild(i);
        R.sfx('place');
        R.particles(x, 1.2, z, t.color, 18, 3.5);
        R.popText(x, 3.2, z, `-${t.cost}`, '#ffeaa7');
        R.swing();
      } else {
        const c = upgradeCost(b);
        if (cash < c) {
          R.sfx('click');
          R.toast(`強化には ${c}円 必要です`);
          return false;
        }
        cash -= c;
        b.level++;
        rebuild(i);
        R.sfx('buy');
        R.particles(x, 2, z, types[b.type].color, 30, 4.5, { size: 0.16 });
        R.popText(x, 4.2, z, `Lv${b.level}`, '#ffffff');
        R.swing();
      }
      return true;
    }

    function update(dt) {
      if (state !== 'playing') return;
      tick += dt;

      // 選択（数字キー）
      for (const code of W.input.pressed) {
        const m = /^Digit([1-4])$/.exec(code);
        if (m) sel = Number(m[1]) - 1;
      }

      // 照準のマスを更新
      const aim = W.aimGround(26);
      hover = aim ? tileAt(aim.x, aim.z) : -1;
      if (hover >= 0) {
        const [x, z] = cellCenter(hover);
        R.place(hoverMesh, x, 0.2, z, { visible: true });
      } else {
        R.place(hoverMesh, 0, -5, 0, { visible: false });
      }

      if (W.input.fire) act();

      const inc = income() * dt;
      cash += inc;
      earned += inc;

      // 稼いでいる建物からコインがはじける
      if (Math.floor(tick * 2) !== Math.floor((tick - dt) * 2)) {
        const built = cells.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
        if (built.length > 0) {
          const i = built[Math.floor(Math.random() * built.length)];
          const [x, z] = cellCenter(i);
          R.particles(x, 4 + cells[i].level * 0.9, z, 0xffd54f, 3, 2.2, { size: 0.12, life: 0.9, up: 1 });
          if (Math.random() < 0.5) R.sfx('coin');
        }
      }

      if (earned >= goal) {
        earned = goal;
        state = 'won';
      }
    }

    function hint() {
      if (hover < 0) return 'マスに照準を合わせて左クリック（またはE）。数字キーで建物を選択';
      const b = cells[hover];
      if (!b) return `${types[sel].name}を設置（${types[sel].cost}円）`;
      return `Lv${b.level} ${types[b.type].name}を強化（${upgradeCost(b)}円）`;
    }

    function status() {
      return {
        progress: earned / goal,
        label: `所持金 ${Math.floor(cash)}円 ・ 収入 ${income().toFixed(1)}/秒 ・ 累計 ${Math.floor(earned)} / ${goal} ・ 選択: ${types[sel].name}`,
        hint: hint(),
        state,
      };
    }

    // テスト（tests/playtest.js）用
    function inspect() {
      return { cells, types, cash, sel, income: income(), cellCenter, upgradeCost, COLS, ROWS, hover };
    }

    return { build, update, status, inspect };
  }

  g.GAME_TYPES.tycoon = {
    label: 'タイクーン',
    help: '数字キーで建物を選び、マスに照準を合わせて左クリック（またはE）。建物に合わせると強化できます。',
    spawn: { x: 0, y: 0, z: 12, yaw: 0 },
    viewmodel: { kind: 'hammer', color: 0xf39c12 },
    digits: 4, // 数字ボタンの数（タッチ操作用）
    theme: (p) => ({ sky: p.sky, horizon: R_mix(p.sky, '#ffffff', 0.4), ground: p.ground, fog: 0.008, night: '#16213e', sunT: 0.28 }),
    create,
  };

  function R_mix(a, b, t) {
    return g.Render.mix(a, b, t);
  }
})(window);
