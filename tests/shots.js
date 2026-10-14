'use strict';
// 各ジャンルの画面をヘッドレス Chromium で撮影する（描画とエラーの確認用）
// 実行: node tests/shots.js <出力フォルダ> [id ...]
// Three.js は CDN の代わりに THREE_LOCAL（既定: ./three.min.js）を読み込む
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const out = process.argv[2] || '.';
const ids = process.argv.slice(3).length ? process.argv.slice(3) : ['brainrot-001', 'tycoon-050', 'rpg-099', 'slowlife-042', 'athletic-075'];
const three = process.env.THREE_LOCAL;
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const url = 'file://' + path.join(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js', (route) =>
    route.fulfill({ path: three, contentType: 'application/javascript' })
  );
  for (const id of ids) {
    await page.goto(url + '#' + id);
    await page.waitForSelector('#play:not([hidden])');
    await page.waitForTimeout(2500);
    await page.locator('#stage').screenshot({ path: path.join(out, id + '.png') });
    const hud = await page.locator('#hud').innerText();
    const hint = await page.locator('#hint').innerText();
    console.log(id, '| HUD:', hud, '| hint:', hint);
    await page.evaluate(() => (location.hash = ''));
  }
  fs.writeFileSync(path.join(out, 'errors.txt'), errors.join('\n') || 'none');
  console.log('errors:', errors.length ? errors.join(' / ') : 'none');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
