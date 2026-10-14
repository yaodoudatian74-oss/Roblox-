// RPG: 押し寄せるモンスターを倒してレベルアップ。HPが0になると敗北
(function (g) {
  const C = g.Common;
  const RANGE = 75;

  function create(cfg) {
    const rng = C.mulberry32(cfg.seed + 1);
    const p = cfg.palette;
    const d = cfg.difficulty;
    const v = cfg.variant;
    const goal = 10 + Math.round(d * 40);
    const speedMul = [0.8, 0.95, 1.1, 1.2, 1.3][v];

    const hero = { x: C.W / 2, y: C.H / 2, hp: 100, maxHp: 100, lvl: 1, xp: 0, atk: 10, cool: 0 };
    let mobs = [];
    let kills = 0;
    let spawnTimer = 0;
    let flash = 0;
    let state = 'playing';

    function spawn() {
      const side = Math.floor(rng() * 4);
      const x = side === 0 ? -20 : side === 1 ? C.W + 20 : rng() * C.W;
      const y = side === 2 ? -20 : side === 3 ? C.H + 20 : rng() * C.H;
      const big = rng() < 0.2;
      const hp = (20 + d * 30) * (big ? 2.5 : 1);
      mobs.push({
        x,
        y,
        hp,
        maxHp: hp,
        big,
        speed: (50 + rng() * 30 + d * 30) * speedMul,
        dmg: (big ? 12 : 6) * (1 + 0.5 * d),
        name: cfg.names[Math.floor(rng() * cfg.names.length)],
        hit: 0,
        touch: 0,
      });
    }

    function attack() {
      hero.cool = 0.45;
      flash = 0.2;
      for (const m of mobs) {
        if (C.dist(hero.x, hero.y, m.x, m.y) > RANGE) continue;
        m.hp -= hero.atk * (0.8 + rng() * 0.4);
        m.hit = 0.12;
      }
      mobs = mobs.filter((m) => {
        if (m.hp > 0) return true;
        kills++;
        hero.xp += 10 + Math.round(m.maxHp * 0.2);
        while (hero.xp >= hero.lvl * 30) {
          hero.xp -= hero.lvl * 30;
          hero.lvl++;
          hero.atk += 3;
          hero.maxHp += 15;
          hero.hp = hero.maxHp;
        }
        return false;
      });
      if (kills >= goal && state === 'playing') state = 'won';
    }

    function click() {
      if (state === 'playing' && hero.cool <= 0) attack();
    }

    function update(dt, input) {
      if (state !== 'playing') return;
      const a = C.axis(input.keys);
      hero.x = C.clamp(hero.x + a.x * 190 * dt, 16, C.W - 16);
      hero.y = C.clamp(hero.y + a.y * 190 * dt, 16, C.H - 16);
      hero.cool = Math.max(0, hero.cool - dt);
      flash = Math.max(0, flash - dt);

      if (input.keys.has('Space') && hero.cool <= 0) attack();

      spawnTimer += dt;
      if (spawnTimer >= Math.max(0.9, 2.6 - 1.2 * d) && mobs.length < 14) {
        spawnTimer = 0;
        spawn();
      }

      for (const m of mobs) {
        const dx = hero.x - m.x;
        const dy = hero.y - m.y;
        const L = Math.hypot(dx, dy) || 1;
        m.x += (dx / L) * m.speed * dt;
        m.y += (dy / L) * m.speed * dt;
        m.hit = Math.max(0, m.hit - dt);
        m.touch = Math.max(0, m.touch - dt);
        if (L < 26 && m.touch <= 0) {
          hero.hp -= m.dmg;
          m.touch = 0.8;
        }
      }

      if (hero.hp <= 0) {
        hero.hp = 0;
        state = 'lost';
      }
    }

    function draw(ctx) {
      ctx.fillStyle = p.ground;
      ctx.fillRect(0, 0, C.W, C.H);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      for (let x = 0; x < C.W; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, C.H);
        ctx.stroke();
      }
      for (let y = 0; y < C.H; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(C.W, y);
        ctx.stroke();
      }

      if (flash > 0) {
        ctx.strokeStyle = p.block;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(hero.x, hero.y, RANGE, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (const m of mobs) {
        const s = m.big ? 34 : 24;
        C.block(ctx, m.x - s / 2, m.y - s / 2, s, s, m.hit > 0 ? '#ffffff' : p.accent);
        C.eyes(ctx, m.x, m.y, m.big ? 1.2 : 0.8);
        C.text(ctx, m.name, m.x, m.y - s / 2 - 12, p.dark, 10);
        C.bar(ctx, m.x - 16, m.y + s / 2 + 4, 32, m.hp / m.maxHp, '#2ecc71');
      }

      C.block(ctx, hero.x - 12, hero.y - 12, 24, 24, p.block);
      C.eyes(ctx, hero.x, hero.y, 0.8);
      C.bar(ctx, hero.x - 16, hero.y - 22, 32, hero.hp / hero.maxHp, '#ff5252');
    }

    function status() {
      return {
        progress: kills / goal,
        label: `Lv${hero.lvl} ・ HP ${Math.ceil(hero.hp)}/${hero.maxHp} ・ ATK ${hero.atk} ・ 撃破 ${kills} / ${goal}`,
        state,
      };
    }

    // テスト（tests/playtest.js）用
    function inspect() {
      return { hero, mobs, kills, goal, cool: hero.cool };
    }

    return { update, draw, click, status, inspect };
  }

  g.GAME_TYPES.rpg = {
    label: 'RPG',
    help: '矢印キー / WASDで移動。スペースキーかクリックで周囲のモンスターを攻撃します。',
    create,
  };
})(window);
