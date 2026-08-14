import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Heart, MessageCircle, Send, X, Flag } from 'lucide-react'
import Avatar from './Avatar.jsx'
import ReportDialog from './ReportDialog.jsx'
import { useAuth } from '../AuthProvider.jsx'

/**
 * 递归查找评论：在任意层级的 comments 树中按 id 查找
 * 为什么用递归：后端已支持任意深度嵌套，前端需匹配以定位被回复人的昵称
 */
function findCommentById(comments, id) {
  if (!Array.isArray(comments)) return null
  for (const c of comments) {
    if (c.id === id) return c
    const found = findCommentById(c.replies, id)
    if (found) return found
  }
  return null
}

/**
 * 单条评论节点（递归组件）
 * - 支持任意深度嵌套渲染
 * - depth=0：顶层评论（完整样式 + 独立卡片）
 * - depth>=1：嵌套回复（缩进 + 左侧边框 + 紧凑卡片）
 * - 点赞/回复/举报等交互统一由父组件状态控制
 */
function CommentNode({
  comment, users, depth,
  likedSet, formatRelativeTime,
  replyTargetId, replyTextMap, replySubmittingId,
  onToggleReply, onSubmitReply, onReplyTextChange, onLike, onReport,
  onFindCommentById,
}) {
  const author = users.find((u) => u.id === comment.authorId)
  const isLiked = likedSet.has(comment.id)
  const replies = comment.replies || []
  const showReplyBox = replyTargetId === comment.id
  const replyBusy = replySubmittingId === comment.id
  // 本地 ref：用于在展开回复框时自动聚焦
  const textareaRef = useRef(null)

  // 当本评论成为回复目标时，自动聚焦输入框并将光标定位到末尾
  useEffect(() => {
    if (showReplyBox && textareaRef.current) {
      const el = textareaRef.current
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    }
  }, [showReplyBox])

  // 不同层级的样式
  const avatarSize = depth === 0 ? 'sm' : 'xs'
  const containerStyle = depth === 0
    ? 'flex gap-3'
    : 'flex gap-3'
  const bubbleStyle = depth === 0
    ? 'flex-1 min-w-0'
    : 'flex-1 min-w-0 rounded-af-lg bg-afmuted/50 p-3'
  const contentClass = depth === 0
    ? 'text-sm text-foreground/90 leading-relaxed mb-2'
    : 'text-sm text-foreground/90 leading-relaxed'

  return (
    <div className="space-y-3">
      <div className={containerStyle}>
        <Avatar text={author?.avatarText} size={avatarSize} />
        <div className={bubbleStyle}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {author?.nickname || '匿名用户'}
            </span>
            <span className="text-xs text-afmuted-foreground">
              {formatRelativeTime(comment.createdAt)}
            </span>
          </div>
          <p className={contentClass}>
            {comment.content}
          </p>

          {/* 操作栏：点赞 / 回复 / 举报 —— 所有层级都支持 */}
          <div className={`flex items-center gap-3 text-xs text-afmuted-foreground ${depth === 0 ? '' : 'mt-1.5'}`}>
            <button
              type="button"
              onClick={() => onLike(comment.id)}
              className={`flex items-center gap-1 transition-colors p-1 -m-1 rounded hover:bg-afmuted ${
                isLiked ? 'text-error' : 'hover:text-foreground'
              }`}
            >
              <Heart className={`size-3.5 ${isLiked ? 'fill-current' : ''}`} />
              <span>{comment.likes || 0}</span>
            </button>
            <button
              type="button"
              onClick={() => onToggleReply(comment.id)}
              className="flex items-center gap-1 hover:text-foreground transition-colors p-1 -m-1 rounded hover:bg-afmuted"
            >
              <MessageCircle className="size-3.5" />
              <span>回复</span>
            </button>
            <button
              type="button"
              onClick={() => onReport(comment.id)}
              className="flex items-center gap-1 hover:text-foreground transition-colors p-1 -m-1 rounded hover:bg-afmuted"
              aria-label="举报该评论"
            >
              <Flag className="size-3" />
            </button>
          </div>

          {/* 回复输入框：任意层级均可展开 */}
          {showReplyBox ? (
            <div className={`mt-3 rounded-af-lg border border-border p-3 bg-afmuted/20`}>
              <textarea
                ref={textareaRef}
                value={replyTextMap[comment.id] || ''}
                onChange={(e) => onReplyTextChange(comment.id, e.target.value)}
                placeholder="输入回复内容..."
                rows={2}
                className="w-full rounded-af-md border border-input bg-background p-2 text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                disabled={replyBusy}
              />
              <div className="flex items-center justify-between mt-2">
                <button
                  type="button"
                  onClick={() => onToggleReply(null)}
                  disabled={replyBusy}
                  className="inline-flex items-center gap-1 text-xs text-afmuted-foreground hover:text-foreground transition-colors disabled:opacity-60"
                >
                  <X className="size-3" /> 取消
                </button>
                <button
                  type="button"
                  onClick={() => onSubmitReply(comment.id)}
                  disabled={replyBusy || !(replyTextMap[comment.id] || '').trim()}
                  className="inline-flex items-center gap-1 h-7 px-3 rounded-af-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="size-3" />
                  {replyBusy ? '发送中...' : '发送回复'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 嵌套回复：递归渲染，depth+1 */}
      {Boolean(replies.length) ? (
        <div className={`${depth === 0 ? 'ml-11 pl-6 border-l-2 border-border' : 'ml-6 pl-4 border-l-2 border-border/60'}`}>
          {replies.map((reply) => (
            <CommentNode
              key={reply.id}
              comment={reply}
              users={users}
              depth={depth + 1}
              likedSet={likedSet}
              formatRelativeTime={formatRelativeTime}
              replyTargetId={replyTargetId}
              replyTextMap={replyTextMap}
              replySubmittingId={replySubmittingId}
              onToggleReply={onToggleReply}
              onSubmitReply={onSubmitReply}
              onReplyTextChange={onReplyTextChange}
              onLike={onLike}
              onReport={onReport}
              onFindCommentById={onFindCommentById}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/**
 * 评论线程组件（顶层容器）
 * - 渲染顶层评论列表 + 任意深度嵌套回复（通过递归 CommentNode 实现）
 * - 每条评论支持：点赞、回复、举报
 * @param {Array} comments 顶层评论数组（每条含 replies[]，replies 内可继续嵌套）
 * @param {Array} users 用户数组
 * @param {Function} formatRelativeTime 相对时间格式化工具
 * @param {Array<string>} likedCommentIds 当前用户已点赞的评论 id 列表
 * @param {Function} onLikeComment  (commentId:string)=>void   评论点赞回调
 * @param {Function} onReplySubmit   (parentId:string, content:string)=>Promise<{ok:boolean, error?:string}> 回复提交回调
 */
export default function CommentThread({
  comments, users, formatRelativeTime,
  likedCommentIds = [], onLikeComment, onReplySubmit,
}) {
  const { requireAuth } = useAuth()
  // 正在显示回复输入框的父评论 id（null 表示都不显示）
  const [replyTargetId, setReplyTargetId] = useState(null)
  // 回复输入框内容（按 commentId 分开保存）
  const [replyTextMap, setReplyTextMap] = useState({})
  // 回复提交 loading 状态
  const [replySubmittingId, setReplySubmittingId] = useState(null)
  // 举报目标评论 id（null 表示弹窗关闭）
  const [reportCommentId, setReportCommentId] = useState(null)

  const likedSet = useMemo(() => new Set(likedCommentIds || []), [likedCommentIds])

  /** 全树范围的评论查找：供嵌套回复定位被回复人昵称 */
  const findCommentInTree = useCallback(
    (id) => findCommentById(comments, id),
    [comments]
  )

  /** 评论点赞：未登录拦截 */
  const toggleLike = (targetId) => {
    if (!requireAuth('登录后点赞')) return
    if (typeof onLikeComment === 'function') onLikeComment(targetId)
  }

  /** 点击"回复"按钮：展开回复输入框并自动插入 @昵称 前缀 */
  const handleToggleReply = (commentId) => {
    if (!requireAuth('登录后回复评论')) return
    if (replyTargetId === commentId) {
      setReplyTargetId(null)
      return
    }
    // 在全树中查找被回复人的昵称（支持任意深度嵌套）
    const targetComment = findCommentInTree(commentId)
    const targetAuthor = targetComment
      ? users.find((u) => u.id === targetComment.authorId)
      : null
    const nickname = targetAuthor?.nickname || '用户'
    const prefix = `@${nickname} `
    setReplyTextMap((prev) => ({
      ...prev,
      [commentId]: prev[commentId]?.startsWith(`@${nickname}`)
        ? prev[commentId]
        : `${prefix}${prev[commentId] || ''}`,
    }))
    setReplyTargetId(commentId)
  }

  /** 回复输入框内容变更 */
  const handleReplyTextChange = (commentId, value) => {
    setReplyTextMap((prev) => ({ ...prev, [commentId]: value }))
  }

  /** 提交回复：交给父组件 onReplySubmit */
  const handleSubmitReply = async (parentId) => {
    if (!requireAuth('登录后回复评论')) return
    if (!onReplySubmit) return
    const content = (replyTextMap[parentId] || '').trim()
    if (!content) return
    setReplySubmittingId(parentId)
    const result = await onReplySubmit(parentId, content)
    setReplySubmittingId(null)
    if (!result.ok) {
      alert(`回复失败：${result.error || '请稍后重试'}`)
      return
    }
    setReplyTextMap((prev) => ({ ...prev, [parentId]: '' }))
    setReplyTargetId(null)
  }

  /** 举报评论 */
  const handleReport = (commentId) => {
    if (!requireAuth('登录后举报')) return
    setReportCommentId(commentId)
  }

  if (!Boolean(comments?.length)) return null

  return (
    <>
    <div className="space-y-5">
      {comments.map((comment) => (
        <CommentNode
          key={comment.id}
          comment={comment}
          users={users}
          depth={0}
          likedSet={likedSet}
          formatRelativeTime={formatRelativeTime}
          replyTargetId={replyTargetId}
          replyTextMap={replyTextMap}
          replySubmittingId={replySubmittingId}
          onToggleReply={handleToggleReply}
          onSubmitReply={handleSubmitReply}
          onReplyTextChange={handleReplyTextChange}
          onLike={toggleLike}
          onReport={handleReport}
          onFindCommentById={findCommentInTree}
        />
      ))}
    </div>

      {reportCommentId ? (
        <ReportDialog
          target_type="comment"
          target_id={reportCommentId}
          onClose={() => setReportCommentId(null)}
        />
      ) : null}
    </>
  )
}
