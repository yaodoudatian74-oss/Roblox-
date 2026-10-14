'use strict';
// テストプレイ: ジャンルごとの攻略ボットで500ゲームを最後までプレイし、
// クリア率・所要時間・行き詰まり・敗北を集計する。
// ボットは実際のプレイヤーと同じ入力（キー・クリック）だけでゲームを操作する。
//
// 実行: node tests/playtest.js            全ジャンル
//       node tests/playtest.js rpg -v     RPGだけ、ゲームごとの結果も表示
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const files = [
  'js/common.js',
  'js/games/brainrot.js',
  'js/games/tycoon.js',
  'js/games/rpg.js',
  'js/games/slowlife.js',
  'js/games/athletic.js',
  'js/catalog.js',
];
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of files) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
}
const { CATALOG, CATALOG_ORDER, GAME_TYPES } = sandbox;

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const onlyGenre = args.find((a) => !a.startsWith('-'));

const DT = 1 / 30;
const MAX_SECONDS = 15 * 60; // ゲーム内時間の上限
const STUCK_SECONDS = 180; // この時間進捗がなければ行き詰まり扱い

// 描画は呼び出しだけ確認する（例外が出ないこと）
function makeCtx() {
  const noop = () => {};
  return new Proxy({}, { get: (t, k) => (k in t ? t[k] : (t[k] = noop)), set: (t, k, v) => ((t[k] = v), true) });
}
const ctx = makeCtx();

// 目標の方向に応じて矢印キーを押す集合を返す
function keysToward(dx, dy, eps = 4) {
  const s = new Set();
  if (dx < -eps) s.add('ArrowLeft');
  if (dx > eps) s.add('ArrowRight');
  if (dy < -eps) s.add('ArrowUp');
  if (dy > eps) s.add('ArrowDown');
  return s;
}

const bots = {
  // 一番近い生き物に向かう
  brainrot(game, t) {
    const st = game.inspect();
    let target = null;
    let best = Infinity;
    for (const w of st.wild) {
      const d = Math.hypot(w.x - st.player.x, w.y - st.player.y);
      if (d < best) {
        best = d;
        target = w;
      }
    }
    if (!target) return {};
    return { keys: keysToward(target.x - st.player.x, target.y - st.player.y, 3) };
  },

  // 0.5秒ごとに1手。空きマスには回収の早い建物（費用/収入が最小）を置き、なければ一番安い強化をする
  tycoon(game, t) {
    if (t % 15 !== 0) return {};
    const st = game.inspect();
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
        return { keydown: ['Digit' + (pick + 1)], click: st.cellCenter(empty) };
      }
    }
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
    if (up >= 0) return { click: st.cellCenter(up) };
    return {};
  },

  // 近づきすぎないように間合いを取り、範囲に入ったら攻撃。HPが少ないときは逃げる
  rpg(game) {
    const st = game.inspect();
    const h = st.hero;
    let near = null;
    let nd = Infinity;
    for (const m of st.mobs) {
      const d = Math.hypot(m.x - h.x, m.y - h.y);
      if (d < nd) {
        nd = d;
        near = m;
      }
    }
    if (!near) return {};
    let keys;
    if (h.hp < h.maxHp * 0.35 && nd < 150) keys = keysToward(h.x - near.x, h.y - near.y);
    else if (nd > 60) keys = keysToward(near.x - h.x, near.y - h.y);
    else keys = new Set();
    if (nd < 90) keys.add('Space');
    return { keys };
  },

  // 0.5秒ごとに1手。実った作物を収穫し、なければ（費用の範囲で）一番効率のよい作物を植える
  slowlife(game, t) {
    if (t % 15 !== 0) return {};
    const st = game.inspect();
    const ripe = st.tiles.findIndex((tile) => tile.crop >= 0 && tile.grow >= 1);
    if (ripe >= 0) return { click: st.cellCenter(ripe) };
    const empty = st.tiles.findIndex((tile) => tile.crop < 0);
    if (empty < 0 || st.coins < 3) return {};
    let best = 0;
    st.crops.forEach((c, k) => {
      if (c.value / c.time > st.crops[best].value / st.crops[best].time) best = k;
    });
    const keydown = st.sel === best ? [] : ['Digit' + (best + 1)];
    return { keydown, click: st.cellCenter(empty) };
  },

  // 右へ走り続け、「今ジャンプしたら次の足場に乗れるか」を物理シミュレーションで判断して跳ぶ
  athletic(game) {
    const st = game.inspect();
    const p = st.player;
    const keys = new Set(['ArrowRight']);
    if (p.on) {
      const cx = p.x + p.w / 2;
      const cur = st.plats.findIndex((f) => cx >= f.x && cx <= f.x + f.w);
      if (cur >= 0 && landsAhead(st, p, cur)) keys.add('Space');
    }
    return { keys };
  },
};

// ゲーム本体と同じ式で、今この瞬間にジャンプした軌道を追い、先の足場に着地できるかを返す
function landsAhead(st, p, curIdx) {
  const dt = DT;
  const H = 500;
  let x = p.x;
  let y = p.y;
  let vy = -st.jumpV;
  const vx = st.runSpeed;
  const cur = st.plats[curIdx];
  for (let f = 0; f < 300; f++) {
    vy += st.gravity * dt;
    const prevBottom = y + p.h;
    x += vx * dt;
    y += vy * dt;
    if (vy >= 0) {
      for (let i = 0; i < st.plats.length; i++) {
        if (i === curIdx) continue;
        const pf = st.plats[i];
        const overlapX = x + p.w > pf.x && x < pf.x + pf.w;
        if (overlapX && prevBottom <= pf.y + 2 && y + p.h >= pf.y && pf.x > cur.x) return true;
      }
    }
    if (y > H + 80) return false;
  }
  return false;
}

function playOne(item) {
  const bot = bots[item.genre];
  const game = GAME_TYPES[item.genre].create(item);
  const keys = new Set();
  const input = { keys };
  const maxFrames = Math.round(MAX_SECONDS / DT);
  const stuckFrames = Math.round(STUCK_SECONDS / DT);
  let lastProgress = -1;
  let lastProgressFrame = 0;

  for (let f = 0; f < maxFrames; f++) {
    const plan = bot(game, f) || {};
    keys.clear();
    if (plan.keys) for (const k of plan.keys) keys.add(k);
    if (plan.keydown) for (const code of plan.keydown) game.keydown(code);
    if (plan.click) game.click(plan.click[0], plan.click[1]);

    game.update(DT, input);
    if (f % 30 === 0) game.draw(ctx);

    const s = game.status();
    if (!Number.isFinite(s.progress)) throw new Error(`${item.id}: progress is not finite at frame ${f}`);
    if (s.state !== 'playing') return { state: s.state, seconds: f * DT, progress: s.progress };
    if (s.progress > lastProgress + 1e-4) {
      lastProgress = s.progress;
      lastProgressFrame = f;
    } else if (f - lastProgressFrame > stuckFrames) {
      return { state: 'stuck', seconds: f * DT, progress: s.progress };
    }
  }
  return { state: 'timeout', seconds: MAX_SECONDS, progress: game.status().progress };
}

function median(xs) {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const fmt = (sec) => (Number.isFinite(sec) ? `${Math.round(sec)}秒 (${(sec / 60).toFixed(1)}分)` : '-');

const genres = onlyGenre ? [onlyGenre] : CATALOG_ORDER;
let anyFailure = false;

for (const genre of genres) {
  const items = CATALOG.filter((c) => c.genre === genre);
  if (items.length === 0) {
    console.error(`unknown genre: ${genre}`);
    process.exit(2);
  }
  const results = items.map((item) => ({ item, ...playOne(item) }));
  const won = results.filter((r) => r.state === 'won');
  const failCount = {};
  for (const r of results) if (r.state !== 'won') failCount[r.state] = (failCount[r.state] || 0) + 1;

  console.log(`\n== ${GAME_TYPES[genre].label} (${genre}) ==`);
  console.log(`クリア: ${won.length}/${items.length}`);
  console.log(`所要時間: 中央値 ${fmt(median(won.map((r) => r.seconds)))} / 最短 ${fmt(Math.min(...won.map((r) => r.seconds)))} / 最長 ${fmt(Math.max(...won.map((r) => r.seconds)))}`);
  const failText = Object.entries(failCount).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`失敗内訳: ${failText || 'なし'}`);

  // 難易度の段階別（0〜1を3つに分ける）
  const tiers = [
    ['易', (r) => r.item.difficulty < 1 / 3],
    ['中', (r) => r.item.difficulty >= 1 / 3 && r.item.difficulty < 2 / 3],
    ['難', (r) => r.item.difficulty >= 2 / 3],
  ];
  for (const [name, pred] of tiers) {
    const group = results.filter(pred);
    const ok = group.filter((r) => r.state === 'won').length;
    console.log(`  ${name}: クリア ${ok}/${group.length}  中央値 ${fmt(median(group.filter((r) => r.state === 'won').map((r) => r.seconds)))}`);
  }

  if (verbose) {
    for (const r of results) {
      console.log(`  ${r.item.id} ${r.item.title}: ${r.state} ${fmt(r.seconds)} 進捗 ${(r.progress * 100).toFixed(0)}%`);
    }
  }
  if (won.length < items.length) anyFailure = true;
}

console.log(anyFailure ? '\n※ クリアできなかったゲームがあります（上の内訳を確認）' : '\nすべてのゲームをクリアできました');
