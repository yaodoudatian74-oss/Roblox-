'use strict';
// ジャンルごとの攻略ボット（テストプレイ用）。実際のプレイヤーと同じ入力（キー・視点・クリック）だけで操作する。
// 引数の sb は tests/load.js で読み込んだゲーム環境（World, Physics を含む）。
module.exports = function createBots(sb) {
  const { World: W, Physics } = sb;
  const DT = 1 / 30;
  const bot = {};

  // 視線を (tx, tz) の地面上の点に向ける
  function aimAt(tx, tz) {
    const p = W.player;
    const dx = tx - p.x;
    const dz = tz - p.z;
    const h = Math.hypot(dx, dz) || 1;
    const dy = -(p.y + W.EYE);
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.asin(dy / Math.hypot(h, dy));
  }
  
  function faceTo(tx, tz) {
    const p = W.player;
    p.yaw = Math.atan2(-(tx - p.x), -(tz - p.z));
  }
  
  const bots = {
    // 一番近い生き物に向かって歩く
    brainrot(game) {
      const st = game.inspect();
      let target = null;
      let best = Infinity;
      for (const c of st.wild) {
        const d = Math.hypot(c.x - W.player.x, c.z - W.player.z);
        if (d < best) {
          best = d;
          target = c;
        }
      }
      if (!target) return;
      faceTo(target.x, target.z);
      W.input.keys.add('KeyW');
    },
  
    // 2秒ごとに1手。空きマスには回収の早い建物を、なければ一番安い強化を狙う。照準が合ったら左クリック
    tycoon(game, f) {
      const st = game.inspect();
      if (f % 60 === 0 || !bot.tycoonTarget) {
        bot.tycoonTarget = null;
        const empty = st.cells.findIndex((c) => c === null);
        if (empty >= 0) {
          let pick = -1;
          let bestPayback = Infinity;
          st.types.forEach((ty, k) => {
            if (st.cash >= ty.cost && ty.cost / ty.cps < bestPayback) {
              bestPayback = ty.cost / ty.cps;
              pick = k;
            }
          });
          if (pick >= 0) {
            bot.tycoonTarget = { i: empty, sel: pick };
          }
        }
        if (!bot.tycoonTarget) {
          let up = -1;
          let upCost = Infinity;
          st.cells.forEach((b, i) => {
            if (!b) return;
            const c = st.upgradeCost(b);
            if (c <= st.cash && c < upCost) {
              upCost = c;
              up = i;
            }
          });
          if (up >= 0) bot.tycoonTarget = { i: up, sel: null };
        }
      }
      const t = bot.tycoonTarget;
      if (!t) return;
      if (t.sel !== null && st.sel !== t.sel) W.input.pressed.add('Digit' + (t.sel + 1));
      const [tx, tz] = st.cellCenter(t.i);
      aimAt(tx, tz);
      if (st.hover === t.i && f % 15 === 7) W.input.fire = true;
    },
  
    // 近づきすぎないよう敵に向き、範囲に入ったら攻撃。HPが少ないときは下がる
    rpg(game) {
      const st = game.inspect();
      let near = null;
      let nd = Infinity;
      for (const m of st.mobs) {
        const d = Math.hypot(m.x - W.player.x, m.z - W.player.z);
        if (d < nd) {
          nd = d;
          near = m;
        }
      }
      if (!near) return;
      faceTo(near.x, near.z);
      if (st.hero.hp < st.hero.maxHp * 0.35 && nd < 6) W.input.keys.add('KeyS');
      else if (nd > 2.0) W.input.keys.add('KeyW');
      if (nd < 2.9 && st.cool <= 0) W.input.fire = true;
    },
  
    // 1秒ごとに1手。実った作物を収穫し、なければ一番効率のよい作物を植える
    slowlife(game, f) {
      const st = game.inspect();
      if (f % 30 === 0 || !bot.slowTarget) {
        bot.slowTarget = null;
        const ripe = st.tiles.findIndex((t) => t.crop >= 0 && t.grow >= 1);
        if (ripe >= 0) {
          bot.slowTarget = { i: ripe, sel: null };
        } else if (st.coins >= 3) {
          const empty = st.tiles.findIndex((t) => t.crop < 0);
          if (empty >= 0) {
            let best = 0;
            st.crops.forEach((c, k) => {
              if (c.value / c.time > st.crops[best].value / st.crops[best].time) best = k;
            });
            bot.slowTarget = { i: empty, sel: best };
          }
        }
      }
      const t = bot.slowTarget;
      if (!t) return;
      if (t.sel !== null && st.sel !== t.sel) W.input.pressed.add('Digit' + (t.sel + 1));
      const [tx, tz] = st.cellCenter(t.i);
      aimAt(tx, tz);
      if (st.hover === t.i && f % 15 === 7) W.input.fire = true;
    },
  
    // 走り続け、「今ジャンプしたら次の足場に乗れるか」を物理シミュレーションで判断して跳ぶ
    athletic(game) {
    const p = W.player;
    W.input.keys.add('KeyW');
    // 空中でも、跳んだときの速さ（全速か歩きか）を保つ。空中で Shift を離すと速度が落ちて着地が狂う
    if (!p.onGround) {
      if (bot.sprint) W.input.keys.add('ShiftLeft');
      return;
    }
    const cur = W.colliders.find((c) => p.x >= c.minX - p.r && p.x <= c.maxX + p.r && Math.abs(c.maxY - p.y) < 0.01);
    if (!cur) return;
    // 全速（11m/s）で届くならそのまま跳ぶ。届かなければ歩き（7m/s）で届くか試す。どちらも届かなければ全速で進む
    // 余裕のある着地（端から0.6m以上）を優先し、無ければ端ぎりぎりでも届くかを見る
    if (landsAhead(p, cur, 11, 0.6) || landsAhead(p, cur, 7, 0.6)) {
      const sprint = landsAhead(p, cur, 11, 0.6);
      bot.sprint = sprint;
      if (sprint) W.input.keys.add('ShiftLeft');
      W.input.keys.add('Space');
    } else if (landsAhead(p, cur, 11) || landsAhead(p, cur, 7)) {
      const sprint = landsAhead(p, cur, 11);
      bot.sprint = sprint;
      if (sprint) W.input.keys.add('ShiftLeft');
      W.input.keys.add('Space');
    } else {
      bot.sprint = true;
      W.input.keys.add('ShiftLeft');
    }
  },

  };
  
  // 今ジャンプすると、現在の足場より先の足場に乗れるかを、実際の物理式で先読みする
  // margin: 着地点が足場の端から何m以上内側か（余裕のある着地を優先する）
  function landsAhead(p, cur, speed, margin = 0) {
    // 現在の速度から始める（静止や減速からの跳躍を過大評価しない）
    const b = { x: p.x, y: p.y, z: p.z, vx: p.vx, vy: 0, vz: p.vz, onGround: true, r: p.r, h: p.h };
    const opts = { wx: 1, wz: 0, speed, jump: true, G: W.G, jumpV: W.JUMP };
    for (let f = 0; f < 150; f++) {
      Physics.stepBody(b, opts, DT, W.colliders);
      opts.jump = false;
      if (b.y < W.voidY) return false;
      if (b.onGround && b.x > cur.maxX) {
        const landed = W.colliders.find((c) => b.x >= c.minX && b.x <= c.maxX && Math.abs(c.maxY - b.y) < 0.01);
        if (landed && landed !== cur) return true;
      }
    }
    return false;
  }

  return { bots, bot, landsAhead, aimAt, faceTo };
};
