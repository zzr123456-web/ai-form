import React, { useState, useMemo } from 'react'
import { Heart, MessageCircle, Send, X } from 'lucide-react'
import Avatar from './Avatar.jsx'
import { useAuth } from '../AuthProvider.jsx'

/**
 * 评论线程组件
 * - 渲染顶层评论列表 + 嵌套回复（最多 2 层展示，不再更深嵌套）
 * - 每条评论支持：点赞（调用父组件 onLikeComment 走后端 API）、回复
 * - 点赞高亮由父组件 likedCommentIds 控制（不再使用本地 likedMap，避免状态割裂）
 * @param {Array} comments 顶层评论数组（每条含 replies[]）
 * @param {Array} users 用户数组
 * @param {Function} formatRelativeTime 相对时间格式化工具
 * @param {Array<string>} likedCommentIds 当前用户已点赞的评论 id 列表
 * @param {Function} onLikeComment  (commentId:string)=>void   评论点赞回调
 * @param {Function} onReplySubmit   (parentId:string, content:string)=>Promise<{ok:boolean, error?:string}> 回复评论提交回调
 */
export default function CommentThread({
  comments, users, formatRelativeTime,
  likedCommentIds = [], onLikeComment, onReplySubmit,
}) {
  const { requireAuth } = useAuth()
  // 正在显示回复输入框的父评论 id（null 表示都不显示）
  const [replyTargetId, setReplyTargetId] = useState(null)
  // 回复输入框内容（按 parentId 分开保存）
  const [replyTextMap, setReplyTextMap] = useState({})
  // 回复提交 loading 状态
  const [replySubmittingId, setReplySubmittingId] = useState(null)

  // 快速查询 Set，避免每次 O(n) includes
  const likedSet = useMemo(() => new Set(likedCommentIds || []), [likedCommentIds])

  /** 评论点赞：未登录拦截，已登录交给父组件处理（持久化到 DB） */
  const toggleLike = (targetId) => {
    if (!requireAuth('登录后点赞')) return
    if (typeof onLikeComment === 'function') onLikeComment(targetId)
  }

  /** 点击"回复"按钮：展开/收起回复输入框 */
  const handleToggleReply = (commentId) => {
    if (!requireAuth('登录后回复评论')) return
    setReplyTargetId((prev) => (prev === commentId ? null : commentId))
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
    // 成功：清空输入框 + 收起输入框
    setReplyTextMap((prev) => ({ ...prev, [parentId]: '' }))
    setReplyTargetId(null)
  }

  // 无评论时由父组件渲染 EmptyState，此处只做防御性兜底
  if (!Boolean(comments?.length)) return null

  return (
    <div className="space-y-5">
      {comments.map((comment) => {
        const commentAuthor = users.find((u) => u.id === comment.authorId)
        const isCommentLiked = likedSet.has(comment.id)
        const replies = comment.replies || []
        const showReplyBox = replyTargetId === comment.id
        const replyBusy = replySubmittingId === comment.id

        return (
          <div key={comment.id} className="space-y-3">
            {/* ====== 一级评论 ====== */}
            <div className="flex gap-3">
              <Avatar text={commentAuthor?.avatarText} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-medium text-foreground">
                    {commentAuthor?.nickname || '匿名用户'}
                  </span>
                  <span className="text-xs text-afmuted-foreground">
                    {formatRelativeTime(comment.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed mb-2">
                  {comment.content}
                </p>
                <div className="flex items-center gap-3 text-xs text-afmuted-foreground">
                  <button
                    type="button"
                    onClick={() => toggleLike(comment.id)}
                    className={`flex items-center gap-1 transition-colors p-1 -m-1 rounded hover:bg-afmuted ${
                      isCommentLiked ? 'text-error' : 'hover:text-foreground'
                    }`}
                  >
                    <Heart
                      className={`size-3.5 ${isCommentLiked ? 'fill-current' : ''}`}
                    />
                    <span>{comment.likes || 0}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleReply(comment.id)}
                    className="flex items-center gap-1 hover:text-foreground transition-colors p-1 -m-1 rounded hover:bg-afmuted"
                  >
                    <MessageCircle className="size-3.5" />
                    <span>回复</span>
                  </button>
                </div>

                {/* ====== 一级评论的回复输入框（点击回复后展开） ====== */}
                {showReplyBox ? (
                  <div className="mt-3 rounded-af-lg border border-border p-3 bg-afmuted/20">
                    <textarea
                      value={replyTextMap[comment.id] || ''}
                      onChange={(e) => setReplyTextMap((prev) => ({
                        ...prev,
                        [comment.id]: e.target.value,
                      }))}
                      placeholder={`回复 @${commentAuthor?.nickname || '用户'}...`}
                      rows={2}
                      className="w-full rounded-af-md border border-input bg-background p-2 text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      disabled={replyBusy}
                    />
                    <div className="flex items-center justify-between mt-2">
                      <button
                        type="button"
                        onClick={() => setReplyTargetId(null)}
                        disabled={replyBusy}
                        className="inline-flex items-center gap-1 text-xs text-afmuted-foreground hover:text-foreground transition-colors disabled:opacity-60"
                      >
                        <X className="size-3" /> 取消
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSubmitReply(comment.id)}
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

            {/* ====== 二级回复（缩进层级，左侧边框视觉区分） ======
                 限制最多 2 层展示：不再递归 deeper 层，避免过深嵌套导致可读性下降 */}
            {Boolean(replies.length) ? (
              <div className="ml-11 space-y-3 pl-6 border-l-2 border-border">
                {replies.map((reply) => {
                  const replyAuthor = users.find((u) => u.id === reply.authorId)
                  const isReplyLiked = likedSet.has(reply.id)
                  return (
                    <div key={reply.id} className="flex gap-3">
                      <Avatar text={replyAuthor?.avatarText} size="xs" />
                      <div className="flex-1 min-w-0">
                        <div
                          className="rounded-af-lg bg-afmuted/50 p-3"
                        >
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-medium text-foreground">
                              {replyAuthor?.nickname || '匿名用户'}
                            </span>
                            <span className="text-xs text-afmuted-foreground">
                              {formatRelativeTime(reply.createdAt)}
                            </span>
                          </div>
                          <p className="text-sm text-foreground/90 leading-relaxed">
                            {reply.content}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-afmuted-foreground mt-1.5">
                          <button
                            type="button"
                            onClick={() => toggleLike(reply.id)}
                            className={`flex items-center gap-1 transition-colors p-1 -m-1 rounded hover:bg-afmuted ${
                              isReplyLiked ? 'text-error' : 'hover:text-foreground'
                            }`}
                          >
                            <Heart
                              className={`size-3.5 ${isReplyLiked ? 'fill-current' : ''}`}
                            />
                            <span>{reply.likes || 0}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
