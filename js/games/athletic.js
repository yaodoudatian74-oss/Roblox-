// アスレチック（3D）: 空に浮かぶ足場を、ジャンプで渡ってゴールを目指す。落ちたら最後のチェックポイントから再開
(function (g) {
  const C = g.Common;
  const K = g.Kit;
  const W = g.World;
  const R = g.Render;

  const VOID_Y = -12;

  function create(cfg) {
    const rng = C.mulberry32(cfg.seed + 3);
    const p = cfg.palette;
    const d = cfg.difficulty;
    const v = cfg.variant;
    const jump = [7.6, 8.0, 8.4, 8.8, 9.2][v];
    const N = 26 + Math.round(d * 14); // 足場の数
    const CHECK_EVERY = 5;

    // 足場を左から順に生成。ジャンプで届く範囲（間隔は最大約4.4m、上りは最大約1m）に収める
    // 物理の到達確認は tests/playtest.js で全ゲームに対して行う
    const plats = [];
    let x = 0;
    let top = 0;
    let z = 0;
    plats.push({ x: 0, top: 0, z: 0, w: 9, d: 6, check: true });
    x = 4.5;
    for (let i = 1; i <= N; i++) {
      const gap = 1.6 + rng() * (2.5 - 0.6 * d);
      const w = 2.4 + rng() * (3.0 - 0.9 * d);
      const dd = 3.4 + rng() * 1.6;
      top = C.clamp(top + (rng() * 1.8 - 1.0), -1, 8);
      // 奥行きは最小3.4mあるので、±1m 以内のずれならプレイヤーの進路（z=0）は必ず足場の上になる
      z = C.clamp(z + (rng() * 2 - 1) * 0.6, -1, 1);
      x += gap + w / 2;
      plats.push({ x, top, z, w, d: dd, check: i % CHECK_EVERY === 0 });
      x += w / 2;
    }
    // ゴールの広い足場（直前の足場から3m離す）
    x += 3.0 + 6;
    const goalTop = top;
    const goalPlat = { x, top: goalTop, z: 0, w: 12, d: 10, goal: true };
    plats.push(goalPlat);
    const goalStart = x - 6 + 0.5;

    const checkpoints = [plats[0]];
    let falls = 0;
    let coins = 0;
    let state = 'playing';
    let spin = 0;
    const coinList = [];
    let respawn = { x: 0, y: 0, z: 0 };
    let flagMesh = null;

    // 物理の設定（W.reset の後に呼ばれるので、ここで上書きする）
    W.JUMP = jump;
    W.voidY = VOID_Y;
    W.onVoid = (player) => fallRespawn(player);

    function build() {
      // 下の海（落ちたときに見える）
      const sea = R.prop({ kind: 'plane', w: 500, d: 500, color: '#2b7bb9', rough: 0.25, shadow: false, outline: false });
      R.place(sea, 0, VOID_Y + 0.5, 0);

      plats.forEach((pl, i) => {
        const base = i % 2 ? p.block : p.ground;
        const color = pl.goal ? 0xfff176 : K.lighten(base, 0.05 * (i % 3) + (pl.check ? 0.2 : 0));
        K.platform({ x: pl.x, y: pl.top - 1, z: pl.z, w: pl.w, d: pl.d, h: 1, color, studs: true });
        if (pl.check || pl.goal) {
          const pad = R.prop({ kind: 'cyl', r: Math.min(pl.w, pl.d) * 0.3, h: 0.08, color: pl.goal ? 0xffd54f : p.accent, emissive: pl.goal ? 0xffd54f : p.accent, emissiveIntensity: 1.2, outline: false, shadow: false });
          R.place(pad, pl.x, pl.top + 0.04, pl.z);
          R.glow(pl.x, pl.top + 1.6, pl.z, pl.goal ? 0xffd54f : p.accent, pl.goal ? 5 : 1.8, pl.goal ? 0.5 : 0.3);
        }
        if (i > 0 && i % 2 === 0 && !pl.goal && rng() < 0.8) {
          coinList.push({ x: pl.x + (rng() - 0.5) * pl.w * 0.4, y: pl.top + 1.7, z: pl.z });
        }
      });
      for (const c of coinList) {
        c.mesh = R.prop({ kind: 'cyl', r: 0.32, h: 0.08, color: 0xffd54f, emissive: 0xffd54f, emissiveIntensity: 0.9, outline: false, shadow: false, rough: 0.3, metal: 0.4 });
        c.mesh.rotation.x = Math.PI / 2;
        R.place(c.mesh, c.x, c.y, c.z);
        R.glow(c.x, c.y, c.z, 0xffd54f, 1.6, 0.45);
      }

      // ゴールの旗
      const pole = R.prop({ kind: 'cyl', r: 0.12, h: 6, color: 0xffffff, outline: false });
      R.place(pole, goalPlat.x + 4, goalTop + 3, 0);
      const flag = R.prop({ kind: 'box', w: 0.05, h: 1.4, d: 2.2, color: p.block, emissive: p.block, emissiveIntensity: 0.4, outline: false, shadow: false });
      R.place(flag, goalPlat.x + 4, goalTop + 5.2, 1.2);
      flagMesh = flag;

      // 背景
      const trng = C.mulberry32(cfg.seed + 13);
      K.islands(trng, 12, [p.ground, p.block, p.accent]);
      K.clouds(trng, 16);
      R.flushStuds();
    }

    function fallRespawn(player) {
      falls++;
      player.x = respawn.x;
      player.y = respawn.y;
      player.z = respawn.z;
      player.vx = 0;
      player.vy = 0;
      player.vz = 0;
      R.sfx('fall');
      R.popText(player.x, player.y + 2.5, player.z, '落下！', '#ff8a80');
      R.shake(0.3);
    }

    function update(dt) {
      if (state !== 'playing') return;
      spin += dt;

      const pl = W.player;
      // 通ったチェックポイントを記録する
      for (const c of plats) {
        if (!c.check) continue;
        if (Math.abs(pl.x - c.x) < c.w / 2 && Math.abs(pl.z - c.z) < c.d / 2 && pl.onGround && Math.abs(pl.y - c.top) < 0.05) {
          if (!checkpoints.includes(c)) {
            checkpoints.push(c);
            R.toast('チェックポイント');
            R.sfx('coin');
          }
          // 進路は常に z=0 の一本道なので、リスポーンも z=0（足場の奥行きは必ずこの位置を含む）
          respawn = { x: c.x, y: c.top + 0.02, z: 0 };
        }
      }

      // コイン
      for (let i = coinList.length - 1; i >= 0; i--) {
        const c = coinList[i];
        if (C.dist(pl.x, pl.z, c.x, c.z) < 1.2 && Math.abs(pl.y - c.y) < 1.8) {
          coins++;
          R.particles(c.x, c.y, c.z, 0xffd54f, 10, 3, { size: 0.12 });
          R.sfx('coin');
          R.remove(c.mesh);
          coinList.splice(i, 1);
        }
      }
      for (const c of coinList) {
        c.mesh.rotation.y = spin * 3;
        c.mesh.position.y = c.y + Math.sin(spin * 2 + c.x) * 0.12;
      }
      if (flagMesh) flagMesh.rotation.y = Math.sin(spin * 2) * 0.2;

      // ゴール（広い足場に乗ったら）
      if (pl.x > goalStart && pl.onGround && Math.abs(pl.y - goalTop) < 0.05) {
        state = 'won';
        R.sfx('win');
        R.particles(pl.x, pl.y + 2, pl.z, 0xffd54f, 40, 6, { size: 0.2, life: 1.2 });
      }
    }

    function status() {
      const remain = Math.max(0, Math.round(goalStart - W.player.x));
      return {
        progress: C.clamp(W.player.x / goalStart, 0, 1),
        label: `ゴールまで ${remain}m ・ 落下 ${falls}回 ・ コイン ${coins}`,
        hint: '矢印キー / WASDで移動、スペースでジャンプ（Shiftで走る）。落ちたら最後のチェックポイントから再開',
        state,
      };
    }

    // テスト（tests/playtest.js）用
    function inspect() {
      return { plats, goalStart, goalTop, player: W.player, falls, jumpV: jump, gravity: W.G };
    }

    return { build, update, status, inspect };
  }

  g.GAME_TYPES.athletic = {
    label: 'アスレチック',
    help: '矢印キー / WASDで移動、スペースでジャンプ、Shiftで走る。足場から落ちても最後のチェックポイントから再開できます。',
    spawn: { x: 0, y: 0, z: 0, yaw: -Math.PI / 2 },
    noFloor: true,
    viewmodel: { kind: 'hand', color: 0xffd6a5 },
    theme: (p) => ({ sky: p.sky, horizon: R_mix(p.sky, '#cfeeff', 0.3), noGround: true, fog: 0.0035, night: '#101840', sunT: 0.3 }),
    create,
  };

  function R_mix(a, b, t) {
    return g.Render.mix(a, b, t);
  }
})(window);
