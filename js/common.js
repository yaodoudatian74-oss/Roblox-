// 共通ユーティリティ（乱数・配色・数学の小物）。全ゲームから window.Common として参照する。
(function (global) {
  // 同じ seed なら同じ乱数列を返す（ゲームごとに再現性を持たせるため）
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ゲームごとの配色（空・地面・アクセント・ブロック）
  const PALETTES = [
    { sky: '#8fd3ff', ground: '#6ab04c', accent: '#ff6b6b', block: '#ffd93d', dark: '#2d3436' },
    { sky: '#ffb6c1', ground: '#a3e4a7', accent: '#9b59b6', block: '#ffeaa7', dark: '#2d3436' },
    { sky: '#1e272e', ground: '#2f3640', accent: '#00d2d3', block: '#feca57', dark: '#dfe6e9' },
    { sky: '#ffeaa7', ground: '#e17055', accent: '#0984e3', block: '#fab1a0', dark: '#2d3436' },
    { sky: '#b2bec3', ground: '#636e72', accent: '#e84393', block: '#55efc4', dark: '#2d3436' },
    { sky: '#74b9ff', ground: '#00b894', accent: '#fdcb6e', block: '#fd79a8', dark: '#2d3436' },
    { sky: '#dfe6e9', ground: '#81ecec', accent: '#d63031', block: '#a29bfe', dark: '#2d3436' },
    { sky: '#273c75', ground: '#487eb0', accent: '#fbc531', block: '#e84118', dark: '#f5f6fa' },
  ];

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  global.GAME_TYPES = {};
  global.Common = { mulberry32, PALETTES, clamp, dist };
})(window);
