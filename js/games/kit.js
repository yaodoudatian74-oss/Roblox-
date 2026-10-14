// 全ゲーム共通の部品（キャラクター・背景の装飾・足場）。描画は Render、当たり判定は World を使う。
(function (g) {
  const R = () => g.Render;
  const W = () => g.World;

  // ブロック調のキャラクター（足元が y=0）。顔は向きの -z 側に付く
  function character({ color, eye = 0xffffff, pupil = 0x111111, scale = 1, parent, body2 = null }) {
    const root = R().group(parent);
    const legs = [];
    for (const x of [-0.17, 0.17]) {
      const leg = R().prop({ kind: 'box', w: 0.28, h: 0.3, d: 0.28, color: body2 ?? color, parent: root });
      R().place(leg, x, 0.15, 0);
      legs.push(leg);
    }
    const body = R().prop({ kind: 'box', w: 0.7, h: 0.55, d: 0.45, color, parent: root });
    R().place(body, 0, 0.575, 0);
    const head = R().prop({ kind: 'box', w: 0.6, h: 0.55, d: 0.55, color: lighten(color, 0.15), parent: root });
    R().place(head, 0, 1.125, 0);
    const eyes = [];
    for (const x of [-0.14, 0.14]) {
      const e = R().prop({ kind: 'box', w: 0.14, h: 0.14, d: 0.03, color: eye, emissive: eye, emissiveIntensity: 0.35, parent: root, outline: false, shadow: false });
      R().place(e, x, 1.17, -0.285);
      const p = R().prop({ kind: 'box', w: 0.06, h: 0.07, d: 0.03, color: pupil, parent: root, outline: false, shadow: false });
      R().place(p, x, 1.16, -0.3);
      eyes.push(e);
    }
    R().blob(root, 0.55, 0.3);
    root.scale.setScalar(scale);
    return { group: root, legs, body, head, eyes };
  }

  function lighten(hex, t) {
    const n = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
    const r = (n >> 16) & 255;
    const gg = (n >> 8) & 255;
    const b = n & 255;
    const f = (v) => Math.round(v + (255 - v) * t);
    return (f(r) << 16) | (f(gg) << 8) | f(b);
  }

  // 木（幹＋葉の球2つ）
  function tree(rnd, x, z, leaf = 0x4caf50, scale = 1) {
    const s = scale * (0.85 + rnd() * 0.35);
    const trunk = R().prop({ kind: 'cyl', r: 0.22 * s, h: 1.7 * s, color: 0x8d6e63, outline: false });
    R().place(trunk, x, 0.85 * s, z);
    const crown = R().prop({ kind: 'sphere', r: 1.45 * s, color: leaf, outline: false, rough: 0.9 });
    R().place(crown, x, 2.9 * s, z, { s: [1, 0.95, 1] });
    const top = R().prop({ kind: 'sphere', r: 1.0 * s, color: lighten(leaf, 0.12), outline: false, rough: 0.9 });
    R().place(top, x + 0.2 * s, 3.9 * s, z - 0.2 * s);
  }

  function rock(rnd, x, z, color = 0x90a4ae) {
    const w = 0.8 + rnd() * 1.4;
    const h = 0.5 + rnd() * 0.8;
    const m = R().prop({ kind: 'box', w, h, d: w * (0.7 + rnd() * 0.5), color: lighten(color, rnd() * 0.15), rough: 0.95, outline: false });
    R().place(m, x, h / 2, z, { ry: rnd() * 3 });
  }

  // 暖かい光のランプ（点光源は使わず、発光する球で雰囲気を出す）
  function lamp(x, z, color = 0xffd27f) {
    const pole = R().prop({ kind: 'cyl', r: 0.07, h: 2.8, color: 0x37474f, outline: false });
    R().place(pole, x, 1.4, z);
    const bulb = R().prop({ kind: 'sphere', r: 0.24, color, emissive: color, emissiveIntensity: 2.4, outline: false, shadow: false });
    R().place(bulb, x, 2.9, z);
    R().glow(x, 2.9, z, color, 2.6, 0.55);
  }

  // 草むら（円形の範囲に、色の違う草の束を散らす）
  function meadow(rnd, cx, cz, rad, n, colors = [0x66bb6a, 0x81c784, 0x4caf50], shape = null) {
    const lists = colors.map(() => []);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = Math.sqrt(rnd()) * rad;
      const k = i % colors.length;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (shape && !shape(x, z)) continue;
      lists[k].push({ x, z, s: 0.7 + rnd() * 0.7, ry: rnd() * 3 });
    }
    colors.forEach((c, k) => R().scatter(lists[k], { color: c, r: 0.13, h: 0.45 }));
  }

  // 遠くに浮かぶ島（奥行き感とスカイラインのため）
  function islands(rnd, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const dist = 130 + rnd() * 90;
      const w = 22 + rnd() * 30;
      const d = 22 + rnd() * 30;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      const y = 22 + rnd() * 40;
      const top = R().prop({ kind: 'box', w, h: 3, d, color: colors[i % colors.length], outline: false, shadow: false, rough: 0.9 });
      R().place(top, x, y, z);
      const under = R().prop({ kind: 'cone', r: w * 0.45, h: 14, color: 0x6d4c41, outline: false, shadow: false, rough: 1 });
      R().place(under, x, y - 8.5, z, { rx: Math.PI });
    }
  }

  function clouds(rnd, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const dist = 90 + rnd() * 120;
      const x = Math.cos(a) * dist;
      const z = Math.sin(a) * dist;
      const y = 45 + rnd() * 25;
      for (let k = 0; k < 3; k++) {
        const c = R().prop({ kind: 'sphere', r: 6 + rnd() * 5, color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.15, outline: false, shadow: false, rough: 1 });
        R().place(c, x + (k - 1) * 7 + rnd() * 3, y + rnd() * 2, z + rnd() * 4, { s: [1, 0.55, 1] });
      }
    }
  }

  // 当たり判定つきの足場（上面にスタッドを並べる）
  function platform({ x, y, z, w, d, h = 1, color, top = null, studs = true }) {
    W().solid({ x, y, z, w, h, d, color });
    if (studs) {
      const nx = Math.max(1, Math.floor(w / 1.2));
      const nz = Math.max(1, Math.floor(d / 1.2));
      for (let i = 0; i < nx; i++) {
        for (let k = 0; k < nz; k++) {
          const sx = x - w / 2 + (i + 0.5) * (w / nx);
          const sz = z - d / 2 + (k + 0.5) * (d / nz);
          R().stud(sx, y + h, sz);
        }
      }
    }
    if (top) {
      // 上面の色を変えるための薄い板
      const m = R().prop({ kind: 'box', w: w * 0.98, h: 0.04, d: d * 0.98, color: top, outline: false, shadow: false });
      R().place(m, x, y + h + 0.02, z);
    }
  }

  // 低い柵で囲む（当たり判定あり）
  function fence(x1, x2, z1, z2, color = 0xf5f5f5) {
    const h = 1.1;
    const th = 0.25;
    const len = Math.abs(x2 - x1) + th;
    const depth = Math.abs(z2 - z1) + th;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    if (Math.abs(x2 - x1) > Math.abs(z2 - z1)) {
      for (const z of [z1, z2]) W().solid({ x: cx, y: 0, z, w: len, h, d: th, color });
    } else {
      for (const x of [x1, x2]) W().solid({ x, y: 0, z: cz, w: th, h, d: depth, color });
    }
  }

  // 太陽の位置と空の色を変える（時間帯）
  g.Kit = { character, tree, rock, lamp, islands, clouds, platform, fence, lighten, meadow };
})(window);
