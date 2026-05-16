# embyProxy

一个基于 `snippets.js` 的 Emby/Jellyfin 反向代理 Worker / Snippets 脚本，支持多上游别名访问、响应 URL 重写、流媒体直通与动态上游签名代理。

## 功能概览

- 多上游别名代理：通过 `BACKENDS` 配置多个上游，按别名访问。
- 请求头转发与规范化：自动处理 `x-forwarded-*`、授权头、`origin/referer` 等。
- CORS 支持：自动响应代理路径下的 `OPTIONS` 预检。
- 流媒体优化：对流媒体内容走直通响应，降低起播延迟。
- 响应重写：自动重写 `Location`、`Content-Location`、`Refresh`、`Set-Cookie` 以及 JSON/文本中的 API 路径与 URL。
- 动态上游签名：对动态代理路径附加并校验 HMAC 签名参数，降低滥用风险。
- 缓存策略：静态资源短期缓存；认证、会话、播放等敏感接口强制 `no-store`。

## 文件说明

- `snippets.js`：核心 Worker 逻辑与配置入口。
- `LICENSE`：项目许可证（AGPL-3.0-or-later）。

## 配置

编辑 `snippets.js` 顶部 `CONFIG`：

- `PUBLIC_ORIGIN`：你的反代公网域名（例如 `https://emby.example.com`）。
- `PROXY_PREFIX`：代理前缀（默认 `/emby`）。
- `SIGNING_SECRET`：动态代理签名密钥（必须改成随机字符串）。
- `SIGNING_TTL_SECONDS`：签名有效期（秒）。
- `SIGNING_CLOCK_SKEW_SECONDS`：时钟偏移容忍（秒）。
- `BACKENDS`：上游映射（`alias -> upstream`）。

示例（节选）：

```js
BACKENDS: {
  example: {
    upstream: "https://emby.example.com/emby"
  },
  example2: {
    upstream: "https://emby2.example.com/emby"
  }
}
```

## 访问方式

假设：

- `PUBLIC_ORIGIN = https://emby.your-domain.com`
- `PROXY_PREFIX = /emby`
- 别名为 `example`

则客户端地址为：

```text
https://emby.your-domain.com/emby/example
```

多上游时按别名区分：

```text
https://emby.your-domain.com/emby/example2
```

## 部署建议（Cloudflare Workers）

1. 在 Cloudflare Workers 创建 Worker。
2. 将 `snippets.js` 内容粘贴为 Worker 脚本。
3. 按需修改 `CONFIG`（尤其是 `PUBLIC_ORIGIN`、`SIGNING_SECRET`、`BACKENDS`）。
4. 绑定自定义域名并验证访问。

## 安全建议

- `SIGNING_SECRET` 不要留空，且请使用高强度随机字符串。
- 仅添加可信上游到 `BACKENDS`。
- 建议配合 Cloudflare 防火墙规则限制异常访问。

## License

本项目采用 **GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)**。

这意味着：如果你修改了本项目并进行分发，或以网络服务方式提供修改版，应按 AGPL 要求公开对应源码。
