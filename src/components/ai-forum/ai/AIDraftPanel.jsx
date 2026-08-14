import React, { useState } from 'react'
import { Sparkles, Tag, Wand2, Loader2, Check, X, AlertCircle } from 'lucide-react'
import { aiPostAssist } from '../../../utils/ai-forum/apiClient.js'

// 三个 AI 助手动作：标题 / 标签 / 润色，分别对应一种结果展示
const ASSIST_ACTIONS = [
  { key: 'title',  label: 'AI 标题', icon: Sparkles },
  { key: 'tags',   label: 'AI 标签', icon: Tag },
  { key: 'polish', label: 'AI 润色', icon: Wand2 },
]

/**
 * 从 AI 返回结构中提取标题候选（兼容多种字段命名，后端字段未最终定时也能兜底）
 * @param {Object} data
 * @returns {Array<string>}
 */
function extractTitles(data) {
  if (!data) return []
  const raw = data.titles || data.title_candidates || data.suggested_titles || data.title
  if (Array.isArray(raw)) return raw.map((t) => String(t)).filter((t) => t.trim())
  if (typeof raw === 'string' && raw.trim()) {
    // 字符串场景：按换行或顿号切分为候选
    return raw.split(/[\n、]/).map((s) => s.trim()).filter(Boolean)
  }
  return []
}

/**
 * 从 AI 返回结构中提取推荐标签
 * @param {Object} data
 * @returns {Array<string>}
 */
function extractTags(data) {
  if (!data) return []
  const raw = data.tags || data.suggested_tags || data.recommended_tags
  if (Array.isArray(raw)) return raw.map((t) => String(t)).filter((t) => t.trim())
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/[\n、,，]/).map((s) => s.trim()).filter(Boolean)
  }
  return []
}

/**
 * 从 AI 返回结构中提取润色后的正文
 * @param {Object} data
 * @returns {string}
 */
function extractPolished(data) {
  if (!data) return ''
  const raw = data.polished || data.polished_content || data.revised_content || data.content
  return typeof raw === 'string' ? raw : ''
}

export default function AIDraftPanel({
  content = '',
  boardId = '',
  currentTags = [],
  onTitleSelect,
  onTagAdd,
  onContentReplace,
}) {
  // loading 为当前进行中的动作 key（'title' | 'tags' | 'polish'），null 表示空闲
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)
  const [titles, setTitles] = useState([])
  const [tagCandidates, setTagCandidates] = useState([])
  const [polishedContent, setPolishedContent] = useState('')

  // 统一调用 AI 发帖助手：每次点击都带上当前正文 / 版块 / 已选标签作为上下文
  const handleAssist = async (type) => {
    setError(null)
    setLoading(type)
    // 切换动作时清空上一类结果，避免界面串味
    setTitles([])
    setTagCandidates([])
    setPolishedContent('')

    try {
      const result = await aiPostAssist({
        content: content || '',
        board_id: boardId,
        current_tags: Array.isArray(currentTags) ? currentTags : [],
      })
      if (!result.ok) {
        setError(result.error || 'AI 助手调用失败')
        return
      }
      const d = result.data || {}
      if (type === 'title') setTitles(extractTitles(d))
      else if (type === 'tags') setTagCandidates(extractTags(d))
      else setPolishedContent(extractPolished(d))
    } catch (err) {
      setError(err?.message || 'AI 助手调用失败')
    } finally {
      setLoading(null)
    }
  }

  const handlePickTitle = (title) => {
    if (onTitleSelect) onTitleSelect(title)
  }

  const handlePickTag = (tag) => {
    if (onTagAdd) onTagAdd(tag)
  }

  const handleConfirmPolish = () => {
    if (polishedContent && onContentReplace) {
      onContentReplace(polishedContent)
      setPolishedContent('')
    }
  }

  const handleCancelPolish = () => setPolishedContent('')

  // 渲染单个动作按钮（含 loading 态）
  const renderActionButton = ({ key, label, icon: Icon }) => {
    const isLoading = loading === key
    return (
      <button
        key={key}
        type="button"
        onClick={() => handleAssist(key)}
        disabled={loading !== null}
        className="relative inline-flex items-center gap-2 px-3 py-2.5 rounded-af-md border border-border bg-card hover:bg-afmuted/50 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoading ? (
          <Loader2 className="size-4 text-primary shrink-0 animate-spin" />
        ) : (
          <Icon className="size-4 text-primary shrink-0" />
        )}
        <span className="text-sm font-medium text-foreground">{label}</span>
      </button>
    )
  }

  // 当前已选标签集合，用于在推荐标签上标识「已添加」
  const currentTagSet = new Set(
    Array.isArray(currentTags) ? currentTags.map((t) => String(t)) : []
  )

  return (
    <div className="rounded-af-lg border border-border bg-gradient-to-br from-primary/5 via-primary/0 to-secondary/5 p-4 h-full">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span>✨</span>
          <h2 className="font-bold text-foreground">AI 发帖助手</h2>
        </div>
        <span className="text-[10px] text-afmuted-foreground bg-afmuted/50 px-2 py-0.5 rounded-full">
          Deepseek-V4
        </span>
      </div>

      <p className="text-xs text-afmuted-foreground mb-5 leading-relaxed">
        AI 辅助你写出结构清晰、标签准确、表达流畅的帖子。
      </p>

      {/* 三个动作按钮 */}
      <div className="flex flex-col gap-3 mb-4">
        {ASSIST_ACTIONS.map(renderActionButton)}
      </div>

      {/* 错误提示 */}
      {error ? (
        <div className="flex items-start gap-2 mb-4 rounded-af-md border border-error/30 bg-error/5 p-2.5">
          <AlertCircle className="size-4 text-error shrink-0 mt-0.5" />
          <p className="text-xs text-error leading-relaxed">{error}</p>
        </div>
      ) : null}

      {/* 标题候选结果 */}
      {titles.length > 0 ? (
        <div className="mb-4 rounded-af-md border border-border bg-card p-3">
          <p className="text-xs font-medium text-afmuted-foreground mb-2">标题候选（点击采用）</p>
          <div className="flex flex-col gap-2">
            {titles.map((t, idx) => (
              <button
                key={`${t}-${idx}`}
                type="button"
                onClick={() => handlePickTitle(t)}
                className="text-left text-sm text-foreground px-3 py-2 rounded-af-md border border-border hover:border-primary hover:bg-primary/5 transition-colors"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* 推荐标签结果 */}
      {tagCandidates.length > 0 ? (
        <div className="mb-4 rounded-af-md border border-border bg-card p-3">
          <p className="text-xs font-medium text-afmuted-foreground mb-2">推荐标签（点击添加）</p>
          <div className="flex flex-wrap gap-2">
            {tagCandidates.map((t, idx) => {
              const added = currentTagSet.has(String(t))
              return (
                <button
                  key={`${t}-${idx}`}
                  type="button"
                  onClick={() => handlePickTag(t)}
                  disabled={added}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full border text-sm transition-colors ${
                    added
                      ? 'bg-afmuted/50 text-afmuted-foreground border-border cursor-not-allowed'
                      : 'bg-card text-foreground border-border hover:border-primary hover:text-primary'
                  }`}
                >
                  {added ? <Check className="size-3" /> : null}
                  {t}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* 润色预览结果 */}
      {polishedContent ? (
        <div className="mb-4 rounded-af-md border border-border bg-card p-3">
          <p className="text-xs font-medium text-afmuted-foreground mb-2">润色预览</p>
          <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap max-h-60 overflow-auto mb-3">
            {polishedContent}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmPolish}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-af-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <Check className="size-3.5" /> 采纳替换
            </button>
            <button
              type="button"
              onClick={handleCancelPolish}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-af-md border border-border bg-card text-foreground text-xs font-medium hover:bg-afmuted/50 transition-colors"
            >
              <X className="size-3.5" /> 取消
            </button>
          </div>
        </div>
      ) : null}

      <div className="pt-4 border-t border-border/60">
        <p className="text-[11px] text-afmuted-foreground">
          生成结果仅供参考，请结合实际情况核实后发布。
        </p>
      </div>
    </div>
  )
}
