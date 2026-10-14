// 物理とプレイヤー操作（描画に依存しない純粋なJS）。
// ボットのテストでも同じ関数を使うため、ここには Three.js を入れない。
(function (g) {
  const EYE = 1.6;
  const STEP_UP = 0.55; // これ以下の段差は自動で乗り越える
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // プレイヤー（円柱を近似した箱）と箱状の障害物が重なっているか
  function overlaps(b, c, x, y, z) {
    return (
      x + b.r > c.minX &&
      x - b.r < c.maxX &&
      z + b.r > c.minZ &&
      z - b.r < c.maxZ &&
      y + b.h > c.minY &&
      y < c.maxY
    );
  }

  // 1軸ぶん動かし、どこかにぶつかったら true を返す
  function moveAxis(b, axis, d, cols) {
    if (d === 0) return false;
    let blocked = false;
    if (axis === 'x') {
      b.x += d;
      for (const c of cols) {
        if (!overlaps(b, c, b.x, b.y, b.z)) continue;
        b.x = d > 0 ? c.minX - b.r : c.maxX + b.r;
        blocked = true;
      }
    } else if (axis === 'z') {
      b.z += d;
      for (const c of cols) {
        if (!overlaps(b, c, b.x, b.y, b.z)) continue;
        b.z = d > 0 ? c.minZ - b.r : c.maxZ + b.r;
        blocked = true;
      }
    } else {
      b.y += d;
      for (const c of cols) {
        if (!overlaps(b, c, b.x, b.y, b.z)) continue;
        b.y = d > 0 ? c.minY - b.h : c.maxY;
        blocked = true;
      }
    }
    return blocked;
  }

  // 水平移動。床にいるときは段差を乗り越えられるか試す
  function moveHorizontal(b, axis, d, cols) {
    if (d === 0) return;
    const x0 = b.x;
    const y0 = b.y;
    const z0 = b.z;
    if (!moveAxis(b, axis, d, cols)) return;
    if (!b.onGround) return;
    b.x = x0;
    b.y = y0 + STEP_UP;
    b.z = z0;
    if (moveAxis(b, axis, d, cols)) {
      // 段を上がっても塞がれているなら元に戻す
      b.x = x0;
      b.y = y0;
      b.z = z0;
      moveAxis(b, axis, d, cols);
    }
  }

  // 身体1つを dt 秒進める。ボットの先読みでも使う
  function stepBody(b, opts, dt, cols) {
    const { wx, wz, speed, jump, G, jumpV } = opts;
    const acc = b.onGround ? 60 : 14;
    const tx = wx * speed;
    const tz = wz * speed;
    b.vx += clamp(tx - b.vx, -acc * dt, acc * dt);
    b.vz += clamp(tz - b.vz, -acc * dt, acc * dt);
    if (jump && b.onGround) {
      b.vy = jumpV;
      b.onGround = false;
    }
    b.vy = Math.max(-40, b.vy - G * dt);

    moveHorizontal(b, 'x', b.vx * dt, cols);
    moveHorizontal(b, 'z', b.vz * dt, cols);

    b.onGround = false;
    if (moveAxis(b, 'y', b.vy * dt, cols)) {
      if (b.vy < 0) b.onGround = true;
      b.vy = 0;
    }
  }

  const World = {
    EYE,
    G: 24,
    JUMP: 8.4,
    voidY: -20,
    colliders: [],
    player: null,
    onVoid: null,
    moving: false,
    input: {
      keys: new Set(), // 押し続けているキー（KeyCode）
      pressed: new Set(), // このフレームに押されたキー
      dx: 0, // マウス移動量（視点）
      dy: 0,
      fire: false, // このフレームの「行動」（左クリック / Eキー）
      lookSens: 0.0022,
    },

    reset(o) {
      this.colliders = [];
      // 床（見た目の地面と同じ高さ y=0）。アスレチックのように床のないゲームは floor:false
      if (o.floor !== false) this.colliders.push({ minX: -200, maxX: 200, minY: -1, maxY: 0, minZ: -200, maxZ: 200 });
      this.G = o.G ?? 24;
      this.JUMP = o.jump ?? 8.4;
      this.voidY = o.voidY ?? -20;
      this.onVoid = o.onVoid ?? null;
      this.player = {
        x: o.spawn.x,
        y: o.spawn.y,
        z: o.spawn.z,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: o.spawn.yaw ?? 0,
        pitch: -0.15,
        onGround: true,
        r: 0.35,
        h: 1.8,
      };
      this.moving = false;
      this.input.fire = false;
      this.input.pressed.clear();
      this.input.dx = 0;
      this.input.dy = 0;
    },

    // 立方体の障害物（中心 x,z・底面 y のサイズ指定）。見た目も同時に作る
    solid(s) {
      const c = {
        minX: s.x - s.w / 2,
        maxX: s.x + s.w / 2,
        minY: s.y,
        maxY: s.y + s.h,
        minZ: s.z - s.d / 2,
        maxZ: s.z + s.d / 2,
      };
      this.colliders.push(c);
      let mesh = null;
      if (g.Render && !s.hidden) {
        mesh = g.Render.prop(Object.assign({ kind: 'box' }, s));
        g.Render.place(mesh, s.x, s.y + s.h / 2, s.z);
      }
      return { collider: c, mesh };
    },

    // 向いている方向の地面（y=0）との交点。届かないなら null
    aimGround(maxDist = 14) {
      const p = this.player;
      const cp = Math.cos(p.pitch);
      const dx = -Math.sin(p.yaw) * cp;
      const dy = Math.sin(p.pitch);
      const dz = -Math.cos(p.yaw) * cp;
      if (dy > -0.02) return null;
      const t = -(p.y + EYE) / dy;
      if (t < 0 || t > maxDist) return null;
      return { x: p.x + dx * t, z: p.z + dz * t, dist: t };
    },

    // 向き（yaw, pitch）から前方ベクトル
    forward(yaw = this.player.yaw, pitch = this.player.pitch) {
      const cp = Math.cos(pitch);
      return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
    },

    step(dt) {
      const p = this.player;
      const inp = this.input;
      p.yaw -= inp.dx * inp.lookSens;
      p.pitch = clamp(p.pitch - inp.dy * inp.lookSens, -1.45, 1.45);
      inp.dx = 0;
      inp.dy = 0;

      const k = inp.keys;
      const sy = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const sx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const fx = -Math.sin(p.yaw);
      const fz = -Math.cos(p.yaw);
      const rx = Math.cos(p.yaw);
      const rz = -Math.sin(p.yaw);
      let wx = fx * sy + rx * sx;
      let wz = fz * sy + rz * sx;
      const len = Math.hypot(wx, wz);
      if (len > 0) {
        wx /= len;
        wz /= len;
      }
      const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
      const speed = sprint ? this.speedSprint : this.speedWalk;
      const opts = { wx, wz, speed, jump: k.has('Space'), G: this.G, jumpV: this.JUMP };
      stepBody(p, opts, dt, this.colliders);
      this.moving = len > 0 && p.onGround;
      if (p.y < this.voidY && this.onVoid) this.onVoid(p);
    },

    endFrame() {
      this.input.fire = false;
      this.input.pressed.clear();
    },
  };
  World.speedWalk = 7;
  World.speedSprint = 11;

  g.World = World;
  g.Physics = { stepBody, EYE };
})(window);
