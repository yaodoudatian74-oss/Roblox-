// RPG（3D）: 闘技場に押し寄せるモンスターを近接攻撃で倒してレベルアップ。HPが0になると敗北
(function (g) {
  const C = g.Common;
  const K = g.Kit;
  const W = g.World;
  const R = g.Render;

  const ARENA = 23; // 歩ける半径
  const RING = 27; // モンスターが湧く半径
  const RANGE = 3.2;
  const CONE = Math.cos((70 * Math.PI) / 180);

  function create(cfg) {
    const rng = C.mulberry32(cfg.seed + 1);
    const p = cfg.palette;
    const d = cfg.difficulty;
    const v = cfg.variant;
    const goal = 10 + Math.round(d * 40);
    const speedMul = [0.8, 0.95, 1.1, 1.2, 1.3][v];
    const spawnEvery = Math.max(0.9, 2.6 - 1.2 * d);

    const hero = { hp: 100, maxHp: 100, lvl: 1, xp: 0, atk: 10, cool: 0 };
    let mobs = [];
    let kills = 0;
    let spawnTimer = 0;
    let state = 'playing';
    let tick = 0;
    let lastHit = 0;

    function build() {
      // 石の柱が闘技場を囲む（当たり判定あり）
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const x = Math.cos(a) * 20;
        const z = Math.sin(a) * 20;
        W.solid({ x, y: 0, z, w: 1.6, h: 4.2, d: 1.6, color: K.lighten(p.block, 0.1) });
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const top = R.prop({ kind: 'box', w: 1.9, h: 0.5, d: 1.9, color: K.lighten(p.block, 0.25) });
        R.place(top, Math.cos(a) * 20, 4.45, Math.sin(a) * 20);
      }
      // 中央の魔法陣
      const rune = R.prop({ kind: 'torus', r: 6, color: p.accent, emissive: p.accent, emissiveIntensity: 0.9, outline: false, shadow: false });
      R.place(rune, 0, 0.05, 0, { rx: Math.PI / 2 });
      // 四隅のかがり火
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
        const x = Math.cos(a) * 17;
        const z = Math.sin(a) * 17;
        const pole = R.prop({ kind: 'cyl', r: 0.14, h: 1.6, color: 0x37474f, outline: false });
        R.place(pole, x, 0.8, z);
        const fire = R.prop({ kind: 'sphere', r: 0.36, color: 0xff7043, emissive: 0xff7043, emissiveIntensity: 2.6, outline: false, shadow: false });
        R.place(fire, x, 1.9, z);
        R.glow(x, 1.9, z, 0xff7043, 3.2, 0.6);
      }
      const trng = C.mulberry32(cfg.seed + 5);
      for (let i = 0; i < 22; i++) {
        const a = trng() * Math.PI * 2;
        const dist = 33 + trng() * 14;
        K.tree(trng, Math.cos(a) * dist, Math.sin(a) * dist, [0x2e7d32, 0x388e3c, 0x1b5e20][i % 3]);
      }
      for (let i = 0; i < 10; i++) {
        const a = trng() * Math.PI * 2;
        K.rock(trng, Math.cos(a) * (28 + trng() * 10), Math.sin(a) * (28 + trng() * 10), 0x607d8b);
      }
      K.meadow(trng, 0, 0, ARENA - 1, 260, [0x558b2f, 0x7cb342, 0x33691e]);
      K.islands(trng, 8, [p.ground, p.block]);
      K.clouds(trng, 10);
    }

    function spawn() {
      const a = rng() * Math.PI * 2;
      const x = Math.cos(a) * RING;
      const z = Math.sin(a) * RING;
      const big = rng() < 0.2;
      const hp = (20 + d * 30) * (big ? 2.5 : 1);
      const color = big ? p.accent : p.block;
      const ch = K.character({ color, eye: 0xff5252, pupil: 0x111111, scale: big ? 1.5 : 0.95 + rng() * 0.15 });
      const m = {
        grp: ch.group,
        x,
        z,
        hp,
        maxHp: hp,
        big,
        speed: (2.2 + rng() * 1.2 + d * 1.2) * speedMul,
        dmg: (big ? 12 : 6) * (1 + 0.5 * d),
        name: cfg.names[Math.floor(rng() * cfg.names.length)],
        cd: 0.5 + rng() * 0.5,
        tele: 0,
        flash: 0,
        phase: rng() * 6,
        kx: 0,
        kz: 0,
      };
      mobs.push(m);
      R.place(m.grp, x, 0, z);
    }

    function attackHero(dmg) {
      hero.hp -= dmg;
      lastHit = tick;
      R.flash('#ff1744', 0.4);
      R.shake(0.45);
      R.sfx('hurt');
      R.popText(W.player.x, W.player.y + 2, W.player.z, `-${dmg.toFixed(0)}`, '#ff8a80');
    }

    function swing() {
      hero.cool = 0.45;
      R.swing();
      R.sfx('swing');
      const f = W.forward();
      const fl = Math.hypot(f.x, f.z) || 1;
      let hits = 0;
      for (const m of mobs) {
        const dx = m.x - W.player.x;
        const dz = m.z - W.player.z;
        const L = Math.hypot(dx, dz);
        if (L > RANGE || L < 0.01) continue;
        const dot = (dx * f.x + dz * f.z) / (L * fl);
        if (dot < CONE) continue;
        const crit = rng() < 0.15; // 乱数は seed 付きの rng を使い、同じ条件なら同じ結果になるようにする
        const dmg = hero.atk * (0.8 + rng() * 0.4) * (crit ? 2 : 1);
        m.hp -= dmg;
        m.flash = 0.14;
        m.kx = (dx / L) * 2.5;
        m.kz = (dz / L) * 2.5;
        R.particles(m.x, 1.2, m.z, crit ? '#ffd54f' : '#ffffff', crit ? 14 : 8, 3.5, { size: 0.12 });
        R.popText(m.x, 2.4, m.z, crit ? `${dmg.toFixed(0)}!` : dmg.toFixed(0), crit ? '#ffd54f' : '#ffffff');
        hits++;
      }
      if (hits > 0) R.sfx('hit');
    }

    function update(dt) {
      if (state !== 'playing') return;
      tick += dt;
      hero.cool = Math.max(0, hero.cool - dt);

      // 闘技場の外に出ない
      const pl = W.player;
      const rr = Math.hypot(pl.x, pl.z);
      if (rr > ARENA) {
        pl.x *= ARENA / rr;
        pl.z *= ARENA / rr;
      }

      if (W.input.fire && hero.cool <= 0) swing();

      spawnTimer += dt;
      if (spawnTimer >= spawnEvery && mobs.length < 14) {
        spawnTimer = 0;
        spawn();
      }

      for (const m of mobs) {
        m.flash = Math.max(0, m.flash - dt);
        m.cd = Math.max(0, m.cd - dt);
        // ノックバックの減衰
        m.x += m.kx * dt;
        m.z += m.kz * dt;
        m.kx *= Math.pow(0.02, dt);
        m.kz *= Math.pow(0.02, dt);

        const dx = pl.x - m.x;
        const dz = pl.z - m.z;
        const L = Math.hypot(dx, dz) || 1;
        const near = L < 1.9;
        if (!near) {
          m.x += (dx / L) * m.speed * dt;
          m.z += (dz / L) * m.speed * dt;
        }
        // 予兆（脈動）してから攻撃する
        if (near && m.cd <= 0) {
          m.tele += dt;
          if (m.tele > 0.5) {
            m.tele = 0;
            m.cd = 1.0;
            if (Math.hypot(pl.x - m.x, pl.z - m.z) < 2.4) attackHero(m.dmg);
          }
        } else {
          m.tele = 0;
        }

        const pulse = m.tele > 0 ? 1 + Math.sin(m.tele * 40) * 0.08 : 1;
        const squish = m.flash > 0 ? 0.82 : 1;
        const bob = Math.abs(Math.sin((tick + m.phase) * 6)) * 0.12;
        m.grp.position.set(m.x, bob, m.z);
        m.grp.rotation.y = Math.atan2(-dx, -dz);
        const sc = (m.big ? 1.5 : 1) * pulse;
        m.grp.scale.set(sc, sc * squish, sc);

        if (m.hp <= 0) {
          kills++;
          const xp = 10 + Math.round(m.maxHp * 0.2);
          hero.xp += xp;
          R.particles(m.x, 1.2, m.z, m.big ? p.accent : p.block, m.big ? 40 : 22, 5, { size: 0.16 });
          R.popText(m.x, 2.2, m.z, `+${xp} XP`, '#b9f6ca');
          R.sfx('coin');
          m.dead = true;
          R.remove(m.grp);
          while (hero.xp >= hero.lvl * 30) {
            hero.xp -= hero.lvl * 30;
            hero.lvl++;
            hero.atk += 3;
            hero.maxHp += 15;
            hero.hp = hero.maxHp;
            R.sfx('level');
            R.toast(`レベルアップ！ Lv${hero.lvl}`);
            R.popText(pl.x, pl.y + 2.6, pl.z, `Lv${hero.lvl}`, '#ffd54f');
          }
        }
      }
      mobs = mobs.filter((m) => !m.dead);

      // 接触ダメージで止まっていないか（死亡判定）
      if (hero.hp <= 0) {
        hero.hp = 0;
        state = 'lost';
        return;
      }
      if (kills >= goal) state = 'won';
    }

    function status() {
      const danger = tick - lastHit < 0.6;
      return {
        progress: kills / goal,
        label: `Lv${hero.lvl} ・ HP ${Math.ceil(hero.hp)}/${hero.maxHp} ・ ATK ${hero.atk} ・ 撃破 ${kills} / ${goal}${danger ? ' ・ 被弾!' : ''}`,
        hint: '左クリック / E で前方の敵を攻撃。赤く脈打つ敵は攻撃の予兆です',
        state,
      };
    }

    // テスト（tests/playtest.js）用
    function inspect() {
      return { hero, mobs, kills, goal, cool: hero.cool, pos: W.player };
    }

    return { build, update, status, inspect };
  }

  g.GAME_TYPES.rpg = {
    label: 'RPG',
    help: 'WASDで移動、マウスで見回す。左クリック（またはE）で前方の敵を攻撃。敵の予兆に注意。',
    spawn: { x: 0, y: 0, z: 0, yaw: 0 },
    viewmodel: { kind: 'sword', color: 0xffb300 },
    theme: (p) => ({ sky: p.sky, horizon: R_mix(p.sky, '#ffffff', 0.35), ground: R_mix(p.ground, '#ffffff', 0.1), fog: 0.009, night: '#0d0d24', sunT: 0.45 }),
    create,
  };

  function R_mix(a, b, t) {
    return g.Render.mix(a, b, t);
  }
})(window);
