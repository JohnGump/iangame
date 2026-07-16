#!/usr/bin/env bash
# iangame.com 一键部署脚本
# 用法:bash deploy/deploy.sh
# 幂等:可重复执行,已安装的组件会跳过
set -euo pipefail

PROJECT_DIR="/usr/local/coneworkspace/iangame"
cd "$PROJECT_DIR"

c_ok()   { echo -e "  \033[32m✓\033[0m $1"; }
c_info() { echo -e "  \033[36m→\033[0m $1"; }
c_warn() { echo -e "  \033[33m!\033[0m $1"; }

echo "🚀 部署 iangame.com ..."
echo ""

# ---------- 1. Python 虚拟环境 + 依赖 ----------
c_info "检查 Python 虚拟环境"
if [ ! -d "venv" ]; then
  python3 -m venv venv
  c_ok "创建 venv"
fi
c_info "安装/更新依赖"
./venv/bin/pip install -q --upgrade pip
./venv/bin/pip install -q -r backend/requirements.txt
c_ok "依赖就绪"

# ---------- 2. 初始化数据库 ----------
c_info "初始化数据库"
./venv/bin/python -c "
import sys; sys.path.insert(0, 'backend')
from app import create_app
create_app()
print('  数据库就绪,种子已灌入')
"

# ---------- 3. Nginx ----------
if ! command -v nginx >/dev/null 2>&1; then
  c_info "安装 Nginx"
  apt-get update -qq && apt-get install -y -qq nginx
  c_ok "Nginx 已安装"
else
  c_ok "Nginx 已存在"
fi

c_info "配置 Nginx 站点"
cp deploy/nginx.conf /etc/nginx/sites-available/iangame
# 安全头配置(主配置里 include 引用,必须一并拷贝,否则 nginx -t 失败)
cp deploy/nginx-security.conf /etc/nginx/sites-available/nginx-security.conf
ln -sf /etc/nginx/sites-available/iangame /etc/nginx/sites-enabled/iangame
# 移除默认站点避免抢占 80 端口
rm -f /etc/nginx/sites-enabled/default
if nginx -t 2>/dev/null; then
  systemctl reload nginx || systemctl restart nginx
  c_ok "Nginx 配置生效"
else
  c_warn "nginx -t 校验失败,请检查 /etc/nginx/sites-available/iangame"
  nginx -t
  exit 1
fi

# ---------- 4. systemd 服务 ----------
c_info "配置 systemd 服务"
cp deploy/iangame.service /etc/systemd/system/iangame.service
# 若密钥仍是占位符,生成一个随机密钥
if grep -q "CHANGE_ME_TO_A_LONG_RANDOM_STRING" /etc/systemd/system/iangame.service; then
  SECRET=$(./venv/bin/python -c "import secrets; print(secrets.token_hex(32))")
  sed -i "s/CHANGE_ME_TO_A_LONG_RANDOM_STRING/$SECRET/" /etc/systemd/system/iangame.service
  c_ok "已生成随机 SECRET_KEY"
fi
systemctl daemon-reload
systemctl enable iangame >/dev/null 2>&1 || true
systemctl restart iangame
sleep 2
c_ok "iangame 服务已启动"

# ---------- 5. 验证 ----------
echo ""
echo "🔍 验证 ..."
if curl -sf -o /dev/null http://127.0.0.1:8000/api/games; then
  c_ok "Gunicorn 后端 (8000) 正常"
else
  c_warn "后端 8000 未响应,检查: journalctl -u iangame -f"
fi
if curl -sf -o /dev/null http://127.0.0.1/healthz; then
  c_ok "Nginx (80) 健康检查通过"
else
  c_warn "Nginx 80 未响应"
fi
GAME_COUNT=$(curl -s http://127.0.0.1/api/games | python3 -c "import sys,json;print(len(json.load(sys.stdin)['games']))" 2>/dev/null || echo 0)
if [ "$GAME_COUNT" -ge 12 ] 2>/dev/null; then
  c_ok "游戏数量验证通过: ${GAME_COUNT} 款"
else
  c_warn "游戏数量异常: $GAME_COUNT(期望 ≥12)"
fi

echo ""
echo "✅ 部署完成!"
echo "   本机访问:  curl -H 'Host: iangame.com' http://127.0.0.1/"
echo "   公网访问:  将 iangame.com 的 A 记录指向本机公网 IP,即可 http://iangame.com"
echo "   服务状态:  systemctl status iangame"
echo "   实时日志:  journalctl -u iangame -f"
