# AI 辅助论坛 · Phase0 社区基础骨架 - 验证清单

## 全局与认证（AC-1 / AC-2 / AC-3 / AC-9 / NFR-2 / NFR-4）

- [ ] 验证未登录进入首页，guestElapsed 每秒递增且不随组件重渲染错乱
- [ ] 验证 4 分 30 秒（270s）准时显示 GuestBanner 轻提示横幅，含可关闭按钮，关闭后立即消失
- [ ] 验证 5 分整（300s）准时弹出强制认证弹窗 + 内容遮罩；弹窗无关闭 X 按钮，点击遮罩空白区不消失
- [ ] 验证强制认证态下调用 closeAuthModal 无效（弹窗仍保留）
- [ ] 验证未登录点击「发帖 / 点赞 / 收藏 / 关注 / 通知 / 编辑主页」任一按钮 → 弹出认证窗，原操作未执行（点赞数不变等）
- [ ] 验证 Mock 登录后 user 字段为 currentUser，localStorage.af_user 写入 JSON；刷新页面登录态不丢失
- [ ] 验证退出登录 → user 清空、localStorage 移除、guestElapsed 归零
- [ ] 验证携带 `?from=editor` / `?from=timeout` / `?from=post_p1` 进入登录页，顶部展示对应来源文案
- [ ] 验证登录成功后按来源参数正确跳转：editor → /forum/editor；post_p1 → /forum/post/p1；timeout → /forum；默认 → /forum
- [ ] 验证隐私模式（或手动清空 localStorage API）下，读写 localStorage 不抛异常（try/catch 生效）

## 首页 ForumHomePage（AC-4 / AC-11）

- [ ] 验证首页左栏帖子卡片完整展示：标题、summary 2 行截断、Avatar+nickname、版块名、≤2 个标签、点赞数、评论数、相对时间
- [ ] 验证「最新」排序 → 第 1 条 createdAt 最新；「热门」排序 → 第 1 条 likes 最大
- [ ] 验证未登录点击「关注」排序 → 弹出认证窗（requireAuth 拦截）；已登录则展示关注流 Mock 列表
- [ ] 验证右栏「AI 推荐」3 条文案 + 跳转搜索页链接有效
- [ ] 验证右栏「热门话题」8 个 #标签 样式统一且点击跳转
- [ ] 验证右栏「版块快捷入口」5 个版块显示名称 + 帖子数，点击跳转版块列表页
- [ ] 验证 <1024px 宽度下左右栏合并为单列（侧栏移至底部）
- [ ] 验证点击任一帖子卡片 → 打开 `/forum/post/:id` 对应详情页（无 404）

## 版块列表页 BoardsPage（AC-5 / AC-11）

- [ ] 验证顶部 8 个版块导航卡：名称、描述、今日新帖徽标、帖子数、关注数完整
- [ ] 验证治理模式视觉区分：quality_first / safety_first / loose 有明显颜色或标识差异
- [ ] 验证版块筛选下拉：选择单版块 → 列表仅该版块帖子；选择「全部」→ 展示全部
- [ ] 验证标签筛选：选择标签后，列表中每条帖子 tags 包含所选标签
- [ ] 验证「优质」排序 → 按 qualityScore 降序（张悦的伦理帖 8.8 排前列）
- [ ] 验证 <768px 下版块导航折为 2 列网格，不破版

## 帖子详情页 PostDetailPage（AC-6 / AC-2）

- [ ] 验证访问 `/forum/post/p1` → 标题为「如何用提示词工程让大模型输出更稳定的 JSON 格式？」正文包含「已尝试方案」
- [ ] 验证访问不存在的 ID（如 /forum/post/xxx999）→ 展示 EmptyState 空状态组件
- [ ] 验证作者信息卡（头像 + 昵称 + 版块 + 时间）、标签行、AI 总结卡片展示完整
- [ ] 验证评论 c1 存在，其下嵌套 c1r1 / c1r2 两条回复有缩进层级展示
- [ ] 验证互动工具栏：Heart 点赞本地切换数字 ±1；Star 收藏未登录 → 触发认证弹窗；Flag / Share 按钮占位存在
- [ ] 验证相关推荐侧栏：3-5 条帖子，点击能跳转对应详情页
- [ ] 验证 <1024px 下相关推荐侧栏移至评论区下方

## 发帖编辑器 PostEditorPage（AC-7 / AC-14 ~ AC-17）

- [ ] 验证未登录直接访问 `/forum/editor` → 被重定向至 `/forum/login?from=editor`（URL 参数存在）
- [ ] 验证已登录进入编辑器：左栏标题输入 + 正文 textarea + 版块下拉 + 标签 chips 多选；右栏 AI 助手占位面板（含 aiEditorSuggestions 的 3 个标题建议、标签、版块建议）
- [ ] 验证标题为空或正文为空 → 发布按钮 disabled 或点击不跳转（含占位提示 toast/红色边框）
- [ ] 验证标题 + 正文 + 版块都填写 → 点发布 → 创建新帖对象 id=new_xxx → 立即跳转到 `/forum/post/new_xxx` 页面并展示刚发布内容
- [ ] 验证 <768px 下布局变为上下两栏（编辑器在上，AI 占位面板在下）

## 个人主页 ProfilePage（AC-8 / AC-2）

- [ ] 验证资料卡字段完整：大号头像、昵称 AlexChen、Handle @alexchen、职业 AI 应用开发、城市 上海、加入 2024-03-12、简介、关注按钮
- [ ] 验证 4 项计数：发帖 48 / 关注 87 / 粉丝 342 / 收藏 126；影响力 8.6 有视觉化展示（进度条或星评）
- [ ] 验证未登录点击「关注」按钮 → 弹出认证窗；已登录点击 → 按钮在「关注」/「已关注」之间切换样式
- [ ] 验证 4 个 Tab：发帖（仅 AlexChen 写的帖子）/ 收藏（3 条 mock）/ 关注（用户列表）/ 粉丝（用户列表），每个 Tab 内容正确渲染
- [ ] 验证 <600px 下指标卡折为两行不溢出

## 登录注册页 LoginPage（AC-9 / AC-3）

- [ ] 验证「登录 / 注册」Tab 切换流畅，登录表单含 账号 + 密码 + 记住我 + 登录按钮 + 第三方占位
- [ ] 验证注册表单含 昵称 + 邮箱 + 密码 + 确认密码，提交后自动登录并跳转
- [ ] 验证来源提示条：from=editor 显示「发帖需要登录」、from=timeout 显示「浏览已达 5 分钟」等差异化文案
- [ ] 验证登录成功后路由跳转正确（与 checklist 第一项的跳转测试重复项，合并验证）

## 后台骨架 Admin（AC-10）

- [ ] 验证 `/forum/admin` 6 个子路由均可访问，无 404：总览、review、users、boards、reports、config
- [ ] 验证 AdminLayout 侧栏导航 6 个入口高亮当前页正确，顶部返回前台入口可点击回 /forum
- [ ] 验证后台总览 4 个指标卡：DAU 12,480（+8.4%）、新帖 342（+12.5%）、待审 18（-22.0%）、AI 调用 28,460（+15.2%）
- [ ] 验证后台总览周趋势图占位存在（7 天数据）、治理概览卡片数据正确（AI 工单 156 / 已处理 138 / 待处理 18 / 准确率 94.2%）
- [ ] 验证用户管理列表：users 数组 8 位正确展示，状态徽标 active 绿色 / limited 黄色 / banned 红色
- [ ] 验证角色筛选 = moderator → 列表仅保留 AlexChen（roles 含 user+moderator）和赵子轩
- [ ] 验证内容审核 / 版块管理 / 举报处理 / 运营配置 4 个页面骨架完整，有标题 + 「Phase4 上线」占位提示

## 通用组件与工具层（NFR-7 ~ NFR-9 / AC-11）

- [ ] 验证 Avatar 支持 xs/sm/md/lg 尺寸，颜色区分稳定
- [ ] 验证 TagPill 默认 / 选中 / hover 三种状态样式一致
- [ ] 验证 EmptyState 在帖子不存在、列表无数据两种场景正确展示图标与说明
- [ ] 验证 `formatRelativeTime`：60 秒内 → 「刚刚」；3600 秒内 → 「X 分钟前」；1 天内 → 「X 小时前」；超过 → 日期格式
- [ ] 验证 `formatNumber`：1284 → '1.3k'；5210 → '5.2k'；6420 → '6.4k'；28460 → '2.8w'（或约定格式，需一致）
- [ ] 验证全局无硬编码 hex 颜色（扫描 jsx/css 文件，除 lucide icon 默认 fill 外）
- [ ] 验证所有列表 key 使用实体 id，无一处使用 index（React DevTools 或代码审计）
- [ ] 验证所有 useEffect 使用定时器/监听的都有 return 清理函数（AuthProvider 定时器、布局组件 resize 监听等）

## 响应式（AC-11）

- [ ] 桌面 1280px：三档页面（首页/详情/编辑器）布局完整，无横向滚动条
- [ ] 平板 820px：首页两栏合并或合理折行；帖子详情侧栏合理
- [ ] 手机 390px：所有关键操作按钮可点击（尺寸 ≥40px），导航栏简化为图标，无横向滚动

## 构建与运行（AC-12 / NFR-1）

- [ ] `npm run build` 执行成功（exit code 0），无 error 级报错
- [ ] `npm run build` 后 dist/index.html 存在，且包含 forum 路由入口脚本
- [ ] `npm run dev` 启动后，打开 http://localhost:5173/forum 无控制台红错误
- [ ] 冷加载首屏时间（本地）< 2 秒，无长任务阻塞

## 代码规范（User Rules §5~§8）

- [ ] 所有 React 组件采用函数组件 + Hooks，无 Class 组件
- [ ] 组件结构顺序正确：import → 顶层常量 → 主组件 → state → Hooks → useEffect → handleXxx → renderXxx → return JSX
- [ ] 条件渲染无 `0 && <Component />` 陷阱，一律使用三元或 && 前加 Boolean()
- [ ] 使用 === / !== 严格比较，无 == / !=
- [ ] 超过 20 行的逻辑片段考虑了抽象（工具函数 / 子组件 / 自定义 Hook）
- [ ] 关键逻辑有中文注释说明「为什么」（如阈值选择、useEffect 省略依赖理由、兜底处理）
- [ ] Git 提交遵循语义化格式（feat/fix/style/refactor/chore/docs），每次提交粒度单一
