// スローライフ（3D）: 柵で囲んだ畑に種を植え、ゆっくり育てて収穫する。失敗はなく、昼夜と天気が移り変わる
(function (g) {
  const C = g.Common;
  const K = g.Kit;
  const W = g.World;
  const R = g.Render;

  const COLS = 9;
  const ROWS = 5;
  const PITCH = 1.8;
  const TILE = 1.55;
  const CENTER_Z = -2;
  const X0 = -((COLS - 1) / 2) * PITCH;
  const SEED_COST = 3;
  const DAY_LEN = 240; // 1日の長さ（秒）

  function cellCenter(i) {
    return [X0 + (i % COLS) * PITCH, CENTER_Z + (Math.floor(i / COLS) - (ROWS - 1) / 2) * PITCH];
  }

  // 照準の地点から最も近い畑のマス（マスの隙間を狙っても、近いマスが選ばれる）
  function tileAt(x, z) {
    const c = Math.round((x - X0) / PITCH);
    const r = Math.round((z - CENTER_Z) / PITCH + (ROWS - 1) / 2);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    return r * COLS + c;
  }

  function create(cfg) {
    const rng = C.mulberry32(cfg.seed + 2);
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

    const tiles = new Array(COLS * ROWS).fill(null).map(() => ({ crop: -1, grow: 0, grp: null, parts: null }));
    let coins = 10;
    let earned = 0;
    let sel = 0;
    let hover = -1;
    let state = 'playing';
    let time = 0;
    let dayStart = 0.2;
    let butterflies = [];
    let rainTimer = 0;
    let hoverRing = null;

    function build() {
      // 柵の内側の芝生と小道
      K.fence(-11, 11, -12, -12 + 0.01, 0xfafafa); // 奥
      K.fence(-11, -11, -12, 13, 0xfafafa); // 左
      K.fence(11, 11, -12, 13, 0xfafafa); // 右
      W.solid({ x: 0, y: 0, z: 13, w: 22.4, h: 0.6, d: 0.3, color: 0xfafafa });
      const path = R.prop({ kind: 'box', w: 2.2, h: 0.04, d: 15, color: K.lighten(p.block, 0.4), outline: false });
      R.place(path, 0, 0.02, 4.5);

      // 小屋（奥の左）
      const hx = -15;
      const hz = -18;
      const wall = R.prop({ kind: 'box', w: 6, h: 3.2, d: 5, color: K.lighten(p.block, 0.45) });
      R.place(wall, hx, 1.6, hz);
      const roof = R.prop({ kind: 'cone', r: 4.8, h: 2.6, color: 0xd35400, rough: 0.6 });
      R.place(roof, hx, 4.5, hz, { ry: Math.PI / 4, s: [1, 1, 1] });
      const door = R.prop({ kind: 'box', w: 1, h: 2, d: 0.08, color: 0x6d4c41, outline: false });
      R.place(door, hx, 1, hz + 2.55);
      for (const sx of [-1.9, 1.9]) {
        const win = R.prop({ kind: 'box', w: 1.1, h: 1, d: 0.08, color: 0xfff3b0, emissive: 0xfff3b0, emissiveIntensity: 1.2, outline: false, shadow: false });
        R.place(win, hx + sx, 2, hz + 2.55);
      }
      const chimney = R.prop({ kind: 'box', w: 0.7, h: 2, d: 0.7, color: 0x8d6e63 });
      R.place(chimney, hx + 1.8, 4.2, hz - 1.3);

      // 花壇（畑の外側）
      const trng = C.mulberry32(cfg.seed + 9);
      for (let i = 0; i < 24; i++) {
        const side = i % 2 ? 1 : -1;
        const fx = side * (13 + trng() * 6);
        const fz = -16 + trng() * 30;
        const flower = [0xff8fab, 0xffe066, 0xc39bd3, 0xffffff][i % 4];
        for (let k = 0; k < 4; k++) {
          const f = R.prop({ kind: 'sphere', r: 0.22, color: flower, outline: false, shadow: false });
          R.place(f, fx + (trng() - 0.5) * 1.4, 0.25, fz + (trng() - 0.5) * 1.4);
        }
      }
      for (let i = 0; i < 16; i++) {
        const side = i % 2 ? 1 : -1;
        K.tree(trng, side * (22 + trng() * 12), -22 + trng() * 42, [0x66bb6a, 0x81c784, 0x4caf50][i % 3], 1.1);
      }
      for (const [x, z] of [[-9.6, -10], [9.6, -10], [-9.6, 11], [9.6, 11]]) K.lamp(x, z, p.block);
      // 柵の外の草むら（畑と小道には生えないようにする）
      K.meadow(trng, 0, 0, 24, 380, [0x7cb342, 0x9ccc65, 0x558b2f], (x, z) => !(Math.abs(x) < 11.5 && z > -12.5 && z < 13.5));
      // ベンチ
      const bench = R.prop({ kind: 'box', w: 2.4, h: 0.22, d: 0.8, color: 0x8d6e63 });
      R.place(bench, 6, 0.5, 9);
      K.clouds(trng, 10);
      K.islands(trng, 5, [p.ground, K.lighten(p.ground, 0.25)]);

      // 畑（土のマス）
      for (let i = 0; i < COLS * ROWS; i++) {
        const [x, z] = cellCenter(i);
        const soil = R.prop({ kind: 'box', w: TILE, h: 0.16, d: TILE, color: 0x8d6e63, rough: 1 });
        R.place(soil, x, 0.08, z);
      }
      hoverRing = R.prop({ kind: 'box', w: TILE + 0.25, h: 0.05, d: TILE + 0.25, color: 0xffeaa7, emissive: 0xffeaa7, emissiveIntensity: 1.3, outline: false, shadow: false });
      R.place(hoverRing, 0, -5, 0, { visible: false });

      // 蝶（ふわふわ飛ぶ装飾）
      for (let i = 0; i < 6; i++) {
        const b = R.prop({ kind: 'sphere', r: 0.09, color: [0xffeaa7, 0xfab1a0, 0x81ecec][i % 3], emissive: 0xffffff, emissiveIntensity: 0.3, outline: false, shadow: false });
        butterflies.push({ mesh: b, a: rng() * 6, r: 4 + rng() * 9, cz: -4 + rng() * 6, sp: 0.25 + rng() * 0.3, h: 1.4 + rng() * 1.6 });
      }
      R.flushStuds();
    }

    function setRipe(t) {
      // 作物の見た目（茎・葉・実）を育ち具合に合わせる
      if (!t.grp) {
        const grp = R.group();
        const stem = R.prop({ kind: 'cyl', r: 0.05, h: 1, color: 0x2e7d32, parent: grp, outline: false });
        const leafA = R.prop({ kind: 'sphere', r: 0.22, color: 0x66bb6a, parent: grp, outline: false, s: [1, 0.35, 0.6] });
        const leafB = R.prop({ kind: 'sphere', r: 0.22, color: 0x66bb6a, parent: grp, outline: false, s: [1, 0.35, 0.6] });
        const fruit = R.prop({ kind: 'sphere', r: 0.24, color: crops[t.crop].color, emissive: crops[t.crop].color, emissiveIntensity: 0.25, parent: grp, outline: false });
        t.grp = grp;
        t.parts = { stem, leafA, leafB, fruit };
      }
    }

    function plant(i) {
      const t = tiles[i];
      t.crop = sel;
      t.grow = 0;
      setRipe(t);
      const [x, z] = cellCenter(i);
      R.place(t.grp, x, 0.16, z);
      R.particles(x, 0.4, z, 0x8d6e63, 10, 2, { size: 0.08, life: 0.5 });
    }

    function harvest(i) {
      const t = tiles[i];
      const value = crops[t.crop].value;
      coins += value;
      earned += value;
      const [x, z] = cellCenter(i);
      R.particles(x, 0.8, z, crops[t.crop].color, 16, 3.2, { size: 0.12 });
      R.popText(x, 1.6, z, `+${value}`, '#ffd54f');
      R.sfx('harvest');
      R.remove(t.grp);
      t.grp = null;
      t.parts = null;
      t.crop = -1;
      t.grow = 0;
      if (earned >= goal) {
        earned = goal;
        state = 'won';
      }
    }

    function act() {
      if (hover < 0) return;
      const t = tiles[hover];
      if (t.crop < 0) {
        if (coins >= SEED_COST) {
          coins -= SEED_COST;
          plant(hover);
          R.sfx('place');
          R.swing();
        } else {
          R.sfx('click');
          R.toast(`種は ${SEED_COST} コインです`);
        }
      } else if (t.grow >= 1) {
        harvest(hover);
        R.swing();
      }
    }

    function update(dt) {
      if (state !== 'playing') return;
      time += dt;

      for (const code of W.input.pressed) {
        const m = /^Digit([1-5])$/.exec(code);
        if (m) sel = Number(m[1]) - 1;
      }

      // 昼夜（1日 = DAY_LEN 秒）
      const sunT = (dayStart + time / DAY_LEN) % 1;
      R.setSun(sunT);

      const aim = W.aimGround(24);
      hover = aim ? tileAt(aim.x, aim.z) : -1;
      if (hover >= 0) {
        const [x, z] = cellCenter(hover);
        R.place(hoverRing, x, 0.18, z, { visible: true });
      } else {
        R.place(hoverRing, 0, -5, 0, { visible: false });
      }
      if (W.input.fire) act();

      // 育つ（天気で速さが変わる）
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        if (t.crop < 0) continue;
        if (t.grow < 1) t.grow = Math.min(1, t.grow + (dt * weather.mul) / crops[t.crop].time);
        const gr = t.grow;
        const sway = Math.sin(time * 1.6 + i) * 0.04 * gr;
        // 幾何は単位サイズ（半径1・高さ1）なので、scale は実寸で指定する
        const stemH = 0.12 + 0.55 * gr;
        t.parts.stem.scale.set(0.05, stemH, 0.05);
        t.parts.stem.position.set(0, stemH / 2, 0);
        t.parts.stem.rotation.z = sway;
        t.parts.leafA.position.set(-0.12, stemH * 0.7, 0);
        t.parts.leafA.scale.set(0.2 + gr * 0.1, 0.05, 0.12 + gr * 0.05);
        t.parts.leafB.position.set(0.12, stemH * 0.5, 0);
        t.parts.leafB.scale.set(0.2 + gr * 0.1, 0.05, 0.12 + gr * 0.05);
        const ripe = gr >= 1;
        t.parts.fruit.visible = gr > 0.6;
        const bounce = ripe ? Math.abs(Math.sin(time * 4 + i)) * 0.12 : 0;
        t.parts.fruit.position.set(0.05, stemH + 0.1 + bounce, 0);
        const fs = 0.4 + 0.6 * clamp01((gr - 0.6) / 0.4);
        t.parts.fruit.scale.setScalar(0.24 * fs);
      }

      // 蝶
      for (const b of butterflies) {
        b.a += dt * b.sp;
        b.mesh.position.set(Math.cos(b.a) * b.r, b.h + Math.sin(time * 3 + b.a) * 0.3, b.cz + Math.sin(b.a) * b.r * 0.5);
      }

      // 雨の日は雨粒を降らせる
      if (v === 2) {
        rainTimer += dt;
        if (rainTimer > 0.05) {
          rainTimer = 0;
          for (let k = 0; k < 3; k++) {
            R.particles((rng() - 0.5) * 30, 12, -6 + (rng() - 0.5) * 24, 0x90caf9, 1, 0.1, { up: -6, size: 0.05, life: 1.4, grav: 2 });
          }
        }
      }
      // 風の日は葉っぱを舞わせる
      if (v === 4 && Math.random() < dt * 3) {
        R.particles((rng() - 0.5) * 24, 3 + rng() * 3, -6 + (rng() - 0.5) * 20, 0x7cb342, 1, 1.5, { size: 0.12, life: 3, up: 0.2, grav: 0.8 });
      }
    }

    function clamp01(x) {
      return Math.max(0, Math.min(1, x));
    }

    function hint() {
      if (hover < 0) return '畑に照準を合わせて左クリック（またはE）。数字キーで作物を選択';
      const t = tiles[hover];
      if (t.crop < 0) return `${crops[sel].name}の種を植える（${SEED_COST}コイン）`;
      if (t.grow >= 1) return `${crops[t.crop].name}を収穫（${crops[t.crop].value}コイン）`;
      return `${crops[t.crop].name}が育っています（${Math.floor(t.grow * 100)}%）`;
    }

    function status() {
      const daytime = (dayStart + time / DAY_LEN) % 1;
      const hour = Math.floor(daytime * 24);
      return {
        progress: earned / goal,
        label: `コイン ${coins} ・ 累計 ${Math.floor(earned)} / ${goal} ・ 天気 ${weather.name} ・ ${String(hour).padStart(2, '0')}時 ・ 選択: ${crops[sel].name}`,
        hint: hint(),
        state,
      };
    }

    // テスト（tests/playtest.js）用
    function inspect() {
      return { tiles, crops, coins, sel, cellCenter, hover, weather };
    }

    return { build, update, status, inspect };
  }

  g.GAME_TYPES.slowlife = {
    label: 'スローライフ',
    help: '数字キーで作物を選び、畑に照準を合わせて左クリック（またはE）で植える。実った作物を収穫しましょう。',
    spawn: { x: 0, y: 0, z: 11, yaw: 0 },
    viewmodel: { kind: 'trowel', color: 0x8d6e63 },
    theme: (p) => ({ sky: p.sky, horizon: R_mix(p.sky, '#ffffff', 0.5), ground: p.ground, fog: 0.007, night: '#0d1b3e', sunT: 0.2 }),
    create,
  };

  function R_mix(a, b, t) {
    return g.Render.mix(a, b, t);
  }
})(window);
