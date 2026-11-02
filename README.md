# CFSM Doraemon Probe

哆啦A梦探针主题的 CF-Server-Monitor 适配移植版。尽量保留原主题首页、节点卡片、晴空/夜空背景、地图、竹蜻蜓加载动画、四次元口袋与任意门彩蛋，并将数据层适配到 CF-Server-Monitor。

## 目标平台

- CF-Server-Monitor 第三方主题
- 路由：`/#/`、`/#/server/:id`
- REST：`/api/config`、`/api/servers`、`/api/server?id=...`、`/api/history/all?id=...`
- WebSocket：`/api/ws?subscribe=all` 或单服务器订阅
- 主题配置：读取 `/api/config` 的 `theme_options`

## 构建

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run build
```

构建产物在 `dist/`，目录结构必须是：

```text
dist/
├── index.html
└── assets/
    ├── *.js
    ├── *.css
    ├── images/doraemon/
    └── data/world-countries.geojson
```

CFSM 只代理主题根目录的 `index.html` 与 `assets/`。请将 `dist/` **内部的内容**发布到独立 GitHub 仓库的根目录，或放入主题仓库的子目录。

## 安装到 CF-Server-Monitor

1. 创建一个 GitHub 仓库，例如 `cfsm-doraemon-theme`。
2. 将本项目完整源码上传到仓库的 `main` 分支。
3. 在仓库的 Actions 页面等待 `Build and publish CFSM theme` 工作流成功；它会自动把 `dist/` 内部的 `index.html` 和 `assets/` 发布到 `build` 分支。
4. 在 CF-Server-Monitor 管理后台打开「主题商店」或「外观设置」，将主题地址设置为：

   `https://github.com/<你的用户名>/cfsm-doraemon-theme/tree/build`

   也可以改用某个固定 commit SHA 锁定版本。
5. 保存后访问首页。详情页使用 `/#/server/<server-id>`。

## 适配说明

- 原主题内部 `Client` / `NodeStatus` 数据结构仍由适配层生成，尽量不改动原始 Vue 页面和可视组件。
- CFSM 的 UUID 字符串 ID 已适配；页面路由改为 hash 模式。
- 首页从 `/api/servers` 读取；详情页直接请求 `/api/server?id=`，避免详情页拉取整站服务器。
- WebSocket 订阅按首页 ID 列表或详情页单服务器执行，并处理 `batchUpdate` 增量帧。
- 历史数据从 `/api/history/all` 转换为主题图表数据。
- 登录 JWT 从 CFSM 文档约定的 `localStorage.jwt_token` 读取并随 REST 请求发送；同源 WebSocket 使用 `cfsm_auth` Cookie。
- 主题配置读取 `/api/config.theme_options`；默认值保留在主题包中。CFSM 的第三方主题配置写入需要管理 JWT，本版本不绕过认证写入。站点启用 Turnstile 时会显示 Cloudflare 验证组件，并缓存 55 分钟的已验证凭证。
- CFSM 的探测线路与原主题的探针任务模型不同，当前把 CT/CU/CM/BGP 及 Node 1–4 映射为最多八条线路；不支持的原始指标会显示为空，不会伪造数据。
- 访客 IP、IP 地理位置、CPU 资料查询等可选功能会访问原主题使用的第三方服务；若 CFSM 的 CSP 阻止这些请求，可在管理后台按需添加相应 `csp_api` / `csp_static` 来源，或关闭对应功能。
- OS 图标与国家旗帜使用 CFSM 提供的 `/os-icons/`、`/flags/` 资源；哆啦A梦插画与地图 GeoJSON 打包在 `assets/`。

## 已知差异

原主题部分功能依赖原平台独有的访客资料、拓扑、供应商元数据、完整财务字段及可写主题设置 API。CFSM 没有完全等价的公开数据接口，因此这些部分可能降级显示或不可用；监控核心数据、实时推送、历史图表、首页/详情页视觉和主题彩蛋是本移植的主要目标。

## 致谢与许可

本项目基于 dongbo501 的 `minimalist-probe-doraemon-theme` 进行适配移植，原项目采用 MIT License。保留原作者及原项目署名；哆啦A梦相关形象与名称仍归其权利人所有。本移植为非官方第三方主题。
