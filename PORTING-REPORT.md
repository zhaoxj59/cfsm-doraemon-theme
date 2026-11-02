# CFSM Doraemon Probe — 移植报告

## 已完成

- 替换原项目 API 数据层：`/api/config`、`/api/servers`、`/api/server`、`/api/history/all`。
- 将 CFSM 字符串 UUID 映射到原主题 `Client` / `NodeStatus` 模型。
- 适配 CPU、内存、Swap、磁盘、网速、累计/当月流量、系统负载、GPU、进程、TCP/UDP、到期信息、国家地区和在线状态。
- 将 CT/CU/CM/BGP 与 Node 1–4 映射为最多八条延迟线路。
- 适配 CFSM `batchUpdate` WebSocket 协议；首页订阅服务器 ID 列表，详情页使用单服务器订阅。
- 路由切换为 CFSM 要求的 hash 路由：`/#/` 与 `/#/server/:id`。
- 适配 JWT Bearer（`localStorage.jwt_token`）和 Turnstile 验证凭证缓存。
- 把主题自带哆啦A梦插画和地图数据放进 `/assets/`；OS 图标与旗帜改用 CFSM 默认资源路径。
- 页脚改为 `Powered by CF-Server-Monitor`。
- 添加 GitHub Actions 工作流：推送 `main` 后自动构建并发布静态主题文件到 `build` 分支。

## 检查结果

- `hub.ts`、`rpc.ts`、`api.ts`、`turnstile.ts` 的 TypeScript 适配层检查通过。
- 使用模拟 CFSM `/api/servers` 数据进行字段转换测试通过（UUID、国家旗帜、CPU、内存、在线状态、Ping、流量配额）。
- 当前运行环境无法完成 `npm install`（依赖安装请求超时），因此本次没有在沙箱内生成最终 Vite `dist/`，也没有完成浏览器端端到端测试。仓库内已加入自动构建工作流；推送到 GitHub 后会在 Actions 中执行真实构建。

## 已知平台差异

- 原主题的访客 IP、拓扑、供应商地理信息、部分财务与原平台专属工具没有 CFSM 完全等价的公开 API，可能隐藏或降级。
- CFSM 的主题配置从 `/api/config.theme_options` 读取；当前版本保留原主题默认配置，但不绕过 CFSM JWT 认证写入主题选项。
- CFSM 的历史 API 上限为 7 天；匿名访问最多 24 小时。
