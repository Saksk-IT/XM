# XM 微信小程序

`apps/miniprogram` 是 XM 的原生微信小程序管理端，复用 Fastify API 和共享 TypeScript 契约。

## 本地配置

`.env` 中配置微信小程序服务端参数：

```bash
WECHAT_MINIPROGRAM_APP_ID="wxe797661da01b0e17"
WECHAT_MINIPROGRAM_APP_SECRET="替换为微信公众平台中的当前密钥"
```

不要把 AppSecret 写入源码、文档或提交记录。若密钥曾在聊天、截图或日志中出现，应在微信公众平台重置后再写入本机 `.env`。

## 启动

先启动 XM API：

```bash
docker compose up -d postgres
pnpm db:push
pnpm db:seed
pnpm dev
```

本地小程序默认请求 `http://127.0.0.1:4000`。微信开发者工具本地调试时，需要在详情里开启“不校验合法域名、web-view 域名、TLS 版本以及 HTTPS 证书”。

## 微信开发者工具

打开路径：

```text
apps/miniprogram
```

项目配置中的 `miniprogramRoot` 已指向 `miniprogram/`，开发者工具会读取 `project.config.json`。

## 架构约定

小程序端按长期扩展拆分为四层：

- `core`: 应用配置、会话存储、请求封装和登录失效处理。
- `services`: 面向后端 API 的 typed client，页面不直接拼接接口细节。
- `domain`: 项目、任务、清单等领域视图模型和标签、日期、筛选规则。
- `pages`: 只负责页面状态、用户交互和调用 service/domain。

新增功能优先复用 `services/xmApi.ts` 和 `domain/projectView.ts` 的模式。不要在页面里重复写请求头、token 处理、状态标签映射或日期格式化。

## 真机预览

真机预览不能直接访问本机 `127.0.0.1`。需要先部署 API 到 HTTPS 域名，并在微信公众平台配置 request 合法域名，然后把小程序 `app.ts` 中的 `apiBaseUrl` 改为对应 HTTPS 地址。

## 验证

```bash
pnpm --filter @xm/miniprogram typecheck
pnpm --filter @xm/miniprogram test
```
