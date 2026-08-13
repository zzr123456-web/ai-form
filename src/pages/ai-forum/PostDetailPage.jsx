import React, { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  Sparkles, Heart, Star, Flag, Share2, MessageCircle,
  ChevronRight, Home, Eye, Send,
} from 'lucide-react'
import Avatar from '../../components/ai-forum/common/Avatar.jsx'
import TagPill from '../../components/ai-forum/common/TagPill.jsx'
import EmptyState from '../../components/ai-forum/common/EmptyState.jsx'
import CommentThread from '../../components/ai-forum/common/CommentThread.jsx'
import { useAuth } from '../../components/ai-forum/AuthProvider.jsx'
import {
  getPost, getComments, getPosts,
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

      setPost(postData)
      // getComments 失败时兜底为空数组，不影响帖子主体展示
      setComments(Array.isArray(commentsData) ? commentsData : [])
      // 互动状态：未登录/无记录时保持默认 false
      if (interactionsData) {
        setLiked(!!interactionsData.liked)
        setFavored(!!interactionsData.favored)
        setLikedCommentIds(Array.isArray(interactionsData.likedCommentIds) ? interactionsData.likedCommentIds : [])
      }
      setLoading(false)

      // 相关推荐：best-effort 加载，失败不影响主流程
      // 基于第一个 tag 查询同标签帖子，过滤当前帖后取前 5 条
      if (postData.tags?.length > 0) {
        const related = await getPosts({ tag: postData.tags[0], limit: 6 })
        if (cancelled) return
        setRelatedPosts(
          (Array.isArray(related) ? related : [])
            .filter((p) => p.id !== id)
            .slice(0, 5)
        )
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

  /** 举报：未登录拦截，已登录弹出提示（运营后台工单 Phase2 接入） */
  const handleFlag = () => {
    if (!requireAuth('登录后举报')) return
    alert('举报已提交，运营会尽快处理')
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
                  {formatNumber((post.likes || 0) + (liked ? 1 : 0))}
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
            <h2 className="font-semibold text-foreground mb-5">
              评论 <span className="text-afmuted-foreground font-normal">({totalCommentsCount})</span>
            </h2>

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
        </div>

        {/* ====== 右栏：4/12，<1024px grid 自动堆叠至评论区下方 ====== */}
        <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-20 lg:self-start">
          {/* 相关推荐卡 */}
          <div className="bg-card border border-border rounded-af-lg p-5">
            <h2 className="font-semibold text-foreground mb-4">相关推荐</h2>

            {Boolean(relatedPosts.length) ? (
              <div className="space-y-4">
                {relatedPosts.map((rp) => {
                  // 相关推荐作者信息从嵌套 author 取
                  const rpAuthor = rp.author
                  return (
                    // 使用 onClick navigate 而非 to prop，符合 checklist 要求
                    <button
                      key={rp.id}
                      type="button"
                      onClick={() => navigate(`/forum/post/${rp.id}`)}
                      className="group block w-full text-left"
                    >
                      {/* 标题 2 行截断 */}
                      <h3 className="text-sm font-medium text-foreground group-hover:text-afmuted-foreground transition-colors mb-2 line-clamp-2 leading-snug">
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
              <EmptyState
                icon={MessageCircle}
                title="暂无相关推荐"
                description="后续会补充更多相似帖子"
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
