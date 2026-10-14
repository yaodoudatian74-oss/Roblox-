'use strict';
// テスト用に、ブラウザ用のスクリプトを Node の仮想環境へ順に読み込む（描画は stub-render.js で置き換える）
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const files = [
  'tests/stub-render.js',
  'js/common.js',
  'js/core/world.js',
  'js/games/kit.js',
  'js/games/brainrot.js',
  'js/games/tycoon.js',
  'js/games/rpg.js',
  'js/games/slowlife.js',
  'js/games/athletic.js',
  'js/catalog.js',
];

function load() {
  const sandbox = { console, Math };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox;
}

module.exports = { load };
