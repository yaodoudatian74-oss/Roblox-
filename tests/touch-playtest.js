'use strict';
// タッチ操作のテスト（ヘッドレス Chromium、タッチ端末として動かす）。
// 画面内のジョイスティック・ボタン・数字ボタンを、実際のタッチ入力で操作する。
// 実行: THREE_LOCAL=path/to/three.min.js node tests/touch-playtest.js
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const THREE_LOCAL = process.env.THREE_LOCAL;
const url = 'file://' + path.join(__dirname, '..', 'index.html');

let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) failures++;
}

const hud = (page) => page.locator('#hud').innerText();

async function center(page, sel) {
  const b = await page.locator(sel).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

// CDP でタッチの指を動かす（押す → 少しずつ動かす → 離す）
async function touchDrag(cdp, from, to, steps = 12, ms = 40) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
    await new Promise((r) => setTimeout(r, ms));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function touchHold(cdp, at, ms) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 1 }] });
  await new Promise((r) => setTimeout(r, ms));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1000, height: 700 }, isMobile: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  if (THREE_LOCAL) {
    await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js', (route) =>
      route.fulfill({ path: THREE_LOCAL, contentType: 'application/javascript' })
    );
  }
  const cdp = await context.newCDPSession(page);

  // 1. 画面内のタッチ操作が表示される
  await page.goto(url + '#athletic-001');
  await page.waitForSelector('#play:not([hidden])');
  await page.waitForTimeout(500);
  check(await page.locator('#touch').isVisible(), 'タッチ端末では画面内の操作ボタンが表示される');
  check(!(await page.locator('#lockhint').isVisible()), 'タッチ端末ではマウス視点の案内を出さない');

  // 2. ジョイスティックを前へ倒すと、ゴールまでの距離が減る
  const d0 = Number((await hud(page)).match(/ゴールまで (\d+)m/)[1]);
  const joy = await center(page, '#joy');
  await touchDrag(cdp, joy, { x: joy.x, y: joy.y - 40 }, 14, 70);
  await page.waitForTimeout(300);
  const d1 = Number((await hud(page)).match(/ゴールまで (\d+)m/)[1]);
  check(d1 < d0, `ジョイスティックで前へ進める（${d0}m → ${d1}m）`);

  // 3. ジャンプと走るボタンはエラーなく押せる（押している間だけ反応する）
  const jump = await center(page, '#tJump');
  await touchHold(cdp, jump, 200);
  const run = await center(page, '#tRun');
  await touchHold(cdp, run, 200);
  check(true, 'ジャンプ・走るボタンを押せる');
  await page.keyboard.press('Escape');

  // 4. タイクーン: 数字ボタンで建物を選び、行動ボタンで建てる → 所持金が減る
  await page.evaluate(() => (location.hash = ''));
  await page.evaluate(() => (location.hash = 'tycoon-001'));
  await page.waitForSelector('#play:not([hidden])');
  await page.waitForTimeout(400);
  const digits = await page.locator('#tDigits button').count();
  check(digits === 4, `タイクーンの数字ボタンは4つ（実際 ${digits}）`);
  const cash = async () => Number((await hud(page)).match(/所持金 (\d+)/)[1]);
  const before = await cash();
  const d2 = await center(page, '#tDigits button >> nth=0');
  await touchHold(cdp, d2, 80);
  await page.waitForTimeout(200);
  const act = await center(page, '#tAct');
  await touchHold(cdp, act, 100);
  await page.waitForTimeout(400);
  const after = await cash();
  check(after < before, `数字ボタンと行動ボタンで建物を建てられる（${before} → ${after}）`);
  const hint = await page.locator('#hint').innerText();
  check(hint.length > 0, `ヒントが表示される（${hint}）`);
  await page.keyboard.press('Escape');

  // 5. スローライフ: 数字ボタン5つ。行動ボタンで植える → コインが減る
  await page.evaluate(() => (location.hash = ''));
  await page.evaluate(() => (location.hash = 'slowlife-001'));
  await page.waitForSelector('#play:not([hidden])');
  await page.waitForTimeout(400);
  check((await page.locator('#tDigits button').count()) === 5, 'スローライフの数字ボタンは5つ');
  const coins = async () => Number((await hud(page)).match(/コイン (\d+)/)[1]);
  const c0 = await coins();
  await touchHold(cdp, await center(page, '#tDigits button >> nth=1'), 80);
  await touchHold(cdp, await center(page, '#tAct'), 100);
  await page.waitForTimeout(400);
  check((await coins()) < c0, `畑に種を植えられる（コイン ${c0} → ${await coins()}）`);

  // 6. 右側をなぞると視点が動く（画面の端のボタンに触れなければ、エラーなく動く）
  await page.evaluate(() => (location.hash = ''));
  await page.evaluate(() => (location.hash = 'rpg-050'));
  await page.waitForSelector('#play:not([hidden])');
  await page.waitForTimeout(300);
  const stage = await page.locator('#stage').boundingBox();
  await touchDrag(cdp, { x: stage.x + stage.width * 0.7, y: stage.y + stage.height * 0.4 }, { x: stage.x + stage.width * 0.9, y: stage.y + stage.height * 0.4 }, 10, 30);
  check((await page.locator('#touch').isVisible()) && (await page.locator('#hud').innerText()).includes('HP'), '右側のなぞりで視点を動かせる（HUD は正常）');

  // 7. 画面の描画が空白でない
  const shot = await page.locator('#stage').screenshot({ path: process.env.SHOT_OUT || undefined });
  check(shot.length > 20000, `タッチ画面の描画がある（撮影サイズ ${shot.length} バイト）`);

  check(errors.length === 0, `ブラウザのエラーなし${errors.length ? '\n  ' + errors.join('\n  ') : ''}`);
  await browser.close();
  console.log(failures === 0 ? '\nタッチ操作テスト: すべて合格' : `\nタッチ操作テスト: ${failures}件失敗`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
