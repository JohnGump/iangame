# 变更记录 · iangame

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 风格。

## [0.3.0] - 2026-06-23
### Added
- 新增塔防「星陨防线 Starfall Defense」(slug `starfall`):太空科幻路径塔防,7 关递进战役
  - 5 种炮塔(光子/震荡/凝冰/雷电/天基)各具特色与克制关系,每塔可升 3 级、可卖出
  - 6 种敌人(侦察/战斗/重甲/疾行/修复/Boss),含护甲克制与治疗机制
  - 三难度(简单/普通/困难)调节起始金币/生命与敌血敌速;Tab 倍速、1-5 快捷建塔
  - 伪 3D 塔体三面着色、霓虹路带、粒子/冲击波/震屏/浮动伤害字等精致特效
  - 单文件自包含,后续可整体拎出做二级域名独立站
### Changed
- `_seed()` 改为按 slug upsert 缺失游戏:已有库可补种新游戏,无需删库重建
- `deploy.sh` 游戏数量验证改为 `≥12`,避免每次加游戏即失效
- 模板游戏计数改为动态(`all_games|length`),首页标题/描述不再写死

## [0.1.0] - 2026-06-19 · 首版上线
### Added
- 深色霓虹电竞风游戏门户(Flask + 原生JS/Canvas + SQLite + Nginx + Gunicorn + systemd)
- 12 款游戏:PvZ 塔防、拳皇格斗、贪吃蛇、俄罗斯方块、2048、打砖块、扫雷、五子棋、像素小鸟、飞机大战、坦克大战、记忆翻牌
- 登录注册(宽松)+ 云端记分 + 全球排行榜 + 收藏;游客免登录可玩全部
- 统一游戏接口契约 `window.IanGame`,12 款游戏自包含、可独立替换
- 一键部署脚本 `deploy/deploy.sh`(venv + 建库 + nginx + systemd + 验证)
- 开发规范 `DEVELOPMENT.md`、产品需求 `PRD.md`,便于后续 session 接手

### Fixed
- config 兼容裸路径与完整 URI 两种 IAN_DB 输入(修复 systemd 启动报 SQLAlchemy URL 解析失败)
- 坦克大战:死亡后无法重开 / 出生点被困 / 基地被自弹摧毁
- 俄罗斯方块:旋转/硬降键盘未门控游戏状态
- PvZ:波次模型不闭环导致通关瞬间跳关
- 拳皇:攻击手臂高度死表达式
- 4 款游戏改固定逻辑步长,修复高刷新率显示器下加速

## [Unreleased]
- (空)
