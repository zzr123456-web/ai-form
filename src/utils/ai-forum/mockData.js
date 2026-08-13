/**
 * AI 辅助论坛 · Mock 数据
 * 覆盖前台/后台所有页面的数据需求，结构对齐 PRD 数据模型
 */

// === 用户 ===
export const currentUser = {
  id: 'u_alex',
  nickname: 'AlexChen',
  avatarText: 'A',
  bio: 'AI 应用开发者 / 关注 RAG 与 Agent 落地实践',
  handle: 'alexchen',
  profession: 'AI 应用开发',
  city: '上海',
  joinedAt: '2024-03-12',
  status: 'active',
  roles: ['user', 'moderator'],
}

export const users = [
  currentUser,
  { id: 'u_chen', nickname: '陈明哲', avatarText: '陈', bio: 'Prompt 工程爱好者', handle: 'minghez', profession: '算法工程师', city: '北京', joinedAt: '2023-11-02', status: 'active', roles: ['user'] },
  { id: 'u_lin', nickname: '林晓彤', avatarText: '林', bio: '效率工具控，分享 AI 编程实践', handle: 'xiaotongl', profession: '全栈开发', city: '杭州', joinedAt: '2024-01-20', status: 'active', roles: ['user'] },
  { id: 'u_wang', nickname: '王浩然', avatarText: '王', bio: '专注本地化模型部署', handle: 'haoranw', profession: '运维架构师', city: '深圳', joinedAt: '2023-08-15', status: 'active', roles: ['user'] },
  { id: 'u_zhang', nickname: '张悦', avatarText: '张', bio: '学术伦理研究者', handle: 'yuezhang', profession: '科研人员', city: '南京', joinedAt: '2024-05-08', status: 'active', roles: ['user'] },
  { id: 'u_li', nickname: '李静怡', avatarText: '李', bio: '多模态方向', handle: 'jingyil', profession: '研究生', city: '成都', joinedAt: '2024-06-30', status: 'active', roles: ['user'] },
  // roles 是数组，moderator 筛选需要 includes，因为用户可以有多个角色
  { id: 'u_zhao', nickname: '赵子轩', avatarText: '赵', bio: 'Agent 框架开发者', handle: 'zixuanz', profession: '后端开发', city: '广州', joinedAt: '2023-12-10', status: 'limited', roles: ['user', 'moderator'] },
  { id: 'u_spam', nickname: '营销号小王', avatarText: '营', bio: '', handle: 'spamwang', profession: '', city: '', joinedAt: '2024-07-01', status: 'banned', roles: ['user'] },
]

export const userStats = {
  postCount: 48,
  favoriteCount: 126,
  followingCount: 87,
  followerCount: 342,
  influenceScore: 8.6,
  totalLikes: 1284,
  totalFavorited: 213,
}

// === 版块 ===
export const boards = [
  { id: 'b1', name: 'AI 开发实践', description: '大模型应用、Prompt 工程、API 对接的实战讨论区', icon: 'cpu', todayPosts: 23, postCount: 1240, followers: 3200, governanceMode: 'quality_first', color: '#475569' },
  { id: 'b2', name: '模型部署与优化', description: '本地部署、推理加速、量化裁剪、硬件选型', icon: 'server', todayPosts: 11, postCount: 856, followers: 2100, governanceMode: 'quality_first', color: '#334155' },
  { id: 'b3', name: '经验分享', description: '使用心得、效率提升、踩坑总结', icon: 'lightbulb', todayPosts: 18, postCount: 643, followers: 1800, governanceMode: 'loose', color: '#64748b' },
  { id: 'b4', name: '思辨与讨论', description: 'AI 伦理、学术边界、行业趋势的深度讨论', icon: 'scale', todayPosts: 7, postCount: 521, followers: 1500, governanceMode: 'safety_first', color: '#1e293b' },
  { id: 'b5', name: '多模态与视觉', description: '图像生成、视频理解、跨模态应用', icon: 'image', todayPosts: 9, postCount: 412, followers: 1200, governanceMode: 'quality_first', color: '#0f172a' },
  { id: 'b6', name: '闲聊与吐槽', description: '轻松交流，AI 圈日常', icon: 'coffee', todayPosts: 31, postCount: 980, followers: 2400, governanceMode: 'loose', color: '#94a3b8' },
  { id: 'b7', name: '求职与招聘', description: 'AI 岗位信息、面试经验、内推', icon: 'briefcase', todayPosts: 5, postCount: 287, followers: 900, governanceMode: 'safety_first', color: '#475569' },
  { id: 'b8', name: '学术与论文', description: '论文阅读、研究讨论、复现', icon: 'book-open', todayPosts: 4, postCount: 198, followers: 760, governanceMode: 'quality_first', color: '#334155' },
]

// === 热门话题 ===
export const hotTopics = [
  { id: 't1', name: '大模型应用', heat: 9820 },
  { id: 't2', name: 'Agent 开发', heat: 7641 },
  { id: 't3', name: 'RAG', heat: 6532 },
  { id: 't4', name: 'AI 编程', heat: 5890 },
  { id: 't5', name: '多模态', heat: 4321 },
  { id: 't6', name: 'AI 伦理', heat: 3987 },
  { id: 't7', name: '提示词工程', heat: 3520 },
  { id: 't8', name: '本地部署', heat: 3104 },
]

// === 标签 ===
export const tags = ['Prompt Engineering', 'JSON', '效率工具', 'Copilot', 'RAG', '本地部署', '学术伦理', 'AIGC', 'Agent', 'LangChain', '向量数据库', '微调']

// === 帖子 ===
export const posts = [
  {
    id: 'p1',
    title: '如何用提示词工程让大模型输出更稳定的 JSON 格式？',
    summary: '最近在对接 LLM API 时，发现模型返回的 JSON 偶尔会出现字段缺失或格式错误的情况。我尝试了 few-shot 和 schema 约束，但效果不够稳定。有没有更可靠的策略？',
    content: `<p>最近在对接 LLM API 时，发现模型返回的 JSON 偶尔会出现字段缺失或格式错误。尝试了 few-shot 和 schema 约束，但效果不够稳定。</p>
<h3>已尝试方案</h3>
<ul><li>Few-shot 示例：提供 3-5 个标准 JSON 样本</li><li>Schema 约束：在 system prompt 中声明字段</li><li>Function Calling：让模型走工具调用通道</li></ul>
<h3>当前问题</h3>
<p>Function Calling 相对稳定，但在复杂嵌套结构下仍偶发字段缺失。希望了解大家的生产实践。</p>`,
    authorId: 'u_chen',
    boardId: 'b1',
    tags: ['Prompt Engineering', 'JSON'],
    likes: 128,
    comments: 34,
    views: 2840,
    createdAt: '2026-08-11T08:00:00Z',
    aiSummary: '讨论聚焦 Function Calling 与 Schema 约束的稳定性，社区建议结合 JSON Mode + 字段校验中间件。',
    qualityScore: 8.4,
    riskLevel: 'none',
    status: 'published',
  },
  {
    id: 'p2',
    title: 'AI 辅助编程半年复盘：哪些场景真正提升了效率？',
    summary: '从代码补全到代码审查，再到自动化测试生成，过去半年我逐步把 AI 工具融入日常开发。这篇文章总结了真正带来效率提升的三个场景，以及容易踩坑的地方。',
    content: `<p>过去半年逐步把 AI 工具融入日常开发，总结三个真正提效的场景。</p>
<h3>场景一：样板代码生成</h3>
<p>CRUD、DTO、类型定义等重复性代码，AI 生成准确率高，节省约 40% 时间。</p>
<h3>场景二：测试用例补全</h3>
<p>对已有函数生成边界测试，覆盖了几个我没想到的 corner case。</p>
<h3>容易踩坑</h3>
<ul><li>复杂业务逻辑不要直接采信，需人工核对</li><li>跨文件上下文理解仍弱，需手动补充</li></ul>`,
    authorId: 'u_lin',
    boardId: 'b3',
    tags: ['效率工具', 'Copilot'],
    likes: 256,
    comments: 67,
    views: 5210,
    createdAt: '2026-08-11T05:00:00Z',
    aiSummary: '社区普遍认同样板代码与测试生成是当前最稳场景，复杂业务逻辑需谨慎。',
    qualityScore: 9.1,
    riskLevel: 'none',
    status: 'published',
  },
  {
    id: 'p3',
    title: '本地部署 7B 模型做知识库问答的硬件与选型建议',
    summary: '想在团队内部署一个本地化的知识库问答系统，预算有限。对比了 Llama 3、Qwen 2 和 Mistral 等开源模型，整理了一份面向中小企业的选型与硬件配置清单。',
    content: `<p>面向中小企业的本地化 RAG 选型清单。</p>
<h3>模型对比</h3>
<ul><li>Llama 3 8B：英文强，中文需微调</li><li>Qwen2 7B：中文综合最佳</li><li>Mistral 7B：推理快，多语言均衡</li></ul>
<h3>硬件建议</h3>
<p>单卡 RTX 4090 可跑 INT4 量化 7B 模型，吞吐约 30 tokens/s。</p>`,
    authorId: 'u_wang',
    boardId: 'b2',
    tags: ['RAG', '本地部署'],
    likes: 89,
    comments: 21,
    views: 1830,
    createdAt: '2026-08-10T12:00:00Z',
    aiSummary: 'Qwen2 在中文场景被多次推荐，硬件层面 4090 是性价比之选。',
    qualityScore: 8.0,
    riskLevel: 'none',
    status: 'published',
  },
  {
    id: 'p4',
    title: '讨论：AI 生成内容在学术写作中的边界在哪里？',
    summary: '随着越来越多期刊和高校出台 AI 使用政策，学术界对生成式 AI 的态度日趋谨慎。大家如何看待 AI 在文献综述、语言润色和观点生成中的合理使用边界？',
    content: `<p>学术写作中 AI 使用的边界讨论。</p>
<h3>可接受</h3>
<p>语言润色、语法校对、格式整理。</p>
<h3>灰色地带</h3>
<p>文献综述初稿、数据可视化建议。</p>
<h3>不可接受</h3>
<p>观点生成、数据捏造、整段照搬。</p>`,
    authorId: 'u_zhang',
    boardId: 'b4',
    tags: ['学术伦理', 'AIGC'],
    likes: 312,
    comments: 108,
    views: 6420,
    createdAt: '2026-08-09T10:00:00Z',
    aiSummary: '社区共识：润色可接受，观点与数据生成越界。争议点在文献综述的辅助程度。',
    qualityScore: 8.8,
    riskLevel: 'low',
    status: 'published',
  },
  {
    id: 'p5',
    title: '用 LangChain 搭建多 Agent 协作系统的实践与反思',
    summary: '尝试用 LangChain 的 AgentExecutor 构建一个研究型多 Agent 系统，记录架构设计、消息传递和失败模式。',
    content: `<p>多 Agent 协作系统实践记录。</p><h3>架构</h3><p>Planner + Researcher + Writer 三角色。</p>`,
    authorId: 'u_zhao',
    boardId: 'b1',
    tags: ['Agent', 'LangChain'],
    likes: 156,
    comments: 42,
    views: 3120,
    createdAt: '2026-08-08T14:00:00Z',
    aiSummary: '多 Agent 系统的关键是消息协议设计与失败回退策略。',
    qualityScore: 8.2,
    riskLevel: 'none',
    status: 'published',
  },
  {
    id: 'p6',
    title: '向量数据库选型：Milvus vs Qdrant vs Weaviate 实测对比',
    summary: '在 100 万级文档场景下，对三款主流向量库做了召回率、延迟、资源占用的横向对比。',
    content: `<p>三款向量库横向对比测试。</p>`,
    authorId: 'u_wang',
    boardId: 'b2',
    tags: ['RAG', '向量数据库'],
    likes: 198,
    comments: 53,
    views: 4100,
    createdAt: '2026-08-07T09:00:00Z',
    aiSummary: 'Milvus 在大规模场景吞吐领先，Qdrant 部署最轻量。',
    qualityScore: 8.6,
    riskLevel: 'none',
    status: 'published',
  },
]

// === 评论（含楼中楼） ===
export const comments = {
  p1: [
    {
      id: 'c1', authorId: 'u_lin', content: '建议试试 OpenAI 的 JSON Mode，配合 response_format 参数，字段缺失问题基本消失。', likes: 24, createdAt: '2026-08-11T08:30:00Z',
      replies: [
        { id: 'c1r1', authorId: 'u_chen', content: 'JSON Mode 用过，但偶尔会多出注释字段，我加了正则清洗。', likes: 8, createdAt: '2026-08-11T08:45:00Z' },
        { id: 'c1r2', authorId: 'u_zhao', content: '正则清洗有风险，建议用 Pydantic 做结构校验更稳。', likes: 12, createdAt: '2026-08-11T09:00:00Z' },
      ],
    },
    {
      id: 'c2', authorId: 'u_wang', content: '复杂嵌套结构我们走 Function Calling，把每个层级拆成独立 tool，稳定性好很多。', likes: 18, createdAt: '2026-08-11T09:20:00Z', replies: [],
    },
    {
      id: 'c3', authorId: 'u_zhang', content: '补充一点：温度参数调到 0 也能显著提升格式稳定性，代价是多样性下降。', likes: 9, createdAt: '2026-08-11T10:00:00Z', replies: [],
    },
  ],
}

// === 通知 ===
export const notifications = [
  { id: 'n1', type: 'reply', title: '陈明哲 回复了你的帖子', body: '建议试试 OpenAI 的 JSON Mode，配合 response_format 参数...', readAt: null, createdAt: '2026-08-11T08:30:00Z', targetId: 'p1' },
  { id: 'n2', type: 'follow', title: '林晓彤 关注了你', body: '你们有 3 个共同关注的话题', readAt: null, createdAt: '2026-08-11T07:00:00Z', targetId: 'u_lin' },
  { id: 'n3', type: 'ai_reminder', title: 'AI 提醒', body: '你关注的「RAG」话题有 3 篇新高质量讨论', readAt: '2026-08-11T06:00:00Z', targetId: 't3' },
  { id: 'n4', type: 'reply', title: '王浩然 回复了你的评论', body: '正则清洗有风险，建议用 Pydantic 做结构校验更稳。', readAt: '2026-08-10T22:00:00Z', targetId: 'p1' },
  { id: 'n5', type: 'system', title: '系统通知', body: '你的帖子《向量数据库选型》被加入「RAG」知识库候选池', readAt: '2026-08-10T18:00:00Z', targetId: 'p6' },
  { id: 'n6', type: 'moderation_result', title: '审核结果', body: '你举报的评论已被折叠处理', readAt: '2026-08-10T15:00:00Z', targetId: null },
  { id: 'n7', type: 'follow', title: '赵子轩 关注了你', body: '', readAt: '2026-08-09T20:00:00Z', targetId: 'u_zhao' },
]

// === AI 答疑历史 ===
export const qaHistory = [
  {
    id: 'q1',
    question: '租房押金被扣怎么办？房东说有损耗直接扣除合理吗？',
    answer: `押金扣除需遵循以下原则：\n\n1. 正常使用损耗不得扣除押金，房东主张损耗需举证\n2. 押金扣除应提供明细清单与凭证\n3. 协商不成可向住建部门投诉或起诉\n\n风险提示：以上为通用法律边界，具体情形请咨询专业律师或当地住建部门。`,
    citations: [
      { id: 'ci1', sourceType: 'post', title: '租房纠纷处理经验合集', excerpt: '社区用户分享的押金追回完整流程，含协商、投诉、诉讼三阶段。' },
      { id: 'ci2', sourceType: 'knowledge_item', title: '《商品房屋租赁管理办法》摘录', excerpt: '承租人按照约定方法使用房屋，致使房屋受到损耗的，不承担赔偿责任。' },
      { id: 'ci3', sourceType: 'external_web', title: '住建部租赁合同示范文本', excerpt: '押金返还争议处理条款与示范约定。' },
      { id: 'ci4', sourceType: 'post', title: '我的押金追回全过程', excerpt: '从取证到小额诉讼的实战记录。' },
    ],
    safetyLabel: 'sensitive',
    createdAt: '2026-08-10T11:00:00Z',
  },
]

// === 社区补充回答 ===
export const communityAnswers = [
  { id: 'ca1', authorId: 'u_wang', content: '我去年遇到过同样情况，先录音保留沟通证据，然后写了正式的押金返还请求函，房东最后全额退还。建议先书面催告。', likes: 34, createdAt: '2026-08-10T12:00:00Z' },
  { id: 'ca2', authorId: 'u_zhang', content: '补充一点：很多城市有房屋租赁投诉平台，比直接诉讼成本低，可以先尝试。', likes: 21, createdAt: '2026-08-10T13:30:00Z' },
]

// === 知识库 ===
export const knowledgeItems = [
  { id: 'k1', title: '《商品房屋租赁管理办法》核心条款摘录', content: '租赁押金、损耗界定、争议处理的核心条款。', tags: ['法律', '租房'], updatedAt: '2026-07-20', status: 'active' },
  { id: 'k2', title: 'Prompt Engineering 进阶指南', content: '从 few-shot 到 chain-of-thought 的完整实践。', tags: ['Prompt', '教程'], updatedAt: '2026-08-01', status: 'active' },
  { id: 'k3', title: 'RAG 系统架构选型参考', content: '向量库、embedding 模型、检索策略的选型矩阵。', tags: ['RAG', '架构'], updatedAt: '2026-08-05', status: 'active' },
]

// === 后台：运营指标 ===
export const adminStats = {
  overview: {
    dau: 12480,
    dauDelta: 8.4,
    newPosts: 342,
    newPostsDelta: 12.5,
    pendingReview: 18,
    pendingReviewDelta: -22.0,
    aiCallCount: 28460,
    aiCallDelta: 15.2,
  },
  weeklyTrend: [
    { day: '周一', posts: 280, comments: 1240, active: 9800 },
    { day: '周二', posts: 310, comments: 1380, active: 10200 },
    { day: '周三', posts: 295, comments: 1320, active: 10100 },
    { day: '周四', posts: 340, comments: 1510, active: 11500 },
    { day: '周五', posts: 420, comments: 1820, active: 13200 },
    { day: '周六', posts: 380, comments: 1640, active: 12800 },
    { day: '周日', posts: 342, comments: 1450, active: 12480 },
  ],
  governance: { aiCases: 156, resolved: 138, pending: 18, aiAccuracy: 94.2 },
}

// === 审核工单 ===
export const moderationCases = [
  { id: 'm1', targetType: 'comment', targetId: 'c_x1', source: 'ai', riskType: 'misinformation', riskLevel: 'high', content: '这条评论给出绝对化法律结论：直接报警就能拿回押金，不用起诉。', authorId: 'u_spam', status: 'open', createdAt: '2026-08-11T09:00:00Z', postId: 'p1' },
  { id: 'm2', targetType: 'post', targetId: 'p_x2', source: 'ai', riskType: 'spam', riskLevel: 'medium', content: '加我微信领 AI 工具合集，限时免费...', authorId: 'u_spam', status: 'open', createdAt: '2026-08-11T08:30:00Z', postId: null },
  { id: 'm3', targetType: 'comment', targetId: 'c_x3', source: 'report', riskType: 'abuse', riskLevel: 'medium', content: '地域攻击言论...', authorId: 'u_zhao', status: 'assigned', assignee: 'u_alex', createdAt: '2026-08-11T07:00:00Z', postId: 'p4' },
  { id: 'm4', targetType: 'comment', targetId: 'c_x4', source: 'ai', riskType: 'low_quality', riskLevel: 'low', content: '沙发支持一下', authorId: 'u_li', status: 'resolved', createdAt: '2026-08-10T22:00:00Z', postId: 'p2', resolvedAt: '2026-08-10T23:00:00Z' },
  { id: 'm5', targetType: 'post', targetId: 'p_x5', source: 'ai', riskType: 'sensitive', riskLevel: 'high', content: '涉及医疗诊断绝对化结论...', authorId: 'u_li', status: 'open', createdAt: '2026-08-11T10:00:00Z', postId: null },
]

// === 举报 ===
export const reports = [
  { id: 'r1', reporterId: 'u_chen', targetType: 'comment', targetId: 'c_x3', reason: '人身攻击/地域歧视', detail: '评论区出现针对某地区用户的攻击性言论', status: 'pending', createdAt: '2026-08-11T07:30:00Z', targetContent: '地域攻击言论...' },
  { id: 'r2', reporterId: 'u_lin', targetType: 'post', targetId: 'p_x2', reason: '垃圾广告', detail: '帖子内容为外部引流，无实际讨论价值', status: 'pending', createdAt: '2026-08-11T08:00:00Z', targetContent: '加我微信领 AI 工具合集...' },
  { id: 'r3', reporterId: 'u_wang', targetType: 'comment', targetId: 'c_x6', reason: '错误信息', detail: '评论给出错误的法律结论，可能误导他人', status: 'processing', createdAt: '2026-08-10T19:00:00Z', targetContent: '直接报警就能拿回押金...' },
  { id: 'r4', reporterId: 'u_zhang', targetType: 'user', targetId: 'u_spam', reason: '恶意刷屏', detail: '该用户在多个版块发布相同广告内容', status: 'resolved', createdAt: '2026-08-09T15:00:00Z', targetContent: '用户「营销号小王」' },
]

// === AI 发帖助手建议 ===
export const aiEditorSuggestions = {
  titles: [
    '从 Few-shot 到 JSON Mode：让大模型输出稳定结构化数据的实践',
    '大模型 JSON 输出不稳定？这三招让格式错误率降到 1% 以下',
    '讨论：你在生产环境如何保证 LLM 输出格式可靠？',
  ],
  tags: ['Prompt Engineering', 'JSON', 'Function Calling', '生产实践', 'LLM API'],
  boards: [
    { id: 'b1', name: 'AI 开发实践', reason: '与你的标题最匹配，该版块关注 LLM API 实战' },
    { id: 'b3', name: '经验分享', reason: '若内容偏复盘总结，也可发到经验分享' },
  ],
  privacy: '检测到草稿中可能包含 API Key 片段（sk-...），发布前请确认是否敏感。',
}

// === 运营配置 ===
export const operationConfig = {
  recommend: { strategy: 'quality_first', qualityWeight: 0.6, engagementWeight: 0.3, freshnessWeight: 0.1 },
  aiGovernance: { riskThreshold: 'medium', autoFoldEnabled: true, humanReviewRatio: 0.15 },
  communityRules: { minPostLength: 20, maxPostsPerDay: 20, newAccountCooldown: 24 },
}
