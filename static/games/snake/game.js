/* ========================================================================
   霓虹贪吃蛇 — 遵循 window.IanGame 接口契约
   ======================================================================== */
(function () {
  'use strict';

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var CELL = 20, COLS = W / CELL, ROWS = H / CELL;

    var snake, dir, nextDir, food, score, speed, acc, last, alive, running, rafId;
    var keys = {};

    function reset() {
      snake = [{ x: 10, y: 12 }, { x: 9, y: 12 }, { x: 8, y: 12 }];
      dir = { x: 1, y: 0 }; nextDir = { x: 1, y: 0 };
      score = 0; speed = 8; acc = 0; last = 0; alive = true;
      placeFood(); emitScore(); emitState('playing');
    }

    function placeFood() {
      var p;
      do { p = { x: (Math.random() * COLS) | 0, y: (Math.random() * ROWS) | 0 }; }
      while (snake.some(function (s) { return s.x === p.x && s.y === p.y; }));
      food = p;
    }

    function emitScore() { hooks.onScore && hooks.onScore(score, 1); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    function step() {
      dir = nextDir;
      var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      // 撞墙
      if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) return die();
      // 撞自己
      if (snake.some(function (s) { return s.x === head.x && s.y === head.y; })) return die();
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 10; speed = Math.min(20, 8 + score / 60); emitScore(); placeFood();
      } else {
        snake.pop();
      }
    }

    function die() { alive = false; emitState('over'); hooks.onGameOver && hooks.onGameOver(score, 1); }

    function draw() {
      // 背景
      ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, W, H);
      // 网格
      ctx.strokeStyle = 'rgba(124,58,237,.08)'; ctx.lineWidth = 1;
      for (var x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke(); }
      for (var y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke(); }
      // 食物(脉动)
      var pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
      ctx.shadowBlur = 18; ctx.shadowColor = '#ff2e63';
      ctx.fillStyle = '#ff2e63';
      roundRect(food.x * CELL + 3, food.y * CELL + 3, CELL - 6, CELL - 6, 5);
      ctx.fill();
      ctx.shadowBlur = 0;
      // 蛇身
      snake.forEach(function (s, i) {
        var t = i / snake.length;
        var col = i === 0 ? '#00e0ff' : blend('#00e0ff', '#b537f2', t);
        ctx.shadowBlur = i === 0 ? 16 : 8; ctx.shadowColor = col;
        ctx.fillStyle = col;
        roundRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4, 5);
        ctx.fill();
      });
      ctx.shadowBlur = 0;
      // 死亡暗化
      if (!alive) { ctx.fillStyle = 'rgba(6,9,18,.6)'; ctx.fillRect(0, 0, W, H); }
    }

    function loop(ts) {
      if (!running) return;
      if (!last) last = ts;
      var dt = (ts - last) / 1000; last = ts;
      if (alive) { acc += dt; var interval = 1 / speed; while (acc >= interval) { step(); acc -= interval; } }
      draw();
      rafId = requestAnimationFrame(loop);
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function blend(a, b, t) {
      var pa = hex(a), pb = hex(b);
      var r = (pa[0] + (pb[0] - pa[0]) * t) | 0, g = (pa[1] + (pb[1] - pa[1]) * t) | 0, bl = (pa[2] + (pb[2] - pa[2]) * t) | 0;
      return 'rgb(' + r + ',' + g + ',' + bl + ')';
    }
    function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

    function onKey(e) {
      var k = e.key;
      if (k === 'ArrowUp' || k === 'w') { if (dir.y !== 1) nextDir = { x: 0, y: -1 }; e.preventDefault(); }
      else if (k === 'ArrowDown' || k === 's') { if (dir.y !== -1) nextDir = { x: 0, y: 1 }; e.preventDefault(); }
      else if (k === 'ArrowLeft' || k === 'a') { if (dir.x !== 1) nextDir = { x: -1, y: 0 }; e.preventDefault(); }
      else if (k === 'ArrowRight' || k === 'd') { if (dir.x !== -1) nextDir = { x: 1, y: 0 }; e.preventDefault(); }
      else if (k === ' ') { togglePause(); e.preventDefault(); }
    }
    function togglePause() { if (!alive) return; running ? pause() : resume(); }

    function start() { reset(); running = true; last = 0; rafId = requestAnimationFrame(loop); }
    function pause() { running = false; emitState('paused'); if (rafId) cancelAnimationFrame(rafId); }
    function resume() { if (!alive) return; running = true; last = 0; emitState('playing'); rafId = requestAnimationFrame(loop); }

    function destroy() { running = false; if (rafId) cancelAnimationFrame(rafId); window.removeEventListener('keydown', onKey); }

    window.addEventListener('keydown', onKey);
    // 先 reset 出初始画面(等壳页面点开始)
    reset();
    draw();

    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
