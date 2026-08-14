import React, { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Heart, MessageSquare, Sparkles, ArrowUpRight, Flame } from 'lucide-react'
import SortControls from '../../components/ai-forum/common/SortControls.jsx'
import Avatar from '../../components/ai-forum/common/Avatar.jsx'
import { useAuth } from '../../components/ai-forum/AuthProvider.jsx'
import { getPosts, getTopics, getBoards } from '../../utils/ai-forum/apiClient.js'
import { formatRelativeTime, formatNumber } from '../../utils/ai-forum/aiForumUtils.js'

const SORT_OPTIONS = [
  { key: 'latest', label: '最新' },
  { key: 'hot', label: '热门' },
  // 推荐流由后端按个性化/热度算法排序，前端不再二次排序
  { key: 'recommended', label: '推荐' },
  { key: 'follow', label: '关注' },
]

// AI 推荐 3 条固定文案：每项带稳定 id，避免使用 index 作为 React key
const AI_RECOMMENDS = [
  { id: 'ai_rec_1', text: '基于你的浏览，推荐关注「RAG 检索增强生成」话题' },
  { id: 'ai_rec_2', text: '你可能对这篇《提示词模板合集》感兴趣' },
  { id: 'ai_rec_3', text: '「Agent 开发」版块本周新增 23 篇高质量讨论' },
]

export default function ForumHomePage() {
  const { requireAuth } = useAuth()
  const navigate = useNavigate()
  const [sort, setSort] = useState('latest')

  // 数据状态：帖子、热门话题、版块均由后端 API 异步加载
  const [posts, setPosts] = useState([])
  const [topics, setTopics] = useState([])
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // 重试计数器：点击重试按钮时递增，触发 useEffect 重新拉取数据
  const [reloadKey, setReloadKey] = useState(0)

  /**
   * 异步加载首页所需数据：帖子列表 + 热门话题 + 版块
   * - Promise.all 并行请求，减少首屏等待时间
   * - cancelled 标志避免组件卸载后 setState 导致的内存泄漏警告
   * - 依赖 reloadKey：点击重试按钮时递增以触发重新加载
   * - 依赖 sort：切换排序时把 sort 透传给后端，让后端按对应策略返回
   *   （recommended 走后端推荐算法；hot/latest 也由后端排序，前端 sortedPosts 仍会兜底重排）
   */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([getPosts({ sort }), getTopics(), getBoards()])
      .then(([postData, topicData, boardData]) => {
        if (cancelled) return
        setPosts(postData)
        setTopics(topicData)
        setBoards(boardData)
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
  }, [reloadKey, sort])

  // 排序后帖子列表：使用 useMemo 缓存，避免每次重渲染重复排序
  // 依赖 posts：异步数据到达后需重新计算排序
  const sortedPosts = useMemo(() => {
    // recommended：完全采用后端推荐算法返回的顺序，前端不再二次排序
    if (sort === 'recommended') {
      return posts
    }
    // [...posts] 克隆后排序：防止直接修改 state 数组，
    // 否则切回其他排序时源数组顺序已经被打乱
    if (sort === 'hot') {
      return [...posts].sort((a, b) => b.likes - a.likes)
    }
    if (sort === 'follow') {
      // 关注流 Phase0 仅做 Mock 截断：取前 3 条模拟已登录用户的关注内容
      return posts.slice(0, 3)
    }
    // 默认 latest：按 createdAt 时间戳倒序，最新发布排第一条
    return [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [sort, posts])

  /**
   * 排序切换处理
   * 「关注」排序需要登录态：未登录时拦截并弹认证窗，阻止切换到 follow
   * 已登录直接切换即可，sortedPosts 中已按 follow 逻辑 slice 截断
   */
  const handleSort = (key) => {
    if (key === 'follow') {
      // requireAuth 未登录时返回 false，直接 return 不执行 setSort
      if (requireAuth('登录后查看关注流') === false) return
    }
    setSort(key)
  }

  /**
   * 点击帖子卡片跳转详情页
   * 使用 navigate 而非 Link 包裹整张卡片，避免语义嵌套错误
   * （卡片内部有作者、标签等潜在可交互区域，避免嵌套 a 标签）
   */
  const handleCardClick = (postId) => {
    navigate(`/forum/post/${postId}`)
  }

  // 重试按钮：递增 reloadKey 触发 useEffect 重新拉取
  const handleRetry = () => setReloadKey((k) => k + 1)

  // 加载中：骨架屏占位，保持页面布局稳定避免闪烁
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-8 space-y-4">
            <div className="h-7 bg-afmuted rounded-af-md animate-pulse" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-card border border-border rounded-af-lg p-5 space-y-3">
                <div className="h-5 bg-afmuted rounded w-3/4 animate-pulse" />
                <div className="h-4 bg-afmuted rounded w-full animate-pulse" />
                <div className="h-4 bg-afmuted rounded w-1/2 animate-pulse" />
              </div>
            ))}
          </section>
          <aside className="lg:col-span-4 space-y-4">
            {[0, 1].map((i) => (
              <div key={i} className="bg-card border border-border rounded-af-lg p-5 space-y-3">
                <div className="h-5 bg-afmuted rounded w-1/3 animate-pulse" />
                <div className="h-4 bg-afmuted rounded w-full animate-pulse" />
                <div className="h-4 bg-afmuted rounded w-2/3 animate-pulse" />
              </div>
            ))}
          </aside>
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
      {/*
        两栏 Grid 布局：
        - 桌面 >=1024px：12 列栅格，左 8 列内容流 + 右 4 列侧栏
        - 移动端 <1024px：单列堆叠，grid-cols-1 自动把侧栏排到左栏下方
        - 无需修改 DOM 顺序，使用 CSS grid 自动堆叠即可
      */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧推荐内容流 */}
        <section className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-semibold text-foreground">推荐内容</h1>
            <SortControls options={SORT_OPTIONS} value={sort} onChange={handleSort} />
          </div>

          {/* 帖子列表：使用 Boolean 避免 0 && 陷阱 */}
          {Boolean(sortedPosts.length) ? (
            sortedPosts.map((post) => {
              // 后端 JOIN 查询已内联 author/board 对象，无需再从 users/boards 数组查找
              const author = post.author
              const board = post.board
              return (
                <article
                  key={post.id}
                  onClick={() => handleCardClick(post.id)}
                  className="bg-card border border-border rounded-af-lg p-5 hover:border-afmuted-foreground/40 hover:shadow-af-1 transition-all cursor-pointer"
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
                      {/* 标签 pill：最多展示 2 个，窄屏 sm 以下隐藏，避免挤压作者信息 */}
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
            <div className="py-12 text-center text-afmuted-foreground text-sm">暂无内容</div>
          )}
        </section>

        {/* 右侧边栏：三区块自上而下 */}
        <aside className="lg:col-span-4 space-y-4">
          {/* 1) AI 推荐位 */}
          <div className="bg-card border border-border rounded-af-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="size-5 text-foreground" />
              <h2 className="font-semibold text-foreground">AI 推荐</h2>
            </div>
            <ul className="space-y-3">
              {AI_RECOMMENDS.map((rec, i) => (
                <li key={rec.id} className={i > 0 ? 'border-t border-border pt-3' : ''}>
                  <Link to="/forum/search" className="group block">
                    <p className="text-sm text-foreground group-hover:text-afmuted-foreground transition-colors">
                      {rec.text}
                    </p>
                    <span className="inline-flex items-center gap-1 mt-1.5 text-xs text-afmuted-foreground group-hover:text-foreground transition-colors">
                      查看相关讨论 <ArrowUpRight className="size-3" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 2) 热门话题：8 个 #t.name pill 样式 */}
          <div className="bg-card border border-border rounded-af-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="size-5 text-foreground" />
              <h2 className="font-semibold text-foreground">热门话题</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {topics.map((t) => (
                <Link
                  key={t.id}
                  to="/forum/search"
                  className="px-3 py-1.5 rounded-full border border-border bg-card text-sm text-foreground hover:bg-afmuted hover:border-afmuted-foreground/30 transition-colors"
                >
                  #{t.name}
                </Link>
              ))}
            </div>
          </div>

          {/* 3) 版块快捷入口：前 5 个版块，展示名称 + 帖子数 */}
          <div className="bg-card border border-border rounded-af-lg p-5">
            <h2 className="font-semibold text-foreground mb-4">版块快捷入口</h2>
            <ul className="space-y-1">
              {boards.slice(0, 5).map((b) => (
                <li key={b.id}>
                  <Link
                    to="/forum/boards"
                    className="flex items-center justify-between px-3 py-2 rounded-af-md hover:bg-afmuted transition-colors"
                  >
                    <span className="text-sm text-foreground">{b.name}</span>
                    <span className="text-xs text-afmuted-foreground">
                      {formatNumber(b.postCount)} 帖子
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
