/* ========================================================================
   铁幕指挥官 — 原创红警风 RTS · 遵循 window.IanGame 接口契约
   玩法:采矿 → 建造科技树 → 产兵 → 指挥作战 → 摧毁敌方建造厂
   ======================================================================== */
(function () {
  'use strict';

  var NUKE_ENABLED = true; // ★ 核弹开关:false 则科技树不出现核弹发射井

  var MAP_W = 1600, MAP_H = 1000;   // 虚拟地图大小
  var STEP = 1 / 60;                  // 固定逻辑步长

  // ---------- 建筑定义 ----------
  // kind, name, cost矿, power(正=供/负=耗), hp, buildTime秒, sight视野, prereq前置, prod可生产单位kind列表, role
  var BUILDINGS = {
    base:      { name: '建造厂', icon: '🏛️', cost: 0,   power: -10, hp: 2000, build: 0,  sight: 220, prereq: [],               prod: [], side:'core' },
    power:     { name: '发电厂', icon: '⚡', cost: 200,  power: 80,  hp: 400,  build: 5,  sight: 80,  prereq: ['base'],         prod: [], side:'econ' },
    refinery:  { name: '精炼厂', icon: '🏭', cost: 400,  power: -20, hp: 600,  build: 8,  sight: 110, prereq: ['base'],         prod: ['harvester'], side:'econ' },
    barracks:  { name: '兵营',   icon: '🪖', cost: 300,  power: -20, hp: 500,  build: 7,  sight: 110, prereq: ['power'],        prod: ['soldier','missile'], side:'mil' },
    warfactory:{ name: '战车工厂',icon: '🏗️', cost: 600, power: -30, hp: 700,  build: 10, sight: 110, prereq: ['power'],        prod: ['tank','artillery'], side:'mil' },
    radar:     { name: '雷达站', icon: '📡', cost: 500,  power: -30, hp: 450,  build: 9,  sight: 260, prereq: ['barracks'],     prod: [], side:'util' },
    turret:    { name: '炮塔',   icon: '🗼', cost: 350,  power: -25, hp: 500,  build: 6,  sight: 200, prereq: ['barracks'],     prod: [], side:'def', atk:{dmg:18,range:180,cool:0.8} },
    nuke:      { name: '核弹井', icon: '☢️', cost: 1500, power: -60, hp: 900,  build: 18, sight: 140, prereq: ['radar'],        prod: [], side:'super' },
  };
  // ---------- 单位定义 ----------
  // kind, name, cost, hp, speed(像素/秒), sight, builtFrom, role, dmg?, range?, cool?
  var UNITS = {
    harvester: { name: '矿车',   icon: '🚛', cost: 300, hp: 300, speed: 70, sight: 90,  from: 'refinery', role:'mine',  cap: 2 },
    soldier:   { name: '步兵',   icon: '🪖', cost: 100, hp: 80,  speed: 55, sight: 120, from: 'barracks', role:'atk',  dmg:8,  range:70, cool:0.7, target:'ground' },
    missile:   { name: '导弹兵', icon: '🚀', cost: 175, hp: 70,  speed: 50, sight: 130, from: 'barracks', role:'atk',  dmg:22, range:110, cool:1.2, target:'armor' },
    tank:      { name: '主战坦克',icon: '🛡️', cost: 500, hp: 280, speed: 60, sight: 150, from: 'warfactory', role:'atk', dmg:30, range:90, cool:1.0, target:'any' },
    artillery: { name: '火箭车', icon: '💥', cost: 700, hp: 180, speed: 50, sight: 160, from: 'warfactory', role:'atk', dmg:45, range:220, cool:2.0, target:'building' },
  };

  var TEAM_COLOR = { player: '#3da9fc', enemy: '#ff4d4d' };
  var MINE_COLOR = '#ffd54a';

  function init(canvas, hooks) {
    var ctx = canvas.getContext('2d');
    var VW = canvas.width, VH = canvas.height;   // 视口 800x500
    var fogCanvas = document.createElement('canvas');
    fogCanvas.width = MAP_W; fogCanvas.height = MAP_H;
    var fogCtx = fogCanvas.getContext('2d');

    // ---------- 状态 ----------
    var cam, view, keys, running, paused, over, won, rafId, last, acc, frame;
    var oreP, oreE, powerP, powerE;            // 双方资源/电力
    var buildings, units, mines, bullets, particles, floatTexts;
    var selected,             // 选中的单位数组
        buildMode,            // 待放置建筑kind | null
        prodQueue,            // 双方生产队列 {team, from, kind, t, total}
        nukeCharge,           // {player:0..1, enemy:0..1}
        nukeTargeting,        // bool 玩家是否在选核弹落点
        enemyAItimer, enemyAIwave;
    var score, kills;
    // 输入
    var mouse, dragStart, isDragging;

    function reset() {
      cam = { x: 0, y: 0 };
      keys = {};
      oreP = 1500; oreE = 1000; powerP = 0; powerE = 0;
      buildings = []; units = []; bullets = []; particles = []; floatTexts = [];
      mines = []; selected = []; buildMode = null; prodQueue = [];
      nukeCharge = { player: 0, enemy: 0 }; nukeTargeting = false;
      enemyAItimer = 40; enemyAIwave = 0; score = 0; kills = 0;
      over = false; won = false; frame = 0; acc = 0; last = 0;
      // 生成矿脉(地图各处)
      var spots = [[300,300],[1300,700],[800,200],[800,800],[500,750],[1100,250],[250,500],[1350,500]];
      spots.forEach(function (s) { mines.push({ x: s[0], y: s[1], r: 40, amount: 99999 }); });
      // 玩家初始基地(左下)
      addBuilding('base', 'player', 250, 820);
      addBuilding('power', 'player', 360, 820);
      addBuilding('refinery', 'player', 250, 700);
      // 敌方初始基地(右上)
      addBuilding('base', 'enemy', 1350, 180);
      addBuilding('power', 'enemy', 1240, 180);
      addBuilding('refinery', 'enemy', 1350, 300);
      // 各送一辆矿车
      addUnit('harvester', 'player', 320, 760);
      addUnit('harvester', 'enemy', 1280, 240);
      recomputePower('player'); recomputePower('enemy');
      emitScore(); emitState('playing');
      fogCtx.clearRect(0, 0, MAP_W, MAP_H);
      fogCtx.fillStyle = 'rgba(0,0,0,1)';
      fogCtx.fillRect(0, 0, MAP_W, MAP_H);
    }

    function emitScore() { hooks.onScore && hooks.onScore(score | 0, 1); }
    function emitState(s) { hooks.onState && hooks.onState(s); }

    function addBuilding(kind, team, x, y) {
      var def = BUILDINGS[kind];
      buildings.push({ kind: kind, team: team, x: x, y: y, hp: def.hp, maxhp: def.hp,
                       t: def.build, building: def.build > 0, prod: def.atk ? 0 : null });
    }
    function addUnit(kind, team, x, y) {
      var def = UNITS[kind];
      units.push({ kind: kind, team: team, x: x, y: y, hp: def.hp, maxhp: def.hp, def: def,
                   tx: x, ty: y, cmd: 'idle', target: null, cool: 0, cargo: 0,
                   miningState: 'toMine', mineTarget: null });
    }
    function recomputePower(team) {
      var p = 0;
      buildings.filter(function (b) { return b.team === team && !b.building; }).forEach(function (b) {
        p += BUILDINGS[b.kind].power;
      });
      if (team === 'player') powerP = p; else powerE = p;
    }
    function hasBuilding(team, kind) {
      return buildings.some(function (b) { return b.team === team && b.kind === kind && !b.building; });
    }
    function countUnits(team) { return units.filter(function (u) { return u.team === team; }).length; }
    function powerOk(team) { return (team === 'player' ? powerP : powerE) >= 0; }
    function canBuild(team, kind) {
      var def = BUILDINGS[kind];
      if (!def.prereq.every(function (p) { return hasBuilding(team, p); })) return false;
      if (kind === 'nuke' && !NUKE_ENABLED) return false;
      return true;
    }
    function canProduce(team, kind) {
      var def = UNITS[kind];
      if (!hasBuilding(team, def.from)) return false;
      // 矿车数量受精炼厂限制
      if (kind === 'harvester') {
        var refs = buildings.filter(function (b) { return b.team === team && b.kind === 'refinery' && !b.building; }).length;
        var hvs = units.filter(function (u) { return u.team === team && u.kind === 'harvester'; }).length;
        if (hvs >= refs * 2) return false;
      }
      return true;
    }

    // ---------- 主逻辑 ----------
    function step(dt) {
      frame++;
      // 生产队列推进
      for (var i = prodQueue.length - 1; i >= 0; i--) {
        var q = prodQueue[i];
        var eff = powerOk(q.team) ? 1 : 0.4;   // 缺电减速
        q.t -= dt * eff;
        if (q.t <= 0) {
          // 出生:在来源建筑旁
          var src = buildings.filter(function (b) { return b.team === q.team && b.kind === q.from && !b.building; })[0];
          if (src) {
            var ox = src.x + (Math.random() * 60 - 30), oy = src.y + 90 + (Math.random() * 20);
            addUnit(q.kind, q.team, Math.max(20, ox), Math.min(MAP_H - 20, oy));
          }
          prodQueue.splice(i, 1);
        }
      }
      // 建筑建造中倒计时
      buildings.forEach(function (b) {
        if (b.building) { b.t -= dt; if (b.t <= 0) { b.building = false; recomputePower(b.team); } }
        // 炮塔开火
        if (b.kind === 'turret' && !b.building) {
          var def = BUILDINGS.turret.atk;
          b.prod = (b.prod || 0) - dt;
          if (b.prod <= 0) {
            var enemy = nearestEnemy(b.x, b.y, b.team, def.range);
            if (enemy) {
              fireBullet(b.x, b.y - 10, enemy, def.dmg, b.team);
              b.prod = def.cool;
            }
          }
        }
      });
      // 单位逻辑
      units.forEach(updateUnit);
      // 子弹
      bullets.forEach(function (bl) {
        bl.t -= dt;
        if (bl.target && bl.target.hp > 0) {
          var tx = bl.target.x, ty = bl.target.y - 10;
          var dx = tx - bl.x, dy = ty - bl.y, d = Math.hypot(dx, dy) || 1;
          bl.x += dx / d * 360 * dt; bl.y += dy / d * 360 * dt;
          if (d < 16) { damage(bl.target, bl.dmg, bl.team); bl.dead = true; spark(bl.x, bl.y, '#ffb627', 6); }
        } else bl.dead = true;
      });
      bullets = bullets.filter(function (b) { return !b.dead && b.t > 0; });
      // 粒子
      particles.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; });
      particles = particles.filter(function (p) { return p.life > 0; });
      floatTexts.forEach(function (f) { f.y -= 20 * dt; f.life -= dt; });
      floatTexts = floatTexts.filter(function (f) { return f.life > 0; });
      // 单位软碰撞分离
      separateUnits();
      // 战争迷雾(玩家视野)
      updateFog(dt);
      // 核弹充能
      if (hasBuilding('player', 'nuke') && nukeCharge.player < 1) nukeCharge.player = Math.min(1, nukeCharge.player + dt / 90);
      // 敌方 AI
      enemyAI(dt);
      // 相机贴边卷动
      edgePan(dt);
      // 胜负
      if (!hasBuilding('player', 'base')) { endGame(false); }
      else if (!hasBuilding('enemy', 'base')) { endGame(true); }
      // 分数:矿 + 击杀*10
      score = (oreP | 0) + kills * 10;
      if (frame % 30 === 0) emitScore();
    }

    function updateUnit(u) {
      u.cool = Math.max(0, u.cool - STEP);
      if (u.def.role === 'mine') { updateHarvester(u); return; }
      // 战斗单位
      if (u.cmd === 'attack' && u.target) {
        if (u.target.hp <= 0) { u.cmd = 'idle'; u.target = null; return; }
        var d = dist(u, u.target);
        if (d > u.def.range) {
          moveToward(u, u.target.x, u.target.y, STEP);
        } else if (u.cool <= 0) {
          fireBullet(u.x, u.y - 6, u.target, u.def.dmg, u.team); u.cool = u.def.cool;
        }
        // 自动索敌(若闲置或目标走远,自动打最近敌人)
      } else if (u.cmd === 'move') {
        if (dist(u, { x: u.tx, y: u.ty }) < 6) { u.cmd = 'idle'; }
        else moveToward(u, u.tx, u.ty, STEP);
        // 移动中遇敌自动反击(视野内)
        autoEngage(u);
      } else {
        autoEngage(u);
      }
    }
    function autoEngage(u) {
      if (u.cool > 0) return;
      var e = nearestEnemy(u.x, u.y, u.team, u.def.sight);
      if (e) { fireBullet(u.x, u.y - 6, e, u.def.dmg, u.team); u.cool = u.def.cool; }
    }
    function updateHarvester(u) {
      if (!u.mineTarget) {
        var m = nearestMine(u.x, u.y);
        if (m) { u.mineTarget = m; u.miningState = 'toMine'; }
        else return;
      }
      if (u.miningState === 'toMine') {
        if (dist(u, u.mineTarget) < u.mineTarget.r + 10) {
          u.miningState = 'mining'; u.cargo = 0; u.mineT = 0;
        } else moveToward(u, u.mineTarget.x, u.mineTarget.y, STEP);
      } else if (u.miningState === 'mining') {
        u.mineT += STEP;
        if (u.mineT > 1.5) { u.cargo = 50; u.miningState = 'toBase'; }
      } else { // toBase
        var ref = buildings.filter(function (b) { return b.team === u.team && b.kind === 'refinery' && !b.building; })[0];
        if (!ref) { u.miningState = 'toMine'; return; }
        if (dist(u, ref) < 70) {
          if (u.team === 'player') oreP += u.cargo; else oreE += u.cargo;
          u.cargo = 0; u.miningState = 'toMine';
        } else moveToward(u, ref.x, ref.y, STEP);
      }
    }
    function moveToward(u, x, y, dt) {
      var dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy) || 1;
      u.x += dx / d * u.def.speed * dt; u.y += dy / d * u.def.speed * dt;
      u.x = Math.max(8, Math.min(MAP_W - 8, u.x)); u.y = Math.max(8, Math.min(MAP_H - 8, u.y));
    }
    function separateUnits() {
      var us = units;
      for (var i = 0; i < us.length; i++) {
        for (var j = i + 1; j < us.length; j++) {
          var a = us[i], b = us[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
          var minD = 26;
          if (d > 0 && d < minD) {
            var push = (minD - d) / 2 * 0.5;
            a.x -= dx / d * push; a.y -= dy / d * push;
            b.x += dx / d * push; b.y += dy / d * push;
          }
        }
      }
    }
    function nearestEnemy(x, y, team, range) {
      var best = null, bd = range;
      for (var i = 0; i < units.length; i++) {
        var u = units[i];
        if (u.team === team || u.hp <= 0) continue;
        var d = Math.hypot(u.x - x, u.y - y);
        if (d < bd) { bd = d; best = u; }
      }
      for (var j = 0; j < buildings.length; j++) {
        var b = buildings[j];
        if (b.team === team || b.hp <= 0) continue;
        var d2 = Math.hypot(b.x - x, b.y - y);
        if (d2 < bd) { bd = d2; best = b; }
      }
      return best;
    }
    function nearestMine(x, y) {
      var best = null, bd = 1e9;
      mines.forEach(function (m) { var d = Math.hypot(m.x - x, m.y - y); if (d < bd) { bd = d; best = m; } });
      return best;
    }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function fireBullet(x, y, target, dmg, team) {
      bullets.push({ x: x, y: y, target: target, dmg: dmg, team: team, t: 2.0 });
    }
    function damage(obj, dmg, fromTeam) {
      obj.hp -= dmg;
      if (obj.hp <= 0) {
        obj.hp = 0;
        // 移除
        var idx;
        if ((idx = units.indexOf(obj)) >= 0) {
          units.splice(idx, 1);
          spark(obj.x, obj.y, '#ff4d4d', 16);
          if (fromTeam === 'player') kills++;
        } else if ((idx = buildings.indexOf(obj)) >= 0) {
          buildings.splice(idx, 1);
          spark(obj.x, obj.y, '#ff8800', 30);
          recomputePower(obj.team);
        }
      }
    }
    function spark(x, y, col, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 7, sp = 40 + Math.random() * 120;
        particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, color: col, r: 2 + Math.random() * 2 });
      }
    }

    // ---------- 战争迷雾 ----------
    function updateFog(dt) {
      // 每帧把玩家单位/建筑视野用 destination-out 擦开
      fogCtx.globalCompositeOperation = 'destination-out';
      fogCtx.fillStyle = 'rgba(0,0,0,1)';
      var ents = units.concat(buildings).filter(function (e) { return e.team === 'player'; });
      ents.forEach(function (e) {
        var def = e.def ? e.def : BUILDINGS[e.kind];
        var s = def ? def.sight : 100;
        var grad = fogCtx.createRadialGradient(e.x, e.y, 0, e.x, e.y, s);
        grad.addColorStop(0, 'rgba(0,0,0,1)');
        grad.addColorStop(0.7, 'rgba(0,0,0,0.7)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        fogCtx.fillStyle = grad;
        fogCtx.beginPath(); fogCtx.arc(e.x, e.y, s, 0, 7); fogCtx.fill();
      });
      fogCtx.globalCompositeOperation = 'source-over';
    }

    // ---------- 敌方 AI(简单,偏弱) ----------
    function enemyAI(dt) {
      enemyAItimer -= dt;
      // 经济:精炼厂<2 且有钱就造
      if (oreE >= 400 && buildings.filter(function (b) { return b.team === 'enemy' && b.kind === 'refinery'; }).length < 2) {
        tryBuild('enemy', 'refinery');
      }
      if (oreE >= 200 && buildings.filter(function (b) { return b.team === 'enemy' && b.kind === 'power'; }).length < 3) {
        tryBuild('enemy', 'power');
      }
      if (oreE >= 300 && !hasBuilding('enemy', 'barracks')) tryBuild('enemy', 'barracks');
      if (oreE >= 600 && !hasBuilding('enemy', 'warfactory')) tryBuild('enemy', 'warfactory');
      if (oreE >= 350 && !hasBuilding('enemy', 'turret') && hasBuilding('enemy', 'barracks')) tryBuild('enemy', 'turret');
      // 造兵(兵力上限低)
      if (countUnits('enemy') < 12) {
        if (hasBuilding('enemy', 'warfactory') && oreE >= 500) tryProduce('enemy', 'tank');
        else if (hasBuilding('enemy', 'barracks') && oreE >= 100) tryProduce('enemy', 'soldier');
      }
      // 进攻波次:每 ~50s 集结所有战斗单位冲玩家基地
      if (enemyAItimer <= 0) {
        enemyAIwave++;
        enemyAItimer = 50;
        var pbase = buildings.filter(function (b) { return b.team === 'player' && b.kind === 'base'; })[0];
        if (pbase) {
          units.filter(function (u) { return u.team === 'enemy' && u.def.role === 'atk'; }).forEach(function (u) {
            u.cmd = 'attack'; u.target = pbase; u.tx = pbase.x; u.ty = pbase.y;
          });
        }
      }
    }
    function tryBuild(team, kind) {
      if (!canBuild(team, kind)) return;
      var cost = BUILDINGS[kind].cost;
      if (team === 'enemy') { if (oreE < cost) return; oreE -= cost; } else { if (oreP < cost) return; oreP -= cost; }
      var base = buildings.filter(function (b) { return b.team === team && b.kind === 'base'; })[0];
      var sign = team === 'player' ? 1 : -1;
      var x = base.x + sign * (100 + Math.random() * 200);
      var y = base.y + (Math.random() * 240 - 120);
      x = Math.max(40, Math.min(MAP_W - 40, x)); y = Math.max(40, Math.min(MAP_H - 40, y));
      addBuilding(kind, team, x, y);
    }
    function tryProduce(team, kind) {
      if (!canProduce(team, kind)) return;
      var cost = UNITS[kind].cost;
      if (team === 'enemy') { if (oreE < cost) return; oreE -= cost; } else { if (oreP < cost) return; oreP -= cost; }
      prodQueue.push({ team: team, from: UNITS[kind].from, kind: kind, t: UNITS[kind].cost / 100 * 2 + 1, total: 0 });
    }

    // ---------- 玩家指令 ----------
    function cmdBuild(kind) {
      if (!canBuild('player', kind)) { toast('前置建筑未满足'); return; }
      if (oreP < BUILDINGS[kind].cost) { toast('矿石不足'); return; }
      buildMode = kind; nukeTargeting = false;
    }
    function cmdProduce(kind) {
      if (!canProduce('player', kind)) { toast('需要 ' + BUILDINGS[UNITS[kind].from].name); return; }
      if (oreP < UNITS[kind].cost) { toast('矿石不足'); return; }
      oreP -= UNITS[kind].cost;
      prodQueue.push({ team: 'player', from: UNITS[kind].from, kind: kind, t: UNITS[kind].cost / 100 * 2 + 1, total: 0 });
      toast(UNITS[kind].name + ' 生产中');
    }
    function placeBuilding(wx, wy) {
      var kind = buildMode;
      if (!kind) return;
      // 简单查重叠
      oreP -= BUILDINGS[kind].cost;
      addBuilding(kind, 'player', wx, wy);
      recomputePower('player');
      buildMode = null;
    }
    function commandUnits(wx, wy, isAttack) {
      if (selected.length === 0) return;
      if (isAttack) {
        // 找点击处敌人
        var tgt = pickEntity(wx, wy, 'enemy');
        selected.forEach(function (u) {
          u.cmd = tgt ? 'attack' : 'move'; u.target = tgt;
          u.tx = wx; u.ty = wy;
        });
      } else {
        // 编队散开
        var n = selected.length, cols = Math.ceil(Math.sqrt(n));
        selected.forEach(function (u, i) {
          u.cmd = 'move'; u.target = null;
          u.tx = wx + (i % cols) * 30 - cols * 15; u.ty = wy + Math.floor(i / cols) * 30 - cols * 15;
        });
      }
    }
    function pickEntity(wx, wy, team) {
      for (var i = 0; i < units.length; i++) { var u = units[i]; if ((!team || u.team === team) && Math.hypot(u.x - wx, u.y - wy) < 20) return u; }
      for (var j = 0; j < buildings.length; j++) { var b = buildings[j]; if ((!team || b.team === team) && Math.hypot(b.x - wx, b.y - wy) < 45) return b; }
      return null;
    }
    function launchNuke(wx, wy) {
      if (nukeCharge.player < 1) { toast('核弹尚未充能'); return; }
      nukeCharge.player = 0; nukeTargeting = false;
      // 落点范围伤害
      toast('☢️ 核弹发射!');
      var R = 220;
      units.forEach(function (u) { if (Math.hypot(u.x - wx, u.y - wy) < R) damage(u, 9999, 'player'); });
      buildings.forEach(function (b) { if (b.team !== 'player' && Math.hypot(b.x - wx, b.y - wy) < R) damage(b, 1500, 'player'); });
      // 大爆炸粒子
      for (var i = 0; i < 80; i++) { var a = Math.random() * 7, sp = 100 + Math.random() * 300; particles.push({ x: wx, y: wy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.2, color: i % 2 ? '#ff4d4d' : '#ffd54a', r: 4 }); }
    }

    // ---------- 相机 ----------
    function edgePan(dt) {
      var sp = 480 * dt;
      var m = mouse;
      var pad = 24;
      if (keys['w'] || keys['arrowup'] || (m && m.y < pad)) cam.y -= sp;
      if (keys['s'] || keys['arrowdown'] || (m && m.y > VH - pad)) cam.y += sp;
      if (keys['a'] || keys['arrowleft'] || (m && m.x < pad)) cam.x -= sp;
      if (keys['d'] || keys['arrowright'] || (m && m.x > VW - pad)) cam.x += sp;
      cam.x = Math.max(0, Math.min(MAP_W - VW, cam.x));
      cam.y = Math.max(0, Math.min(MAP_H - VH, cam.y));
    }
    function screenToWorld(sx, sy) { return { x: sx + cam.x, y: sy + cam.y }; }

    // ---------- 渲染 ----------
    function draw() {
      // 背景
      ctx.fillStyle = '#0a1410'; ctx.fillRect(0, 0, VW, VH);
      ctx.save();
      ctx.translate(-cam.x, -cam.y);
      // 地形网格
      drawTerrain();
      // 矿脉
      mines.forEach(drawMine);
      // 雾(在世界坐标)
      ctx.globalAlpha = 0.92;
      ctx.drawImage(fogCanvas, 0, 0);
      ctx.globalAlpha = 1;
      // 建筑
      buildings.forEach(drawBuilding);
      // 单位
      units.forEach(drawUnit);
      // 子弹
      bullets.forEach(function (bl) {
        ctx.fillStyle = TEAM_COLOR[bl.team]; ctx.shadowBlur = 8; ctx.shadowColor = TEAM_COLOR[bl.team];
        ctx.beginPath(); ctx.arc(bl.x, bl.y, 3, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      });
      // 粒子
      particles.forEach(function (p) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r); });
      ctx.globalAlpha = 1;
      // 框选
      if (isDragging && dragStart) {
        var x0 = Math.min(dragStart.x, mouse.x) + cam.x, y0 = Math.min(dragStart.y, mouse.y) + cam.y;
        var x1 = Math.max(dragStart.x, mouse.x) + cam.x, y1 = Math.max(dragStart.y, mouse.y) + cam.y;
        ctx.strokeStyle = '#3da9fc'; ctx.lineWidth = 1.5; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        ctx.fillStyle = 'rgba(61,169,252,0.1)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
      // 放置预览
      if (buildMode && mouse) {
        var w = screenToWorld(mouse.x, mouse.y);
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#3da9fc';
        ctx.fillRect(w.x - 30, w.y - 30, 60, 60); ctx.globalAlpha = 1;
        ctx.strokeStyle = '#3da9fc'; ctx.strokeRect(w.x - 30, w.y - 30, 60, 60);
      }
      // 核弹目标圈
      if (nukeTargeting && mouse) {
        var nw = screenToWorld(mouse.x, mouse.y);
        ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 2; ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.arc(nw.x, nw.y, 220, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
      }
      ctx.restore();
      // HUD
      drawHUD();
      drawMinimap();
    }
    function drawTerrain() {
      // 视口内画网格
      var x0 = cam.x, y0 = cam.y;
      ctx.strokeStyle = 'rgba(80,140,100,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = Math.floor(x0 / 40) * 40; x < x0 + VW; x += 40) { ctx.moveTo(x, y0); ctx.lineTo(x, y0 + VH); }
      for (var y = Math.floor(y0 / 40) * 40; y < y0 + VH; y += 40) { ctx.moveTo(x0, y); ctx.lineTo(x0 + VW, y); }
      ctx.stroke();
    }
    function drawMine(m) {
      ctx.save(); ctx.translate(m.x, m.y);
      var pulse = 0.7 + 0.3 * Math.sin(frame * 0.05);
      ctx.shadowBlur = 14; ctx.shadowColor = MINE_COLOR;
      ctx.fillStyle = MINE_COLOR; ctx.globalAlpha = pulse;
      for (var i = 0; i < 6; i++) { var a = i / 6 * 7; ctx.beginPath(); ctx.arc(Math.cos(a) * 20, Math.sin(a) * 15, 6, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      ctx.restore();
    }
    function drawBuilding(b) {
      var def = BUILDINGS[b.kind]; var col = TEAM_COLOR[b.team];
      // 视口裁剪
      if (b.x < cam.x - 60 || b.x > cam.x + VW + 60 || b.y < cam.y - 60 || b.y > cam.y + VH + 60) return;
      ctx.save(); ctx.translate(b.x, b.y);
      if (b.building) ctx.globalAlpha = 0.5;
      // 底座
      ctx.fillStyle = col; ctx.shadowBlur = 10; ctx.shadowColor = col;
      roundRect(-32, -32, 64, 64, 8); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(-32, -32, 64, 22, 8); ctx.fill();
      // 图标
      ctx.font = '30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, 0, 4);
      ctx.restore();
      // 血条
      if (b.hp < b.maxhp) drawBar(b.x, b.y - 42, b.hp / b.maxhp, 50);
      // 选中标记(己方建筑被选)
      // 建造进度
      if (b.building) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(b.x - 32, b.y + 22, 64, 6); ctx.fillStyle = '#3da9fc'; ctx.fillRect(b.x - 32, b.y + 22, 64 * (1 - b.t / def.build), 6); }
    }
    function drawUnit(u) {
      if (u.x < cam.x - 30 || u.x > cam.x + VW + 30 || u.y < cam.y - 30 || u.y > cam.y + VH + 30) return;
      var col = TEAM_COLOR[u.team]; var isSel = selected.indexOf(u) >= 0;
      ctx.save(); ctx.translate(u.x, u.y);
      // 阴影
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 8, 14, 5, 0, 0, 7); ctx.fill();
      // 选中圈
      if (isSel) { ctx.strokeStyle = '#3da9fc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 18, 0, 7); ctx.stroke(); ctx.lineWidth = 1; }
      ctx.shadowBlur = 6; ctx.shadowColor = col;
      ctx.fillStyle = col;
      if (u.def.role === 'mine') { roundRect(-12, -10, 24, 20, 4); ctx.fill(); }
      else if (u.kind === 'tank') { ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(-3, -16, 6, 12); }
      else if (u.kind === 'artillery') { ctx.fillRect(-10, -8, 20, 16); ctx.fillStyle = '#222'; ctx.fillRect(8, -3, 14, 6); }
      else { ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill(); }
      ctx.shadowBlur = 0;
      // 矿车载货
      if (u.cargo > 0) { ctx.fillStyle = MINE_COLOR; ctx.fillRect(-6, -4, 12, 4); }
      ctx.restore();
      if (u.hp < u.maxhp) drawBar(u.x, u.y - 16, u.hp / u.maxhp, 24);
    }
    function drawBar(x, y, pct, w) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - w / 2, y, w, 4);
      ctx.fillStyle = pct > 0.5 ? '#2ee6a6' : pct > 0.25 ? '#ffb627' : '#ff4d4d';
      ctx.fillRect(x - w / 2, y, w * pct, 4);
    }
    function roundRect(x, y, w, h, r) {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }

    // ---------- HUD ----------
    function drawHUD() {
      // 顶栏:矿石/电力/核弹
      ctx.fillStyle = 'rgba(6,9,18,0.85)'; roundRectH(8, 8, VW - 16, 44, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(124,58,237,0.3)'; roundRectH(8, 8, VW - 16, 44, 10); ctx.stroke();
      ctx.textBaseline = 'middle'; ctx.font = 'bold 16px Rajdhani';
      ctx.fillStyle = MINE_COLOR; ctx.textAlign = 'left'; ctx.fillText('💰 ' + (oreP | 0), 20, 30);
      ctx.fillStyle = powerP >= 0 ? '#2ee6a6' : '#ff4d4d'; ctx.fillText('⚡ ' + powerP, 130, 30);
      ctx.fillStyle = '#8b97b3'; ctx.fillText('🎯 击杀 ' + kills, 220, 30);
      if (hasBuilding('player', 'nuke')) {
        ctx.fillStyle = nukeCharge.player >= 1 ? '#ff4d4d' : '#8b97b3';
        ctx.fillText('☢️ 核弹 ' + Math.floor(nukeCharge.player * 100) + '%', 330, 30);
      }
      ctx.fillStyle = '#8b97b3'; ctx.textAlign = 'right';
      ctx.fillText('敌方基地 HP ' + (baseHp('enemy') | 0), VW - 20, 30);

      // 右侧建造面板
      drawBuildPanel();
      // 核弹按钮
      if (hasBuilding('player', 'nuke') && NUKE_ENABLED) {
        var ny = VH - 96;
        var ready = nukeCharge.player >= 1;
        ctx.fillStyle = ready ? 'rgba(255,77,77,0.3)' : 'rgba(6,9,18,0.7)';
        roundRectH(VW - 152, ny, 144, 40, 8); ctx.fill();
        ctx.strokeStyle = ready ? '#ff4d4d' : 'rgba(255,255,255,0.2)'; roundRectH(VW - 152, ny, 144, 40, 8); ctx.stroke();
        ctx.fillStyle = ready ? '#ff4d4d' : '#8b97b3'; ctx.textAlign = 'center'; ctx.font = 'bold 14px Rajdhani';
        ctx.fillText(nukeTargeting ? '点击地图落点' : (ready ? '☢️ 发射核弹' : '充能中 ' + Math.floor(nukeCharge.player * 100) + '%'), VW - 80, ny + 20);
      }
      // 提示
      ctx.fillStyle = '#5a6580'; ctx.textAlign = 'left'; ctx.font = '12px Rajdhani';
      ctx.fillText('左键框选·右键移动/攻击·WASD移视野', 12, VH - 14);
    }
    function baseHp(team) {
      var b = buildings.filter(function (x) { return x.team === team && x.kind === 'base'; })[0];
      return b ? b.hp : 0;
    }
    var PANEL_X, PANEL_W, PANEL_ITEMS;
    function drawBuildPanel() {
      // 建造面板:右下,分两列(建筑/单位)
      PANEL_X = VW - 152; PANEL_W = 144;
      var y0 = 64;
      ctx.fillStyle = 'rgba(6,9,18,0.8)'; roundRectH(PANEL_X, y0, PANEL_W, VH - 64 - 110, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(124,58,237,0.3)'; roundRectH(PANEL_X, y0, PANEL_W, VH - 64 - 110, 10); ctx.stroke();
      ctx.fillStyle = '#eaf0fb'; ctx.textAlign = 'center'; ctx.font = 'bold 12px Rajdhani';
      ctx.fillText('🏗 建造', PANEL_X + PANEL_W / 2, y0 + 14);
      var by = y0 + 24;
      var bkeys = ['power', 'refinery', 'barracks', 'warfactory', 'radar', 'turret'].concat(NUKE_ENABLED ? ['nuke'] : []);
      PANEL_ITEMS = [];
      bkeys.forEach(function (k, i) {
        drawPanelItem(k, 'building', PANEL_X + 8, by + i * 34, canBuild('player', k), oreP >= BUILDINGS[k].cost);
        PANEL_ITEMS.push({ type: 'building', kind: k, x: PANEL_X + 8, y: by + i * 34 });
      });
      // 单位
      var uy = by + bkeys.length * 34 + 8;
      ctx.fillStyle = '#eaf0fb'; ctx.fillText('⚔ 单位', PANEL_X + PANEL_W / 2, uy + 6); uy += 16;
      var ukeys = ['soldier', 'missile', 'tank', 'artillery'];
      ukeys.forEach(function (k, i) {
        drawPanelItem(k, 'unit', PANEL_X + 8, uy + i * 34, canProduce('player', k), oreP >= UNITS[k].cost);
        PANEL_ITEMS.push({ type: 'unit', kind: k, x: PANEL_X + 8, y: uy + i * 34 });
      });
    }
    function drawPanelItem(kind, type, x, y, avail, afford) {
      var def = type === 'building' ? BUILDINGS[kind] : UNITS[kind];
      var w = PANEL_W - 16, h = 30;
      ctx.fillStyle = avail ? 'rgba(61,169,252,0.08)' : 'rgba(255,255,255,0.03)';
      roundRectH(x, y, w, h, 6); ctx.fill();
      ctx.strokeStyle = avail ? (afford ? '#3da9fc' : 'rgba(255,179,39,0.4)') : 'rgba(255,255,255,0.08)';
      roundRectH(x, y, w, h, 6); ctx.stroke();
      ctx.globalAlpha = avail ? 1 : 0.4;
      ctx.font = '18px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(def.icon, x + 8, y + 15);
      ctx.fillStyle = '#eaf0fb'; ctx.font = 'bold 12px Rajdhani'; ctx.fillText(def.name, x + 34, y + 11);
      ctx.fillStyle = afford ? MINE_COLOR : '#ff4d4d'; ctx.font = '11px Rajdhani'; ctx.fillText('💰' + def.cost, x + 34, y + 22);
      ctx.globalAlpha = 1;
    }
    function roundRectH(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

    // ---------- 小地图 ----------
    function drawMinimap() {
      var mw = 160, mh = 100, mx = VW - mw - 12, my = VH - mh - 12;
      var sx = mw / MAP_W, sy = mh / MAP_H;
      ctx.fillStyle = 'rgba(6,9,18,0.85)'; roundRectH(mx - 4, my - 4, mw + 8, mh + 8, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(124,58,237,0.4)'; roundRectH(mx - 4, my - 4, mw + 8, mh + 8, 6); ctx.stroke();
      ctx.fillStyle = '#0a1f14'; ctx.fillRect(mx, my, mw, mh);
      // 矿
      ctx.fillStyle = MINE_COLOR; mines.forEach(function (m) { ctx.fillRect(mx + m.x * sx - 1, my + m.y * sy - 1, 2, 2); });
      // 建筑
      buildings.forEach(function (b) { if (fogVisible(b.x, b.y)) { ctx.fillStyle = TEAM_COLOR[b.team]; ctx.fillRect(mx + b.x * sx - 2, my + b.y * sy - 2, 4, 4); } });
      // 单位(玩家全显示,敌人仅雾内)
      units.forEach(function (u) { if (u.team === 'player' || fogVisible(u.x, u.y)) { ctx.fillStyle = TEAM_COLOR[u.team]; ctx.fillRect(mx + u.x * sx - 1, my + u.y * sy - 1, 2, 2); } });
      // 视口框
      ctx.strokeStyle = '#3da9fc'; ctx.lineWidth = 1; ctx.strokeRect(mx + cam.x * sx, my + cam.y * sy, VW * sx, VH * sy); ctx.lineWidth = 1;
    }
    function fogVisible(wx, wy) {
      // 查询雾 alpha:用 getImageData 太慢,简化为玩家视野内有单位/建筑则可见
      var vis = false;
      var ents = units.concat(buildings).filter(function (e) { return e.team === 'player'; });
      for (var i = 0; i < ents.length; i++) {
        var e = ents[i], def = e.def ? e.def : BUILDINGS[e.kind], s = def ? def.sight : 100;
        if (Math.hypot(e.x - wx, e.y - wy) < s) { vis = true; break; }
      }
      return vis;
    }

    function endGame(victory) {
      if (over) return;
      over = true; won = victory;
      if (victory) score += 3000 + Math.max(0, 2000 - (frame * STEP | 0));
      emitScore(); emitState('over');
      hooks.onGameOver && hooks.onGameOver(score | 0, 1);
    }

    // ---------- 输入 ----------
    function onDown(e) {
      e.preventDefault();
      var r = canvas.getBoundingClientRect();
      var sx = (e.clientX - r.left) * (VW / r.width), sy = (e.clientY - r.top) * (VH / r.height);
      mouse = { x: sx, y: sy };
      // 核弹目标选择
      if (nukeTargeting) { var w = screenToWorld(sx, sy); launchNuke(w.x, w.y); return; }
      // 点击建造面板
      if (PANEL_ITEMS && sx >= PANEL_X) {
        for (var i = 0; i < PANEL_ITEMS.length; i++) {
          var it = PANEL_ITEMS[i];
          if (sx >= it.x && sx <= it.x + PANEL_W - 16 && sy >= it.y && sy <= it.y + 30) {
            if (it.type === 'building') cmdBuild(it.kind); else cmdProduce(it.kind);
            return;
          }
        }
      }
      // 核弹按钮
      if (hasBuilding('player', 'nuke') && NUKE_ENABLED && sx >= VW - 152 && sy >= VH - 96 && sy <= VH - 56) {
        if (nukeCharge.player >= 1) { nukeTargeting = true; toast('点击地图选择核弹落点'); }
        return;
      }
      // 小地图点击跳转
      if (sx >= VW - 172 && sy >= VH - 112) {
        var mw = 160, mh = 100, mx = VW - mw - 12, my = VH - mh - 12;
        cam.x = (sx - mx) / (mw / MAP_W) - VW / 2; cam.y = (sy - my) / (mh / MAP_H) - VH / 2;
        cam.x = Math.max(0, Math.min(MAP_W - VW, cam.x)); cam.y = Math.max(0, Math.min(MAP_H - VH, cam.y));
        return;
      }
      // 右键 = 指令
      if (e.button === 2) {
        var w2 = screenToWorld(sx, sy);
        commandUnits(w2.x, w2.y, !!pickEntity(w2.x, w2.y, 'enemy'));
        return;
      }
      // 左键:建造模式放置
      if (buildMode) { var wp = screenToWorld(sx, sy); placeBuilding(wp.x, wp.y); return; }
      // 左键:开始框选
      dragStart = { x: sx, y: sy }; isDragging = true;
    }
    function onMove(e) {
      var r = canvas.getBoundingClientRect();
      mouse = { x: (e.clientX - r.left) * (VW / r.width), y: (e.clientY - r.top) * (VH / r.height) };
    }
    function onUp(e) {
      if (!isDragging) return;
      isDragging = false;
      var sx = mouse.x, sy = mouse.y;
      var x0 = Math.min(dragStart.x, sx) + cam.x, y0 = Math.min(dragStart.y, sy) + cam.y;
      var x1 = Math.max(dragStart.x, sx) + cam.x, y1 = Math.max(dragStart.y, sy) + cam.y;
      // 框选范围太小 = 单击选一个
      if (x1 - x0 < 6 && y1 - y0 < 6) {
        var ent = pickEntity(x0, y0, 'player');
        selected = ent ? [ent] : [];
      } else {
        selected = units.filter(function (u) {
          return u.team === 'player' && u.def.role === 'atk' && u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1;
        });
        // 若没选到战斗单位,尝试选己方建筑
        if (selected.length === 0) {
          var b = buildings.filter(function (bb) { return bb.team === 'player' && bb.x >= x0 && bb.x <= x1 && bb.y >= y0 && bb.y <= y1; });
          if (b.length) selected = [b[0]];
        }
      }
      dragStart = null;
    }
    function onKey(e) {
      var k = e.key.toLowerCase();
      keys[k] = (e.type === 'keydown');
      keys[e.key.toLowerCase()] = (e.type === 'keydown');
      if (e.type === 'keydown') {
        if (k === 'escape') { buildMode = null; nukeTargeting = false; selected = []; }
        if (k === ' ' && hasBuilding('player', 'nuke') && NUKE_ENABLED && nukeCharge.player >= 1) { nukeTargeting = !nukeTargeting; }
      }
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
    }
    function onContext(e) { e.preventDefault(); }
    function onTouch(e, type) {
      var t = e.touches[0] || e.changedTouches[0];
      var r = canvas.getBoundingClientRect();
      var fake = { clientX: t.clientX, clientY: t.clientY, button: 0, preventDefault: function () {} };
      if (type === 'down') { onDown(fake); e.preventDefault(); }
      else if (type === 'up') { onUp(fake); }
    }

    function toast(m) { if (window.IanToast) window.IanToast(m); }

    // ---------- 主循环(固定步长)----------
    function loop(ts) {
      if (!last) last = ts;
      var dt = (ts - last) / 1000; last = ts;
      if (dt > 0.1) dt = 0.1; // 钳制
      if (running && !over && !paused) {
        acc += dt;
        var max = 5;
        while (acc >= STEP && max-- > 0) { step(STEP); acc -= STEP; }
      }
      draw();
      rafId = requestAnimationFrame(loop);
    }
    function start() { reset(); running = true; paused = false; last = 0; acc = 0; }
    function pause() { paused = true; emitState('paused'); }
    function resume() { if (over) return; paused = false; emitState('playing'); }
    function destroy() {
      running = false; if (rafId) cancelAnimationFrame(rafId);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('contextmenu', onContext);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    }

    // 绑定
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    reset();
    running = false; rafId = requestAnimationFrame(loop);
    return { pause: pause, resume: resume, restart: start, destroy: destroy };
  }

  window.IanGame = { init: init };
})();
