# AI 辅助论坛 · Phase0 社区基础骨架 - 实施计划（任务分解与优先级）

## [x] Task 1：全局认证计时与 AuthProvider 完善
- **Priority**: high
- **Depends On**: None
- **Description**：
  - 校对并完善 `AuthProvider.jsx` 中的 `GUEST_LIMIT_SECONDS=300` / `GUEST_REMIND_SECONDS=270` 阈值与状态迁移逻辑（active → expiring → expired）。
  - 确保 `guestStatus='expired'` 时 `closeAuthModal` 被禁用（无关闭按钮/遮罩不消失）。
  - 确保 `login()` 调用时同步重置 `guestElapsed=0`、关闭 banner、关闭 modal。
  - 新增 `redirectAfterLogin` 字段，支持登录后跳回来源页（从 URL query `?from=` 读取）。
  - 所有 localStorage 读写保持 try/catch 兜底。
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-9
- **Test Requirements**：
  - `programmatic` TR-1.1：未登录状态下，guestElapsed 每秒递增 1，270 秒时 showGuestBanner 变为 true，300 秒时 authModal.open=true 且 reason 包含「5 分钟」。
  - `programmatic` TR-1.2：guestStatus='expired' 时调用 closeAuthModal()，authModal.open 仍为 true（不被关闭）。
  - `programmatic` TR-1.3：调用 login() 后 user !== null、guestElapsed===0、showGuestBanner===false、authModal.open===false；刷新页面后 user 仍保持。
  - `programmatic` TR-1.4：未登录调用 requireAuth('发帖需要登录') → 返回 false 且 authModal.reason='发帖需要登录'；已登录调用 requireAuth 传入 callback → callback 执行且返回 true。
  - `human-judgement` TR-1.5：在浏览器控制台或直接改代码将阈值调小（如 REMIND=5 / LIMIT=10），肉眼确认横幅和阻断弹窗的出现时机与样式。
- **Notes**：当前 AuthProvider 骨架已较完整，主要是边缘 case 打磨与 redirect 支持。

---

## [x] Task 2：前台 ForumLayout 全局布局（导航栏、底栏、GuestBanner 注入）
- **Priority**: high
- **Depends On**: Task 1
- **Description**：
  - 完善 `ForumLayout.jsx`：顶部导航栏包含 Logo（点击回首页）、搜索框占位、发帖按钮（点击走 requireAuth → 跳转 /forum/editor）、通知铃铛占位、用户头像下拉（登录状态）/ 登录入口（未登录状态展示剩余时间）。
  - 将 `GuestBanner.jsx` 注入到 ForumLayout 顶部（showGuestBanner=true 时渲染）。
  - 全局挂载 `AuthModal.jsx`（从 authModal 状态驱动渲染，已登录状态下不展示）。
  - 底栏 `ForumFooter.jsx`：版权信息、导航链接、社区规则占位。
  - 响应式：<768px 时导航栏简化元素（隐藏搜索框展开为图标，发帖按钮缩为图标）；<600px 布局单列。
- **Acceptance Criteria Addressed**: AC-2, AC-11
- **Test Requirements**：
  - `programmatic` TR-2.1：点击「发帖」按钮，未登录时 requireAuth 返回 false 并弹出 authModal；已登录时 navigate('/forum/editor')。
  - `programmatic` TR-2.2：顶栏 Logo → navigate('/forum')；头像下拉中的「个人主页」→ navigate('/forum/profile')；「退出登录」→ 调用 logout。
  - `human-judgement` TR-2.3：桌面 1280px、平板 900px、手机 420px 三档宽度截屏确认导航栏无溢出、无错行、点击区域可交互。
  - `human-judgement` TR-2.4：GuestBanner 出现时位于导航栏下方、内容主体上方，关闭按钮可点击且立即消失。
- **Notes**：当前 ForumHeader/ForumFooter/GuestBanner 组件已存在文件，主要补齐样式与事件绑定。

---

## [x] Task 3：首页 ForumHomePage 推荐流、排序、侧栏完善
- **Priority**: high
- **Depends On**: Task 2
- **Description**：
  - 校验「最新 / 热门 / 关注」排序实现：`sort='latest'` 按 createdAt 倒序；`sort='hot'` 按 likes 降序；`sort='follow'` 未登录 → requireAuth 拦截，已登录 → 取 posts 的关注流 mock（当前 `slice(0,3)` 可保留）。
  - 帖子卡片字段完整性：标题、summary 2 行截断、Avatar + nickname、版块名、≤2 个 tag pill、点赞 Heart + 数字、评论 MessageSquare + 数字、formatRelativeTime 相对时间。
  - 点击卡片整体 → navigate(`/forum/post/${post.id}`)。
  - 右侧三栏：AI 推荐（Sparkles 图标 + 3 条文字，点击跳转 /forum/search）；热门话题（Flame 图标 + 8 个标签 pill，#t.name 样式）；版块快捷入口（5 个版块 + postCount）。
  - 响应式：<1024px 左右栏合并为单列（侧栏降至底部）。
- **Acceptance Criteria Addressed**: AC-4, AC-11
- **Test Requirements**：
  - `programmatic` TR-3.1：sort='latest' 下第 1 条帖子 createdAt 时间戳最大；sort='hot' 下第 1 条 likes 最大。
  - `programmatic` TR-3.2：未登录点击「关注」排序 → authModal 打开；已登录则不拦截。
  - `human-judgement` TR-3.3：卡片 hover 有高亮过渡动画；summary 第 3 行出现省略号；标签在窄屏不折行乱版。
- **Notes**：当前 ForumHomePage 骨架已较完整，主要校对字段、响应式、关注流拦截。

---

## [x] Task 4：版块列表页 BoardsPage 版块导航与筛选
- **Priority**: high
- **Depends On**: Task 2
- **Description**：
  - 顶部版块导航区：8 个版块卡片，展示名称、描述、todayPosts（今日新帖徽标）、postCount、followers；治理模式通过颜色或边框区分（quality_first/safety_first/loose）。
  - 筛选控件：版块筛选下拉（全部/单版块）、标签筛选（多选）、排序控件（最新/热门/优质，优质按 qualityScore 降序）。
  - 帖子列表区：复用首页卡片样式但去掉作者头像右侧标签数量限制为 2。
  - 未登录可浏览基础列表；「发帖」按钮未登录走 requireAuth → 跳转 /forum/editor。
- **Acceptance Criteria Addressed**: AC-5, AC-11
- **Test Requirements**：
  - `programmatic` TR-4.1：选择版块 b1（AI 开发实践）后，帖子列表每条 boardId === 'b1'。
  - `programmatic` TR-4.2：排序=优质时，列表第 1 条帖子 qualityScore 最高。
  - `human-judgement` TR-4.3：治理模式在版块卡上有视觉区分（如 safety_first 带红色小标识）；版块导航在 <768px 折为两列网格。
- **Notes**：需要检查现有 BoardsPage 文件，按上述规格补齐缺失部分。

---

## [x] Task 5：帖子详情页 PostDetailPage 正文、评论楼中楼、互动工具栏
- **Priority**: high
- **Depends On**: Task 1, Task 2
- **Description**：
  - URL 参数 `:id` 从 posts 中查帖子，不存在时展示 EmptyState 空状态。
  - 正文区：标题（xl font-semibold）、作者信息卡（Avatar + nickname + 版块 + 时间）、标签行、正文 HTML（mockData 已含 `<p><h3><ul>` 等标记，用 div dangerouslySetInnerHTML 或自建简单 HTML 解析渲染；考虑到 Phase0 规模，可采用 `dangerouslySetInnerHTML` 但必须 **仅对 mockData 受控来源** 使用）。
  - AI 摘要占位区：卡片样式展示 `aiSummary` 字段（Sparkles 图标 + 「AI 总结」标题），为 Phase2 做准备。
  - 互动工具栏：Heart（点赞，本地状态切换 + 数字 ±1）、Star（收藏，requireAuth 拦截）、Flag（举报入口，占位）、Share（分享占位按钮）。
  - 评论区：顶层评论按 comments[post.id] 渲染，每条评论含作者、内容、点赞、回复按钮；嵌套 replies 缩进展示（最多 2 层）；回复输入框占位（未登录 requireAuth 拦截）。
  - 相关推荐侧栏：取当前帖子标签同标签的其他帖子 3-5 条，可点击跳转。
- **Acceptance Criteria Addressed**: AC-6, AC-2
- **Test Requirements**：
  - `programmatic` TR-5.1：访问 /forum/post/p1 → 标题正确、正文包含「已尝试方案」；访问 /forum/post/不存在id → 展示 EmptyState。
  - `programmatic` TR-5.2：p1 评论区 c1 存在且其 replies 渲染了 c1r1/c1r2 两条回复，样式有缩进。
  - `programmatic` TR-5.3：未登录点击「收藏」Star → requireAuth 返回 false 并弹认证窗；已登录点击 → 本地收藏态切换（视觉变化）。
  - `human-judgement` TR-5.4：正文排版层级清晰（h3 段落缩进合适）；楼中楼视觉层级可辨；相关推荐侧栏在窄屏移到下方。
- **Notes**：dangerouslySetInnerHTML 仅限 mockData 可信来源。

---

## [x] Task 6：发帖编辑器 PostEditorPage 登录校验、表单、发布跳转
- **Priority**: high
- **Depends On**: Task 1
- **Description**：
  - 进入页面时未登录：navigate('/forum/login?from=editor', { replace: true })。
  - 页面布局：左 2/3 为编辑器（标题 input、正文 textarea、版块 select 下拉、标签选择器 chips，可多选）；右 1/3 为 AI 助手占位面板（Sparkles 标题 + 「AI 助手面板（Phase2 上线）」占位说明 + 静态建议展示，字段从 aiEditorSuggestions 读取展示）。
  - 发布按钮：标题或正文为空时 disabled 并占位提示；否则创建新 Post 对象（id=`new_${Date.now()}`、authorId=currentUser.id、createdAt=new Date().toISOString()、status='published'），将其临时写入 mockData posts 数组或本地状态，然后 navigate(`/forum/post/${newId}`)。
  - 预览按钮（可选）：弹窗展示当前草稿的渲染效果。
  - 响应式：<768px 改为上下两栏布局（编辑器上 / AI 占位下）。
- **Acceptance Criteria Addressed**: AC-7, AC-14, AC-15, AC-16, AC-17
- **Test Requirements**：
  - `programmatic` TR-6.1：未登录直接访问 /forum/editor → 当前路由变为 /forum/login 且 URL 含 from=editor。
  - `programmatic` TR-6.2：标题 + 正文都填写 → 点发布后，路由跳转到 /forum/post/new_xxx，新帖内容匹配；标题为空 → 点发布无反应（按钮 disabled 或点击不跳转）。
  - `human-judgement` TR-6.3：AI 占位面板样式完整（与左侧编辑器同高，卡片化），标签 chips 可多选并正确回显。
- **Notes**：

---

## [x] Task 7：个人主页 ProfilePage 资料卡、Tab 切换、列表
- **Priority**: medium
- **Depends On**: Task 1, Task 2
- **Description**：
  - 资料卡：Avatar（大号）、nickname、handle @、profession + city、joinedAt、bio、关注按钮（Heart 心形 → 未登录 requireAuth 拦截；已登录切换 following 状态）。
  - 指标卡横排：postCount、followingCount、followerCount、favoriteCount、影响力评分 influenceScore（用进度条或星评视觉展示）。
  - Tab 切换：发帖 / 收藏 / 关注 / 粉丝。每个 Tab 列表复用卡片组件。
    - 发帖：取 posts.filter(p => p.authorId === currentUser.id)。
    - 收藏：posts.slice(0, 3) mock。
    - 关注/粉丝：users 数组各取 4-5 位做列表。
  - 响应式：<600px 指标卡折为两行。
- **Acceptance Criteria Addressed**: AC-8, AC-2
- **Test Requirements**：
  - `programmatic` TR-7.1：资料卡字段与 userStats/currentUser 一致（postCount=48 等）。
  - `programmatic` TR-7.2：点击「关注」按钮 → 未登录弹认证窗；已登录按钮文案在「关注」/「已关注」之间切换。
  - `human-judgement` TR-7.3：4 个 Tab 切换流畅；影响力评分用视觉化方式呈现（非纯数字），美观可读。
- **Notes**：

---

## [x] Task 8：登录注册页 LoginPage 表单、来源承接、跳转
- **Priority**: high
- **Depends On**: Task 1
- **Description**：
  - 顶部来源提示区：从 URL `?from=` 读取并展示文案（from=timeout → 「浏览已达 5 分钟，登录后继续」；from=editor → 「发帖需要登录」；from=post_p1 → 「互动需要登录，登录后返回帖子」；默认 → 欢迎登录）。
  - Tab 切换：「登录」 / 「注册」。
  - 登录表单：手机号/邮箱 + 密码输入框，「记住我」占位勾选，登录按钮（点击调用 login()），第三方登录入口占位（微信/GitHub 图标）。
  - 注册表单：昵称 + 邮箱 + 密码 + 确认密码，注册按钮（点击后自动 login()）。
  - 登录成功后根据 from 参数决定跳转：from=editor → /forum/editor；from=post_p1 → /forum/post/p1；from=timeout → 回上一页或 /forum；from=xxx → /forum/xxx；默认 → /forum。
  - 响应式：<768px 居中宽度收窄为 100%。
- **Acceptance Criteria Addressed**: AC-9, AC-3
- **Test Requirements**：
  - `programmatic` TR-8.1：访问 /forum/login?from=editor → 顶部文案包含「发帖」；登录后 navigate('/forum/editor')。
  - `programmatic` TR-8.2：访问 /forum/login?from=post_p1 → 登录后 navigate('/forum/post/p1')。
  - `programmatic` TR-8.3：点击注册 Tab，填写后提交 → user 被设置且跳转逻辑同登录。
  - `human-judgement` TR-8.4：来源提示区使用带背景色的信息条样式，与表单区分。
- **Notes**：表单均为 Mock 提交，无需真实校验（必填提示可保留）。

---

## [x] Task 9：后台骨架（总览 + 用户管理 + 4 个占位页）与 AdminLayout
- **Priority**: medium
- **Depends On**: Task 2
- **Description**：
  - AdminLayout 侧栏导航：6 个后台入口（总览 / 内容审核 / 用户管理 / 版块管理 / 举报处理 / 运营配置），顶部回前台入口。
  - AdminDashboardPage：4 个指标卡（DAU、新帖数、待审、AI 调用数）+ 周趋势图占位（柱状/折线示意，用 div 绘制即可）+ 治理概览卡片。
  - UserManagePage：用户列表（用户数据来自 users，status 展示为彩色徽标 active/limited/banned），角色筛选下拉（全部/user/moderator/admin），点击行展开用户详情卡（基础字段）。
  - ContentReviewPage、BoardManagePage、ReportHandlePage、OperationConfigPage：页面标题 + 筛选项占位条 + 空状态提示「Phase4 上线」占位卡即可。
- **Acceptance Criteria Addressed**: AC-10, AC-11
- **Test Requirements**：
  - `programmatic` TR-9.1：/forum/admin 路由下各子路由可访问，404 无。
  - `programmatic` TR-9.2：AdminDashboard 指标卡数值与 adminStats.overview 一致（dau=12480 等）。
  - `programmatic` TR-9.3：UserManage 页面筛选 moderator 后，列表中仅赵子轩 / AlexChen 保留（roles 含 moderator）。
  - `human-judgement` TR-9.4：4 个占位页骨架统一、视觉一致。
- **Notes**：Phase0 不对后台做权限校验，登录后即可访问。

---

## [x] Task 10：工具层补齐、样式细节、通用组件打磨
- **Priority**: medium
- **Depends On**: Task 1-9（并行于 UI 任务）
- **Description**：
  - `aiForumUtils.js`：补齐/校验 formatRelativeTime（相对时间：刚刚 / X 分钟前 / X 小时前 / 日期）、formatNumber（>999 显示 1.2k、>9999 显示 12.4k）、truncateText（2 行截断可复用 CSS，但 utils 提供字符串截断兜底）。
  - `ai-forum.css`：必要的全局样式（行间距、卡片边框圆角过渡、af-line-clamp 截断等），避免写冗余 Tailwind 重复表达。
  - 通用组件打磨：Avatar（尺寸 sm/md/lg 支持，字母+彩色背景）、TagPill（选中/未选中样式）、EmptyState（404/无数据两种图标）、Pagination（帖子列表翻页占位）。
  - 主题色审查：全部页面颜色走 tailwind.config.js 的 ink/cream/vermilion/ochre 等主题项，无 hex 硬编码。
- **Acceptance Criteria Addressed**: NFR-7, NFR-8, NFR-9
- **Test Requirements**：
  - `programmatic` TR-10.1：formatRelativeTime(new Date(Date.now()-60000).toISOString()) 返回包含「1 分钟」的字符串；formatNumber(1284) → '1.3k' 或 '1.28k'。
  - `human-judgement` TR-10.2：全局扫描 CSS/Tailwind，未发现硬编码 #xxxxxx 颜色（SVG icon 默认 fill 除外）；组件间距、圆角风格统一。
- **Notes**：可与 Task 3-9 并行做。

---

## [x] Task 11：构建验证与 Bug 修复
- **Priority**: high
- **Depends On**: Task 1-10 全部
- **Description**：
  - 执行 `npm run build`，修复所有 error 级问题；warning 逐条评审（无用 import 警告必须修，其他视情况）。
  - 执行 `npm run dev`，人工走完全部核心流程（AC-1 至 AC-10 对应路径），记录并修复视觉/交互 Bug。
  - 代码自检：文件超过 500 行？→ 拆分子组件；useEffect 有清理？→ 定时器/监听器补齐；key 稳定？→ 列表不用 index；try/catch？→ localStorage 读写有兜底。
- **Acceptance Criteria Addressed**: AC-12, NFR-1, NFR-2, NFR-4, NFR-5, NFR-6
- **Test Requirements**：
  - `programmatic` TR-11.1：`npm run build` 退出码 0，dist/ 目录存在且包含 index.html。
  - `programmatic` TR-11.2：`npm run dev` 启动后无控制台红错误（error 级）。
  - `human-judgement` TR-11.3：人工走查流程清单，每一步对应 AC 均通过；无明显视觉错位。
- **Notes**：本任务为最后一关，需认真对待。
