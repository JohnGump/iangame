/* ============================================================
 * 植物大战僵尸 · 精致版 (pvz-deluxe)
 * ------------------------------------------------------------
 * 单文件 IIFE,实现 IanGame 契约:window.IanGame.init(canvas, hooks)
 *   → 返回 { pause, resume, restart(diff), destroy }
 *
 * 分层架构(引擎层隔离,未来可替换为 PlayCanvas/WebGL 而不影响壳页面):
 *   Renderer  绘制原语 + 贝塞尔自绘卡通形象
 *   Input     鼠标/触摸坐标映射
 *   Particles 多层粒子 + 加色混合发光
 *   Entities  Plant / Zombie / Projectile
 *   Game      经济(阳光) / 关卡波次 / HUD
 * ============================================================ */
(function () {
  'use strict';

  // ============================================================
  // 配置常量
  // ============================================================
  var COLS = 9, ROWS = 5;            // 9 列 5 行草坪
  var LEVELS = 3;                    // Phase 1 先做 3 关
  var WAVES_PER_LEVEL = 5;
  var SHOP_TOP = 0, HUD_TOP = 88;    // 顶部 HUD 安全区高度 88px
  var FIELD_TOP = 112;               // 草坪起始 y
  var COLOR = {
    bg: '#060912',
    grass1: '#1a3a22', grass2: '#205028', grass3: '#28602f', grassDark: '#0f2418',
    house: '#2c3e6a', houseDark: '#1a2747', roof: '#5a3a4a',
    sun: '#ffd84d', sunCore: '#fff3a0',
    neon: '#00e0ff', neon2: '#b537f2', ok: '#2ee6a6', warn: '#ffb627', danger: '#ff2e63',
    text: '#eaf0fb', text2: '#8b97b3'
  };

  // ============================================================
  // 植物定义(Phase 1: 3 种)
  // ============================================================
  var PLANTS = {
    sunflower: { name: '向日葵', cost: 50, hp: 4, cd: 7.5, recharge: 7.5, produce: 24, interval: 9, kind: 'sun' },
    peashooter: { name: '豌豆射手', cost: 100, hp: 4, cd: 7.5, recharge: 7.5, fire: 1.4, dmg: 1, kind: 'shoot' },
    wallnut: { name: '坚果墙', cost: 50, hp: 18, cd: 20, recharge: 20, kind: 'wall' }
  };
  var SHOP_KEYS = ['sunflower', 'peashooter', 'wallnut'];

  // ============================================================
  // 僵尸定义(Phase 1: 3 种)
  // ============================================================
  var ZOMBIES = {
    normal:  { name: '普通僵尸', hp: 3,  sp: 0.22, atk: 0.5, score: 10, tint: '#7a8a55' },
    cone:    { name: '路障僵尸', hp: 6,  sp: 0.22, atk: 0.5, score: 20, tint: '#5a6a40', hat: 'cone' },
    bucket:  { name: '铁桶僵尸', hp: 12, sp: 0.20, atk: 0.5, score: 40, tint: '#525f6e', hat: 'bucket' }
  };

  // ============================================================
  // Engine · 工具
  // ============================================================
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  // 圆角矩形 path(polyfill 兼容老 canvas)
  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ============================================================
  // Engine · 精细自绘:植物
  //   每个绘制函数都自带帧动画参数(用全局 time 驱动摇摆/脉动)
  // ============================================================
  function drawSunflower(ctx, x, y, size, t, hurt) {
    // 茎
    ctx.strokeStyle = '#3da935'; ctx.lineWidth = size * 0.10; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.5);
    ctx.quadraticCurveTo(x + Math.sin(t * 1.5) * size * 0.04, y + size * 0.2, x, y - size * 0.05);
    ctx.stroke();
    // 叶子
    ctx.fillStyle = '#4cc041';
    ctx.beginPath();
    ctx.ellipse(x - size * 0.28, y + size * 0.28, size * 0.18, size * 0.09, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // 花瓣(8 瓣,绕中心旋转 + 脉动)
    var cx = x, cy = y - size * 0.18;
    var pulse = 1 + Math.sin(t * 2) * 0.05;
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2 + t * 0.3;
      var px = cx + Math.cos(a) * size * 0.30 * pulse;
      var py = cy + Math.sin(a) * size * 0.30 * pulse;
      var grd = ctx.createRadialGradient(px, py, 0, px, py, size * 0.18);
      grd.addColorStop(0, '#ffe066'); grd.addColorStop(1, '#f59e0b');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(px, py, size * 0.16, size * 0.10, a, 0, Math.PI * 2);
      ctx.fill();
    }
    // 花心
    var core = ctx.createRadialGradient(cx - size * 0.05, cy - size * 0.05, 0, cx, cy, size * 0.22);
    core.addColorStop(0, '#7a4a1a'); core.addColorStop(1, '#3a2008');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.20, 0, Math.PI * 2); ctx.fill();
    // 笑脸眼睛
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx - size * 0.07, cy - size * 0.03, size * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + size * 0.07, cy - size * 0.03, size * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx - size * 0.07, cy - size * 0.03, size * 0.018, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + size * 0.07, cy - size * 0.03, size * 0.018, 0, Math.PI * 2); ctx.fill();
    if (hurt) { ctx.fillStyle = 'rgba(255,80,80,0.45)'; ctx.beginPath(); ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawPeashooter(ctx, x, y, size, t, hurt, attack) {
    // 茎
    ctx.strokeStyle = '#3da935'; ctx.lineWidth = size * 0.10; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.5);
    ctx.quadraticCurveTo(x + Math.sin(t * 2) * size * 0.05, y, x, y - size * 0.05);
    ctx.stroke();
    // 叶子 ×2
    ctx.fillStyle = '#4cc041';
    ctx.beginPath(); ctx.ellipse(x - size * 0.26, y + size * 0.22, size * 0.16, size * 0.08, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + size * 0.26, y + size * 0.32, size * 0.16, size * 0.08, 0.5, 0, Math.PI * 2); ctx.fill();
    // 头部(发射时前倾 + 张嘴)
    var headX = x + size * 0.08 + (attack ? size * 0.06 : 0);
    var headY = y - size * 0.08;
    var grd = ctx.createRadialGradient(headX - size * 0.08, headY - size * 0.08, 0, headX, headY, size * 0.26);
    grd.addColorStop(0, '#7ee06a'); grd.addColorStop(1, '#2e9b3a');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(headX, headY, size * 0.24, 0, Math.PI * 2); ctx.fill();
    // 嘴管(炮口)
    ctx.fillStyle = '#1f7a2a';
    var mouthOpen = attack ? size * 0.10 : size * 0.06;
    ctx.beginPath();
    ctx.ellipse(headX + size * 0.22, headY, size * 0.10, mouthOpen, 0, 0, Math.PI * 2);
    ctx.fill();
    // 眼睛
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(headX - size * 0.02, headY - size * 0.06, size * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(headX + size * 0.01, headY - size * 0.06, size * 0.025, 0, Math.PI * 2); ctx.fill();
    if (hurt) { ctx.fillStyle = 'rgba(255,80,80,0.45)'; ctx.beginPath(); ctx.arc(headX, headY, size * 0.4, 0, Math.PI * 2); ctx.fill(); }
  }

  function drawWallnut(ctx, x, y, size, t, hurt, hpRatio) {
    // 坚果身体 + 受损裂纹(hpRatio 越低裂纹越多)
    var sway = Math.sin(t * 1.2) * size * 0.02;
    var grd = ctx.createRadialGradient(x - size * 0.1 + sway, y - size * 0.15, 0, x + sway, y, size * 0.45);
    grd.addColorStop(0, '#d4a36a'); grd.addColorStop(0.6, '#a8703a'); grd.addColorStop(1, '#5a3818');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(x + sway, y, size * 0.40, size * 0.46, 0, 0, Math.PI * 2); ctx.fill();
    // 顶部小叶
    ctx.fillStyle = '#3da935';
    ctx.beginPath(); ctx.ellipse(x + sway, y - size * 0.42, size * 0.08, size * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    // 裂纹(血量越低越多)
    ctx.strokeStyle = 'rgba(40,20,5,0.7)'; ctx.lineWidth = 1.5;
    var cracks = hpRatio > 0.66 ? 0 : (hpRatio > 0.33 ? 2 : 4);
    for (var i = 0; i < cracks; i++) {
      var a = (i / 4) * Math.PI * 2 + 0.5;
      ctx.beginPath();
      ctx.moveTo(x + sway + Math.cos(a) * size * 0.10, y + Math.sin(a) * size * 0.10);
      ctx.lineTo(x + sway + Math.cos(a) * size * 0.32, y + Math.sin(a) * size * 0.32);
      ctx.stroke();
    }
    // 脸
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x + sway - size * 0.10, y - size * 0.04, size * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + sway + size * 0.10, y - size * 0.04, size * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(x + sway - size * 0.10, y - size * 0.04, size * 0.025, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + sway + size * 0.10, y - size * 0.04, size * 0.025, 0, Math.PI * 2); ctx.fill();
    // 嘴(hp 低时下垂)
    ctx.strokeStyle = '#3a2008'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + sway, y + size * 0.10, size * 0.08, 0.2 + (1 - hpRatio) * 0.3, Math.PI - 0.2 - (1 - hpRatio) * 0.3);
    ctx.stroke();
    if (hurt) { ctx.fillStyle = 'rgba(255,80,80,0.4)'; ctx.beginPath(); ctx.ellipse(x + sway, y, size * 0.4, size * 0.46, 0, 0, Math.PI * 2); ctx.fill(); }
  }

  // 按类型分发
  function drawPlantByType(ctx, type, x, y, size, t, hurt, extra) {
    if (type === 'sunflower') drawSunflower(ctx, x, y, size, t, hurt);
    else if (type === 'peashooter') drawPeashooter(ctx, x, y, size, t, hurt, extra && extra.attack);
    else if (type === 'wallnut') drawWallnut(ctx, x, y, size, t, hurt, extra && extra.hpRatio);
  }

  // ============================================================
  // Engine · 精细自绘:僵尸(带行走腿部摆动 + 帽子)
  // ============================================================
  function drawZombieBody(ctx, x, y, size, t, def, walkPhase, hurt, frozen) {
    var sw = Math.sin(walkPhase) * size * 0.08;   // 左右晃
    var bob = Math.abs(Math.sin(walkPhase)) * size * 0.03; // 上下颠
    var cy = y - bob;
    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x, y + size * 0.42, size * 0.28, size * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    // 腿(交替摆动)
    ctx.strokeStyle = '#2a3018'; ctx.lineWidth = size * 0.09; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - size * 0.10, cy + size * 0.10);
    ctx.lineTo(x - size * 0.10 + sw, cy + size * 0.38);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.10, cy + size * 0.10);
    ctx.lineTo(x + size * 0.10 - sw, cy + size * 0.38);
    ctx.stroke();
    // 身体(破衣服)
    var body = ctx.createLinearGradient(x, cy - size * 0.1, x, cy + size * 0.2);
    body.addColorStop(0, '#3a4458'); body.addColorStop(1, '#1e2638');
    ctx.fillStyle = body;
    roundRectPath(ctx, x - size * 0.18, cy - size * 0.10, size * 0.36, size * 0.30, size * 0.06); ctx.fill();
    // 衣服破口
    ctx.fillStyle = def.tint;
    roundRectPath(ctx, x - size * 0.15, cy - size * 0.05, size * 0.30, size * 0.18, size * 0.04); ctx.fill();
    // 手臂(前伸)
    ctx.strokeStyle = def.tint; ctx.lineWidth = size * 0.08;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.12, cy - size * 0.02);
    ctx.lineTo(x + size * 0.22, cy + size * 0.02 + Math.sin(walkPhase + 1) * size * 0.03);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.12, cy - size * 0.02);
    ctx.lineTo(x + size * 0.26, cy + size * 0.04 + Math.sin(walkPhase) * size * 0.03);
    ctx.stroke();
    // 头
    var headGrd = ctx.createRadialGradient(x - size * 0.06, cy - size * 0.30, 0, x, cy - size * 0.24, size * 0.22);
    headGrd.addColorStop(0, '#a8b878'); headGrdStop(headGrd, def.tint);
    ctx.fillStyle = headGrd;
    ctx.beginPath(); ctx.arc(x, cy - size * 0.24, size * 0.18, 0, Math.PI * 2); ctx.fill();
    // 眼睛(发光红眼)
    ctx.fillStyle = '#1a0808';
    ctx.beginPath(); ctx.arc(x - size * 0.06, cy - size * 0.26, size * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + size * 0.06, cy - size * 0.26, size * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff3838';
    ctx.beginPath(); ctx.arc(x - size * 0.06, cy - size * 0.26, size * 0.015, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + size * 0.06, cy - size * 0.26, size * 0.015, 0, Math.PI * 2); ctx.fill();
    // 牙齿
    ctx.fillStyle = '#d8d0b0';
    ctx.fillRect(x - size * 0.04, cy - size * 0.16, size * 0.08, size * 0.03);
    // 帽子
    if (def.hat === 'cone') {
      var cgrd = ctx.createLinearGradient(x, cy - size * 0.55, x, cy - size * 0.40);
      cgrd.addColorStop(0, '#ff8a3a'); cgrd.addColorStop(1, '#c04a10');
      ctx.fillStyle = cgrd;
      ctx.beginPath();
      ctx.moveTo(x, cy - size * 0.56);
      ctx.lineTo(x - size * 0.16, cy - size * 0.40);
      ctx.lineTo(x + size * 0.16, cy - size * 0.40);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(x - size * 0.08, cy - size * 0.48); ctx.lineTo(x + size * 0.08, cy - size * 0.48); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (def.hat === 'bucket') {
      var bgrd = ctx.createLinearGradient(x, cy - size * 0.50, x, cy - size * 0.32);
      bgrd.addColorStop(0, '#9aa6b4'); bgrd.addColorStop(1, '#4a5664');
      ctx.fillStyle = bgrd;
      roundRectPath(ctx, x - size * 0.20, cy - size * 0.50, size * 0.40, size * 0.18, size * 0.03); ctx.fill();
      ctx.strokeStyle = '#2a3640'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - size * 0.20, cy - size * 0.42); ctx.lineTo(x + size * 0.20, cy - size * 0.42); ctx.stroke();
    }
    // 冰冻覆盖
    if (frozen) {
      ctx.fillStyle = 'rgba(100,200,255,0.4)';
      ctx.beginPath(); ctx.ellipse(x, cy - size * 0.05, size * 0.35, size * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(180,230,255,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, cy - size * 0.05, size * 0.35, 0, Math.PI * 2); ctx.stroke();
    }
    // 受击闪白
    if (hurt) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.ellipse(x, cy - size * 0.05, size * 0.32, size * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 辅助:渐变第二色(避免某些环境 addColorStop 异常)
  function headGrdStop(g, tint) { try { g.addColorStop(1, tint); } catch (e) {} }

  // ============================================================
  // Engine · 精细自绘:阳光(金色拖尾 + 脉动光晕)
  // ============================================================
  function drawSun(ctx, s, t) {
    var pulse = 1 + Math.sin(t * 0.18 + s.phase) * 0.08;
    var r = 20 * pulse;
    // 外光晕(加色混合)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 2.2);
    glow.addColorStop(0, 'rgba(255,216,77,0.6)'); glow.addColorStop(1, 'rgba(255,216,77,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(s.x, s.y, r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 光芒射线
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(t * 0.5 + s.phase);
    ctx.strokeStyle = 'rgba(255,216,77,0.8)'; ctx.lineWidth = 2;
    for (var i = 0; i < 8; i++) {
      var a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      ctx.lineTo(Math.cos(a) * r * 1.4, Math.sin(a) * r * 1.4);
      ctx.stroke();
    }
    ctx.restore();
    // 本体(径向渐变球)
    var core = ctx.createRadialGradient(s.x - 4, s.y - 4, 0, s.x, s.y, r);
    core.addColorStop(0, COLOR.sunCore); core.addColorStop(0.6, COLOR.sun); core.addColorStop(1, '#e08a00');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
  }

  // ============================================================
  // Engine · 精细自绘:豌豆(拖尾 + 发光)
  // ============================================================
  function drawPea(ctx, p) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14);
    glow.addColorStop(0, 'rgba(124,255,124,0.5)'); glow.addColorStop(1, 'rgba(124,255,124,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 拖尾
    ctx.strokeStyle = 'rgba(124,255,124,0.4)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    // 本体
    var grd = ctx.createRadialGradient(p.x - 2, p.y - 2, 0, p.x, p.y, 6);
    grd.addColorStop(0, '#aeffc0'); grd.addColorStop(1, '#3a9b3a');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
  }

  // ============================================================
  // Particles · 多层粒子系统
  // ============================================================
  function makeParticles() {
    var list = [];
    function spawn(x, y, opt) {
      opt = opt || {};
      var n = opt.n || 8;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2;
        var sp = rand(opt.spMin || 40, opt.spMax || 160);
        list.push({
          x: x, y: y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.lift || 0),
          life: opt.life || 0.6, max: opt.life || 0.6,
          size: rand(opt.sizeMin || 2, opt.sizeMax || 5),
          color: opt.color || '#7cff7c',
          gravity: opt.gravity != null ? opt.gravity : 200,
          glow: opt.glow !== false
        });
      }
    }
    function update(dt) {
      for (var i = list.length - 1; i >= 0; i--) {
        var p = list[i];
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += p.gravity * dt;
        p.life -= dt;
        if (p.life <= 0) list.splice(i, 1);
      }
    }
    function draw(ctx) {
      ctx.save();
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var alpha = clamp(p.life / p.max, 0, 1);
        if (p.glow) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = withAlpha(p.color, alpha * 0.5);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = withAlpha(p.color, alpha);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    function clear() { list.length = 0; }
    return { spawn: spawn, update: update, draw: draw, clear: clear };
  }
  function withAlpha(hex, a) {
    // 支持 #rrggbb → rgba
    if (hex.charAt(0) === '#' && hex.length === 7) {
      var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    return hex;
  }

  // ============================================================
  // Input · 鼠标/触摸坐标映射(处理 CSS 缩放)
  // ============================================================
  function makeInput(canvas, W, H, handler) {
    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      var cx, cy;
      if (e.touches && e.touches.length) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
      else { cx = e.clientX; cy = e.clientY; }
      return { x: (cx - rect.left) * (W / rect.width), y: (cy - rect.top) * (H / rect.height) };
    }
    function onDown(e) { e.preventDefault(); handler(pos(e)); }
    function onMove(e) { handler(pos(e), true); }
    function onKey(e) { if (e.key === 'Escape') handler(null, false, true); }
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('keydown', onKey);
    return function destroy() {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('touchstart', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }

  // ============================================================
  // Audio · WebAudio 合成音效(无音频文件)
  // ============================================================
  function makeAudio() {
    var actx = null, enabled = true;
    function ensure() {
      if (!actx) {
        try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { enabled = false; }
      }
      if (actx && actx.state === 'suspended') actx.resume();
      return actx;
    }
    // tone: 简易合成器 { freq, dur, type, vol, sweep }
    function tone(opt) {
      if (!enabled) return;
      var ac = ensure(); if (!ac) return;
      var osc = ac.createOscillator(), gain = ac.createGain();
      osc.type = opt.type || 'sine';
      osc.frequency.setValueAtTime(opt.freq, ac.currentTime);
      if (opt.sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(40, opt.sweep), ac.currentTime + opt.dur);
      gain.gain.setValueAtTime(opt.vol || 0.15, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + opt.dur);
      osc.connect(gain); gain.connect(ac.destination);
      osc.start(); osc.stop(ac.currentTime + opt.dur);
    }
    return {
      shoot: function () { tone({ freq: 680, sweep: 380, dur: 0.08, type: 'square', vol: 0.08 }); },
      hit: function () { tone({ freq: 220, sweep: 120, dur: 0.06, type: 'triangle', vol: 0.10 }); },
      sun: function () { tone({ freq: 880, sweep: 1320, dur: 0.15, type: 'sine', vol: 0.12 }); },
      plant: function () { tone({ freq: 440, sweep: 660, dur: 0.12, type: 'sine', vol: 0.10 }); },
      zombieHit: function () { tone({ freq: 180, sweep: 80, dur: 0.10, type: 'sawtooth', vol: 0.08 }); },
      win: function () {
        tone({ freq: 523, dur: 0.15, type: 'sine', vol: 0.15 });
        setTimeout(function () { tone({ freq: 659, dur: 0.15, type: 'sine', vol: 0.15 }); }, 120);
        setTimeout(function () { tone({ freq: 784, dur: 0.25, type: 'sine', vol: 0.15 }); }, 240);
      },
      lose: function () {
        tone({ freq: 300, sweep: 100, dur: 0.4, type: 'sawtooth', vol: 0.15 });
      }
    };
  }

  // ============================================================
  // Game · 主类
  // ============================================================
  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var COL_W = Math.floor((W - 80) / COLS);   // 草坪左边留 80px 给房屋
    var CELL = COL_W;
    var FIELD_LEFT = 80;
    var FIELD_W = COL_W * COLS;
    var FIELD_H = Math.floor((H - FIELD_TOP - 20) / ROWS);
    var ROW_H = FIELD_H;

    // ---- 状态 ----
    var state = {
      sun: 75, score: 0, level: 1, wave: 0, waveTotal: WAVES_PER_LEVEL,
      running: false, paused: false, over: false, won: false,
      frame: 0, time: 0, diff: 'normal',
      plants: [], zombies: [], bullets: [], suns: [], particles: makeParticles(),
      shopCD: {}, selected: null, hoverCell: null,
      waveTimer: 8, zombiesToSpawn: 0, spawnTimer: 0, spawnQueue: [],
      toasts: [], shake: 0,
      skyTimer: rand(6, 10),
      levelStartFlash: 0, waveBanner: 0, waveBannerText: ''
    };

    var audio = makeAudio();
    var destroyInput = null;

    // ---- 坐标工具 ----
    function cellCenter(col, row) {
      return { x: FIELD_LEFT + col * COL_W + COL_W / 2, y: FIELD_TOP + row * ROW_H + ROW_H / 2 };
    }
    function pickCell(x, y) {
      if (x < FIELD_LEFT || x > FIELD_LEFT + FIELD_W) return null;
      if (y < FIELD_TOP || y > FIELD_TOP + FIELD_H) return null;
      return { col: Math.floor((x - FIELD_LEFT) / COL_W), row: Math.floor((y - FIELD_TOP) / ROW_H) };
    }
    function plantAt(col, row) {
      for (var i = 0; i < state.plants.length; i++) {
        if (state.plants[i].col === col && state.plants[i].row === row) return state.plants[i];
      }
      return null;
    }

    // ---- emit helpers ----
    function emitScore() { hooks.onScore && hooks.onScore(state.score, state.level); }
    function emitState(s) { hooks.onState && hooks.onState(s); }
    function toast(text, kind) {
      state.toasts.push({ text: text, kind: kind || 'info', life: 2.2, max: 2.2 });
    }

    // ---- 阳光 ----
    function spawnSky() {
      state.suns.push({
        x: rand(FIELD_LEFT + 40, FIELD_LEFT + FIELD_W - 40), y: -20,
        tx: rand(FIELD_LEFT + 40, FIELD_LEFT + FIELD_W - 40),
        ty: rand(FIELD_TOP + 40, FIELD_TOP + FIELD_H - 40),
        vy: 0.6, phase: Math.random() * 6, fromSky: true, life: 12
      });
    }
    function spawnFromSunflower(p) {
      state.suns.push({
        x: p.x + rand(-10, 10), y: p.y, tx: p.x + rand(-30, 30), ty: p.y + rand(-10, 10),
        vx: rand(-30, 30), vy: -60, phase: Math.random() * 6, fromSky: false, life: 10
      });
    }
    function tryCollectSun(x, y) {
      for (var i = state.suns.length - 1; i >= 0; i--) {
        var s = state.suns[i];
        if (dist2(x, y, s.x, s.y) < 28 * 28) {
          state.sun += 25;
          state.particles.spawn(s.x, s.y, { n: 10, color: COLOR.sun, life: 0.5, sizeMin: 2, sizeMax: 4 });
          state.suns.splice(i, 1);
          audio.sun();
          return true;
        }
      }
      return false;
    }

    // ---- 商店 / 放置 ----
    function trySelectShop(key, mx, my) {
      var card = shopCardRect(key);
      if (mx >= card.x && mx <= card.x + card.w && my >= card.y && my <= card.y + card.h) {
        var def = PLANTS[key];
        if (state.sun >= def.cost && (state.shopCD[key] || 0) <= 0) {
          state.selected = (state.selected === key) ? null : key;
        }
        return true;
      }
      return false;
    }
    function shopCardRect(key) {
      var i = SHOP_KEYS.indexOf(key);
      var w = 84, h = 56, gap = 8;
      return { x: 12 + i * (w + gap), y: 14, w: w, h: h };
    }
    function tryPlace(mx, my) {
      if (!state.selected) return false;
      var cell = pickCell(mx, my);
      if (!cell) return false;
      if (plantAt(cell.col, cell.row)) return false;
      var def = PLANTS[state.selected];
      if (state.sun < def.cost) return false;
      state.sun -= def.cost;
      var c = cellCenter(cell.col, cell.row);
      state.plants.push({
        type: state.selected, col: cell.col, row: cell.row, x: c.x, y: c.y,
        hp: def.hp, maxHp: def.hp, t: Math.random() * 6, fireTimer: 0, prodTimer: rand(2, def.interval || 9),
        hurt: 0, attack: 0, placed: 0
      });
      state.shopCD[state.selected] = def.recharge;
      state.selected = null;
      state.particles.spawn(c.x, c.y, { n: 12, color: '#7ee06a', life: 0.5, gravity: 100 });
      audio.plant();
      return true;
    }
    function tryShovel(mx, my) {
      // 铲子按钮(右上)
      var sx = W - 50, sy = 16, sw = 38, sh = 38;
      if (mx >= sx && mx <= sx + sw && my >= sy && my <= sy + sh) {
        state.shovelActive = !state.shovelActive;
        return true;
      }
      if (state.shovelActive) {
        var cell = pickCell(mx, my);
        if (cell) {
          var p = plantAt(cell.col, cell.row);
          if (p) {
            state.plants.splice(state.plants.indexOf(p), 1);
            state.particles.spawn(p.x, p.y, { n: 10, color: '#a8703a', life: 0.4 });
            state.shovelActive = false;
            return true;
          }
        }
      }
      return false;
    }

    // ---- 输入处理 ----
    function onHandle(pos, isMove, isEsc) {
      if (isEsc) { state.selected = null; state.shovelActive = false; return; }
      if (!pos) return;
      if (isMove) { state.hoverCell = pickCell(pos.x, pos.y); return; }
      // 点击(HUD 区或草坪)
      if (tryShovel(pos.x, pos.y)) return;
      if (pos.y < HUD_TOP) {
        for (var i = 0; i < SHOP_KEYS.length; i++) {
          if (trySelectShop(SHOP_KEYS[i], pos.x, pos.y)) return;
        }
        return;
      }
      if (tryCollectSun(pos.x, pos.y)) return;
      tryPlace(pos.x, pos.y);
    }

    // ---- 波次 / 出怪 ----
    function startWave() {
      state.wave++;
      if (state.wave > WAVES_PER_LEVEL) { nextLevel(); return; }
      var count = 3 + state.wave + state.level;
      state.zombiesToSpawn = count;
      state.spawnQueue = [];
      var pool;
      if (state.wave < 2) pool = ['normal'];
      else if (state.wave < 4) pool = ['normal', 'normal', 'cone'];
      else pool = ['normal', 'cone', 'cone', 'bucket'];
      for (var i = 0; i < count; i++) state.spawnQueue.push(pool[Math.floor(Math.random() * pool.length)]);
      state.spawnTimer = 1.0;
      state.waveBanner = 1.6;
      state.waveBannerText = '第 ' + state.level + ' 章 · 第 ' + state.wave + ' / ' + WAVES_PER_LEVEL + ' 波';
      toast(state.waveBannerText);
    }
    function nextLevel() {
      state.level++;
      if (state.level > LEVELS) {
        state.won = true; state.over = true; state.running = false;
        emitState('over'); emitScore();
        hooks.onGameOver && hooks.onGameOver(state.score, state.level);
        audio.win();
        return;
      }
      state.wave = 0;
      state.sun += 50;
      state.waveTimer = 8;
      state.levelStartFlash = 1;
      toast('进入第 ' + state.level + ' 章!+50 阳光', 'ok');
      startWave();
    }
    function spawnZombie(type) {
      var def = ZOMBIES[type];
      var row = Math.floor(Math.random() * ROWS);
      var c = cellCenter(COLS, row);   // 从右侧场外
      state.zombies.push({
        type: type, x: c.x + 40, y: c.y, row: row,
        hp: def.hp, maxHp: def.hp, def: def,
        walkPhase: Math.random() * 6, hurt: 0, eating: false, eatTimer: 0
      });
    }

    // ---- 更新 ----
    function update(dt) {
      state.frame++;
      state.time += dt;
      if (state.shake > 0) state.shake -= dt * 8;
      if (state.levelStartFlash > 0) state.levelStartFlash -= dt;
      if (state.waveBanner > 0) state.waveBanner -= dt;
      // toasts
      for (var i = state.toasts.length - 1; i >= 0; i--) {
        state.toasts[i].life -= dt;
        if (state.toasts[i].life <= 0) state.toasts.splice(i, 1);
      }
      // 商店冷却
      for (var k in state.shopCD) state.shopCD[k] = Math.max(0, state.shopCD[k] - dt);

      // 天降阳光
      state.skyTimer -= dt;
      if (state.skyTimer <= 0) { spawnSky(); state.skyTimer = rand(8, 12); }

      // 阳光移动
      for (var i = state.suns.length - 1; i >= 0; i--) {
        var s = state.suns[i];
        if (s.fromSky) {
          if (s.y < s.ty) s.y += 60 * dt * 4;
          else s.y = s.ty;
        } else {
          s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 200 * dt;
          if (s.y > s.ty + 20) { s.y = s.ty + 20; s.vy = 0; }
        }
        s.life -= dt;
        if (s.life <= 0) state.suns.splice(i, 1);
      }

      // 植物逻辑
      for (var i = state.plants.length - 1; i >= 0; i--) {
        var p = state.plants[i];
        p.t += dt; p.placed += dt;
        if (p.hurt > 0) p.hurt -= dt;
        if (p.attack > 0) p.attack -= dt;
        var def = PLANTS[p.type];
        if (def.kind === 'sun') {
          p.prodTimer -= dt;
          if (p.prodTimer <= 0) { spawnFromSunflower(p); p.prodTimer = def.interval; }
        } else if (def.kind === 'shoot') {
          p.fireTimer -= dt;
          // 检查同行有僵尸
          var hasZ = false;
          for (var j = 0; j < state.zombies.length; j++) {
            if (state.zombies[j].row === p.row && state.zombies[j].x > p.x) { hasZ = true; break; }
          }
          if (hasZ && p.fireTimer <= 0) {
            state.bullets.push({ x: p.x + 18, y: p.y - 6, vx: 380, dmg: def.dmg, row: p.row, life: 3 });
            p.fireTimer = def.fire; p.attack = 0.2;
            audio.shoot();
          }
        }
        if (p.hp <= 0) {
          state.particles.spawn(p.x, p.y, { n: 14, color: '#5a8a3a', life: 0.6 });
          state.plants.splice(i, 1);
        }
      }

      // 子弹
      for (var i = state.bullets.length - 1; i >= 0; i--) {
        var b = state.bullets[i];
        b.x += b.vx * dt; b.life -= dt;
        if (b.x > W + 20 || b.life <= 0) { state.bullets.splice(i, 1); continue; }
        // 碰撞同行僵尸
        for (var j = 0; j < state.zombies.length; j++) {
          var z = state.zombies[j];
          if (z.row === b.row && Math.abs(z.x - b.x) < 22 && z.hp > 0) {
            z.hp -= b.dmg; z.hurt = 0.15;
            state.particles.spawn(b.x, b.y, { n: 5, color: '#7cff7c', life: 0.3, sizeMin: 1, sizeMax: 3 });
            state.bullets.splice(i, 1);
            audio.hit();
            break;
          }
        }
      }

      // 僵尸
      for (var i = state.zombies.length - 1; i >= 0; i--) {
        var z = state.zombies[i];
        z.walkPhase += dt * (z.eating ? 6 : 3.5);
        if (z.hurt > 0) z.hurt -= dt;
        // 查前方植物
        var target = null;
        for (var j = 0; j < state.plants.length; j++) {
          var pp = state.plants[j];
          if (pp.row === z.row && pp.x > z.x - 40 && pp.x < z.x + 20) { target = pp; break; }
        }
        if (target) {
          z.eating = true; z.eatTimer -= dt;
          if (z.eatTimer <= 0) { target.hp -= z.def.atk; target.hurt = 0.3; z.eatTimer = 0.6; audio.zombieHit(); }
        } else {
          z.eating = false;
          z.x -= z.def.sp * dt * 60;
        }
        if (z.hp <= 0) {
          state.score += z.def.score; emitScore();
          state.particles.spawn(z.x, z.y - 20, { n: 16, color: z.def.tint, life: 0.7, sizeMin: 2, sizeMax: 5 });
          state.particles.spawn(z.x, z.y - 20, { n: 6, color: '#ff3838', life: 0.4, glow: true });
          state.zombies.splice(i, 1);
          continue;
        }
        // 到家 = 失败
        if (z.x < FIELD_LEFT - 20) {
          state.over = true; state.running = false; state.won = false;
          emitState('over');
          hooks.onGameOver && hooks.onGameOver(state.score, state.level);
          audio.lose();
          state.shake = 1;
          return;
        }
      }

      // 波次推进
      if (state.zombiesToSpawn > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0 && state.spawnQueue.length) {
          spawnZombie(state.spawnQueue.shift());
          state.zombiesToSpawn--;
          state.spawnTimer = rand(1.2, 2.4) / (state.diff === 'hard' ? 1.4 : state.diff === 'easy' ? 0.7 : 1);
        }
      } else if (state.zombies.length === 0) {
        // 本波清完
        if (state.waveTimer > 3) state.waveTimer = 3;
        state.waveTimer -= dt;
        if (state.waveTimer <= 0) {
          state.waveTimer = 15;
          startWave();
        }
      }

      // 粒子
      state.particles.update(dt);
    }

    // ---- 渲染 ----
    function draw() {
      ctx.save();
      if (state.shake > 0) {
        ctx.translate(rand(-state.shake * 8, state.shake * 8), rand(-state.shake * 8, state.shake * 8));
      }
      drawBackground();
      drawGrid();
      drawPlants();
      drawZombies();
      drawBullets();
      drawSuns();
      state.particles.draw(ctx);
      drawHUD();
      if (state.waveBanner > 0) drawWaveBanner();
      if (state.levelStartFlash > 0) drawLevelFlash();
      drawHover();
      drawToasts();
      ctx.restore();
    }

    function drawBackground() {
      // 深色底
      ctx.fillStyle = COLOR.bg;
      ctx.fillRect(0, 0, W, H);
      // 远景天空渐变(顶部一丝光)
      var sky = ctx.createLinearGradient(0, 0, 0, FIELD_TOP);
      sky.addColorStop(0, '#0a1428'); sky.addColorStop(1, '#0a1f1a');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, FIELD_TOP);
      // 房屋(左侧)
      drawHouse();
      // 草坪条纹 + 渐变
      for (var r = 0; r < ROWS; r++) {
        var y = FIELD_TOP + r * ROW_H;
        var grd = ctx.createLinearGradient(0, y, 0, y + ROW_H);
        var c1 = r % 2 === 0 ? COLOR.grass1 : COLOR.grass2;
        var c2 = r % 2 === 0 ? COLOR.grassDark : '#152e1c';
        grd.addColorStop(0, c1); grd.addColorStop(1, c2);
        ctx.fillStyle = grd;
        ctx.fillRect(FIELD_LEFT, y, FIELD_W, ROW_H);
      }
      // 草坪顶部高光
      ctx.fillStyle = 'rgba(120,200,90,0.08)';
      ctx.fillRect(FIELD_LEFT, FIELD_TOP, FIELD_W, 4);
      // 草丛噪点(随机但固定)
      ctx.fillStyle = 'rgba(80,160,70,0.5)';
      for (var i = 0; i < 60; i++) {
        var gx = FIELD_LEFT + (i * 137 % FIELD_W);
        var gy = FIELD_TOP + (i * 89 % FIELD_H);
        ctx.fillRect(gx, gy, 2, 2);
      }
    }

    function drawHouse() {
      var x = 0, y = FIELD_TOP, w = 76, h = FIELD_H * ROWS;
      // 主体
      var grd = ctx.createLinearGradient(x, y, x + w, y);
      grd.addColorStop(0, COLOR.houseDark); grd.addColorStop(1, COLOR.house);
      ctx.fillStyle = grd;
      ctx.fillRect(x, y, w, h);
      // 屋顶斜面
      ctx.fillStyle = COLOR.roof;
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.lineTo(w, y - 16); ctx.closePath(); ctx.fill();
      // 窗户网格(代表 5 个房间)
      ctx.fillStyle = '#1a2747';
      for (var r = 0; r < ROWS; r++) {
        var wy = y + r * ROW_H + ROW_H / 2 - 12;
        ctx.fillStyle = (state.frame + r) % 200 < 190 ? '#3a5a8a' : '#2a3a5a';
        roundRectPath(ctx, 16, wy, 44, 24, 4); ctx.fill();
        // 窗框十字
        ctx.strokeStyle = '#1a2747'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(38, wy); ctx.lineTo(38, wy + 24); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(16, wy + 12); ctx.lineTo(60, wy + 12); ctx.stroke();
      }
    }

    function drawGrid() {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      for (var c = 0; c <= COLS; c++) {
        var x = FIELD_LEFT + c * COL_W;
        ctx.beginPath(); ctx.moveTo(x, FIELD_TOP); ctx.lineTo(x, FIELD_TOP + FIELD_H); ctx.stroke();
      }
      for (var r = 0; r <= ROWS; r++) {
        var y = FIELD_TOP + r * ROW_H;
        ctx.beginPath(); ctx.moveTo(FIELD_LEFT, y); ctx.lineTo(FIELD_LEFT + FIELD_W, y); ctx.stroke();
      }
    }

    function drawPlants() {
      for (var i = 0; i < state.plants.length; i++) {
        var p = state.plants[i];
        // 生长动画(刚放置从小放大)
        var scale = p.placed < 0.3 ? lerp(0.3, 1, p.placed / 0.3) : 1;
        var size = CELL * 0.62 * scale;
        var hpRatio = p.hp / p.maxHp;
        ctx.save();
        if (p.placed < 0.3) { ctx.translate(p.x, p.y); ctx.scale(scale, scale); ctx.translate(-p.x, -p.y); }
        drawPlantByType(ctx, p.type, p.x, p.y, size, p.t, p.hurt > 0, { attack: p.attack > 0, hpRatio: hpRatio });
        ctx.restore();
        // 血条(只在受损时)
        if (hpRatio < 1) {
          var bw = CELL * 0.5, bx = p.x - bw / 2, by = p.y - CELL * 0.42;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRectPath(ctx, bx - 1, by - 1, bw + 2, 5, 2); ctx.fill();
          ctx.fillStyle = hpRatio > 0.5 ? COLOR.ok : (hpRatio > 0.25 ? COLOR.warn : COLOR.danger);
          roundRectPath(ctx, bx, by, bw * hpRatio, 3, 1.5); ctx.fill();
        }
      }
    }

    function drawZombies() {
      // 按 x 排序(后面的先画)
      var sorted = state.zombies.slice().sort(function (a, b) { return b.x - a.x; });
      for (var i = 0; i < sorted.length; i++) {
        var z = sorted[i];
        drawZombieBody(ctx, z.x, z.y, CELL * 0.66, state.time, z.def, z.walkPhase, z.hurt > 0, false);
        // 血条
        if (z.hp < z.maxHp) {
          var bw = CELL * 0.5, bx = z.x - bw / 2, by = z.y - CELL * 0.55;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRectPath(ctx, bx - 1, by - 1, bw + 2, 5, 2); ctx.fill();
          var hr = z.hp / z.maxHp;
          ctx.fillStyle = hr > 0.5 ? COLOR.danger : '#ff6060';
          roundRectPath(ctx, bx, by, bw * hr, 3, 1.5); ctx.fill();
        }
      }
    }

    function drawBullets() {
      for (var i = 0; i < state.bullets.length; i++) drawPea(ctx, state.bullets[i]);
    }

    function drawSuns() {
      for (var i = 0; i < state.suns.length; i++) drawSun(ctx, state.suns[i], state.time);
    }

    function drawHover() {
      if (!state.hoverCell || !state.selected) return;
      var c = state.hoverCell;
      if (c.col < 0 || c.col >= COLS || c.row < 0 || c.row >= ROWS) return;
      var cx = FIELD_LEFT + c.col * COL_W, cy = FIELD_TOP + c.row * ROW_H;
      var occupied = plantAt(c.col, c.row);
      ctx.fillStyle = occupied ? 'rgba(255,46,99,0.25)' : 'rgba(46,230,166,0.25)';
      ctx.fillRect(cx, cy, COL_W, ROW_H);
      ctx.strokeStyle = occupied ? COLOR.danger : COLOR.ok;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + 1, cy + 1, COL_W - 2, ROW_H - 2);
    }

    // ---- HUD ----
    function drawHUD() {
      // 顶部 HUD 底板
      ctx.fillStyle = 'rgba(13,19,32,0.85)';
      roundRectPath(ctx, 0, 0, W, HUD_TOP, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(124,58,237,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, HUD_TOP); ctx.lineTo(W, HUD_TOP); ctx.stroke();

      // 商店卡片
      for (var i = 0; i < SHOP_KEYS.length; i++) {
        var key = SHOP_KEYS[i];
        var def = PLANTS[key];
        var r = shopCardRect(key);
        var affordable = state.sun >= def.cost;
        var cooling = (state.shopCD[key] || 0) > 0;
        var selected = state.selected === key;
        // 卡片底
        ctx.fillStyle = selected ? 'rgba(0,224,255,0.18)' : 'rgba(20,27,46,0.9)';
        roundRectPath(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
        ctx.strokeStyle = selected ? COLOR.neon : 'rgba(124,58,237,0.4)';
        ctx.lineWidth = selected ? 2 : 1;
        roundRectPath(ctx, r.x, r.y, r.w, r.h, 8); ctx.stroke();
        // 卡片内植物小图(用 type 绘制缩小版)
        ctx.save();
        var mini = shopCardIcon(key, r);
        ctx.beginPath(); ctx.rect(r.x + 2, r.y + 2, r.w - 4, r.h - 16); ctx.clip();
        drawPlantByType(ctx, key, mini.x, mini.y, mini.size, state.time, false, { hpRatio: 1 });
        ctx.restore();
        // 冷却遮罩
        if (cooling) {
          var pct = state.shopCD[key] / def.recharge;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(r.x, r.y, r.w, r.h * pct);
        }
        // 不可购买灰化
        if (!affordable || cooling) {
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          roundRectPath(ctx, r.x, r.y, r.w, r.h, 8); ctx.fill();
        }
        // 价格
        ctx.font = 'bold 12px Rajdhani, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = affordable ? COLOR.sun : COLOR.text2;
        ctx.fillText(def.cost, r.x + r.w / 2, r.y + r.h - 8);
      }

      // 阳光面板
      var sx = 290, sy = 14, sw = 100, sh = 44;
      ctx.fillStyle = 'rgba(13,19,32,0.9)';
      roundRectPath(ctx, sx, sy, sw, sh, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(255,216,77,0.4)'; ctx.lineWidth = 1;
      roundRectPath(ctx, sx, sy, sw, sh, 10); ctx.stroke();
      drawSun(ctx, { x: sx + 22, y: sy + sh / 2, phase: 0 }, state.time);
      ctx.font = 'bold 22px Orbitron, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = COLOR.sun; ctx.shadowColor = 'rgba(255,216,77,0.6)'; ctx.shadowBlur = 8;
      ctx.fillText(state.sun, sx + 46, sy + sh / 2);
      ctx.shadowBlur = 0;

      // 波次信息(中右)
      ctx.font = 'bold 14px Rajdhani, sans-serif';
      ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillStyle = COLOR.text;
      ctx.fillText('第 ' + state.level + ' / ' + LEVELS + ' 章', W - 100, 14);
      ctx.fillStyle = COLOR.text2;
      ctx.font = '13px Rajdhani, sans-serif';
      ctx.fillText('第 ' + state.wave + ' / ' + WAVES_PER_LEVEL + ' 波 · 剩余 ' + state.zombies.length, W - 100, 34);
      // 波次进度条
      var pw = 120, px = W - 100 - pw + 60, py = 56;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      roundRectPath(ctx, px, py, pw, 6, 3); ctx.fill();
      var prog = (state.wave - 1 + (1 - state.zombies.length / Math.max(1, state.zombiesToSpawn + state.zombies.length))) / WAVES_PER_LEVEL;
      ctx.fillStyle = COLOR.neon2;
      roundRectPath(ctx, px, py, pw * clamp(prog, 0, 1), 6, 3); ctx.fill();

      // 铲子按钮(右上)
      var shX = W - 50, shY = 16;
      ctx.fillStyle = state.shovelActive ? 'rgba(0,224,255,0.3)' : 'rgba(20,27,46,0.9)';
      roundRectPath(ctx, shX, shY, 38, 38, 8); ctx.fill();
      ctx.strokeStyle = state.shovelActive ? COLOR.neon : 'rgba(124,58,237,0.4)';
      ctx.lineWidth = state.shovelActive ? 2 : 1;
      roundRectPath(ctx, shX, shY, 38, 38, 8); ctx.stroke();
      ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🪏', shX + 19, shY + 19);
    }
    function shopCardIcon(key, r) {
      // 给商店卡片算出植物绘制位置(只露上半部分)
      return { x: r.x + r.w / 2, y: r.y + r.h / 2 + 6, size: r.w * 0.95 };
    }

    function drawWaveBanner() {
      var alpha = state.waveBanner > 1.2 ? (1.6 - state.waveBanner) / 0.4 : Math.min(1, state.waveBanner / 0.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, H / 2 - 40, W, 80);
      ctx.font = 'bold 32px Orbitron, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = COLOR.neon; ctx.shadowColor = COLOR.neon; ctx.shadowBlur = 16;
      ctx.fillText(state.waveBannerText, W / 2, H / 2);
      ctx.restore();
    }
    function drawLevelFlash() {
      ctx.save();
      ctx.globalAlpha = state.levelStartFlash * 0.3;
      ctx.fillStyle = COLOR.ok;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    function drawToasts() {
      ctx.font = 'bold 14px Rajdhani, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (var i = 0; i < state.toasts.length; i++) {
        var t = state.toasts[i];
        var alpha = t.life > t.max - 0.3 ? (t.max - t.life) / 0.3 : Math.min(1, t.life / 0.5);
        var y = H - 70 - i * 30;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = t.kind === 'ok' ? 'rgba(46,230,166,0.9)' : (t.kind === 'warn' ? 'rgba(255,182,39,0.9)' : 'rgba(0,224,255,0.9)');
        var tw = ctx.measureText(t.text).width + 24;
        roundRectPath(ctx, W / 2 - tw / 2, y, tw, 26, 13); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(t.text, W / 2, y + 6);
      }
      ctx.globalAlpha = 1;
    }

    // ---- 主循环 ----
    var last = 0, rafId = null;
    function loop(ts) {
      var dt = Math.min(0.05, (ts - last) / 1000);
      last = ts;
      if (state.running && !state.paused && !state.over) update(dt);
      draw();
      rafId = requestAnimationFrame(loop);
    }

    // ---- 生命周期 ----
    function reset() {
      state.sun = 75; state.score = 0; state.level = 1; state.wave = 0;
      state.running = false; state.paused = false; state.over = false; state.won = false;
      state.plants = []; state.zombies = []; state.bullets = []; state.suns = [];
      state.shopCD = {}; state.selected = null; state.shovelActive = false;
      state.waveTimer = 8; state.zombiesToSpawn = 0; state.spawnQueue = [];
      state.particles.clear(); state.toasts = [];
      state.skyTimer = rand(6, 10);
      emitScore(); emitState('playing');
    }
    function start(diff) {
      reset();
      state.diff = diff || 'normal';
      // easy 多 50 起始阳光,hard 少 25
      if (state.diff === 'easy') state.sun = 125;
      else if (state.diff === 'hard') state.sun = 50;
      state.running = true;
      state.waveTimer = 4;   // 第一波快点来
      toast('第 1 章 · 准备战斗!', 'ok');
      emitState('playing');
    }
    function pause() { if (state.over) return; state.paused = true; emitState('paused'); }
    function resume() { if (state.over) return; state.paused = false; emitState('playing'); }
    function destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      if (destroyInput) destroyInput();
    }

    // ---- 启动 ----
    destroyInput = makeInput(canvas, W, H, onHandle);
    reset();
    rafId = requestAnimationFrame(loop);

    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  // ============================================================
  // 契约暴露
  // ============================================================
  window.IanGame = { init: init };
})();
