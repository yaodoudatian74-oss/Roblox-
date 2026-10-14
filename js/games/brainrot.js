// ブレインロット（3D）: 広場を歩き回る生き物に近づくと回収。回収した分だけ収入が増える
(function (g) {
  const C = g.Common;
  const K = g.Kit;
  const W = g.World;
  const R = g.Render;

  function create(cfg) {
    const rng = C.mulberry32(cfg.seed);
    const p = cfg.palette;
    const d = cfg.difficulty;
    const v = cfg.variant;
    const goal = Math.round((300 + d * 2200) * 60); // 収入は回収数に比例して増えるため、目標は大きめ
    const spawnEvery = 2.2 - 1.2 * d - (v === 2 ? 0.6 : 0);
    const rareChance = [0.05, 0.1, 0.02, 0.15, 0.08][v];
    const HALF = 26;
    const GOLD = 0xffd54f;

    let creatures = [];
    let collected = 0;
    let rate = 0;
    let score = 0;
    let spawnTimer = 0;
    let state = 'playing';
    let time = 0;
    let sparkleTimer = 0;

    function build() {
      const wallColor = K.lighten(p.accent, 0.35);
      W.solid({ x: 0, y: 0, z: -HALF, w: HALF * 2 + 1, h: 2.2, d: 0.6, color: wallColor });
      W.solid({ x: 0, y: 0, z: HALF, w: HALF * 2 + 1, h: 2.2, d: 0.6, color: wallColor });
      W.solid({ x: -HALF, y: 0, z: 0, w: 0.6, h: 2.2, d: HALF * 2 + 1, color: wallColor });
      W.solid({ x: HALF, y: 0, z: 0, w: 0.6, h: 2.2, d: HALF * 2 + 1, color: wallColor });

      // 中央のモニュメント（生き物が集まる場所）
      const base = R.prop({ kind: 'cyl', r: 2.6, h: 0.6, color: 0xeceff1 });
      R.place(base, 0, 0.3, 0);
      const orb = R.prop({ kind: 'sphere', r: 1.1, color: p.accent, emissive: p.accent, emissiveIntensity: 0.9, rough: 0.2 });
      R.place(orb, 0, 2.4, 0);
      R.glow(0, 2.4, 0, p.accent, 5, 0.55);
      const ring = R.prop({ kind: 'torus', r: 1.7, color: GOLD, emissive: GOLD, emissiveIntensity: 0.8, outline: false });
      R.place(ring, 0, 2.4, 0, { rx: Math.PI / 2 });

      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        K.lamp(Math.cos(a) * 22, Math.sin(a) * 22, p.block);
      }
      const trng = C.mulberry32(cfg.seed + 7);
      for (let i = 0; i < 26; i++) {
        const a = trng() * Math.PI * 2;
        const dist = HALF + 4 + trng() * 16;
        K.tree(trng, Math.cos(a) * dist, Math.sin(a) * dist, [0x4caf50, 0x66bb6a, 0x2e7d32][i % 3]);
      }
      for (let i = 0; i < 14; i++) {
        const a = trng() * Math.PI * 2;
        const dist = 6 + trng() * 16;
        K.rock(trng, Math.cos(a) * dist, Math.sin(a) * dist);
      }
      K.meadow(trng, 0, 0, HALF - 1, 420, [0x66bb6a, 0x81c784, 0x4caf50, 0xa5d6a7]);
      K.islands(trng, 9, [p.ground, K.lighten(p.ground, 0.2), p.block]);
      K.clouds(trng, 14);
    }

    function spawn() {
      const rare = rng() < rareChance;
      const base = 4 + rng() * 4;
      const color = rare ? GOLD : p.accent;
      const name = cfg.names[Math.floor(rng() * cfg.names.length)];
      const ch = K.character({ color, eye: 0xffffff, pupil: 0x111111, scale: 0.95 + rng() * 0.2 });
      const c = {
        grp: ch.group,
        x: (rng() * 2 - 1) * (HALF - 3),
        z: (rng() * 2 - 1) * (HALF - 3),
        tx: 0,
        tz: 0,
        retarget: 0,
        life: 8 + rng() * 4,
        rare,
        name,
        value: base * (1 + d) * (rare ? 10 : 1),
        phase: rng() * 10,
        age: 0,
        scale: 1,
      };
      c.tx = c.x;
      c.tz = c.z;
      creatures.push(c);
      R.place(c.grp, c.x, 0, c.z);
    }

    function update(dt) {
      if (state !== 'playing') return;
      time += dt;

      spawnTimer += dt;
      if (spawnTimer >= spawnEvery && creatures.length < 12) {
        spawnTimer = 0;
        spawn();
      }

      for (let i = creatures.length - 1; i >= 0; i--) {
        const c = creatures[i];
        c.age += dt;
        c.life -= dt;
        c.retarget -= dt;
        if (c.retarget <= 0) {
          c.retarget = 2.5 + rng() * 2;
          c.tx = (rng() * 2 - 1) * (HALF - 3);
          c.tz = (rng() * 2 - 1) * (HALF - 3);
        }
        const dx = c.tx - c.x;
        const dz = c.tz - c.z;
        const L = Math.hypot(dx, dz);
        if (L > 0.3) {
          const sp = Math.min(L, 1.1 * dt);
          c.x += (dx / L) * sp;
          c.z += (dz / L) * sp;
          c.grp.rotation.y = Math.atan2(-dx, -dz);
        }
        // 歩くたびに小さく跳ねる
        const hop = Math.abs(Math.sin((time + c.phase) * 7)) * 0.12;
        c.grp.position.set(c.x, hop, c.z);

        const alive = c.life > 0;
        if (!alive) {
          R.remove(c.grp);
          creatures.splice(i, 1);
          continue;
        }
        if (c.life < 0.5) {
          c.grp.scale.setScalar(Math.max(0.01, c.life / 0.5));
        }
        if (C.dist(W.player.x, W.player.z, c.x, c.z) < 2.2) {
          rate += c.value;
          collected++;
          R.particles(c.x, 1, c.z, c.rare ? GOLD : p.accent, c.rare ? 26 : 14, 4, { size: 0.16 });
          R.popText(c.x, 2.2, c.z, `+${c.value.toFixed(0)}`, c.rare ? '#ffd54f' : '#ffffff');
          R.sfx(c.rare ? 'win' : 'collect');
          R.remove(c.grp);
          creatures.splice(i, 1);
        }
      }

      // 金色の個体のキラキラ
      sparkleTimer += dt;
      if (sparkleTimer > 0.35) {
        sparkleTimer = 0;
        for (const c of creatures) {
          if (c.rare) R.particles(c.x, 1.8, c.z, GOLD, 2, 1.2, { size: 0.09, life: 0.8, up: 1 });
        }
      }

      score += rate * dt;
      if (score >= goal) {
        score = goal;
        state = 'won';
      }
    }

    function status() {
      return {
        progress: score / goal,
        label: `スコア ${Math.floor(score)} / ${goal} ・ 収入 ${rate.toFixed(1)}/秒 ・ 回収 ${collected}`,
        hint: '生き物に近づくと回収。回収した分だけ収入が増えます',
        state,
      };
    }

    // テスト（tests/playtest.js）用
    function inspect() {
      return { player: W.player, wild: creatures, rate, score, goal };
    }

    return { build, update, status, inspect };
  }

  g.GAME_TYPES.brainrot = {
    label: 'ブレインロット',
    help: 'WASDで移動、マウスで見回す。生き物に近づくと回収します。',
    spawn: { x: 0, y: 0, z: 12, yaw: 0 },
    viewmodel: { kind: 'hand', color: 0xffd6a5 },
    theme: (p) => ({ sky: p.sky, horizon: R_mix(p.sky, '#ffffff', 0.45), ground: p.ground, fog: 0.012, night: '#1b1f4b', sunT: 0.3 }),
    create,
  };

  function R_mix(a, b, t) {
    return g.Render.mix(a, b, t);
  }
})(window);
