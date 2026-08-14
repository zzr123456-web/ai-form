import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles, Bot, AlertTriangle, Send, FileText, MessageSquareQuote,
  ArrowUpRight, Loader2, AlertCircle,
} from 'lucide-react'
import { SourceTypeBadge } from '../../components/ai-forum/common/Badges.jsx'
import { useAuth } from '../../components/ai-forum/AuthProvider.jsx'
import { aiQAStart, aiQAStream } from '../../utils/ai-forum/apiClient.js'

const MAX_LEN = 500

const RELATED_QUESTIONS = [
  '押金纠纷需要保留哪些证据？',
  '房东不退押金可以报警吗？',
  '租房合同违约如何处理？',
  '小额诉讼流程是怎样的？',
]

/**
 * 将后端返回的相似帖统一归一化为引用展示结构
 * 后端字段命名可能不一致，这里做兼容兜底
 * @param {Object} item 相似帖原始对象
 * @param {number} idx 序号，用于兜底 key
 */
function normalizeCitation(item, idx) {
  return {
    id: item.id || item.post_id || `cit_${idx}`,
    sourceType: item.source_type || item.sourceType || item.type || 'post',
    title: item.title || (item.summary ? item.summary.slice(0, 40) : '') || '相关内容',
    excerpt: item.excerpt || item.summary || item.snippet || '',
  }
}

export default function QaPage() {
  const { requireAuth } = useAuth()
  const navigate = useNavigate()

  const [question, setQuestion] = useState('')
  const [submitted, setSubmitted] = useState(false)
  // streaming 为 true 时表示正在等待首字 / 流式接收中
  const [streaming, setStreaming] = useState(false)
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState(null)
  const [similarPosts, setSimilarPosts] = useState([])
  const [safetyLabel, setSafetyLabel] = useState('')

  // 提交问题：先启动答疑拿到 question_id 与相似帖，再流式接收答案
  const handleSubmit = async (overrideQuestion) => {
    const q = (overrideQuestion ?? question).trim()
    if (!q) return
    if (!requireAuth('登录后提问')) return

    // 通过相关问题点击触发时同步输入框，便于后续「发布为帖子」取标题
    if (overrideQuestion) setQuestion(overrideQuestion)

    // 重置本轮状态
    setSubmitted(true)
    setStreaming(true)
    setError(null)
    setAnswer('')
    setSimilarPosts([])
    setSafetyLabel('')

    try {
      const startRes = await aiQAStart(q)
      if (!startRes.ok) {
        setError(startRes.error || 'AI 服务开小差了，请稍后重试')
        setStreaming(false)
        return
      }
      const startData = startRes.data || {}
      const qid = startData.question_id || startData.questionId
      // 启动阶段即返回相似帖，作为答案下方的来源引用
      setSimilarPosts(
        Array.isArray(startData.similar_posts)
          ? startData.similar_posts.map(normalizeCitation)
          : []
      )
      if (startData.safety_label) setSafetyLabel(startData.safety_label)

      if (!qid) {
        setError('未获取到问题 ID，无法生成回答')
        setStreaming(false)
        return
      }

      // 流式接收：每个 chunk 追加到 answer，实现打字机效果
      const finalMeta = await aiQAStream(qid, (chunk) => {
        setAnswer((prev) => prev + chunk)
      })
      // 流结束事件可能携带 safety_label 等元数据，此处补充
      if (finalMeta && finalMeta.safety_label) setSafetyLabel(finalMeta.safety_label)
    } catch (err) {
      setError(err?.message || 'AI 回答生成失败')
    } finally {
      setStreaming(false)
    }
  }

  // 发布为帖子：携带标题 / 正文 / 标签跳转编辑器
  const handlePublishAsPost = () => {
    if (!requireAuth('登录后发布帖子')) return
    navigate('/forum/editor', {
      state: {
        title: question.substring(0, 50),
        content: answer,
        tags: [],
      },
    })
  }

  // 流式进行中或尚无内容时不允许发布
  const canPublish = !streaming && answer.trim().length > 0
  const isSensitive = safetyLabel === 'sensitive'

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* 提问输入区 */}
      <section className="bg-card border border-border rounded-af-xl p-5 sm:p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquareQuote className="size-5 text-foreground" />
          <h1 className="text-lg font-semibold text-foreground">向 AI 提问</h1>
        </div>
        <div className="relative">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value.slice(0, MAX_LEN))}
            placeholder="描述你的问题，AI 会结合站内内容、知识库和公开信息给出回答..."
            rows={4}
            className="w-full rounded-af-lg border border-input bg-background p-3 text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <span className="absolute bottom-2 right-3 text-xs text-afmuted-foreground font-mono">
            {question.length}/{MAX_LEN}
          </span>
        </div>
        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={!question.trim() || streaming}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-5 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {streaming ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            提交问题
          </button>
        </div>
      </section>

      {submitted ? (
        <>
          {/* 问题卡片 */}
          <div className="bg-card border border-border rounded-af-xl p-5 mb-4">
            <div className="flex items-center gap-2 text-xs text-afmuted-foreground mb-2">
              <MessageSquareQuote className="size-4" /> 你的问题
            </div>
            <h2 className="text-base font-semibold text-foreground">{question}</h2>
          </div>

          {/* 错误提示 */}
          {error ? (
            <div className="flex items-start gap-2 mb-4 rounded-af-lg border border-error/30 bg-error/5 p-3">
              <AlertCircle className="size-4 text-error shrink-0 mt-0.5" />
              <p className="text-xs text-error leading-relaxed">{error}</p>
            </div>
          ) : null}

          {/* AI 回答卡片 */}
          <div className="bg-afmuted/60 border border-border rounded-af-xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                <Bot className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">AI 助手</p>
                <p className="text-xs text-afmuted-foreground">基于站内 + 知识库 + 外部信息生成</p>
              </div>
            </div>
            <div
              className={`text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap ${
                streaming ? 'af-streaming-cursor' : ''
              }`}
            >
              {/* 流式开始但尚未收到首字时给一个思考中提示 */}
              {streaming && answer.length === 0 ? (
                <span className="text-afmuted-foreground inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" /> AI 正在思考...
                </span>
              ) : null}
              {answer}
            </div>
            {/* 安全边界提示：敏感问题给出橙色警示徽章 + 边界说明 */}
            {isSensitive ? (
              <div className="flex items-start gap-2 mt-4 rounded-af-lg bg-warning-bg p-3">
                <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
                <div className="text-xs text-foreground/90">
                  <span className="inline-flex items-center rounded-full bg-warning/20 text-warning px-2 py-0.5 font-medium mb-1">
                    敏感问题
                  </span>
                  <p className="leading-relaxed">
                    此问题涉及高风险领域，以上为通用边界说明，具体情形请咨询专业人士。
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* 来源引用（流式结束后展示） */}
          {!streaming && similarPosts.length > 0 ? (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="size-4 text-afmuted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  来源引用 <span className="text-afmuted-foreground font-normal">({similarPosts.length})</span>
                </h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {similarPosts.map((c) => (
                  <div
                    key={c.id}
                    className="bg-card border border-border rounded-af-lg p-4 hover:border-afmuted-foreground/30 transition-colors"
                  >
                    <div className="mb-2"><SourceTypeBadge type={c.sourceType} /></div>
                    <h4 className="text-sm font-medium text-foreground mb-1.5">{c.title}</h4>
                    {c.excerpt ? (
                      <p className="text-xs text-afmuted-foreground leading-relaxed af-line-clamp-2">{c.excerpt}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 发布为帖子 CTA */}
          {!streaming && !error ? (
            <div className="border-2 border-dashed border-border rounded-af-xl p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">这个问题值得更多人看到？</h3>
                <p className="text-xs text-afmuted-foreground">发布为帖子，邀请社区补充更多经验</p>
              </div>
              <button
                type="button"
                onClick={handlePublishAsPost}
                disabled={!canPublish}
                className="inline-flex items-center gap-1.5 h-9 px-5 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send className="size-4" /> 发布为帖子
              </button>
            </div>
          ) : null}
        </>
      ) : (
        // 未提问时展示历史问题，点击直接发起提问
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-4">相关问题推荐</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {RELATED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => handleSubmit(q)}
                className="flex items-start gap-3 text-left bg-card border border-border rounded-af-lg p-4 hover:border-afmuted-foreground/30 hover:shadow-af-1 transition-all"
              >
                <ArrowUpRight className="size-4 text-afmuted-foreground shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{q}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
