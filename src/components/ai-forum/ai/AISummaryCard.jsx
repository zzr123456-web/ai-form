import React, { useState } from 'react'
import { Sparkles, Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { aiSummary } from '../../../utils/ai-forum/apiClient.js'
import { useAuth } from '../AuthProvider.jsx'

/**
 * AI 讨论总结卡
 * 接收 postId，点击生成后调用 /ai/summary 获取结构化总结
 */
export default function AISummaryCard({ postId }) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null)
  const [expanded, setExpanded] = useState(true)

  const handleGenerate = async () => {
    if (!postId || loading) return
    setLoading(true)
    setError(null)
    setSummary(null)
    try {
      const data = await aiSummary(postId)
      setSummary(data)
    } catch (err) {
      setError(err.message || '总结生成失败')
    } finally {
      setLoading(false)
    }
  }

  // 未登录时提示
  if (!user) {
    return (
      <div className="rounded-af-lg border border-primary/20 bg-primary/[0.03] p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="size-4 text-primary" />
          <h2 className="font-bold text-foreground text-sm">AI 讨论总结</h2>
        </div>
        <p className="text-xs text-afmuted-foreground text-center py-3">
          登录后可使用 AI 生成讨论总结
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-af-lg border border-primary/20 bg-primary/[0.03] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="font-bold text-foreground text-sm">AI 讨论总结</h2>
        </div>
        {summary && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-afmuted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        )}
      </div>

      {/* 生成按钮 / 结果展示 */}
      {!summary && !loading && (
        <>
          <button
            type="button"
            onClick={handleGenerate}
            className="w-full px-4 py-2 rounded-af-md border border-primary/30 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors mb-3"
          >
            生成讨论总结
          </button>
          <p className="text-[11px] text-afmuted-foreground">
            基于帖子内容与评论，生成主要观点、分歧点和建议。
          </p>
        </>
      )}

      {/* 加载中 */}
      {loading && (
        <div className="flex flex-col items-center py-4 gap-2">
          <Loader2 className="size-6 text-primary animate-spin" />
          <p className="text-xs text-afmuted-foreground">AI 正在分析讨论内容...</p>
          <div className="w-full space-y-2 mt-2">
            <div className="h-2 w-4/5 bg-primary/10 rounded animate-pulse" />
            <div className="h-2 w-full bg-primary/10 rounded animate-pulse" />
            <div className="h-2 w-3/5 bg-primary/10 rounded animate-pulse" />
          </div>
        </div>
      )}

      {/* 错误 */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-error/10 border border-error/30 mb-3">
          <AlertCircle className="size-4 text-error shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-error">{error}</p>
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            className="text-xs text-primary hover:underline shrink-0"
          >
            重试
          </button>
        </div>
      )}

      {/* 总结结果 */}
      {summary && expanded && (
        <div className="space-y-3">
          {/* 整体概述 */}
          {summary.summary && (
            <div className="p-3 rounded-md bg-card border border-border">
              <p className="text-xs leading-relaxed text-foreground">{summary.summary}</p>
            </div>
          )}

          {/* 核心观点 */}
          {summary.core_points?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-foreground mb-1.5">核心观点</h3>
              <ul className="space-y-1">
                {summary.core_points.map((point, i) => (
                  <li key={i} className="text-xs text-afmuted-foreground flex items-start gap-1.5">
                    <span className="text-primary shrink-0">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 分歧点 */}
          {summary.controversies?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-foreground mb-1.5">分歧点</h3>
              <ul className="space-y-1">
                {summary.controversies.map((c, i) => (
                  <li key={i} className="text-xs text-afmuted-foreground flex items-start gap-1.5">
                    <span className="text-warning shrink-0">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 建议 */}
          {summary.suggestions?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-foreground mb-1.5">建议</h3>
              <ul className="space-y-1">
                {summary.suggestions.map((s, i) => (
                  <li key={i} className="text-xs text-afmuted-foreground flex items-start gap-1.5">
                    <span className="text-success shrink-0">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 重新生成 */}
          <button
            type="button"
            onClick={handleGenerate}
            className="w-full text-xs text-primary hover:underline mt-1"
          >
            重新生成
          </button>
        </div>
      )}

      {/* 折叠状态下只显示摘要 */}
      {summary && !expanded && summary.summary && (
        <p className="text-xs text-afmuted-foreground line-clamp-2">{summary.summary}</p>
      )}
    </div>
  )
}
