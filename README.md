# embyProxy

一个基于 `snippets.js` 的 Emby/Jellyfin 反向代理脚本，支持多上游别名访问、响应 URL 重写、流媒体直通与动态上游签名代理。推荐优先部署到 **Cloudflare Snippets**（常见场景下请求额度更宽松、链路更稳定）。

## 功能概览

- 多上游别名代理：通过 `BACKENDS` 配置多个上游，按别名访问。
- 请求头转发与规范化：自动处理 `x-forwarded-*`、授权头、`origin/referer` 等。
- CORS 支持：自动响应代理路径下的 `OPTIONS` 预检。
- 流媒体优化：对流媒体内容走直通响应，降低起播延迟。
- 响应重写：自动重写 `Location`、`Content-Location`、`Refresh`、`Set-Cookie` 以及 JSON/文本中的 API 路径与 URL。
- 动态上游签名：对动态代理路径附加并校验 HMAC 签名参数，降低滥用风险。
- 缓存策略：静态资源短期缓存；认证、会话、播放等敏感接口强制 `no-store`。

## 新版本改进（相对旧版）

- 路径规范化更完整：统一处理重复前缀、上游 basePath 与 API 基础路径。
- URL 重写范围更广：覆盖 `Location`/`Content-Location`/`Refresh`、JSON 与文本内 URL。
- 动态上游签名链路完善：签名生成、时间窗校验、抗时序比对（timing-safe compare）。
- 流媒体链路优化：非文本流媒体优先直通，降低首包等待。
- Header/CORS 与缓存控制更细化：转发头、暴露头和敏感接口缓存策略更明确。

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

## 部署建议（优先 Cloudflare Snippets）

### 方案 A：Cloudflare Snippets（推荐）

推荐理由：在当前常见用法下，Snippets 对请求量限制更宽松，且挂载在规则链路中，通常比独立 Worker 路由更稳（以 Cloudflare 当期产品策略为准）。

1. 在 Cloudflare 控制台进入 **Rules -> Snippets**，创建 Snippet。
2. 将 `snippets.js` 内容粘贴并保存发布。
3. 在对应域名的规则中绑定该 Snippet（按你的站点路由生效）。
4. 修改 `CONFIG`（尤其是 `PUBLIC_ORIGIN`、`SIGNING_SECRET`、`BACKENDS`）。
5. 用 `https://你的域名/emby/别名` 验证连通。

### 方案 B：Cloudflare Workers（备选）

1. 在 Cloudflare Workers 创建 Worker。
2. 将 `snippets.js` 内容粘贴为 Worker 脚本并发布。
3. 绑定自定义域名/路由。
4. 修改 `CONFIG`（尤其是 `PUBLIC_ORIGIN`、`SIGNING_SECRET`、`BACKENDS`）。
5. 验证访问。

## 安全建议

- `SIGNING_SECRET` 不要留空，且请使用高强度随机字符串。
- 仅添加可信上游到 `BACKENDS`。
- 建议配合 Cloudflare 防火墙规则限制异常访问。

## License

本项目采用 **GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)**。

这意味着：如果你修改了本项目并进行分发，或以网络服务方式提供修改版，应按 AGPL 要求公开对应源码。
