// 共通ユーティリティ。全ゲームから window.Common として参照する。
(function (global) {
  const W = 800;
  const H = 500;

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

  // Roblox風の角ばった立体感のあるブロック
  function block(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  }

  function eyes(ctx, x, y, s = 1) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - 5 * s, y - 3 * s, 3 * s, 0, Math.PI * 2);
    ctx.arc(x + 5 * s, y - 3 * s, 3 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function text(ctx, s, x, y, color = '#fff', size = 14, align = 'center') {
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  }

  function bar(ctx, x, y, w, ratio, color) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(ratio, 0, 1), 5);
  }

  // 矢印キー / WASD から移動方向（正規化済み）を返す
  function axis(keys) {
    let x = 0;
    let y = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA')) x -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) x += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW')) y -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) y += 1;
    const l = Math.hypot(x, y);
    if (l > 0) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  global.GAME_TYPES = {};
  global.Common = { W, H, mulberry32, PALETTES, block, eyes, text, bar, axis, clamp, dist };
})(window);
