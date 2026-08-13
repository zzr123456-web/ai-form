# AI 辅助论坛社区

一个基于 React 18 + Vite 5 + Tailwind CSS 3 构建的「AI 辅助社区」论坛项目，支持前台社区互动与后台运营管理双端，内置 light / dark 双主题。

## 技术栈

- **框架**：React 18（函数组件 + Hooks）
- **构建**：Vite 5
- **路由**：React Router DOM v6
- **样式**：Tailwind CSS 3 + 独立 CSS 文件（语义化 CSS 变量驱动主题）
- **图标**：lucide-react
- **语言**：JavaScript (JSX)

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器（端口 5174，自动打开浏览器）
npm run dev

# 生产构建（输出到 dist/）
npm run build

# 预览构建产物
npm run preview
```

## 项目结构

```
ai-forum-project/
├── src/
│   ├── pages/ai-forum/          # 前台页面（首页、版块、帖子详情、编辑器、问答、搜索、个人中心、通知、登录）
│   │   └── admin/               # 后台页面（仪表盘、内容审核、用户管理、版块管理、举报处理、运营配置）
│   ├── components/ai-forum/
│   │   ├── AuthProvider.jsx     # 认证上下文
│   │   ├── admin/               # 后台专用组件
│   │   ├── common/              # 通用组件（Avatar / Badges / Pagination 等）
│   │   └── layout/              # 布局组件（ForumHeader / ForumLayout / AdminLayout 等）
│   ├── styles/ai-forum.css      # 论坛全局样式与主题变量
│   ├── utils/ai-forum/          # 工具函数与 Mock 数据
│   ├── App.jsx                  # 路由配置入口
│   ├── main.jsx                 # 应用挂载入口
│   └── index.css                # Tailwind 指令 + 全局重置
├── docs/                        # 需求文档、高保真原型、规格文档
├── scripts/                     # 辅助脚本（数据库初始化、翻译检查等）
├── tailwind.config.js           # Tailwind 主题配置（语义 Token 映射）
├── vite.config.js               # Vite 构建配置
└── package.json
```

## 路由约定

- 前台统一前缀：`/forum/*`
- 后台统一前缀：`/forum/admin/*`
- 根路径 `/` 自动重定向到 `/forum`

## 主题系统

论坛主题采用语义化 CSS 变量驱动，在 `src/styles/ai-forum.css` 中通过 `:root` / `.light` / `.dark` 定义色值，`tailwind.config.js` 仅做变量映射，支持 light / dark 双主题切换。

## 文档

- 需求文档：`docs/requirements/`
- 高保真原型：`docs/prototype/`
- 规格文档：`docs/specs/`

## 开发规则

详见 [AGENTS.md](./AGENTS.md) 与 [GLOBAL_RULES.md](./GLOBAL_RULES.md)。

## 部署指南（Zeabur）

### 3.1 环境变量

部署前需在 Zeabur 控制台配置以下 4 个必需环境变量：

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `DEEPSEEK_API_KEY` | DeepSeek AI 接口密钥，用于 AI 问答与内容生成辅助 | `<your-deepseek-api-key>`（示例：`sk-xxxx`，在 Zeabur 控制台填入真实值） |
| `JWT_SECRET` | JWT 签名密钥，建议使用 32 位以上随机字符串 | `<自行生成随机字符串，建议 32+ 位>` |
| `DATABASE_URL` | PostgreSQL 数据库连接串（需带 SSL） | `postgresql://<username>:<password>@<host>:<port>/<dbname>?sslmode=require` |
| `REDIS_URL` | Redis 缓存连接串（用于访客计时、会话与限流） | `redis://:<password>@<host>:<port>/0` |

**完整变量示例（复制后按需修改占位符）：**
```
DEEPSEEK_API_KEY=<your-deepseek-api-key>
JWT_SECRET=<自行生成随机字符串，建议 32+ 位>
DATABASE_URL=postgresql://<username>:<password>@<host>:<port>/<dbname>?sslmode=require
REDIS_URL=redis://:<password>@<host>:<port>/0
```

> ⚠️ **严禁把真实 KEY 写进仓库任何文件**（公开仓库 GitHub Push Protection 会直接阻止推送）。本仓库的示例值已统一用占位符，真实 Key 请**仅在 Zeabur 控制台手动配置**。

### 3.2 部署流程

**Step 1：推送代码触发自动部署**
- 将代码推送到 GitHub `main` 分支。
- Zeabur 会自动检测仓库并读取项目根目录的 `zbpack.json`，按其中定义的命令执行：
  - `build_command`: `npm run build`（构建前端产物到 `dist/`）
  - `start_command`: `npm start`（启动 Node 服务端，同时托管前端静态资源与后端 API）

**Step 2：配置环境变量并重启服务**
- 进入 Zeabur 控制台 → 选择已部署的服务 → **环境变量** 标签页。
- 按上方 **3.1 环境变量** 表格填入 4 个变量，点击「保存」。
- 保存后 Zeabur 会自动重启服务，或手动点击「重启」按钮使变量生效。

### 3.3 数据库迁移（首次部署/更新表结构后必跑）

首次部署或每次更新数据库表结构后，需按以下顺序在 Zeabur 控制台 → **Command / Shell** 面板中依次执行（每条执行无报错再进入下一条）：

```bash
npm run db:init       # 首次部署：初始化所有表（若已初始化过，幂等不报错，可跳过或仍执行）
npm run db:seed       # 首次部署：填充种子用户/版块/话题（若已填充过可跳过）
npm run db:migrate-users      # 补全 users 表新增列 email/created_at/updated_at
npm run db:migrate-interactions # 点赞/收藏/评论点赞 3 张关联表
npm run db:migrate-phase1     # 访客计时 guest_sessions + AI 用量日志 ai_usage_logs
npm run db:update-users       # 补全历史用户 email 和默认密码（如果迁移后注册/登录仍报缺列问题）
```

> **说明**：所有迁移脚本内部均采用 `CREATE ... IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 写法，重复执行无副作用，可安全多次运行。

### 3.4 上线后自检清单（4 条必验证）

服务启动并配置完成后，请依次验证以下 4 项，确保部署完全正常：

1. **AI 接口健康检查**：
   ```bash
   curl https://你的域名/api/forum/ai/health
   ```
   预期返回：`{"ok":true,"model":"deepseek-chat","ping":true}`

2. **访客计时接口检查**：
   ```bash
   curl https://你的域名/api/forum/guest/start -X POST
   ```
   预期返回 JSON 中 `remainingSeconds ≈ 300`（即 5 分钟访客窗口）。

3. **访客强制认证遮罩**：
   - 使用无痕浏览器打开网站，**不登录**状态下连续浏览约 5 分钟。
   - 预期出现强制认证遮罩（弹窗/全屏覆盖层），提示用户登录后继续使用。

4. **用户互动数据链路**：
   - 登录后依次操作：**发帖 → 评论 → 收藏**。
   - 进入「个人主页」，检查：发帖数、收藏数、评论数三项指标均 **+1** 且数据同步更新。
