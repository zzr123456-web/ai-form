# AGENTS.md — AI 辅助论坛项目规则（项目级）

> 通用规则（语言/注释/抽象/React 编码/Tailwind/Git/流程等）已整理为全局规则，见 [GLOBAL_RULES.md](./GLOBAL_RULES.md)。
> 本文件仅定义**本项目特定**的约束，与全局规则配合使用。

---

## 一、技术栈与框架约束

### 1.1 核心技术栈（禁止随意替换）
- **框架**：React 18（函数组件 + Hooks，不使用 Class 组件）
- **构建工具**：Vite 5
- **路由**：React Router DOM v6（`<Routes>` + `<Route>`，不使用 v5 语法）
- **样式方案**：Tailwind CSS 3 + 独立 CSS 文件（混合使用）
- **语言**：JavaScript (JSX)，**不引入 TypeScript**

### 1.2 新增依赖策略
- 新增 npm 包前必须**审慎评估必要性**，优先使用原生能力或已有依赖实现。
- UI 组件库：本项目采用手写 CSS/Tailwind，**不引入 Ant Design、Material UI 等重量级组件库**。
- 如需引入新依赖，应在回复中明确告知用户并说明理由。

### 1.3 浏览器兼容
- 目标浏览器：现代浏览器（Chrome / Edge / Safari / Firefox 最新两个主版本）。
- 可安全使用 ES2022 语法、IntersectionObserver、CSS Grid、Container Queries 等现代特性。

---

## 二、项目结构与文件组织

### 2.1 目录约定
```
src/
├── pages/                  # 页面级组件（路由直接引用），命名 XxxPage.jsx
│   └── ai-forum/           # 论坛页面
│       ├── ForumHomePage.jsx
│       ├── BoardsPage.jsx
│       ├── PostDetailPage.jsx
│       ├── PostEditorPage.jsx
│       ├── QaPage.jsx
│       ├── SearchPage.jsx
│       ├── ProfilePage.jsx
│       ├── NotificationsPage.jsx
│       ├── LoginPage.jsx
│       └── admin/          # 后台页面
├── styles/                 # 独立 CSS 文件
│   └── ai-forum.css        # 论坛全局样式（CSS 变量 + 主题）
├── components/             # 可复用子组件
│   └── ai-forum/
│       ├── AuthProvider.jsx
│       ├── admin/          # 后台专用组件
│       ├── common/         # 通用组件
│       └── layout/         # 布局组件
├── hooks/                  # 自定义 Hook（按需创建），命名 useXxx.js
├── utils/                  # 纯函数工具
│   └── ai-forum/
│       ├── aiForumUtils.js
│       └── mockData.js
├── App.jsx                 # 路由入口，仅负责 Routes 配置
├── main.jsx                # 应用挂载入口
└── index.css               # Tailwind 指令 + 全局重置

docs/                       # 文档资源
├── requirements/           # 需求文档（PRD、信息架构等）
├── prototype/              # 高保真原型
└── specs/                  # 规格文档
```

### 2.2 命名规范
| 类型 | 规则 | 示例 |
|------|------|------|
| 组件文件 | PascalCase + 后缀描述 | `ForumHomePage.jsx`、`AdminStatCard.jsx` |
| 工具/Hook 文件 | camelCase | `aiForumUtils.js`、`useAuth.js` |
| 组件函数 | PascalCase（默认导出） | `export default function ForumHomePage()` |
| 自定义 Hook | `use` 前缀 + camelCase | `useAuth`、`usePagination` |
| 变量/函数 | camelCase，语义化 | `handleCreatePost`、`formatDate` |
| 常量 | UPPER_SNAKE_CASE（顶层） | `POSTS_PER_PAGE`、`MOCK_USERS` |
| CSS 类 | kebab-case（独立 CSS） | `.af-header`、`.post-card` |
| Tailwind 自定义项 | 见 tailwind.config.js | `af-primary`、`border` |

### 2.3 导入导出规范
- 每个组件文件**默认导出**一个主组件，不使用命名导出作为主入口。
- 导入路径：组件内部使用**相对路径**，避免配置 alias（除非项目已统一配置）。
- 导入顺序（从上至下）：
  1. React 核心（`import React, { useState, useEffect } from 'react'`）
  2. 第三方库（`import { Link, useNavigate } from 'react-router-dom'`）
  3. 相对路径的 CSS 文件
  4. 相对路径的组件/工具

---

## 三、路由约定

- 路由配置集中在 `src/App.jsx`，不分散到各页面。
- 页面间跳转使用 `<Link to="...">`，避免 `<a href>` 导致整页刷新（锚点链接除外）。
- 论坛统一路由前缀：`/forum/*`（前台）、`/forum/admin/*`（后台）。
- 新增页面时：在 `src/pages/ai-forum/` 创建 `XxxPage.jsx` → 在 `App.jsx` 的 `<ForumLayout>` 或 `<AdminLayout>` 下添加 `<Route>`。

---

## 四、Tailwind 主题与语义 Token

论坛主题采用**语义化 CSS 变量**驱动，通过 `ai-forum.css` 中的 `:root` / `.light` / `.dark` 定义具体色值，`tailwind.config.js` 仅做变量映射。新增样式时**优先复用**以下语义 Token，禁止硬编码 hex 值：

### 4.1 语义 Token
- **基础色**：`background`、`foreground`、`card`、`popover`
- **品牌色**：`primary`、`secondary`、`afmuted`
- **边框/输入**：`border`、`input`、`ring`
- **状态色**：`success`、`warning`、`error`、`info`（各有 `.bg` 背景变体）

### 4.2 字体族
- `font-af-sans`（Inter + Noto Sans SC）
- `font-af-mono`（JetBrains Mono）

### 4.3 圆角与阴影
- 圆角：`rounded-af-sm` / `af-md` / `af-lg` / `af-xl` / `af-2xl`
- 阴影：`shadow-af-1` / `af-2` / `af-3`

### 4.4 动画
- 已定义：`animate-af-blink`（流式光标闪烁）
- 新增动画须在 `tailwind.config.js` 的 `keyframes` + `animation` 中注册。

### 4.5 响应式断点
- 优先使用 `max-[600px]` / `md:` / `lg:`，至少适配桌面（>1024）、平板（768-1024）、手机（<600）。

---

## 五、设计约定

- 论坛整体风格遵循「AI 辅助社区」设计语言：轻量、清新、信息密度适中。
- 支持 light / dark 双主题，通过 `.light` / `.dark` 类切换。
- 所有通用组件必须考虑在两种主题下的可读性。
- 样式方案选择、独立 CSS 规范、动画性能等通用约束见全局规则 §六。

---

## 六、认证与权限

- 登录状态通过 `<AuthProvider>` 统一管理（含 Mock 数据持久化）。
- 需要登录的操作（发帖、评论、点赞、个人中心、后台）必须经过 `AuthProvider` 校验。
- 未登录用户使用论坛前台时，5 分钟后触发「游客浏览倒计时」提示登录（见 `GuestBanner` 组件）。
- 后台路由（`/forum/admin/*`）必须校验管理员身份。

---

## 七、本地持久化

- 使用 `localStorage` 时注意：
  - 读写包裹 try/catch（隐私模式可能抛错）。
  - JSON.parse 提供默认值兜底。
  - Key 命名加项目前缀，如 `af_auth_state`、`af_mock_posts`。

---

## 八、构建与部署

### 8.1 脚本命令
- 开发：`npm run dev`（Vite 开发服务器，端口 5174，自动打开浏览器）
- 构建：`npm run build`（输出到 `dist/`，不生成 sourcemap，React 依赖拆分为独立 chunk）
- 预览：`npm run preview`

### 8.2 修改配置的约束
- `vite.config.js` 的 `manualChunks` 拆分策略已优化，新增大型依赖时按需扩展。
- `tailwind.config.js` 新增主题项须经评估，避免与现有语义 Token 冲突。
- `.gitignore` 已忽略 `node_modules/`、`dist/`、`.env*`，新增忽略项需说明。

---

## 九、Git 工作流与自动推送

### 9.1 远程仓库
- **远程仓库地址**：`https://github.com/zzr123456-web/ai-form.git`
- **远程名称**：`origin`
- **主分支**：`main`（本地分支应与远程主分支保持一致）

### 9.2 自动推送规则（强制执行）
- **每次开发任务完成后，必须自动执行以下操作**：
  1. 将本次变更涉及的文件加入暂存区（`git add <具体文件>`，避免使用 `git add .` 以防误纳入敏感文件）。
  2. 创建一次提交，提交信息遵循约定式提交规范（`feat:` / `fix:` / `refactor:` / `chore:` / `docs:` 等前缀），简明描述本次变更内容。
  3. 推送到 GitHub 主分支：`git push origin main`。
- **无需等待用户额外指示**：开发任务一旦完成并自检通过，即应主动提交并推送，确保远程仓库与本地保持同步。
- **推送失败处理**：若推送因远程已有新提交而失败，应先执行 `git pull --rebase origin main` 再重新推送，**禁止使用 `git push --force`**。

### 9.3 提交信息规范
- 使用中文或中英混合，前缀采用英文约定式提交：
  - `feat: 新增 xxx 功能`
  - `fix: 修复 xxx 问题`
  - `refactor: 重构 xxx 逻辑`
  - `chore: 构建/配置/依赖调整`
  - `docs: 文档更新`
- 单次提交应聚焦于一个完整的工作单元，避免「大杂烩」式提交。

### 9.4 分支策略
- 日常开发在 `main` 分支进行，不创建长期存在的开发分支。
- 如需进行大型重构或实验性功能，可临时创建 `feature/xxx` 分支，完成后合并回 `main` 并推送。

---

*本文件为项目级规则，与全局规则配合生效。修改后建议开启新对话以避免历史上下文与新规则冲突。*
