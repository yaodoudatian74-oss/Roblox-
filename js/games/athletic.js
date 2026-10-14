// アスレチック: 足場をジャンプで渡り、ゴールの旗を目指す。落下すると最後のチェックポイントから再開
(function (g) {
  const C = g.Common;
  const RUN_SPEED = 200;

  function create(cfg) {
    const rng = C.mulberry32(cfg.seed + 3);
    const p = cfg.palette;
    const d = cfg.difficulty;
    const v = cfg.variant;
    const gravity = 1400 * (1 + 0.2 * d);
    const jumpV = [520, 540, 560, 580, 600][v];
    const len = 5000 + Math.round(d * 5000);

    // 足場を左から順に生成。ジャンプで届く範囲に収める（間隔は最大100px、上りの高低差は最大45px。
    // 間隔が広い・上りが急だと届かない足場ができるため、tests/playtest.js の到達確認で検証している）
    const plats = [{ x: 0, y: 380, w: 320 }];
    let x = 320;
    let y = 380;
    while (x < len) {
      x += 40 + rng() * (60 - 10 * d);
      const w = 90 + rng() * (220 - 110 * d);
      y = C.clamp(y + (-45 + rng() * 95), 200, 420);
      plats.push({ x, y, w });
      x += w;
    }
    const last = plats[plats.length - 1];
    const flagX = last.x + last.w - 40;

    const pl = { x: 40, y: 300, vx: 0, vy: 0, w: 22, h: 32, on: false };
    let cp = { x: 40, y: 300 };
    let deaths = 0;
    let cam = 0;
    let state = 'playing';

    function update(dt, input) {
      if (state !== 'playing') return;
      const a = C.axis(input.keys);
      pl.vx = a.x * RUN_SPEED;
      if (pl.on && (input.keys.has('Space') || input.keys.has('ArrowUp') || input.keys.has('KeyW'))) {
        pl.vy = -jumpV;
        pl.on = false;
      }

      pl.vy += gravity * dt;
      const prevBottom = pl.y + pl.h;
      pl.x = C.clamp(pl.x + pl.vx * dt, 0, flagX + 200);
      pl.y += pl.vy * dt;
      pl.on = false;

      // 落下中だけ足場に着地判定（下から突き抜けないように）
      if (pl.vy >= 0) {
        for (let i = 0; i < plats.length; i++) {
          const pf = plats[i];
          const overlapX = pl.x + pl.w > pf.x && pl.x < pf.x + pf.w;
          if (overlapX && prevBottom <= pf.y + 2 && pl.y + pl.h >= pf.y) {
            pl.y = pf.y - pl.h;
            pl.vy = 0;
            pl.on = true;
            if (i % 4 === 0) cp = { x: pf.x + 10, y: pf.y - pl.h };
            break;
          }
        }
      }

      if (pl.y > C.H + 80) {
        deaths++;
        pl.x = cp.x;
        pl.y = cp.y;
        pl.vx = 0;
        pl.vy = 0;
      }

      if (pl.x + pl.w >= flagX) state = 'won';
      cam = C.clamp(pl.x - C.W * 0.35, 0, Math.max(0, flagX - C.W + 120));
    }

    function draw(ctx) {
      ctx.fillStyle = p.sky;
      ctx.fillRect(0, 0, C.W, C.H);
      ctx.fillStyle = 'rgba(255,60,60,0.35)';
      ctx.fillRect(0, C.H - 30, C.W, 30);

      ctx.save();
      ctx.translate(-cam, 0);
      plats.forEach((pf, i) => {
        if (pf.x + pf.w < cam - 10 || pf.x > cam + C.W + 10) return;
        C.block(ctx, pf.x, pf.y, pf.w, 20, i % 4 === 0 ? p.accent : p.ground);
      });
      ctx.fillStyle = '#fff';
      ctx.fillRect(flagX, last.y - 120, 4, 120);
      ctx.fillStyle = p.block;
      ctx.beginPath();
      ctx.moveTo(flagX + 4, last.y - 120);
      ctx.lineTo(flagX + 40, last.y - 104);
      ctx.lineTo(flagX + 4, last.y - 88);
      ctx.fill();
      C.block(ctx, pl.x, pl.y, pl.w, pl.h, p.block);
      C.eyes(ctx, pl.x + pl.w / 2, pl.y + 10, 0.8);
      ctx.restore();
    }

    function status() {
      const progress = C.clamp(pl.x / flagX, 0, 1);
      return {
        progress,
        label: `ゴールまで ${Math.max(0, Math.round(flagX - pl.x))}m ・ 落下 ${deaths}回`,
        state,
      };
    }

    // テスト（tests/playtest.js）用: 足場とゴールの位置を読む
    function inspect() {
      return { plats, flagX, player: pl, gravity, jumpV, runSpeed: RUN_SPEED };
    }

    return { update, draw, status, inspect };
  }

  g.GAME_TYPES.athletic = {
    label: 'アスレチック',
    help: '矢印キーで移動、スペースキーでジャンプ。足場から落ちても最後のチェックポイントから再開できます。',
    create,
  };
})(window);
