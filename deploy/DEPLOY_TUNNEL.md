# Cloudflare Tunnel 部署(iangame.com 线上入口)

线上 `https://iangame.com` 走 **Cloudflare Tunnel**,不走传统 DNS+公网 IP。
本机**不暴露任何入站公网端口**,安全性最高。

## 架构

```
用户 ──HTTPS──> Cloudflare 边缘(SIN等节点)
                    │  (CF 自动管理 SSL 证书)
                    ▼  出站隧道(QUIC)
              cloudflared 进程(本机)
                    │
                    ▼
              Nginx :80 (静态直出 + 反代)
                    │
                    ▼
              Gunicorn :8000 (Flask) → SQLite
```

## 关键组件位置

| 组件 | 位置 |
|---|---|
| cloudflared 二进制 | `/tmp/cloudflared`(或装为系统命令) |
| tunnel 凭证 | `/root/.cloudflared/c82aa525-9938-4c4c-a010-ba889c154c24.json` |
| origin 证书(授权) | `/root/.cloudflared/cert.pem`(绑 iangame.com zone) |
| tunnel 配置 | `/root/.cloudflared/config.yml` |
| systemd 服务 | `cloudflared.service`(由 `cloudflared service install` 生成) |

## tunnel 配置(`/root/.cloudflared/config.yml`)

```yaml
tunnel: c82aa525-9938-4c4c-a010-ba889c154c24
credentials-file: /root/.cloudflared/c82aa525-9938-4c4c-a010-ba889c154c24.json
ingress:
  - hostname: iangame.com
    service: http://127.0.0.1:80
  - hostname: www.iangame.com
    service: http://127.0.0.1:80
  - service: http_status:404
```

## 运维命令

```bash
# 状态 / 日志
systemctl status cloudflared
journalctl -u cloudflared -f

# 重启 tunnel
systemctl restart cloudflared

# 重新授权(换账号或 zone 时)
mv /root/.cloudflared/cert.pem /root/.cloudflared/cert.pem.bak
/tmp/cloudflared tunnel login   # 浏览器选 iangame.com zone

# 新建/删除 tunnel
/tmp/cloudflared tunnel list
/tmp/cloudflared tunnel delete iangame   # 会要求先断开连接
```

## 注意事项

- **SSL 模式**:CF 侧默认 Full 即可。tunnel 段是 CF→cloudflared,由 CF 管理,
  不需要在本机配 Let's Encrypt 证书。
- **cloudflared 二进制**目前在 `/tmp`,**机器重启后 /tmp 会清空**。
  建议把二进制移到持久位置:`mv /tmp/cloudflared /usr/local/bin/`,
  并更新 `cloudflared.service` 里的 ExecStart 路径。
- **tunnel 与 Nginx 解耦**:tunnel 只负责把 iangame.com 流量送到本机 80,
  Nginx 负责 static 直出 + 反代 Gunicorn。任一环节挂掉都会 502。

## 重建 tunnel(灾难恢复)

如需完全重建:
```bash
/tmp/cloudflared tunnel login           # 授权 iangame.com
/tmp/cloudflared tunnel create iangame  # 新 tunnel(注意更新 config.yml 里的 id)
/tmp/cloudflared tunnel route dns iangame iangame.com
/tmp/cloudflared tunnel run iangame
```
