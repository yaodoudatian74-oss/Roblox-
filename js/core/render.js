// 描画・演出・音（Three.js）。ゲームはここの関数だけを使い、Three.js を直接触らない。
(function (g) {
  const T = g.THREE;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  let renderer = null;
  let scene = null;
  let camera = null;
  let sun = null;
  let hemi = null;
  let groundMesh = null;
  let skyCanvas = null;
  let skyTex = null;
  let theme = null;
  let viewGroup = null;
  let viewTool = null;
  let swingT = 0;
  let shakeAmt = 0;
  let flashAlpha = 0;
  let sunT = 0.3;
  let skyKey = '';
  let studPending = [];
  let particleMeshes = [];
  let particleActive = [];
  let texts = [];
  let textActive = [];
  let camBob = 0;
  const sunDir = new T.Vector3(0, 1, 0);
  let sunSprite = null;
  let glowTexture = null;
  let blobTexture = null;
  const keepOnReset = new Set();

  const geoCache = {};
  const matCache = new Map();
  const edgeCache = {};

  const el = (id) => document.getElementById(id);

  function geo(kind) {
    if (!geoCache[kind]) {
      if (kind === 'box') geoCache[kind] = new T.BoxGeometry(1, 1, 1);
      else if (kind === 'sphere') geoCache[kind] = new T.SphereGeometry(1, 20, 14);
      else if (kind === 'cyl') geoCache[kind] = new T.CylinderGeometry(1, 1, 1, 18);
      else if (kind === 'cone') geoCache[kind] = new T.ConeGeometry(1, 1, 18);
      else if (kind === 'torus') geoCache[kind] = new T.TorusGeometry(1, 0.04, 10, 48); // 半径に比例して拡大されるので細めにする
      else if (kind === 'plane') geoCache[kind] = new T.PlaneGeometry(1, 1);
      else throw new Error('unknown geometry ' + kind);
    }
    return geoCache[kind];
  }

  function material(color, o = {}) {
    const key = [color, o.emissive ?? 0, o.emissiveIntensity ?? 1, o.opacity ?? 1, o.rough ?? 0.7, o.metal ?? 0].join('|');
    if (!matCache.has(key)) {
      const m = new T.MeshStandardMaterial({
        color: new T.Color(color),
        roughness: o.rough ?? 0.7,
        metalness: o.metal ?? 0,
        emissive: new T.Color(o.emissive ?? 0x000000),
        emissiveIntensity: o.emissiveIntensity ?? 1,
        transparent: (o.opacity ?? 1) < 1,
        opacity: o.opacity ?? 1,
        flatShading: false,
      });
      matCache.set(key, m);
    }
    return matCache.get(key);
  }

  // ---- 色の補助 ----
  function hexToRgb(h) {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  // ---- 初期化 ----
  function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = T.SRGBColorSpace;

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(72, 1.6, 0.05, 500);
    camera.rotation.order = 'YXZ';
    scene.add(camera);

    hemi = new T.HemisphereLight(0xffffff, 0x556070, 1.2);
    scene.add(hemi);
    sun = new T.DirectionalLight(0xffffff, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 40;
    sc.bottom = -40;
    sc.near = 1;
    sc.far = 200;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    scene.add(sun.target);

    viewGroup = new T.Group();
    camera.add(viewGroup);

    // 空に見える太陽（輝き）。影と同じ向きに置く
    sunSprite = new T.Sprite(new T.SpriteMaterial({ map: radialTexture('glow'), color: 0xfff1c4, transparent: true, opacity: 0.9, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    sunSprite.scale.set(70, 70, 1);
    scene.add(sunSprite);
    keepOnReset.add(sunSprite);

    skyCanvas = document.createElement('canvas');
    skyCanvas.width = 4;
    skyCanvas.height = 256;

    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!renderer) return;
    const c = renderer.domElement;
    const w = c.clientWidth || 800;
    const h = c.clientHeight || 500;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // ---- 空・地面 ----
  function paintSky(top, bottom) {
    const ctx = skyCanvas.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, 0, skyCanvas.height);
    grd.addColorStop(0, top);
    grd.addColorStop(0.55, mix(top, bottom, 0.6));
    grd.addColorStop(1, bottom);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
    if (!skyTex) {
      skyTex = new T.CanvasTexture(skyCanvas);
      skyTex.colorSpace = T.SRGBColorSpace;
      scene.background = skyTex;
    }
    skyTex.needsUpdate = true;
  }

  function groundTexture(base) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    // ベースプレートのような薄い格子と、スタッド状のわずかな陰影
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, 253, 253);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const cx = 64 + x * 128;
        const cy = 64 + y * 128;
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        ctx.beginPath();
        ctx.arc(cx, cy, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        ctx.beginPath();
        ctx.arc(cx + 3, cy + 4, 26, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.repeat.set(90, 90);
    tex.anisotropy = 8;
    return tex;
  }

  // ---- シーン全体のリセット（テーマ変更） ----
  function reset(th) {
    theme = Object.assign({ sky: '#8fd3ff', ground: '#6ab04c', noGround: false, fog: 0.01, sunColor: '#fff4e0' }, th);
    const toRemove = scene.children.filter((o) => o !== hemi && o !== sun && o !== sun.target && o !== camera && !keepOnReset.has(o));
    for (const o of toRemove) scene.remove(o);
    for (const m of particleActive) m.visible = false;
    particleMeshes.push(...particleActive);
    particleActive = [];
    for (const t of textActive) t.el.style.opacity = '0';
    texts.push(...textActive);
    textActive = [];
    studPending = [];
    skyKey = '';
    scene.fog = new T.FogExp2(new T.Color(theme.fog ?? theme.sky), theme.fog ?? 0.01);
    if (!theme.noGround) {
      const gm = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshStandardMaterial({ map: groundTexture(theme.ground), roughness: 0.9 }));
      gm.rotation.x = -Math.PI / 2;
      gm.receiveShadow = true;
      scene.add(gm);
      groundMesh = gm;
    } else {
      groundMesh = null;
    }
    sunT = theme.sunT ?? 0.3;
    setSun(sunT, true);
    shakeAmt = 0;
    flashAlpha = 0;
    el('flash').style.opacity = '0';
    camBob = 0;
  }

  // 太陽の位置と色。t: 0〜1（0.25で正午、0.75で夜中）
  function setSun(t, force = false) {
    sunT = t;
    const ang = t * Math.PI * 2;
    const elev = Math.sin(ang);
    const day = clamp(elev * 2.2 + 0.25, 0, 1);
    sun.intensity = 0.25 + day * 2.1;
    sun.color.set(mix(theme.sunColor ?? '#fff4e0', '#ffb070', 1 - clamp(elev * 3, 0, 1)));
    hemi.intensity = 0.45 + day * 0.85;
    sunSprite.material.opacity = 0.15 + day * 0.85;
    sunSprite.material.color.set(sun.color);
    const dayColor = theme.sky;
    const nightColor = theme.night ?? '#0b1030';
    const k = clamp(day, 0, 1);
    // 昼の空は白っぽく明るめにして、暗いパレットでも沈まないようにする
    const top = mix(nightColor, mix(dayColor, '#ffffff', 0.22), k);
    const horizon = mix(nightColor, theme.horizon ?? mix(dayColor, '#ffffff', 0.45), k);
    const key = top + horizon;
    if (force || key !== skyKey) {
      skyKey = key;
      paintSky(top, horizon);
      scene.fog.color.set(horizon);
    }
    // 太陽の向き（影の方向）。位置は sync() でプレイヤーの周りに置く
    sunDir.set(-Math.cos(ang) * 0.6, Math.max(0.25, elev), 0.45).normalize();
  }

  // ---- 光のにじみ・足元の影（共有テクスチャ） ----
  function radialTexture(kind) {
    if (kind === 'glow' && glowTexture) return glowTexture;
    if (kind === 'blob' && blobTexture) return blobTexture;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    if (kind === 'glow') {
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
    } else {
      grd.addColorStop(0, 'rgba(0,0,0,0.55)');
      grd.addColorStop(0.6, 'rgba(0,0,0,0.25)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    if (kind === 'glow') glowTexture = tex;
    else blobTexture = tex;
    return tex;
  }

  // 発光体の周りのにじみ（加算合成のスプライト）
  function glow(x, y, z, color, size = 2, opacity = 0.7, parent) {
    const m = new T.SpriteMaterial({ map: radialTexture('glow'), color: new T.Color(color), transparent: true, opacity, depthWrite: false, blending: T.AdditiveBlending });
    const sp = new T.Sprite(m);
    sp.scale.set(size, size, 1);
    sp.position.set(x, y, z);
    (parent || scene).add(sp);
    return sp;
  }

  // 足元の丸い影（親の子として付けるので、親の動きに付いてくる）
  function blob(parent, r = 0.5, opacity = 0.35) {
    const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: radialTexture('blob'), transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.03;
    m.scale.set(r * 2, r * 2, 1);
    m.renderOrder = 1;
    parent.add(m);
    return m;
  }

  // ---- 部品 ----
  // spec: kind(box|sphere|cyl|cone|torus|plane), w,h,d / r / rt,h,
  //       color, emissive, emissiveIntensity, opacity, rough, metal, outline, shadow, parent
  function prop(spec) {
    const kind = spec.kind ?? 'box';
    const m = new T.Mesh(geo(kind), material(spec.color ?? 0xffffff, spec));
    m.castShadow = spec.shadow !== false;
    m.receiveShadow = true;
    let base;
    if (kind === 'box') base = [spec.w ?? 1, spec.h ?? 1, spec.d ?? 1];
    else if (kind === 'sphere') base = [spec.r ?? 1, spec.r ?? 1, spec.r ?? 1];
    else if (kind === 'cyl') base = [spec.r ?? 1, spec.h ?? 1, spec.r ?? 1];
    else if (kind === 'cone') base = [spec.r ?? 1, spec.h ?? 1, spec.r ?? 1];
    else if (kind === 'torus') base = [spec.r ?? 1, spec.r ?? 1, spec.r ?? 1];
    else if (kind === 'plane') {
      base = [spec.w ?? 1, 1, spec.d ?? spec.h ?? 1];
      m.rotation.x = -Math.PI / 2;
    }
    m.userData.base = base;
    m.scale.set(base[0], base[1], base[2]);
    if (kind === 'box' && spec.outline !== false) {
      const eg = edgeCache.box || (edgeCache.box = new T.EdgesGeometry(geo('box')));
      const line = new T.LineSegments(eg, new T.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 }));
      m.add(line);
    }
    (spec.parent || scene).add(m);
    return m;
  }

  // 配置。o.s は基準サイズへの倍率（数値または [x,y,z]）
  function place(obj, x, y, z, o = {}) {
    obj.position.set(x, y, z);
    if (o.ry !== undefined) obj.rotation.y = o.ry;
    if (o.rx !== undefined) obj.rotation.x = o.rx;
    if (o.rz !== undefined) obj.rotation.z = o.rz;
    if (o.s !== undefined && obj.userData.base) {
      const b = obj.userData.base;
      const s = Array.isArray(o.s) ? o.s : [o.s, o.s, o.s];
      obj.scale.set(b[0] * s[0], b[1] * s[1], b[2] * s[2]);
    }
    if (o.visible !== undefined) obj.visible = o.visible;
  }

  function group(parent) {
    const gp = new T.Group();
    (parent || scene).add(gp);
    return gp;
  }

  function remove(obj) {
    if (obj && obj.parent) obj.parent.remove(obj);
  }

  // スタッドを予約し、flushStuds で一括生成する（見た目の立体感用）
  function stud(x, y, z) {
    studPending.push([x, y, z]);
  }
  function flushStuds(color = 0xffffff) {
    if (studPending.length === 0) return;
    const g0 = new T.CylinderGeometry(0.2, 0.2, 0.14, 14);
    const inst = new T.InstancedMesh(g0, material(color, { rough: 0.5 }), studPending.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    const mtx = new T.Matrix4();
    studPending.forEach((p, i) => {
      mtx.makeTranslation(p[0], p[1] + 0.07, p[2]);
      inst.setMatrixAt(i, mtx);
    });
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
    studPending = [];
  }

  // 草や花などの小物を一括で描く（インスタンス描画で軽くする）
  // list: [{x, z, s, ry}]  y は地面（0）
  function scatter(list, { color = 0x66bb6a, r = 0.14, h = 0.4, sides = 5 } = {}) {
    if (list.length === 0) return null;
    const inst = new T.InstancedMesh(new T.ConeGeometry(r, h, sides), material(color, { rough: 1 }), list.length);
    const m = new T.Matrix4();
    const q = new T.Quaternion();
    const v = new T.Vector3();
    const sc = new T.Vector3();
    list.forEach((p, i) => {
      q.setFromEuler(new T.Euler(0, p.ry ?? 0, 0));
      v.set(p.x, (h * (p.s ?? 1)) / 2, p.z);
      sc.setScalar(p.s ?? 1);
      m.compose(v, q, sc);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.receiveShadow = true;
    scene.add(inst);
    return inst;
  }

  // ---- パーティクル（プール） ----
  function acquireParticle(color) {
    let m = particleMeshes.pop();
    if (!m) {
      if (particleActive.length > 420) return null;
      m = new T.Mesh(geo('sphere'), null);
      m.castShadow = false;
      m.receiveShadow = false;
      scene.add(m);
    }
    m.material = particleMat(color);
    m.visible = true;
    particleActive.push(m);
    return m;
  }
  const particleMats = new Map();
  function particleMat(color) {
    if (!particleMats.has(color)) particleMats.set(color, new T.MeshBasicMaterial({ color: new T.Color(color), toneMapped: false }));
    return particleMats.get(color);
  }
  const particleData = new Map();

  function particles(x, y, z, color, n = 12, speed = 3, o = {}) {
    for (let i = 0; i < n; i++) {
      const m = acquireParticle(color);
      if (!m) return;
      const a = Math.random() * Math.PI * 2;
      const up = o.up ?? 0.6;
      const sp = speed * (0.4 + Math.random() * 0.8);
      m.position.set(x, y, z);
      const vel = { x: Math.cos(a) * sp, y: (Math.random() * 0.5 + up) * sp, z: Math.sin(a) * sp };
      const life = (o.life ?? 0.7) * (0.7 + Math.random() * 0.6);
      particleData.set(m, { vel, life, max: life, size: o.size ?? 0.12, grav: o.grav ?? 9 });
      m.scale.setScalar(o.size ?? 0.12);
    }
  }

  // ---- 数値の表示（画面上の文字） ----
  function popText(x, y, z, text, color = '#ffffff') {
    let t = texts.pop();
    if (!t) {
      if (textActive.length > 30) t = textActive.shift();
      else {
        const d = document.createElement('div');
        d.className = 'pop';
        el('popups').appendChild(d);
        t = { el: d };
      }
    }
    t.el.textContent = text;
    t.el.style.color = color;
    t.el.style.opacity = '1';
    t.p = new T.Vector3(x, y, z);
    t.life = 1.1;
    t.max = 1.1;
    textActive.push(t);
  }

  // 画面下の短い通知
  let toastTimer = 0;
  function toast(text) {
    const t = el('toast');
    t.textContent = text;
    t.style.opacity = '1';
    toastTimer = 1.8;
  }

  function shake(a) {
    shakeAmt = Math.max(shakeAmt, a);
  }
  function flash(color, alpha) {
    const f = el('flash');
    f.style.background = color;
    flashAlpha = alpha;
  }

  // ---- 手に持つ道具（一人称のビューモデル） ----
  function viewmodel(kind, color) {
    viewGroup.clear();
    viewTool = null;
    const skin = 0xffd6a5;
    const arm = prop({ kind: 'box', w: 0.12, h: 0.12, d: 0.34, color: skin, parent: viewGroup, outline: false, shadow: false });
    place(arm, 0.3, -0.27, -0.4, { ry: -0.15 });
    const tool = group(viewGroup);
    tool.position.set(0.27, -0.16, -0.62);
    tool.scale.setScalar(0.62);
    viewTool = tool;
    if (kind === 'sword') {
      prop({ kind: 'box', w: 0.05, h: 0.06, d: 0.7, color: 0xdfe6e9, metal: 0.7, rough: 0.3, parent: tool, outline: false, shadow: false });
      const blade = tool.children[0];
      blade.position.set(0, 0, -0.35);
      const guard = prop({ kind: 'box', w: 0.22, h: 0.06, d: 0.06, color: color, parent: tool, outline: false, shadow: false });
      guard.position.set(0, 0, 0);
      const handle = prop({ kind: 'box', w: 0.07, h: 0.07, d: 0.2, color: 0x6d4c41, parent: tool, outline: false, shadow: false });
      handle.position.set(0, 0, 0.12);
    } else if (kind === 'hammer') {
      const head = prop({ kind: 'box', w: 0.26, h: 0.16, d: 0.16, color: color, parent: tool, outline: false, shadow: false });
      head.position.set(0, 0, -0.2);
      const handle = prop({ kind: 'box', w: 0.06, h: 0.06, d: 0.46, color: 0x8d6e63, parent: tool, outline: false, shadow: false });
      handle.position.set(0, -0.02, 0.05);
    } else if (kind === 'wand') {
      const rod = prop({ kind: 'cyl', r: 0.03, h: 0.5, color: 0x5d4037, parent: tool, outline: false, shadow: false });
      rod.rotation.x = Math.PI / 2;
      rod.position.set(0, 0, -0.2);
      const orb = prop({ kind: 'sphere', r: 0.08, color: color, emissive: color, emissiveIntensity: 2.2, parent: tool, outline: false, shadow: false });
      orb.position.set(0, 0.02, -0.46);
    } else if (kind === 'bat') {
      const b = prop({ kind: 'cyl', r: 0.04, h: 0.6, color: color, parent: tool, outline: false, shadow: false });
      b.rotation.x = Math.PI / 2;
      b.position.set(0, 0, -0.3);
    } else if (kind === 'trowel') {
      const h = prop({ kind: 'box', w: 0.05, h: 0.05, d: 0.36, color: 0x8d6e63, parent: tool, outline: false, shadow: false });
      h.position.set(0, 0, -0.1);
      const s = prop({ kind: 'box', w: 0.16, h: 0.02, d: 0.14, color: 0xbdc3c7, metal: 0.6, rough: 0.4, parent: tool, outline: false, shadow: false });
      s.position.set(0, 0, -0.32);
    }
  }

  function swing() {
    swingT = 0.3;
  }

  // ---- 毎フレーム ----
  function sync() {
    const p = g.World.player;
    const bob = g.World.moving ? Math.sin(camBob) * 0.035 : 0;
    camera.position.set(p.x, p.y + g.World.EYE + bob, p.z);
    camera.rotation.set(p.pitch, p.yaw, 0);
    if (shakeAmt > 0) {
      camera.position.x += (Math.random() - 0.5) * shakeAmt * 0.2;
      camera.position.y += (Math.random() - 0.5) * shakeAmt * 0.2;
    }
    camera.fov = 72 + (g.World.input.keys.has('ShiftLeft') && g.World.moving ? 4 : 0);
    camera.updateProjectionMatrix();
    // 影の範囲を自分の周りに保つ
    sun.target.position.set(p.x, 0, p.z);
    sun.position.set(p.x + sunDir.x * 60, sunDir.y * 60, p.z + sunDir.z * 60);
    sunSprite.position.set(p.x + sunDir.x * 240, sunDir.y * 240, p.z + sunDir.z * 240);
    sun.target.updateMatrixWorld();
  }

  function tick(dt) {
    if (!renderer) return;
    camBob += dt * (g.World.moving ? 10 : 0);

    // パーティクル
    for (let i = particleActive.length - 1; i >= 0; i--) {
      const m = particleActive[i];
      const d = particleData.get(m);
      d.life -= dt;
      if (d.life <= 0) {
        m.visible = false;
        particleActive.splice(i, 1);
        particleMeshes.push(m);
        particleData.delete(m);
        continue;
      }
      d.vel.y -= d.grav * dt;
      m.position.x += d.vel.x * dt;
      m.position.y += d.vel.y * dt;
      m.position.z += d.vel.z * dt;
      if (m.position.y < 0.02) {
        m.position.y = 0.02;
        d.vel.y = 0;
        d.vel.x *= 0.8;
        d.vel.z *= 0.8;
      }
      m.scale.setScalar(d.size * clamp(d.life / d.max, 0, 1));
    }

    // 数値
    for (let i = textActive.length - 1; i >= 0; i--) {
      const t = textActive[i];
      t.life -= dt;
      if (t.life <= 0) {
        t.el.style.opacity = '0';
        textActive.splice(i, 1);
        texts.push(t);
        continue;
      }
      t.p.y += dt * 0.9;
    }

    // 道具の振り
    if (swingT > 0 && viewTool) {
      swingT = Math.max(0, swingT - dt);
      const k = 1 - swingT / 0.3;
      const a = Math.sin(k * Math.PI);
      viewTool.rotation.x = -a * 1.4;
      viewTool.rotation.z = a * 0.3;
    } else if (viewTool) {
      viewTool.rotation.x = 0;
      viewTool.rotation.z = 0;
    }

    // 揺れ・フラッシュ・通知
    shakeAmt = Math.max(0, shakeAmt - dt * 6);
    if (flashAlpha > 0) {
      flashAlpha = Math.max(0, flashAlpha - dt * 1.8);
      el('flash').style.opacity = String(flashAlpha);
    }
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) el('toast').style.opacity = '0';
    }
    setSun(sunT);
    sync();
  }

  // 数値（画面上の文字）の位置を画面座標に反映する
  function drawTexts() {
    const c = renderer.domElement;
    const w = c.clientWidth;
    const h = c.clientHeight;
    for (const t of textActive) {
      const v = t.p.clone().project(camera);
      if (v.z > 1) {
        t.el.style.opacity = '0';
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      t.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      t.el.style.opacity = String(clamp(t.life / t.max * 1.6, 0, 1));
    }
  }

  function draw() {
    if (!renderer) return;
    renderer.render(scene, camera);
    drawTexts();
  }

  // ---- 効果音（Web Audio・波形のビープ） ----
  let ac = null;
  const SFX = {
    collect: [[880, 1320, 0.12, 'sine', 0.16]],
    place: [[220, 330, 0.1, 'triangle', 0.22]],
    buy: [[523, 523, 0.07, 'triangle', 0.18], [659, 659, 0.07, 'triangle', 0.18, 0.07], [784, 784, 0.12, 'triangle', 0.18, 0.14]],
    harvest: [[660, 990, 0.14, 'sine', 0.2]],
    coin: [[1200, 1600, 0.08, 'square', 0.07]],
    hit: [[200, 90, 0.12, 'square', 0.12]],
    hurt: [[160, 60, 0.28, 'sawtooth', 0.12]],
    swing: [[400, 200, 0.08, 'triangle', 0.08]],
    jump: [[300, 520, 0.08, 'sine', 0.07]],
    level: [[523, 523, 0.08, 'triangle', 0.2], [659, 659, 0.08, 'triangle', 0.2, 0.08], [784, 784, 0.08, 'triangle', 0.2, 0.16], [1046, 1046, 0.22, 'triangle', 0.22, 0.24]],
    win: [[523, 523, 0.14, 'triangle', 0.2], [659, 659, 0.14, 'triangle', 0.2, 0.14], [784, 784, 0.14, 'triangle', 0.2, 0.28], [1046, 1046, 0.4, 'triangle', 0.24, 0.42]],
    lose: [[392, 392, 0.2, 'triangle', 0.2], [330, 330, 0.2, 'triangle', 0.2, 0.2], [262, 262, 0.2, 'triangle', 0.2, 0.4], [196, 196, 0.5, 'triangle', 0.22, 0.6]],
    click: [[220, 220, 0.05, 'sine', 0.1]],
    fall: [[500, 90, 0.5, 'sine', 0.16]],
  };
  function unlockAudio() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      ac = null;
    }
  }
  function sfx(name) {
    if (!ac || !SFX[name]) return;
    const t0 = ac.currentTime;
    for (const [f0, f1, dur, type, vol, delay = 0] of SFX[name]) {
      const o = ac.createOscillator();
      const gn = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0 + delay);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + delay + dur);
      gn.gain.setValueAtTime(0.0001, t0 + delay);
      gn.gain.exponentialRampToValueAtTime(vol, t0 + delay + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + dur);
      o.connect(gn).connect(ac.destination);
      o.start(t0 + delay);
      o.stop(t0 + delay + dur + 0.02);
    }
  }

  g.Render = {
    init,
    reset,
    setSun,
    prop,
    place,
    group,
    remove,
    stud,
    flushStuds,
    particles,
    popText,
    toast,
    shake,
    flash,
    viewmodel,
    swing,
    tick,
    sync,
    draw,
    sfx,
    unlockAudio,
    resize,
    glow,
    blob,
    scatter,
    scene: () => scene,
    mix,
  };
})(window);
