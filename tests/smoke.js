'use strict';
// ヘッドレス確認: 500ゲームすべてをランダム入力で動かし、例外が出ないこととカタログの整合性を確認する。
// 実行: node tests/smoke.js
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

const { CATALOG, CATALOG_ORDER, GAME_TYPES, Common } = sandbox;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

// カタログ整合性
assert(CATALOG.length === 500, `total games should be 500, got ${CATALOG.length}`);
for (const genre of CATALOG_ORDER) {
  const items = CATALOG.filter((c) => c.genre === genre);
  assert(items.length === 100, `${genre} should have 100 games, got ${items.length}`);
  const titles = new Set(items.map((c) => c.title));
  assert(titles.size === 100, `${genre} titles should be unique`);
}
const ids = new Set(CATALOG.map((c) => c.id));
assert(ids.size === 500, 'ids should be unique');

// ダミーの描画コンテキスト（呼び出しを無視する）
function makeCtx() {
  const noop = () => {};
  return new Proxy(
    {},
    {
      get: (t, k) => (k in t ? t[k] : (t[k] = noop)),
      set: (t, k, v) => ((t[k] = v), true),
    }
  );
}

const KEYSETS = [
  [],
  ['ArrowLeft'],
  ['ArrowRight'],
  ['ArrowUp'],
  ['ArrowDown'],
  ['Space'],
  ['KeyD', 'Space'],
  ['KeyS'],
];

// 1ゲームを60秒分（30fps相当）ランダム入力で動かす
function run(item) {
  const rng = Common.mulberry32(item.seed ^ 0x9e3779b9);
  const game = GAME_TYPES[item.genre].create(item);
  const keys = new Set();
  const input = { keys };
  const ctx = makeCtx();
  const DT = 1 / 30;
  const FRAMES = 1800;

  for (let f = 0; f < FRAMES; f++) {
    if (f % 30 === 0) {
      keys.clear();
      for (const k of KEYSETS[Math.floor(rng() * KEYSETS.length)]) keys.add(k);
    }
    if (game.keydown && rng() < 0.02) game.keydown('Digit' + (1 + Math.floor(rng() * 5)));
    if (game.click && rng() < 0.05) game.click(rng() * 800, rng() * 500);
    game.update(DT, input);
    game.draw(ctx);
    const s = game.status();
    if (typeof s.progress !== 'number' || !Number.isFinite(s.progress) || typeof s.label !== 'string') {
      throw new Error(`${item.id}: malformed status at frame ${f}`);
    }
    if (s.state !== 'playing') return { state: s.state, frame: f };
  }
  return { state: game.status().state, frame: FRAMES };
}

const summary = {};
for (const item of CATALOG) {
  const r = run(item);
  const key = `${item.genre}:${r.state}`;
  summary[key] = (summary[key] || 0) + 1;
}

console.log('OK: all 500 games ran without exceptions');
console.log('results with random input (not a balance test):');
for (const k of Object.keys(summary).sort()) console.log(`  ${k}: ${summary[k]}`);
