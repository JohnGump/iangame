/* ========================================================================
   像素小鸟 — 遵循 window.IanGame 接口契约
   ======================================================================== */
(function () {
  'use strict';

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var GRAV = 0.42, FLAP = -7.2, GAP = 150, PIPE_W = 64, PIPE_SPD = 2.6, SPAWN = 95;

    var bird, pipes, score, best, frame, running, over, paused, rafId;
    var groundOff = 0;

    function reset() {
      bird = { x: W*0.28, y: H/2, vy: 0, r: 14, rot: 0 };
      pipes = []; score = 0; frame = 0; over = false;
      emitScore(); emitState('playing');
    }

    function emitScore() { hooks.onScore && hooks.onScore(score, 1); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    function flap() {
      if (over) return;
      if (!running) { running = true; emitState('playing'); }
      bird.vy = FLAP;
    }

    function step() {
      frame++;
      bird.vy += GRAV; bird.y += bird.vy;
      bird.rot = Math.max(-0.4, Math.min(1.2, bird.vy / 12));
      // 生成管道
      if (frame % SPAWN === 0) {
        var top = 60 + Math.random() * (H - 160 - GAP);
        pipes.push({ x: W, top: top, gap: GAP, passed: false });
      }
      pipes.forEach(function (p) { p.x -= PIPE_SPD; });
      pipes = pipes.filter(function (p) { return p.x + PIPE_W > -10; });
      // 计分
      pipes.forEach(function (p) {
        if (!p.passed && p.x + PIPE_W < bird.x) { p.passed = true; score++; emitScore(); }
      });
      groundOff = (groundOff + PIPE_SPD) % 40;
      // 碰撞
      if (bird.y + bird.r > H - 40 || bird.y - bird.r < 0) return die();
      for (var i = 0; i < pipes.length; i++) {
        var p = pipes[i];
        if (bird.x + bird.r > p.x && bird.x - bird.r < p.x + PIPE_W &&
            (bird.y - bird.r < p.top || bird.y + bird.r > p.top + p.gap)) return die();
      }
    }
    function die() { over = true; running = false; emitState('over'); hooks.onGameOver && hooks.onGameOver(score, 1); }

    function draw() {
      // 天空渐变
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0d1320'); g.addColorStop(1, '#1a1030');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // 远景星点
      ctx.fillStyle = 'rgba(0,224,255,.3)';
      for (var i = 0; i < 30; i++) {
        var sx = (i * 137 + frame * 0.3) % W, sy = (i * 53) % (H - 60);
        ctx.fillRect(sx, sy, 2, 2);
      }
      // 管道
      pipes.forEach(function (p) {
        ctx.shadowBlur = 12; ctx.shadowColor = '#2ee6a6';
        var grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
        grad.addColorStop(0, '#2ee6a6'); grad.addColorStop(.5, '#5fd3a0'); grad.addColorStop(1, '#1fb583');
        ctx.fillStyle = grad;
        ctx.fillRect(p.x, 0, PIPE_W, p.top); ctx.fillRect(p.x, p.top + p.gap, PIPE_W, H - 40 - p.top - p.gap);
        ctx.fillStyle = '#1fb583';
        ctx.fillRect(p.x - 3, p.top - 18, PIPE_W + 6, 18);
        ctx.fillRect(p.x - 3, p.top + p.gap, PIPE_W + 6, 18);
      });
      ctx.shadowBlur = 0;
      // 地面
      ctx.fillStyle = '#141b2e'; ctx.fillRect(0, H - 40, W, 40);
      ctx.fillStyle = '#7c3aed'; ctx.fillRect(0, H - 40, W, 4);
      ctx.fillStyle = 'rgba(124,58,237,.4)';
      for (var gx = -groundOff; gx < W; gx += 40) ctx.fillRect(gx, H - 36, 20, 4);
      // 小鸟
      ctx.save();
      ctx.translate(bird.x, bird.y); ctx.rotate(bird.rot);
      ctx.shadowBlur = 16; ctx.shadowColor = '#ffb627';
      ctx.fillStyle = '#ffb627'; ctx.beginPath(); ctx.arc(0, 0, bird.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff7847'; ctx.beginPath(); ctx.arc(0, 0, bird.r, -0.3, 0.3); ctx.fill();
      ctx.shadowBlur = 0;
      // 眼睛
      ctx.fillStyle = '#060912'; ctx.beginPath(); ctx.arc(5, -4, 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(6, -5, 1, 0, 7); ctx.fill();
      // 喙
      ctx.fillStyle = '#ff2e63'; ctx.beginPath(); ctx.moveTo(bird.r-2, 0); ctx.lineTo(bird.r+8, -2); ctx.lineTo(bird.r+8, 4); ctx.fill();
      ctx.restore();
    }

    function loop() { if (running && !over && !paused) step(); draw(); rafId = requestAnimationFrame(loop); }

    function start() { reset(); running = true; paused = false; }
    function pause() { paused = true; emitState('paused'); }
    function resume() { if (over) return; paused = false; emitState('playing'); }
    function destroy() { running = false; if (rafId) cancelAnimationFrame(rafId); canvas.removeEventListener('mousedown', flap); window.removeEventListener('keydown', onKey); canvas.removeEventListener('touchstart', onTouch); }

    function onKey(e) { if (e.key === ' ' || e.key === 'ArrowUp') { flap(); e.preventDefault(); } else if (e.key === 'p') togglePause(); }
    function onTouch(e) { flap(); e.preventDefault(); }
    function togglePause() { if (!running || over) return; paused ? resume() : pause(); }

    canvas.addEventListener('mousedown', flap);
    canvas.addEventListener('touchstart', onTouch, { passive: false });
    window.addEventListener('keydown', onKey);
    reset(); running = false; rafId = requestAnimationFrame(loop);

    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
