// タッチ操作（スマートフォン・タブレット）。画面内のジョイスティック・ボタン・視点のなぞりを、
// 既存のキー入力（仮想のキー）と同じ入力値に流し込む。ゲーム側の処理は変えない。
(function (g) {
  const W = g.World;
  const $ = (id) => document.getElementById(id);
  const JOY_R = 46; // ジョイスティックの動かせる半径（px）
  const LOOK_SENS = 2.6; // タッチの視点操作は、マウスより速く動かす

  let lookId = null;
  let lookLast = null;
  let joyId = null;
  let joyCenter = null;

  const isTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // ボタンを押している間だけ onDown / onUp を呼ぶ
  function hold(el, onDown, onUp) {
    let down = false;
    const press = (e) => {
      e.preventDefault();
      if (down) return;
      down = true;
      el.classList.add('on');
      el.setPointerCapture(e.pointerId);
      onDown();
    };
    const release = () => {
      if (!down) return;
      down = false;
      el.classList.remove('on');
      onUp();
    };
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
  }

  function setJoy(dx, dy) {
    const l = Math.hypot(dx, dy);
    const k = l > JOY_R ? JOY_R / l : 1;
    const x = dx * k;
    const y = dy * k;
    $('joyknob').style.transform = `translate(${x}px, ${y}px)`;
    W.input.joy = { x: x / JOY_R, y: y / JOY_R };
  }

  function resetJoy() {
    joyId = null;
    $('joyknob').style.transform = 'translate(0px, 0px)';
    W.input.joy = { x: 0, y: 0 };
  }

  // 初期化（ページ読み込み時に1回）
  function init() {
    const stage = $('stage');
    const joy = $('joy');
    joy.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      joyId = e.pointerId;
      joy.setPointerCapture(e.pointerId);
      const r = joy.getBoundingClientRect();
      joyCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      setJoy(e.clientX - joyCenter.x, e.clientY - joyCenter.y);
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== joyId) return;
      setJoy(e.clientX - joyCenter.x, e.clientY - joyCenter.y);
    });
    const joyEnd = (e) => {
      if (e.pointerId === joyId) resetJoy();
    };
    joy.addEventListener('pointerup', joyEnd);
    joy.addEventListener('pointercancel', joyEnd);

    hold(
      $('tJump'),
      () => W.input.keys.add('Space'),
      () => W.input.keys.delete('Space')
    );
    hold(
      $('tRun'),
      () => W.input.keys.add('ShiftLeft'),
      () => W.input.keys.delete('ShiftLeft')
    );
    hold(
      $('tAct'),
      () => {
        W.input.fire = true;
      },
      () => {}
    );

    // 画面の右側をなぞると視点が動く（左側はジョイスティック、ボタンは除く）
    const isControl = (t) => !!(t && t.closest && t.closest('#touch .ctl'));
    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || isControl(e.target) || lookId !== null) return;
      const r = stage.getBoundingClientRect();
      if (e.clientX < r.left + r.width * 0.4) return;
      lookId = e.pointerId;
      lookLast = { x: e.clientX, y: e.clientY };
    });
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lookId) return;
      W.input.dx += (e.clientX - lookLast.x) * LOOK_SENS;
      W.input.dy += (e.clientY - lookLast.y) * LOOK_SENS;
      lookLast = { x: e.clientX, y: e.clientY };
    });
    const lookEnd = (e) => {
      if (e.pointerId === lookId) lookId = null;
    };
    stage.addEventListener('pointerup', lookEnd);
    stage.addEventListener('pointercancel', lookEnd);
  }

  // 数字ボタン（建物・作物の選択）を n 個並べる。0 なら数字ボタンは出さない
  function setDigits(n) {
    const box = $('tDigits');
    box.replaceChildren();
    for (let i = 1; i <= n; i++) {
      const b = document.createElement('button');
      b.className = 'ctl digit';
      b.textContent = String(i);
      hold(
        b,
        () => W.input.pressed.add('Digit' + i),
        () => {}
      );
      box.append(b);
    }
  }

  // ゲーム画面を開いたとき・閉じたときに呼ぶ
  function show(digits) {
    if (!isTouch()) return;
    $('touch').hidden = false;
    setDigits(digits || 0);
    resetJoy();
  }

  function hide() {
    $('touch').hidden = true;
    lookId = null;
    joyId = null;
    W.input.keys.delete('Space');
    W.input.keys.delete('ShiftLeft');
    W.input.joy = { x: 0, y: 0 };
  }

  g.Touch = { init, show, hide, isTouch };
})(window);
