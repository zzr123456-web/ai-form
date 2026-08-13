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
