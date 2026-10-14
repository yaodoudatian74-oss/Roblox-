'use strict';
// ヘッドレス確認: 500ゲームすべてを生成し、ランダム入力で動かして例外が出ないことを確認する。
// 実行: node tests/smoke.js
const { load } = require('./load');

const sb = load();
const { CATALOG, CATALOG_ORDER, GAME_TYPES, World: W, Common } = sb;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(CATALOG.length === 500, `total games should be 500, got ${CATALOG.length}`);
for (const genre of CATALOG_ORDER) {
  const items = CATALOG.filter((c) => c.genre === genre);
  assert(items.length === 100, `${genre} should have 100 games, got ${items.length}`);
  assert(new Set(items.map((c) => c.title)).size === 100, `${genre} titles should be unique`);
  assert(typeof GAME_TYPES[genre].theme === 'function', `${genre} needs a theme()`);
  assert(GAME_TYPES[genre].spawn, `${genre} needs a spawn`);
}
assert(new Set(CATALOG.map((c) => c.id)).size === 500, 'ids should be unique');

const KEYSETS = [[], ['KeyW'], ['KeyW', 'ShiftLeft'], ['KeyA'], ['KeyD'], ['KeyS'], ['Space'], ['KeyW', 'Space']];

function run(item) {
  const rng = Common.mulberry32(item.seed ^ 0x9e3779b9);
  const type = GAME_TYPES[item.genre];
  W.reset({ spawn: type.spawn, G: 24, jump: 8.4, voidY: -20, floor: !type.noFloor });
  const game = type.create(item);
  game.build();
  const DT = 1 / 30;
  for (let f = 0; f < 1800; f++) {
    if (f % 30 === 0) {
      W.input.keys.clear();
      for (const k of KEYSETS[Math.floor(rng() * KEYSETS.length)]) W.input.keys.add(k);
    }
    W.input.dx = (rng() - 0.5) * 30;
    W.input.dy = (rng() - 0.5) * 30;
    if (rng() < 0.03) W.input.fire = true;
    if (rng() < 0.02) W.input.pressed.add('Digit' + (1 + Math.floor(rng() * 5)));
    W.step(DT);
    game.update(DT);
    const s = game.status();
    if (typeof s.progress !== 'number' || !Number.isFinite(s.progress) || typeof s.label !== 'string') {
      throw new Error(`${item.id}: malformed status at frame ${f}`);
    }
    W.endFrame();
    if (s.state !== 'playing') return s.state;
  }
  return game.status().state;
}

const summary = {};
for (const item of CATALOG) {
  const state = run(item);
  const key = `${item.genre}:${state}`;
  summary[key] = (summary[key] || 0) + 1;
}

console.log('OK: all 500 games built and ran without exceptions');
console.log('results with random input (not a balance test):');
for (const k of Object.keys(summary).sort()) console.log(`  ${k}: ${summary[k]}`);
