'use strict';
// テストプレイ: ジャンルごとの攻略ボットで500ゲームを最後までプレイし、
// クリア率・所要時間・行き詰まり・敗北を集計する（3D一人称）。
// ボットは実際のプレイヤーと同じ入力（キー・マウスの視点・クリック）だけで操作する。
//
// 実行: node tests/playtest.js            全ジャンル
//       node tests/playtest.js rpg -v     RPGだけ、ゲームごとの結果も表示
const { load } = require('./load');

const sb = load();
const { CATALOG, CATALOG_ORDER, GAME_TYPES, World: W } = sb;
const { bots, bot } = require('./bots')(sb);

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const onlyGenre = args.find((a) => !a.startsWith('-'));

const DT = 1 / 30;
const MAX_SECONDS = 15 * 60;
const STUCK_SECONDS = 180;

function playOne(item) {
  const type = GAME_TYPES[item.genre];
  const bot1 = bots[item.genre];
  bot.tycoonTarget = null;
  bot.slowTarget = null;
  W.reset({ spawn: type.spawn, G: 24, jump: 8.4, voidY: -20, floor: !type.noFloor });
  const game = type.create(item);
  game.build();
  const maxFrames = Math.round(MAX_SECONDS / DT);
  const stuckFrames = Math.round(STUCK_SECONDS / DT);
  let lastProgress = -1;
  let lastProgressFrame = 0;
  let falls = 0;

  for (let f = 0; f < maxFrames; f++) {
    W.input.keys.clear();
    bot1(game, f);
    game.update(DT);
    W.step(DT);
    const s = game.status();
    if (!Number.isFinite(s.progress)) throw new Error(`${item.id}: progress is not finite at frame ${f}`);
    W.endFrame();
    if (s.state !== 'playing') return { state: s.state, seconds: f * DT, progress: s.progress };
    if (s.progress > lastProgress + 1e-4) {
      lastProgress = s.progress;
      lastProgressFrame = f;
    } else if (f - lastProgressFrame > stuckFrames) {
      return { state: 'stuck', seconds: f * DT, progress: s.progress };
    }
  }
  return { state: 'timeout', seconds: MAX_SECONDS, progress: game.status().progress, falls };
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
  console.log(`失敗内訳: ${Object.entries(failCount).map(([k, v]) => `${k} ${v}`).join(', ') || 'なし'}`);

  const tiers = [
    ['易', (r) => r.item.difficulty < 1 / 3],
    ['中', (r) => r.item.difficulty >= 1 / 3 && r.item.difficulty < 2 / 3],
    ['難', (r) => r.item.difficulty >= 2 / 3],
  ];
  for (const [name, pred] of tiers) {
    const group = results.filter(pred);
    const ok = group.filter((r) => r.state === 'won');
    console.log(`  ${name}: クリア ${ok.length}/${group.length}  中央値 ${fmt(median(ok.map((r) => r.seconds)))}`);
  }

  if (verbose) {
    for (const r of results) {
      console.log(`  ${r.item.id} ${r.item.title}: ${r.state} ${fmt(r.seconds)} 進捗 ${(r.progress * 100).toFixed(0)}%`);
    }
  }
  if (won.length < items.length) anyFailure = true;
}

console.log(anyFailure ? '\n※ クリアできなかったゲームがあります（上の内訳を確認）' : '\nすべてのゲームをクリアできました');
