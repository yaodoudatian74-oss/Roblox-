// テスト用の描画スタブ。Render と同じ関数を持ち、何も描かない（ロジックの確認用）
(function (g) {
  const obj = () => ({ position: { set() {} }, rotation: { x: 0, y: 0, z: 0 }, scale: { set() {}, setScalar() {} }, visible: true, userData: {}, add() {}, remove() {}, clear() {} });
  const noop = () => {};
  g.Render = {
    init: noop,
    reset: noop,
    setSun: noop,
    prop: (spec) => {
      const o = obj();
      o.userData.base = [spec.w ?? 1, spec.h ?? 1, spec.d ?? 1];
      return o;
    },
    place: (o, x, y, z, opt = {}) => {
      o.position = { x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; } };
      if (opt.visible !== undefined) o.visible = opt.visible;
    },
    group: obj,
    glow: obj,
    blob: obj,
    scatter: obj,
    remove: noop,
    stud: noop,
    flushStuds: noop,
    particles: noop,
    popText: noop,
    toast: noop,
    shake: noop,
    flash: noop,
    viewmodel: noop,
    swing: noop,
    tick: noop,
    sync: noop,
    draw: noop,
    sfx: noop,
    unlockAudio: noop,
    resize: noop,
    mix: (a) => a,
  };
})(globalThis.window ?? globalThis);
