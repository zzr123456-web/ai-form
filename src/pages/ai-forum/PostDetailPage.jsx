import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Sparkles, Heart, Star, Flag, Share2, MessageCircle,
  ChevronRight, Home, Eye, Send, Bot, Loader2,
} from 'lucide-react'
import Avatar from '../../components/ai-forum/common/Avatar.jsx'
import TagPill from '../../components/ai-forum/common/TagPill.jsx'
import EmptyState from '../../components/ai-forum/common/EmptyState.jsx'
import CommentThread from '../../components/ai-forum/common/CommentThread.jsx'
import ReportDialog from '../../components/ai-forum/common/ReportDialog.jsx'
import AISummaryCard from '../../components/ai-forum/ai/AISummaryCard.jsx'
import { useAuth } from '../../components/ai-forum/AuthProvider.jsx'
import {
  getPost, getComments,
  getInteractions, togglePostLike, togglePostFavorite, createComment, toggleCommentLike,
} from '../../utils/ai-forum/apiClient.js'
import { formatRelativeTime, formatNumber } from '../../utils/ai-forum/aiForumUtils.js'

export default function PostDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { requireAuth } = useAuth()

  // ====== 数据状态：post / comments / relatedPosts 均来自后端 API ======
  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [relatedPosts, setRelatedPosts] = useState([])
  // 相关推荐独立 loading：主帖渲染后用骨架屏占位，专用端点返回后填充
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ====== 互动状态：与后端同步，未登录走 requireAuth 拦截 ======
  const [liked, setLiked] = useState(false)
  const [favored, setFavored] = useState(false)
  const [commentText, setCommentText] = useState('')
  // 当前用户已点赞过的评论 id 列表（传至 CommentThread 控制高亮）
  const [likedCommentIds, setLikedCommentIds] = useState([])
  // 评论提交 / 点赞提交 loading，避免重复触发
  const [submittingComment, setSubmittingComment] = useState(false)
  // 举报弹窗显示状态：点击举报按钮时打开 ReportDialog
  const [showReportDialog, setShowReportDialog] = useState(false)
  // AI 回复轮询：检测到 AI 生成中时自动拉取评论，最长 60s
  // - isAIThinking：true 时显示"AI 小助手正在思考中..."提示
  // - aiPollingTimerRef：轮询定时器引用，卸载/取消时清理
  // - aiPollingCountRef：当前轮询次数，到上限后停止
  const [isAIThinking, setIsAIThinking] = useState(false)
  const aiPollingTimerRef = useRef(null)
  const aiPollingCountRef = useRef(0)
  // 记录上一次评论数量（顶层+嵌套），轮询时用于判断是否有新评论（AI 写入了 DB）
  const lastCommentCountRef = useRef(0)
  // 单次 AI 轮询上限：发帖 AI 评论通常 <10s 生成，@ai小助手 回复通常 <15s，给 30 次 x 2s = 60s 缓冲
  const AI_POLLING_MAX_TIMES = 30
  const AI_POLLING_INTERVAL_MS = 2000

  // ====== 数据加载：postId 变化时重新拉取帖子 + 评论 + 互动状态 ======
  // cancelled 标志防止快速切换路由时旧请求覆盖新状态（组件已卸载仍 setState）
  useEffect(() => {
    let cancelled = false

    async function loadPostDetail() {
      setLoading(true)
      setError(null)
      setPost(null)
      setComments([])
      setRelatedPosts([])
      setRelatedLoading(true)
      setLiked(false)
      setFavored(false)
      setLikedCommentIds([])

      // 并行加载帖子与评论，减少串行等待
      const [postData, commentsData, interactionsData] = await Promise.all([
        getPost(id),
        getComments(id),
        getInteractions(id), // 获取当前用户的点赞/收藏状态
      ])

      if (cancelled) return

      // getPost 失败（返回 null）：标记错误并退出
      if (!postData) {
        setError('帖子不存在或加载失败')
        setLoading(false)
        return
      }

      // 将帖子数据写入 state；若当前用户已点赞则补偿 +1（让 post.likes 始终包含本人的赞）
      if (interactionsData?.liked) {
        setPost({ ...postData, likes: (postData.likes || 0) + 1 })
      } else {
        setPost(postData)
      }
      // getComments 失败时兜底为空数组，不影响帖子主体展示
      const _comments = Array.isArray(commentsData) ? commentsData : []
      setComments(_comments)
      // 互动状态：未登录/无记录时保持默认 false
      if (interactionsData) {
        setLiked(!!interactionsData.liked)
        setFavored(!!interactionsData.favored)
        setLikedCommentIds(Array.isArray(interactionsData.likedCommentIds) ? interactionsData.likedCommentIds : [])
      }
      setLoading(false)

      // 进入帖子详情时：若帖子创建时间 < 60 秒（刚发布）且评论中还没有 AI 小助手的评论，
      // 启动一轮 AI 轮询——覆盖"发帖后跳转过来但 AI 评论还没生成"的场景
      try {
        if (postData?.createdAt) {
          const postAgeSec = (Date.now() - new Date(postData.createdAt).getTime()) / 1000
          // 检查是否已有 AI 小助手的评论（author.nickname === 'AI小助手' 或 author.id 以 u_ai 开头）
          let hasAIComment = false
          for (const c of _comments) {
            if (c.author && (c.author.id === 'u_ai_assistant' || c.author.nickname === 'AI小助手')) {
              hasAIComment = true; break
            }
            for (const r of (c.replies || [])) {
              if (r.author && (r.author.id === 'u_ai_assistant' || r.author.nickname === 'AI小助手')) {
                hasAIComment = true; break
              }
            }
            if (hasAIComment) break
          }
          if (postAgeSec < 120 && !hasAIComment) {
            console.log(`[AI:polling] 新发帖进入详情页 postAge=${postAgeSec.toFixed(0)}s 无AI评论，启动轮询`)
            startAIPolling()
          }
        }
      } catch { /* startAIPolling 依赖已定义在下方,用 setTimeout 延后防时序问题 */ }

      // 相关推荐：走专用端点 GET /posts/:id/related，best-effort 加载，失败不影响主流程
      // 不依赖 apiClient.js（避免与并行更新冲突），inline fetch 复用同一鉴权模式
      try {
        let token = null
        try { token = localStorage.getItem('af_token') } catch { token = null }
        const headers = {}
        if (token) headers.Authorization = `Bearer ${token}`
        const relRes = await fetch(`/api/forum/posts/${id}/related`, { headers })
        if (cancelled) return
        if (relRes.ok) {
          const relText = await relRes.text()
          let relData = null
          try { relData = relText ? JSON.parse(relText) : null } catch { relData = null }
          // 兼容数组 / {items} 两种返回形态
          let relList = []
          if (Array.isArray(relData)) relList = relData
          else if (relData && Array.isArray(relData.items)) relList = relData.items
          // 过滤当前帖，最多展示 5 条
          setRelatedPosts(relList.filter((p) => p.id !== id).slice(0, 5))
        } else {
          setRelatedPosts([])
        }
      } catch {
        setRelatedPosts([])
      } finally {
        // cancelled 时跳过，避免覆盖新请求的 loading 状态
        if (!cancelled) setRelatedLoading(false)
      }
    }

    loadPostDetail()

    // 清理函数：组件卸载或 postId 变化时标记取消，避免对已卸载组件更新状态
    return () => { cancelled = true }
  }, [id])

  // ====== 评论总数：顶层评论 + 嵌套 replies 数量之和 ======
  const totalCommentsCount = useMemo(() => {
    let sum = comments.length
    for (const c of comments) {
      if (c.replies && Array.isArray(c.replies)) {
        sum += c.replies.length
      }
    }
    return sum
  }, [comments])

  // ====== 从评论嵌套 author 提取 users 数组 ======
  // 为什么这样做：CommentThread 组件签名要求 users 数组并通过 users.find 查作者，
  // 后端返回的 comment.author 是嵌套对象，这里抽取后传入以保持组件接口不变
  const usersFromComments = useMemo(() => {
    const map = new Map()
    for (const c of comments) {
      if (c.author) map.set(c.author.id, c.author)
      for (const r of (c.replies || [])) {
        if (r.author) map.set(r.author.id, r.author)
      }
    }
    return Array.from(map.values())
  }, [comments])

  // ====== AI 回复轮询：异步 AI 生成期间自动刷新评论 ======

  /** 清空当前 AI 轮询定时器（调用前先做非空、非活跃检查） */
  const clearAIPollingTimer = () => {
    if (aiPollingTimerRef.current) {
      clearInterval(aiPollingTimerRef.current)
      aiPollingTimerRef.current = null
    }
  }

  /** 启动 AI 轮询：每 AI_POLLING_INTERVAL_MS 拉一次评论，直到检测到评论数变化或达到上限 */
  const startAIPolling = () => {
    // 已在运行时不重复启动，避免多个定时器叠加
    if (aiPollingTimerRef.current) return
    aiPollingCountRef.current = 0
    // 记录当前评论数量，轮询时对比变化——只有评论数增加才说明 AI 写入了新回复
    lastCommentCountRef.current = totalCommentsCount
    setIsAIThinking(true)
    console.log(`[AI:polling] 启动轮询 当前评论数=${lastCommentCountRef.current}`)
    aiPollingTimerRef.current = setInterval(async () => {
      aiPollingCountRef.current += 1
      try {
        const fresh = await getComments(id)
        const freshList = Array.isArray(fresh) ? fresh : []
        // 统计新评论总数
        let newCount = freshList.length
        for (const c of freshList) {
          if (c.replies && Array.isArray(c.replies)) newCount += c.replies.length
        }
        console.log(`[AI:polling] 第${aiPollingCountRef.current}次 新评论数=${newCount} 旧数=${lastCommentCountRef.current}`)
        if (newCount > lastCommentCountRef.current) {
          // 评论数增加：说明 AI 已写入，刷新并退出轮询
          setComments(freshList)
          lastCommentCountRef.current = newCount
          console.log(`[AI:polling] 检测到新评论，停止轮询`)
          setIsAIThinking(false)
          clearAIPollingTimer()
          return
        }
      } catch (err) {
        console.warn(`[AI:polling] 拉取评论失败: ${err.message}`)
      }
      if (aiPollingCountRef.current >= AI_POLLING_MAX_TIMES) {
        console.log(`[AI:polling] 达到最大次数${AI_POLLING_MAX_TIMES}，停止轮询`)
        setIsAIThinking(false)
        clearAIPollingTimer()
      }
    }, AI_POLLING_INTERVAL_MS)
  }

  /** 检查评论内容是否包含 @ai小助手 召唤词 */
  const containsAIMention = (text) => /@ai[_\-]*(小?)助手/i.test(text || '')

  // 组件卸载或 postId 变化时清理轮询定时器（与 useEffect 的清理函数配合）
  useEffect(() => {
    return () => {
      clearAIPollingTimer()
    }
  }, [id])

  // ====== 互动事件处理：全部接入真实 API 持久化 ======

  /** 帖子点赞：未登录拦截，已登录调用 POST /posts/:id/like（toggle） */
  const handleLike = async () => {
    if (!requireAuth('登录后点赞')) return
    // 先乐观更新 UI，失败再回滚
    const prevLiked = liked
    const prevLikes = post?.likes || 0
    setLiked((v) => !v)
    if (post) {
      setPost({ ...post, likes: prevLikes + (prevLiked ? -1 : 1) })
    }

    const result = await togglePostLike(id)
    if (!result.ok) {
      // 失败回滚
      setLiked(prevLiked)
      if (post) setPost({ ...post, likes: prevLikes })
      alert(`点赞失败：${result.error || '请稍后重试'}`)
    }
  }

  /** 收藏：未登录拦截，已登录调用 POST /posts/:id/favorite（toggle） */
  const handleSave = async () => {
    if (!requireAuth('登录后收藏')) return
    const prevFavored = favored
    const prevFavCount = post?.favoritesCount || 0
    setFavored((v) => !v)
    if (post) {
      setPost({ ...post, favoritesCount: prevFavCount + (prevFavored ? -1 : 1) })
    }

    const result = await togglePostFavorite(id)
    if (!result.ok) {
      setFavored(prevFavored)
      if (post) setPost({ ...post, favoritesCount: prevFavCount })
      alert(`收藏失败：${result.error || '请稍后重试'}`)
    }
  }

  /** 举报：未登录拦截，已登录打开举报弹窗 */
  const handleFlag = () => {
    if (!requireAuth('登录后举报')) return
    setShowReportDialog(true)
  }

  /** 分享：占位实现，Phase2 接入复制到剪贴板 */
  const handleShare = () => {
    alert('分享链接已复制')
  }

  /** 发布评论：未登录拦截，已登录调用 POST /posts/:id/comments 写入数据库 */
  const handleCommentSubmit = async () => {
    if (!requireAuth('登录后发表评论')) return
    const text = commentText.trim()
    if (!text || submittingComment) return

    setSubmittingComment(true)
    const result = await createComment(id, text)
    setSubmittingComment(false)

    if (!result.ok) {
      alert(`评论失败：${result.error || '请稍后重试'}`)
      return
    }
    // 成功：后端返回最新评论树，直接替换；清空输入框
    if (Array.isArray(result.comments) && result.comments.length > 0) {
      setComments(result.comments)
    } else {
      // 若后端未返回全量（兼容场景），重新拉取一次
      const fresh = await getComments(id)
      setComments(Array.isArray(fresh) ? fresh : [])
    }
    setCommentText('')
    // 同步帖子 comments_count
    if (post) setPost({ ...post, commentsCount: (post.commentsCount || 0) + 1 })
    // 如果包含 @ai小助手 召唤词，启动 AI 回复轮询（异步生成期间自动刷新评论）
    if (containsAIMention(text)) {
      startAIPolling()
    }
  }

  /**
   * 评论点赞（含一级/二级评论）
   * 由 CommentThread 调用，传 commentId
   */
  const handleLikeComment = async (commentId) => {
    if (!requireAuth('登录后点赞评论')) return
    if (!commentId) return

    // 乐观更新：切换 likedCommentIds，并更新对应评论 likes 计数 +-1
    const prevSet = new Set(likedCommentIds)
    const wasLiked = prevSet.has(commentId)
    const nextLikedIds = wasLiked
      ? likedCommentIds.filter((x) => x !== commentId)
      : [...likedCommentIds, commentId]
    setLikedCommentIds(nextLikedIds)

    // 更新评论树中对应条目的 likes 数字（顶层 + replies 都要找）
    function applyDelta(list, targetId, delta) {
      return list.map((c) => {
        if (c.id === targetId) return { ...c, likes: (c.likes || 0) + delta }
        if (c.replies?.length) return { ...c, replies: applyDelta(c.replies, targetId, delta) }
        return c
      })
    }
    setComments((prev) => applyDelta(prev, commentId, wasLiked ? -1 : 1))

    const result = await toggleCommentLike(commentId)
    if (!result.ok) {
      // 失败回滚
      setLikedCommentIds(likedCommentIds)
      setComments((prev) => applyDelta(prev, commentId, wasLiked ? 1 : -1))
      // 不弹窗干扰，仅 console 提示
      console.warn('[likeComment] 失败:', result.error)
    }
  }

  /**
   * 回复评论（楼中楼）：CommentThread 提交回复时调用
   * @param {string} parentId 父评论 id（一级评论 id，不做更深嵌套）
   * @param {string} content  回复内容
   */
  const handleReplySubmit = async (parentId, content) => {
    if (!requireAuth('登录后回复评论')) return { ok: false, error: '未登录' }
    const text = (content || '').trim()
    if (!text || !parentId) return { ok: false, error: '内容或父评论缺失' }

    const result = await createComment(id, text, parentId)
    if (!result.ok) return result

    // 成功：替换评论树 + 更新计数
    if (Array.isArray(result.comments) && result.comments.length > 0) {
      setComments(result.comments)
    }
    if (post) setPost({ ...post, commentsCount: (post.commentsCount || 0) + 1 })
    // 如果包含 @ai小助手 召唤词，启动 AI 回复轮询
    if (containsAIMention(text)) {
      startAIPolling()
    }
    return { ok: true }
  }

  // ====== Loading：骨架屏 ======
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-card border border-border rounded-af-xl p-5 sm:p-7 animate-pulse">
              <div className="h-6 w-3/4 bg-afmuted/50 rounded mb-4" />
              <div className="h-4 w-1/2 bg-afmuted/40 rounded mb-6" />
              <div className="space-y-3">
                <div className="h-4 w-full bg-afmuted/30 rounded" />
                <div className="h-4 w-full bg-afmuted/30 rounded" />
                <div className="h-4 w-5/6 bg-afmuted/30 rounded" />
              </div>
            </div>
            <div className="bg-card border border-border rounded-af-xl p-5 sm:p-6 animate-pulse">
              <div className="h-5 w-24 bg-afmuted/50 rounded mb-5" />
              <div className="space-y-4">
                <div className="h-4 w-full bg-afmuted/30 rounded" />
                <div className="h-4 w-full bg-afmuted/30 rounded" />
              </div>
            </div>
          </div>
          <aside className="lg:col-span-4">
            <div className="bg-card border border-border rounded-af-lg p-5 animate-pulse">
              <div className="h-5 w-28 bg-afmuted/50 rounded mb-4" />
              <div className="space-y-3">
                <div className="h-3 w-full bg-afmuted/30 rounded" />
                <div className="h-3 w-full bg-afmuted/30 rounded" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    )
  }

  // ====== Error / 帖子不存在 ======
  if (error || !post) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <EmptyState
          icon={MessageCircle}
          title={error || '帖子不存在'}
          description="帖子可能已被删除或链接有误"
          action={
            <Link to="/forum" className="text-sm text-foreground underline">
              返回首页
            </Link>
          }
        />
      </div>
    )
  }

  // 作者、版块信息：使用 API 返回的嵌套对象，无需 findUser/findBoard
  const author = post.author
  const board = post.board

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* 面包屑导航 */}
      <nav className="flex items-center gap-1.5 text-sm text-afmuted-foreground mb-6 flex-wrap">
        <Link
          to="/forum"
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <Home className="size-3.5" /> 首页
        </Link>
        <ChevronRight className="size-3.5" />
        <Link to="/forum/boards" className="hover:text-foreground transition-colors">
          {board?.name || '版块列表'}
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground truncate">帖子详情</span>
      </nav>

      {/* ====== 页面主体：12 列 grid，<1024px 自动堆叠为单列（右栏移底） ====== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* ====== 左栏：8/12 ====== */}
        <div className="lg:col-span-8 space-y-6 min-w-0">
          {/* ========== a) 帖子主体卡 ========== */}
          <article className="bg-card border border-border rounded-af-xl p-5 sm:p-7">
            {/* 标签行：Boolean() 保护避免 0 && 渲染陷阱 */}
            {Boolean(post.tags?.length) ? (
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {post.tags.map((tag) => (
                  <TagPill key={tag} variant="bg">
                    {tag}
                  </TagPill>
                ))}
              </div>
            ) : null}

            {/* 标题：text-2xl font-bold，比首页卡片标题更大，突出层级 */}
            <h1 className="text-2xl font-bold text-foreground mb-4 leading-tight">
              {post.title}
            </h1>

            {/* 作者信息卡：Avatar(size='sm') + nickname + 所属版块 + 相对时间 */}
            <div className="flex items-center gap-3 text-xs text-afmuted-foreground mb-6 flex-wrap">
              <Avatar text={author?.avatarText} size="sm" />
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  to="/forum/profile"
                  className="text-foreground font-medium hover:underline underline-offset-2"
                >
                  {author?.nickname || '匿名用户'}
                </Link>
                <span>·</span>
                <span className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                  {board?.name || '未分类'}
                </span>
                <span>·</span>
                <span>{formatRelativeTime(post.createdAt)}</span>
                <span className="hidden sm:inline-flex items-center gap-1">
                  · <Eye className="size-3.5" /> {formatNumber(post.views || 0)} 阅读
                </span>
              </div>
            </div>

            {/* ====== 正文 HTML 渲染 ======
                 注意：后端返回的 content 为 HTML 字符串，
                 后续应接入 XSS 安全的解析器（如 DOMPurify + sanitize-html） */}
            <div
              className="af-post-body text-foreground"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />

            {/* ====== AI 摘要占位卡 ====== */}
            {post.aiSummary ? (
              <div className="mt-8 rounded-af-lg border border-border bg-afmuted/30 p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="size-5 text-foreground" />
                  <h3 className="text-base font-semibold text-foreground">AI 总结</h3>
                </div>
                <p className="text-sm text-foreground/85 leading-relaxed">
                  {post.aiSummary}
                </p>
              </div>
            ) : null}

            {/* ====== 互动工具栏：4 个按钮一行水平排列 ====== */}
            {/* <600px（max-[600px]）按钮放大触控区：px-4 py-2.5 增加点击热区 */}
            <div className="flex items-center justify-between gap-3 mt-6 pt-5 border-t border-border">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {/* 点赞 Heart：本地 liked 切换，数字 ±1 */}
                <button
                  type="button"
                  onClick={handleLike}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 max-[600px]:px-4 max-[600px]:py-2.5 text-sm font-medium transition-colors ${
                    liked
                      ? 'border-error bg-error/10 text-error'
                      : 'border-border bg-card text-foreground hover:bg-afmuted'
                  }`}
                >
                  <Heart className={`size-4 ${liked ? 'fill-current' : ''}`} />
                  {formatNumber(post.likes || 0)}
                </button>

                {/* 收藏 Star：requireAuth 拦截；已登录本地 favored 切换视觉 */}
                <button
                  type="button"
                  onClick={handleSave}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 max-[600px]:px-4 max-[600px]:py-2.5 text-sm font-medium transition-colors ${
                    favored
                      ? 'border-foreground bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-afmuted'
                  }`}
                >
                  <Star className={`size-4 ${favored ? 'fill-current' : ''}`} />
                  {favored ? '已收藏' : '收藏'}
                </button>

                {/* 举报 Flag：requireAuth 拦截；已登录弹出 toast 提示 */}
                <button
                  type="button"
                  onClick={handleFlag}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card text-foreground hover:bg-afmuted px-3 py-1.5 max-[600px]:px-4 max-[600px]:py-2.5 text-sm font-medium transition-colors"
                >
                  <Flag className="size-4" /> 举报
                </button>

                {/* 分享 Share：占位按钮，点击 alert 提示 */}
                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card text-foreground hover:bg-afmuted px-3 py-1.5 max-[600px]:px-4 max-[600px]:py-2.5 text-sm font-medium transition-colors"
                >
                  <Share2 className="size-4" /> 分享
                </button>
              </div>
            </div>
          </article>

          {/* ========== b) 评论区 ========== */}
          <section className="bg-card border border-border rounded-af-xl p-5 sm:p-6">
            {/* 标题：顶层评论数 + 回复数总和 */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-foreground">
                评论 <span className="text-afmuted-foreground font-normal">({totalCommentsCount})</span>
              </h2>
              {/* AI 小助手正在思考中状态提示（轮询进行中显示） */}
              {isAIThinking ? (
                <div className="inline-flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
                  <Bot className="size-3.5" />
                  <Loader2 className="size-3 animate-spin" />
                  <span>AI 小助手正在思考中...</span>
                </div>
              ) : null}
            </div>

            {/* 评论输入框占位 */}
            <div className="mb-6">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="写下你的评论..."
                rows={3}
                className="w-full rounded-af-lg border border-input bg-background p-3 text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={handleCommentSubmit}
                  disabled={submittingComment}
                  className="inline-flex items-center gap-1.5 h-8 px-4 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Send className="size-3.5" />
                  {submittingComment ? '提交中...' : '发布评论'}
                </button>
              </div>
            </div>

            {/* 评论列表：有数据 → CommentThread；无数据 → EmptyState */}
            {Boolean(comments.length) ? (
              <CommentThread
                comments={comments}
                users={usersFromComments}
                formatRelativeTime={formatRelativeTime}
                likedCommentIds={likedCommentIds}
                onLikeComment={handleLikeComment}
                onReplySubmit={handleReplySubmit}
              />
            ) : (
              <EmptyState
                icon={MessageCircle}
                title="暂无评论"
                description="抢个沙发，写下第一条评论吧"
              />
            )}
          </section>

          {/* ========== c) 相关推荐（专用端点 + 骨架屏）========== */}
          <section className="bg-card border border-border rounded-af-xl p-5 sm:p-6">
            <h2 className="font-semibold text-foreground mb-4">相关推荐</h2>

            {relatedLoading ? (
              // 骨架屏：5 条占位卡片，避免内容加载时布局跳动
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="animate-pulse rounded-af-md border border-border p-3">
                    <div className="h-4 w-3/4 bg-afmuted/40 rounded mb-2" />
                    <div className="h-3 w-1/3 bg-afmuted/30 rounded" />
                  </div>
                ))}
              </div>
            ) : Boolean(relatedPosts.length) ? (
              <div className="space-y-3">
                {relatedPosts.map((rp) => {
                  // 相关推荐作者信息从嵌套 author 取
                  const rpAuthor = rp.author
                  return (
                    <button
                      key={rp.id}
                      type="button"
                      onClick={() => navigate(`/forum/post/${rp.id}`)}
                      className="group block w-full text-left rounded-af-md border border-border p-3 hover:border-afmuted-foreground/40 hover:bg-afmuted/30 transition-colors"
                    >
                      {/* 标题 1 行截断，紧凑卡片样式 */}
                      <h3 className="text-sm font-medium text-foreground group-hover:text-afmuted-foreground transition-colors mb-1.5 line-clamp-1 leading-snug">
                        {rp.title}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-afmuted-foreground">
                        <span className="truncate">{rpAuthor?.nickname || '匿名'}</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <Heart className="size-3" /> {formatNumber(rp.likes || 0)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-afmuted-foreground text-center py-4">暂无相关推荐</p>
            )}
          </section>
        </div>

        {/* ====== 右栏：4/12，<1024px grid 自动堆叠至评论区下方 ====== */}
        <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-20 lg:self-start">
          {/* AI 讨论总结卡 */}
          <div className="mb-4">
            <AISummaryCard postId={id} />
          </div>
        </aside>
      </div>

      {/* 举报弹窗：showReportDialog 为 true 时渲染 */}
      {showReportDialog ? (
        <ReportDialog
          target_type="post"
          target_id={id}
          onClose={() => setShowReportDialog(false)}
        />
      ) : null}
    </div>
  )
}
