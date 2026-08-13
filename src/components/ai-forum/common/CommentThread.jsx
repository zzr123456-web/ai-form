import React, { useState } from 'react'
import { Heart, MessageCircle } from 'lucide-react'
import Avatar from './Avatar.jsx'
import { useAuth } from '../AuthProvider.jsx'

/**
 * 评论线程组件
 * - 渲染顶层评论列表 + 嵌套回复（最多 2 层展示，不再更深嵌套）
 * - 每条评论支持：点赞（本地状态切换）、回复按钮占位
 * @param {Array} comments 顶层评论数组（每条含 replies[]）
 * @param {Array} users 用户数组
 * @param {Function} formatRelativeTime 相对时间格式化工具
 */
export default function CommentThread({ comments, users, formatRelativeTime }) {
  const { requireAuth } = useAuth()
  // 本地点赞状态：key = comment.id / reply.id，value = true（liked）
  const [likedMap, setLikedMap] = useState({})

  /** 切换点赞态：未登录走 requireAuth 拦截，不执行后续逻辑 */
  const toggleLike = (targetId) => {
    if (!requireAuth('登录后点赞')) return
    setLikedMap((prev) => ({ ...prev, [targetId]: !prev[targetId] }))
  }

  // 无评论时由父组件渲染 EmptyState，此处只做防御性兜底
  if (!Boolean(comments?.length)) return null

  return (
    <div className="space-y-5">
      {comments.map((comment) => {
        const commentAuthor = users.find((u) => u.id === comment.authorId)
        const isCommentLiked = !!likedMap[comment.id]
        const replies = comment.replies || []

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
                    <span>{(comment.likes || 0) + (isCommentLiked ? 1 : 0)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => requireAuth('登录后回复评论')}
                    className="flex items-center gap-1 hover:text-foreground transition-colors p-1 -m-1 rounded hover:bg-afmuted"
                  >
                    <MessageCircle className="size-3.5" />
                    <span>回复</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ====== 二级回复（缩进层级，左侧边框视觉区分） ======
                 限制最多 2 层展示：不再递归 deeper 层，避免过深嵌套导致可读性下降 */}
            {Boolean(replies.length) ? (
              <div className="ml-11 space-y-3 pl-6 border-l-2 border-border">
                {replies.map((reply) => {
                  const replyAuthor = users.find((u) => u.id === reply.authorId)
                  const isReplyLiked = !!likedMap[reply.id]
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
                            <span>{(reply.likes || 0) + (isReplyLiked ? 1 : 0)}</span>
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
