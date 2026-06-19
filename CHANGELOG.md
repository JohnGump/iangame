# 变更记录 · iangame

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 风格。

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
