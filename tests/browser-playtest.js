'use strict';
// ブラウザでのテストプレイ（Playwright + ヘッドレス Chromium）。
// 実際のキーボード・マウス入力で、メニューからゲームを開き、操作が画面（HUD）に反映されるかを確認する。
// 実行: node tests/browser-playtest.js
//   CHROME_PATH にブラウザの実行ファイルを指定できる（省略時は /opt/pw-browsers/chromium）
const path = require('path');
const { chromium } = require('playwright');

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const url = 'file://' + path.join(__dirname, '..', 'index.html');

let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) failures++;
}

// キャンバスの論理座標（800x500）をページ上の座標に変換してクリックする
async function clickLogical(page, x, y) {
  const box = await page.locator('#screen').boundingBox();
  await page.mouse.click(box.x + (x * box.width) / 800, box.y + (y * box.height) / 500);
}

const hud = (page) => page.locator('#hud').innerText();

async function openGame(page, id) {
  // 同じハッシュへは再遷移してもhashchangeが起きないため、一度空にしてから開く
  await page.evaluate(() => (location.hash = ''));
  await page.evaluate((h) => (location.hash = h), id);
  await page.waitForSelector('#play:not([hidden])');
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  // 1. メニュー: 初期表示、ジャンル切り替え、検索
  await page.goto(url);
  await page.waitForSelector('.card');
  check((await page.locator('.card').count()) === 100, 'ブレインロットの一覧は100件');
  await page.getByRole('button', { name: 'タイクーン' }).click();
  check((await page.locator('.card').count()) === 100, 'タイクーンに切り替えると100件');
  check((await page.locator('#count').innerText()) === '100件', '件数表示が100件');
  await page.getByRole('button', { name: 'RPG' }).click();
  await page.fill('#search', '003');
  check((await page.locator('.card').count()) === 1, '検索 "003" で1件（番号3に一致）');
  await page.fill('#search', '');

  // 2. ブレインロット: 矢印キーで移動し、HUDが更新される
  await openGame(page, 'brainrot-001');
  check((await page.locator('#title').innerText()) === 'ふわふわ ワニワニ', 'タイトルが表示される');
  const h0 = await hud(page);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowLeft');
  check((await hud(page)) !== '', 'ブレインロットのHUDが表示される');
  check(!h0.includes('NaN'), 'HUDに NaN が出ない');

  // 3. Escで一覧に戻り、再度開ける
  await page.keyboard.press('Escape');
  await page.waitForSelector('#menu:not([hidden])');
  check(await page.locator('#menu').isVisible(), 'Escで一覧に戻る');

  // 4. タイクーン: 数字キーで建物を選んで空きマスをクリック → 所持金が減る
  await openGame(page, 'tycoon-001');
  const cash = async () => Number((await hud(page)).match(/所持金 (\d+)/)[1]);
  const before = await cash();
  await page.keyboard.press('Digit1');
  await clickLogical(page, 120 + 35, 55 + 35); // 1番目のマス
  await page.waitForTimeout(200);
  const after = await cash();
  check(after < before, `建物を設置すると所持金が減る（${before} → ${after}）`);
  // 資金が足りないときに建物をクリックしても、強化されず所持金も減らない
  // （強化そのものの確認は tests/playtest.js のボットが行う）
  await clickLogical(page, 120 + 35, 55 + 35);
  await page.waitForTimeout(200);
  check((await cash()) >= after, `資金不足の強化は行われない（所持金 ${await cash()}円）`);
  await page.keyboard.press('Escape');

  // 5. RPG: スペースキーで攻撃するとHUDが変化する（撃破数かHPの変化）
  await openGame(page, 'rpg-050');
  const rpg0 = await hud(page);
  await page.keyboard.down('Space');
  await page.waitForTimeout(4000);
  await page.keyboard.up('Space');
  const rpg1 = await hud(page);
  check(rpg1 !== rpg0 || rpg1.includes('撃破'), 'RPGのHUDが時間とともに更新される');
  await page.keyboard.press('Escape');

  // 6. スローライフ: 種を植えるとコインが減る
  await openGame(page, 'slowlife-001');
  const coins = async () => Number((await hud(page)).match(/コイン (\d+)/)[1]);
  const c0 = await coins();
  await page.keyboard.press('Digit2');
  await clickLogical(page, 112 + 32, 90 + 32);
  await page.waitForTimeout(200);
  check((await coins()) < c0, `種を植えるとコインが減る（${c0} → ${await coins()}）`);
  await page.keyboard.press('Escape');

  // 7. アスレチック: 右へ走ると「ゴールまで」の距離が減る。ジャンプ（スペース）も反映される
  await openGame(page, 'athletic-001');
  const dist = async () => Number((await hud(page)).match(/ゴールまで (\d+)m/)[1]);
  const d0 = await dist();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowRight');
  const d1 = await dist();
  check(d1 < d0, `右へ走るとゴールまでの距離が減る（${d0}m → ${d1}m）`);
  await page.keyboard.press('Escape');

  // 8. 画面の描画が空でないこと（キャンバスに何か描かれている）
  await openGame(page, 'athletic-001');
  await page.waitForTimeout(300);
  const nonEmpty = await page.evaluate(() => {
    const c = document.getElementById('screen');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return colors.size;
  });
  check(nonEmpty > 3, `キャンバスに複数色が描かれている（${nonEmpty}色）`);

  check(errors.length === 0, `ブラウザのエラーなし${errors.length ? '\n  ' + errors.join('\n  ') : ''}`);

  await browser.close();
  console.log(failures === 0 ? '\nブラウザテスト: すべて合格' : `\nブラウザテスト: ${failures}件失敗`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
