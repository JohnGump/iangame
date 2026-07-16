# Cloudflare Tunnel 部署(iangame.com 线上入口)

线上 `https://iangame.com` 走 **Cloudflare Tunnel**,不走传统 DNS+公网 IP。
本机**不暴露任何入站公网端口**,安全性最高。

> 新机器从零部署,看 [`SERVER_MIGRATION.md`](./SERVER_MIGRATION.md) 主流程;本文档讲 tunnel 运维与灾难恢复。

## 架构

```
用户 ──HTTPS──> Cloudflare 边缘(SIN等节点)
                    │  (CF 自动管理 SSL 证书)
                    ▼  出站隧道(QUIC)
              cloudflared 进程(本机, /usr/local/bin/cloudflared)
                    │
                    ▼
              Nginx :80 (静态直出 + 反代)
                    │
                    ▼
              Gunicorn :8000 (Flask) → SQLite
```

## 关键组件位置(迁移后)

| 组件 | 位置 | 说明 |
|---|---|---|
| cloudflared 二进制 | `/usr/local/bin/cloudflared` | **持久路径**,不要放 /tmp(重启清空) |
| tunnel 凭证 json | `/root/.cloudflared/<tunnel-id>.json` | 新机 `tunnel create` 后生成,id 会变 |
| origin 证书(授权) | `/root/.cloudflared/cert.pem` | `tunnel login` 后生成,绑 iangame.com zone |
| tunnel 配置 | `/root/.cloudflared/config.yml` 或 `/etc/cloudflared/config.yml` | ingress 规则 |
| systemd 服务 | `cloudflared.service` | ExecStart 指向 `/usr/local/bin/cloudflared` |

> ⚠️ 迁移到新机器后,**tunnel id 会变**(新机重新 `tunnel create`)。下方示例里的
> `c82aa525-...` 是旧机器的 id,仅作格式参考,新机以实际 `tunnel list` 输出为准。

## tunnel 配置示例(`/etc/cloudflared/config.yml` 或 `/root/.cloudflared/config.yml`)

```yaml
tunnel: <你的新 tunnel-id>
credentials-file: /root/.cloudflared/<你的新 tunnel-id>.json
ingress:
  - hostname: iangame.com
    service: http://127.0.0.1:80
  - hostname: www.iangame.com
    service: http://127.0.0.1:80
  - service: http_status:404   # 兜底
```

## 运维命令

```bash
# 状态 / 日志
systemctl status cloudflared
journalctl -u cloudflared -f

# 重启 tunnel
systemctl restart cloudflared

# 重新授权(换账号或选错 zone 时)
mv /root/.cloudflared/cert.pem /root/.cloudflared/cert.pem.bak
cloudflared tunnel login          # 浏览器务必选 iangame.com zone!

# 列出 / 删除 tunnel
cloudflared tunnel list
cloudflared tunnel delete iangame  # 先断开连接才能删
```

## 注意事项

- **SSL 模式**:CF 侧默认 Full 即可。tunnel 段是 CF→cloudflared,由 CF 管理,
  **不需要**在本机配 Let's Encrypt 证书。
- **cloudflared 二进制必须在持久路径**(`/usr/local/bin/`)。曾因放 `/tmp` 导致重启后丢失,
  已修正。新机安装时务必 `mv` 到持久路径或用包管理器装。
- **tunnel 与 Nginx 解耦**:tunnel 只负责把 iangame.com 流量送到本机 80,
  Nginx 负责 static 直出 + 反代 Gunicorn。任一环节挂掉都会 502。
- **登录授权时务必选对 zone**:`tunnel login` 会列出账号下所有域名,选 **iangame.com**,
  不要选成其他域名(曾误选 iannexus.com,排查了很久)。

## 重建 tunnel(灾难恢复 / 新机部署)

完全重建(新机或凭证损坏):
```bash
cloudflared tunnel login             # 1. 授权 iangame.com
cloudflared tunnel create iangame    # 2. 建 tunnel(记下返回的 id)
cloudflared tunnel route dns iangame iangame.com   # 3. 绑 DNS
# 4. 写 config.yml(把上面的 id 填进 tunnel: 和 credentials-file:)
# 5. 装 systemd 服务:
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
# 6. 等 CF 边缘同步(几秒),验证:
curl -sI https://iangame.com        # 应 200 + CF 头
```
