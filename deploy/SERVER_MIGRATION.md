# 新服务器部署 / 迁移指南

> iangame.com 从零部署到一台全新的 Linux 服务器。全程约 15 分钟。
>
> 机密件(数据库、cloudflared 凭证、生产密钥)**不带过来,新机重新生成**:
> 当前无真实用户,数据库由 `_seed()` 自动重建;cloudflared 重走一次授权即可。

---

## 前置条件

- 一台干净的 Linux 服务器(Ubuntu 22.04 / Debian 12 推荐),**root 权限**
- Python 3.10+(实测 3.12.3)
- 域名 `iangame.com` 已在你的 Cloudflare 账号下
- GitHub 仓库 `JohnGump/iangame`(代码 + 完整 git 历史已推送)

## 架构一览

```
浏览器 ─HTTPS─> Cloudflare 边缘 ─tunnel─> cloudflared(本机)
                                          │
                                          ▼
                                  Nginx :80(静态直出 + 反代)
                                          │
                                          ▼
                                  Gunicorn :8000(Flask) ─> SQLite
```

本机**不暴露任何公网入站端口**,所有流量经 Cloudflare Tunnel 出站回源。

---

## 第 1 步:拉代码

⚠️ **路径必须严格一致**:必须 clone 到 `/usr/local/coneworkspace/iangame`。
systemd unit、nginx 配置、`deploy.sh` 的 `PROJECT_DIR` 全写死了这个路径。
改路径就得同步改三处配置。

```bash
# 若用 SSH 拉(需在新机生成 SSH key 加到 GitHub deploy keys,见下方说明)
git clone git@github.com:JohnGump/iangame.git /usr/local/coneworkspace/iangame

# 或用 HTTPS 拉(公开仓库可直接拉,无需 key)
git clone https://github.com/JohnGump/iangame.git /usr/local/coneworkspace/iangame

cd /usr/local/coneworkspace/iangame
```

### 若新机需要 push 权限(SSH 方式)
```bash
# 1. 新机生成 key
ssh-keygen -t ed25519 -C "iangame-<新机名>" -f /root/.ssh/id_ed25519 -N ""
cat /root/.ssh/id_ed25519.pub
# 2. 把输出加到 GitHub 仓库 Settings → Deploy keys(勾 Allow write access)
# 3. 测试
ssh -T git@github.com   # 应返回 "Hi JohnGump/iangame!"
```

---

## 第 2 步:一键部署应用(venv + 数据库 + nginx + systemd)

```bash
cd /usr/local/coneworkspace/iangame
bash deploy/deploy.sh
```

`deploy.sh` 是幂等的,会自动完成:
1. 建 Python venv + 装 `backend/requirements.txt`(Flask 3 / SQLAlchemy / Gunicorn / Werkzeug)
2. 初始化 SQLite → `_seed()` 自动灌入 **14 款游戏**(按 slug upsert)
3. 装 nginx + 拷贝站点配置(含 `nginx-security.conf` 安全头)
4. 装 `iangame.service`(自动生成随机 `IAN_SECRET_KEY`)+ 启动

### 验证应用起来了
```bash
systemctl status iangame                         # active (running)
curl -s http://127.0.0.1:8000/api/games | python3 -c "import sys,json;print(len(json.load(sys.stdin)['games']),'款游戏')"
# 应输出: 14 款游戏
curl -s http://127.0.0.1/healthz                 # ok
```

到这一步,应用已在本机 `127.0.0.1:80` 可访问,**但公网还进不来**——需要下一步配 Cloudflare Tunnel。

---

## 第 3 步:装 cloudflared 二进制

```bash
# 下载最新版(amd64;arm64 换 cloudflared-linux-arm64)
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -o /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared
cloudflared --version    # 确认可执行
```

> ⚠️ 二进制**必须放 `/usr/local/bin/`**。曾因放 `/tmp` 导致重启后被清空,tunnel 起不来。

---

## 第 4 步:授权 + 建 tunnel + 绑域名

```bash
# 4.1 授权(会打印一个 URL,浏览器打开,选 iangame.com zone 授权)
cloudflared tunnel login
# ⚠️ 一定选 iangame.com!别选错域名(曾误选 iannexus.com,排查很久)
# 成功后生成 /root/.cloudflared/cert.pem

# 4.2 建 tunnel
cloudflared tunnel create iangame
# 返回类似: Created tunnel iangame with id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# 同时生成凭证 /root/.cloudflared/<id>.json   ← 记下这个 id

# 4.3 把域名 DNS 指向这个 tunnel(CNAME,非 A 记录)
cloudflared tunnel route dns iangame iangame.com
cloudflared tunnel route dns iangame www.iangame.com   # 可选
```

### 4.4 写 tunnel 配置
把上一步的 tunnel id 填进去:
```bash
TUNNEL_ID=你刚才拿到的id
mkdir -p /etc/cloudflared
cat > /etc/cloudflared/config.yml <<EOF
tunnel: $TUNNEL_ID
credentials-file: /root/.cloudflared/$TUNNEL_ID.json
ingress:
  - hostname: iangame.com
    service: http://127.0.0.1:80
  - hostname: www.iangame.com
    service: http://127.0.0.1:80
  - service: http_status:404
EOF
```

### 4.5 装 systemd 服务(开机自启)
```bash
cat > /etc/systemd/system/cloudflared.service <<'EOF'
[Unit]
Description=cloudflared
After=network-online.target
Wants=network-online.target
[Service]
TimeoutStartSec=15
Type=notify
ExecStart=/usr/local/bin/cloudflared --no-autoupdate --config /etc/cloudflared/config.yml tunnel run
Restart=on-failure
RestartSec=5s
[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now cloudflared
sleep 3
systemctl status cloudflared          # active (running)
```

### 4.6 验证公网
```bash
# 等 CF 边缘同步(几秒~十几秒)
curl -sI https://iangame.com        # 期望 200 + server: cloudflare
curl -s https://iangame.com/api/games | python3 -c "import sys,json;print(len(json.load(sys.stdin)['games']),'款')"
```

🎉 至此 `https://iangame.com` 已上线。

---

## 第 5 步(可选):确认防火墙

Cloudflare Tunnel 是**出站连接**,本机无需开放任何入站端口。
建议确认入站只留 SSH(22),其余全关:

```bash
ufw status                          # 若启用了 ufw
# nginx 的 80 / 443 无需对公网开放,因为流量走 tunnel 到 127.0.0.1
```

---

## 常见问题排查

| 现象 | 排查 |
|---|---|
| `curl https://iangame.com` 不通 / 502 | `systemctl status cloudflared` 是否 active;`/root/.cloudflared/<id>.json` 是否存在且与 config.yml 里 `credentials-file` 路径一致 |
| 502 但 tunnel 正常 | iangame 服务挂了:`systemctl status iangame`、`journalctl -u iangame -f` |
| `nginx -t` 报错找不到 nginx-security.conf | 重跑 `deploy/deploy.sh`(已修复会自动拷贝);或手动 `cp deploy/nginx-security.conf /etc/nginx/sites-available/` |
| 游戏数量不对 | 删 `data/iangame.db` 后 `systemctl restart iangame`,`_seed()` 会重建 14 款 |
| `tunnel login` 选错域名 | `mv /root/.cloudflared/cert.pem /root/.cloudflared/cert.pem.bak` 后重新 `cloudflared tunnel login` |
| 页面样式/JS 没更新 | Cloudflare 缓存:浏览器 Ctrl+F5;或在 CF 仪表盘 Purge Cache。本机 nginx 已配 `no-cache` 回源校验 |

---

## 迁移后可选优化

- **Tunnel 凭证备份**:把 `/root/.cloudflared/<id>.json` 和 `cert.pem` 存到安全的密码管理器,下次迁移就不用重走授权。
- **数据库备份**:`data/iangame.db` 定期 `cp` 或加 cron:`0 3 * * * cp /usr/local/coneworkspace/iangame/data/iangame.db /backup/iangame-$(date +\%F).db`
- **监控**:`deploy/deploy.sh` 末尾的验证逻辑可抽成 healthcheck 脚本接 Uptime Robot。
- **拆二级域名**:starfall(星陨防线)游戏单文件自包含,可整体拎出做 `td.iangame.com` 独立站,只需 `game.js` + 一个 canvas 页面。

---

## 相关文档

- [`../README.md`](../README.md) — 项目总览
- [`../PRD.md`](../PRD.md) — 产品需求与技术设计
- [`../DEVELOPMENT.md`](../DEVELOPMENT.md) — 开发规范与游戏接入契约(后续开发必读)
- [`../CHANGELOG.md`](../CHANGELOG.md) — 变更记录
- [`DEPLOY_TUNNEL.md`](./DEPLOY_TUNNEL.md) — tunnel 日常运维与灾难恢复
