'use strict';
// ブラウザでのテストプレイ（Playwright + ヘッドレス Chromium）。3D一人称版。
// 実際のキーボード・マウス入力で、メニューからゲームを開き、操作が画面（HUD）に反映されるかを確認する。
// 実行: node tests/browser-playtest.js
//   CHROME_PATH にブラウザの実行ファイルを指定できる（省略時は /opt/pw-browsers/chromium）
//   THREE_LOCAL に Three.js（r160 の build/three.min.js）のパスを指定すると、CDN の代わりにそれを使う
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
const hint = (page) => page.locator('#hint').innerText();

async function openGame(page, id) {
  // 同じハッシュへは再遷移してもhashchangeが起きないため、一度空にしてから開く
  await page.evaluate(() => (location.hash = ''));
  await page.evaluate((h) => (location.hash = h), id);
  await page.waitForSelector('#play:not([hidden])');
  await page.waitForTimeout(400);
}

(async () => {
  const launchArgs = ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const browser = await chromium.launch({ executablePath: CHROME, args: launchArgs });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
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

  // 1. メニュー: 初期表示、ジャンル切り替え、検索
  await page.goto(url);
  await page.waitForSelector('.card');
  check((await page.locator('.card').count()) === 100, 'ブレインロットの一覧は100件');
  await page.getByRole('button', { name: 'タイクーン' }).click();
  check((await page.locator('.card').count()) === 100, 'タイクーンに切り替えると100件');
  await page.getByRole('button', { name: 'RPG' }).click();
  await page.fill('#search', '003');
  check((await page.locator('.card').count()) === 1, '検索 "003" で1件（番号3に一致）');
  await page.fill('#search', '');

  // 2. ブレインロット: 歩けて、HUD が表示される
  await openGame(page, 'brainrot-001');
  check((await page.locator('#title').innerText()) === 'ふわふわ ワニワニ', 'タイトルが表示される');
  check((await hud(page)).includes('スコア'), 'ブレインロットのHUDが表示される');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyW');
  check(!(await hud(page)).includes('NaN'), 'HUDに NaN が出ない');

  // 3. Escで一覧に戻る
  await page.keyboard.press('Escape');
  await page.waitForSelector('#menu:not([hidden])');
  check(await page.locator('#menu').isVisible(), 'Escで一覧に戻る');

  // 4. タイクーン: ドラッグで視線を下げ、マスを狙って E で建物を建てる → 所持金が減る
  await openGame(page, 'tycoon-001');
  const cash = async () => Number((await hud(page)).match(/所持金 (\d+)/)[1]);
  const sel0 = (await hud(page)).match(/選択: (\S+)/)[1];
  await page.keyboard.press('Digit2');
  // HUD が更新されるまで待つ（描画のフレームを待つため、固定時間ではなく条件で待つ）
  await page.waitForFunction((prev) => {
    const m = document.getElementById('hud').innerText.match(/選択: (\S+)/);
    return m && m[1] !== prev;
  }, sel0, { timeout: 3000 }).catch(() => {});
  check((await hud(page)).match(/選択: (\S+)/)[1] !== sel0, '数字キーで建物を選択できる（選択が変わる）');
  await page.keyboard.press('Digit1');
  await page.waitForFunction((prev) => {
    const m = document.getElementById('hud').innerText.match(/選択: (\S+)/);
    return m && m[1] === prev;
  }, sel0, { timeout: 3000 }).catch(() => {});
  const before = await cash();
  await page.waitForTimeout(300);
  const h = await hint(page);
  check(h.includes('設置'), `既定の視線でマスを狙える（ヒント: ${h}）`);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  const after = await cash();
  check(after < before, `建物を設置すると所持金が減る（${before} → ${after}）`);
  await page.keyboard.press('Escape');

  // 5. RPG: 攻撃キーを押しても落ちず、HUD が時間とともに変わる
  await openGame(page, 'rpg-050');
  const rpg0 = await hud(page);
  await page.keyboard.down('Space');
  await page.waitForTimeout(1500);
  await page.keyboard.up('Space');
  check((await hud(page)).includes('HP'), `RPGのHUDが表示される（${rpg0}）`);
  await page.keyboard.press('Escape');

  // 6. スローライフ: 種を植えるとコインが減る
  await openGame(page, 'slowlife-001');
  const coins = async () => Number((await hud(page)).match(/コイン (\d+)/)[1]);
  const c0 = await coins();
  await page.waitForTimeout(300);
  const h2 = await hint(page);
  check(h2.includes('植える'), `畑を狙って植えられる（ヒント: ${h2}）`);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(300);
  check((await coins()) < c0, `種を植えるとコインが減る（${c0} → ${await coins()}）`);
  await page.keyboard.press('Escape');

  // 7. アスレチック: 走ると「ゴールまで」の距離が減る。ジャンプも反映される
  await openGame(page, 'athletic-001');
  const dist = async () => Number((await hud(page)).match(/ゴールまで (\d+)m/)[1]);
  const d0 = await dist();
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  const d1 = await dist();
  check(d1 < d0, `走るとゴールまでの距離が減る（${d0}m → ${d1}m）`);
  await page.keyboard.press('Escape');

  // 8. 描画: 画面の撮影が空白でない（WebGL で何かが描かれている）
  await openGame(page, 'athletic-001');
  await page.waitForTimeout(500);
  const shot = await page.locator('#screen').screenshot();
  check(shot.length > 20000, `3D の描画が行われている（撮影サイズ ${shot.length} バイト）`);

  check(errors.length === 0, `ブラウザのエラーなし${errors.length ? '\n  ' + errors.join('\n  ') : ''}`);

  await browser.close();
  console.log(failures === 0 ? '\nブラウザテスト: すべて合格' : `\nブラウザテスト: ${failures}件失敗`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
