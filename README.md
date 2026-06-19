# iangame.com

深色霓虹电竞风的 HTML5 小游戏聚合站,12 款游戏免登录即玩。

> **上手必读**:[`DEVELOPMENT.md`](./DEVELOPMENT.md) · [`PRD.md`](./PRD.md)

## 快速启动(开发)
```bash
cd /usr/local/coneworkspace/iangame
python3 -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt
cd backend && python app.py          # http://127.0.0.1:5000
```

## 生产部署
```bash
bash deploy/deploy.sh               # 一键:venv + gunicorn + nginx + systemd
```
详见 [`deploy/`](./deploy/)。

## 技术栈
Flask 3 · SQLite · 原生 JS/Canvas · Gunicorn · Nginx · systemd

## 目录
- `backend/` Flask 应用与 API
- `templates/` Jinja2 模板
- `static/` CSS / 站点 JS / 12 款游戏
- `deploy/` 部署配置
- `PRD.md` 产品需求与技术设计
- `DEVELOPMENT.md` 开发与 Git 规范
