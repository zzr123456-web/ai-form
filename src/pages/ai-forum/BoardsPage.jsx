import React, { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight, Home, Heart, MessageSquare, PenSquare } from 'lucide-react'
import SortControls from '../../components/ai-forum/common/SortControls.jsx'
import Avatar from '../../components/ai-forum/common/Avatar.jsx'
import TagPill from '../../components/ai-forum/common/TagPill.jsx'
import EmptyState from '../../components/ai-forum/common/EmptyState.jsx'
import { useAuth } from '../../components/ai-forum/AuthProvider.jsx'
import { getBoards, getPosts } from '../../utils/ai-forum/apiClient.js'
import { formatRelativeTime, formatNumber } from '../../utils/ai-forum/aiForumUtils.js'

const SORT_OPTIONS = [
  { key: 'latest', label: '最新' },
  { key: 'hot', label: '热门' },
  { key: 'quality', label: '优质' },
]

// 治理模式配置：差异化配色体现治理强度
// - quality_first：蓝色系，表示内容质量审核优先
// - safety_first：红色系，表示安全合规优先（醒目警示色）
// - loose：绿色系，表示宽松自由治理
const GOVERNANCE_CONFIG = {
  quality_first: { label: '质量优先', className: 'bg-info-bg text-info' },
  safety_first:  { label: '安全优先', className: 'bg-error-bg text-error' },
  loose:         { label: '宽松治理', className: 'bg-success-bg text-success' },
}

export default function BoardsPage() {
  const { requireAuth } = useAuth()
  const navigate = useNavigate()

  // 选中的版块 id（'all' 表示全部）
  const [selectedBoardId, setSelectedBoardId] = useState('all')
  // 选中的标签集合（多选，用 Set 保证 O(1) 查找）
  const [selectedTags, setSelectedTags] = useState(new Set())
  // 排序方式
  const [sort, setSort] = useState('latest')

  // 数据状态：版块和帖子由后端 API 异步加载
  const [posts, setPosts] = useState([])
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // 重试计数器：点击重试按钮时递增，触发 useEffect 重新拉取数据
  const [reloadKey, setReloadKey] = useState(0)

  /**
   * 异步加载版块和帖子数据
   * - Promise.all 并行请求，减少首屏等待时间
   * - cancelled 标志避免组件卸载后 setState 导致的内存泄漏警告
   * - 依赖 reloadKey：点击重试按钮时递增以触发重新加载
   */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([getBoards(), getPosts()])
      .then(([boardData, postData]) => {
        if (cancelled) return
        setBoards(boardData)
        setPosts(postData)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setError('加载失败')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  /**
   * 标签列表：从已加载的帖子中聚合去重派生
   * 后端未提供独立 /tags 端点，这里用 useMemo 在 posts 变化时实时计算
   */
  const tags = useMemo(() => {
    const set = new Set()
    posts.forEach((p) => {
      if (p.tags) p.tags.forEach((t) => set.add(t))
    })
    return Array.from(set)
  }, [posts])

  /**
   * 筛选与排序后的帖子列表
   * 使用 useMemo 缓存计算结果，避免每次重渲染都重复筛选排序
   * 筛选顺序：版块 → 标签 → 排序，每一步都用 [...arr] 克隆避免修改原数据
   */
  const filteredPosts = useMemo(() => {
    let list = [...posts]

    // 版块筛选：只保留选中版块的帖子
    if (selectedBoardId !== 'all') {
      list = list.filter((p) => p.boardId === selectedBoardId)
    }

    // 标签筛选：帖子 tags 中任一标签属于选中集合即保留
    // 用 Set.has() 比 Array.includes() 在多标签场景下性能更好
    if (selectedTags.size > 0) {
      list = list.filter((p) => p.tags.some((t) => selectedTags.has(t)))
    }

    // 排序：必须先克隆数组再 sort，防止直接修改 state 数组
    // latest：按 createdAt 时间戳倒序（最新在前）
    // hot：按点赞数降序
    // quality：按 qualityScore 降序（Phase0 数据驱动的内容质量排序）
    if (sort === 'hot') {
      list = [...list].sort((a, b) => b.likes - a.likes)
    } else if (sort === 'quality') {
      list = [...list].sort((a, b) => b.qualityScore - a.qualityScore)
    } else {
      list = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    }

    return list
  }, [posts, selectedBoardId, selectedTags, sort])

  /**
   * 标签多选切换
   * 通过 Set 结构管理选中状态：点击已选中的标签则移除，否则加入
   */
  const toggleTag = (tag) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) {
        next.delete(tag)
      } else {
        next.add(tag)
      }
      return next
    })
  }

  /**
   * 点击版块卡片：切换选中的版块
   * 再次点击同一块则恢复为全部（'all'）
   */
  const handleBoardCardClick = (boardId) => {
    setSelectedBoardId((prev) => (prev === boardId ? 'all' : boardId))
  }

  /**
   * 发帖按钮处理：未登录触发认证，已登录跳转发帖页
   */
  const handleCreatePost = () => {
    if (requireAuth('发帖需要登录')) {
      navigate('/forum/editor')
    }
  }

  /**
   * 点击帖子卡片跳转详情页
   * 使用 navigate 而非 Link 包裹整张卡片，避免嵌套 a 标签的语义问题
   */
  const handlePostCardClick = (postId) => {
    navigate(`/forum/post/${postId}`)
  }

  // 重试按钮：递增 reloadKey 触发 useEffect 重新拉取
  const handleRetry = () => setReloadKey((k) => k + 1)

  // 加载中：骨架屏占位，保持页面布局稳定避免闪烁
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="h-8 bg-afmuted rounded-af-md w-48 mb-6 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="bg-card border border-border rounded-af-xl p-4 space-y-3">
              <div className="h-4 bg-afmuted rounded w-2/3 animate-pulse" />
              <div className="h-3 bg-afmuted rounded w-full animate-pulse" />
              <div className="h-3 bg-afmuted rounded w-1/2 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-card border border-border rounded-af-lg p-5 space-y-3">
              <div className="h-5 bg-afmuted rounded w-3/4 animate-pulse" />
              <div className="h-4 bg-afmuted rounded w-full animate-pulse" />
              <div className="h-4 bg-afmuted rounded w-1/2 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // 加载失败：展示错误提示 + 重试按钮
  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-error-bg border border-error/30 text-error rounded-af-lg p-6 text-center">
          <p className="text-sm mb-3">{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            重新加载
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* 面包屑 + 标题区 */}
      <nav className="flex items-center gap-1.5 text-sm text-afmuted-foreground mb-4">
        <Link to="/forum" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <Home className="size-3.5" /> 首页
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">全部版块</span>
      </nav>
      <h1 className="text-2xl font-semibold text-foreground mb-6">全部版块</h1>

      {/* ===== 顶部版块导航区：8 个版块卡片网格 ===== */}
      {/* 响应式：<768px 用 2 列，≥768px 用 4 列 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {boards.map((b) => {
          const active = selectedBoardId === b.id
          const govCfg = GOVERNANCE_CONFIG[b.governanceMode] || GOVERNANCE_CONFIG.loose
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => handleBoardCardClick(b.id)}
              className={`text-left bg-card border rounded-af-xl p-4 transition-all hover:shadow-af-1 relative ${
                active
                  ? 'border-foreground ring-2 ring-ring'
                  : 'border-border hover:border-afmuted-foreground/30'
              }`}
            >
              {/* 治理模式小标签：右上角定位 */}
              <span className={`absolute top-3 right-3 px-2 py-0.5 rounded-full text-[10px] font-medium ${govCfg.className}`}>
                {govCfg.label}
              </span>

              {/* 顶部：彩色圆点 + 版块名称 */}
              <div className="flex items-center gap-2 mb-2 pr-16">
                <span
                  className="size-3 rounded-full shrink-0"
                  style={{ backgroundColor: b.color }}
                  aria-label={`${b.name} 标识色`}
                />
                <span className="font-semibold text-foreground truncate">{b.name}</span>
              </div>

              {/* 中部：版块描述，2 行截断 */}
              <p className="text-xs text-afmuted-foreground af-line-clamp-2 mb-3 leading-relaxed">
                {b.description}
              </p>

              {/* 底部三栏：今日新帖 + 帖子数 + 关注数 */}
              <div className="flex items-center gap-2 text-xs text-afmuted-foreground flex-wrap">
                {/* 今日新帖徽标：红底醒目样式 */}
                {Boolean(b.todayPosts) && (
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-error-bg text-error font-medium">
                    {b.todayPosts} 新
                  </span>
                )}
                <span>{formatNumber(b.postCount)} 帖</span>
                {/* 关注功能未上线前隐藏，避免显示假数据 */}
                {Boolean(b.followers) && (
                  <span>{formatNumber(b.followers)} 关注</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* ===== 筛选控件行：版块下拉 + 标签筛选 + 排序 + 发帖按钮 ===== */}
      {/* flex-wrap 保证窄屏自动换行 */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* 版块筛选下拉 */}
        <select
          value={selectedBoardId}
          onChange={(e) => setSelectedBoardId(e.target.value)}
          className="h-9 px-3 rounded-af-lg bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">全部版块</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>

        {/* 标签筛选：多选 TagPill，可横向滚动（窄屏） */}
        <div className="flex items-center gap-2 overflow-x-auto af-no-scrollbar flex-1 min-w-0">
          <span className="text-xs text-afmuted-foreground shrink-0">标签：</span>
          {tags.map((t) => {
            const selected = selectedTags.has(t)
            return (
              <TagPill
                key={t}
                as="button"
                type="button"
                onClick={() => toggleTag(t)}
                variant={selected ? 'solid' : 'border'}
                className="shrink-0 cursor-pointer"
              >
                {t}
              </TagPill>
            )
          })}
        </div>

        {/* 排序控件 */}
        <SortControls options={SORT_OPTIONS} value={sort} onChange={setSort} />

        {/* 发帖按钮：PenSquare 图标 + 文字 */}
        <button
          type="button"
          onClick={handleCreatePost}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
        >
          <PenSquare className="size-4" /> 发帖
        </button>
      </div>

      {/* ===== 帖子列表区：复用首页卡片样式 ===== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-afmuted-foreground">{filteredPosts.length} 个结果</span>
        </div>

        {/* 用 Boolean 避免 0 && <Component /> 陷阱 */}
        {Boolean(filteredPosts.length) ? (
          filteredPosts.map((post) => {
            // 后端 JOIN 查询已内联 author/board 对象，无需再从 users/boards 数组查找
            const author = post.author
            const board = post.board
            return (
              <article
                key={post.id}
                onClick={() => handlePostCardClick(post.id)}
                className="bg-card border border-border rounded-af-lg p-5 hover:border-afmuted-foreground/40 hover:shadow-af-1 transition-all cursor-pointer w-full"
              >
                <h2 className="text-lg font-semibold text-foreground mb-2">{post.title}</h2>
                <p className="text-sm text-afmuted-foreground af-line-clamp-2 mb-4 leading-relaxed">
                  {post.summary}
                </p>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar text={author?.avatarText} size="xs" />
                    <span className="text-xs text-foreground truncate">{author?.nickname}</span>
                    <span className="text-xs text-afmuted-foreground">·</span>
                    <span className="text-xs text-afmuted-foreground truncate">{board?.name}</span>
                    {/* ≤2 个标签 pill：窄屏 sm 以下隐藏，避免挤压作者信息 */}
                    {Boolean(post.tags?.slice(0, 2).length) && (
                      <div className="hidden sm:flex items-center gap-1.5">
                        {post.tags.slice(0, 2).map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-afmuted-foreground shrink-0">
                    <span className="flex items-center gap-1">
                      <Heart className="size-4" /> {formatNumber(post.likes)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="size-4" /> {post.commentsCount}
                    </span>
                    <span className="hidden sm:inline">{formatRelativeTime(post.createdAt)}</span>
                  </div>
                </div>
              </article>
            )
          })
        ) : (
          <EmptyState
            title="暂无匹配的帖子"
            description="尝试切换版块、取消部分标签筛选，或换一种排序方式"
          />
        )}
      </section>
    </div>
  )
}
