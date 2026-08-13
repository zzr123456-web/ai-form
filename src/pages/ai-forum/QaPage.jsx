import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Sparkles, Bot, AlertTriangle, Send, FileText, MessageSquareQuote, ArrowUpRight,
} from 'lucide-react'
import Avatar from '../../components/ai-forum/common/Avatar.jsx'
import VoteButton from '../../components/ai-forum/common/VoteButton.jsx'
import { SourceTypeBadge } from '../../components/ai-forum/common/Badges.jsx'
import { useAuth } from '../../components/ai-forum/AuthProvider.jsx'
import { qaHistory, communityAnswers, users } from '../../utils/ai-forum/mockData.js'
import { formatRelativeTime } from '../../utils/ai-forum/aiForumUtils.js'

const SOURCE_SCOPES = [
  { key: 'site_only',       label: '仅站内' },
  { key: 'knowledge_base',  label: '知识库' },
  { key: 'site_and_web',    label: '站内+站外' },
]

const RELATED_QUESTIONS = [
  '押金纠纷需要保留哪些证据？',
  '房东不退押金可以报警吗？',
  '租房合同违约如何处理？',
  '小额诉讼流程是怎样的？',
]

export default function QaPage() {
  const { requireAuth } = useAuth()
  const navigate = useNavigate()
  const [question, setQuestion] = useState('')
  const [scope, setScope] = useState('site_and_web')
  const [submitted, setSubmitted] = useState(false)
  const [streaming, setStreaming] = useState(false)

  const MAX_LEN = 500
  const answer = qaHistory[0] // mock：始终展示同一份回答

  const handleSubmit = () => {
    if (!question.trim()) return
    if (!requireAuth('登录后提问')) return
    setSubmitted(true)
    setStreaming(true)
    // mock：2 秒后停止流式动画
    setTimeout(() => setStreaming(false), 2000)
  }

  const handlePublishAsPost = () => {
    if (!requireAuth('登录后发布帖子')) return
    navigate('/forum/editor')
  }

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
          <span className="absolute bottom-2 right-3 text-xs text-afmuted-foreground font-mono">{question.length}/{MAX_LEN}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-afmuted-foreground">来源范围：</span>
            {SOURCE_SCOPES.map((s) => (
              <label key={s.key} className="cursor-pointer">
                <input type="radio" name="scope" value={s.key} checked={scope === s.key} onChange={() => setScope(s.key)} className="sr-only" />
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  scope === s.key ? 'border-foreground bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-afmuted'
                }`}>{s.label}</span>
              </label>
            ))}
          </div>
          <button type="button" onClick={handleSubmit} disabled={!question.trim()} className="inline-flex items-center justify-center gap-1.5 h-9 px-5 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
            <Sparkles className="size-4" /> 提交问题
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
            <div className={`text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap ${streaming ? 'af-streaming-cursor' : ''}`}>
              {answer.answer}
            </div>
            {answer.safetyLabel === 'sensitive' ? (
              <div className="flex items-start gap-2 mt-4 rounded-af-lg bg-warning-bg p-3">
                <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-foreground/90">此问题涉及法律领域，以上为通用边界说明，具体情形请咨询专业律师或当地住建部门。</p>
              </div>
            ) : null}
          </div>

          {/* 来源引用 */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="size-4 text-afmuted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">来源引用 <span className="text-afmuted-foreground font-normal">({answer.citations.length})</span></h3>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {answer.citations.map((c) => (
                <div key={c.id} className="bg-card border border-border rounded-af-lg p-4 hover:border-afmuted-foreground/30 transition-colors">
                  <div className="mb-2"><SourceTypeBadge type={c.sourceType} /></div>
                  <h4 className="text-sm font-medium text-foreground mb-1.5">{c.title}</h4>
                  <p className="text-xs text-afmuted-foreground leading-relaxed af-line-clamp-2">{c.excerpt}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 社区补充回答 */}
          <section className="mb-8">
            <h3 className="text-sm font-semibold text-foreground mb-4">社区补充回答 <span className="text-afmuted-foreground font-normal">({communityAnswers.length})</span></h3>
            <div className="space-y-4">
              {communityAnswers.map((a) => {
                const author = users.find((u) => u.id === a.authorId)
                return (
                  <div key={a.id} className="bg-card border border-border rounded-af-xl p-5 flex gap-4">
                    <VoteButton initialScore={a.likes} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Avatar text={author?.avatarText} size="xs" />
                        <span className="text-sm font-medium text-foreground">{author?.nickname}</span>
                        <span className="text-xs text-afmuted-foreground">· {author?.profession}</span>
                        <span className="text-xs text-afmuted-foreground">· {formatRelativeTime(a.createdAt)}</span>
                      </div>
                      <p className="text-sm text-foreground/90 leading-relaxed mb-3">{a.content}</p>
                      <div className="flex items-center gap-3 text-xs text-afmuted-foreground">
                        <button type="button" className="hover:text-foreground transition-colors">感谢</button>
                        <button type="button" className="hover:text-foreground transition-colors">回复</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* 发布为帖子 CTA */}
          <div className="border-2 border-dashed border-border rounded-af-xl p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">这个问题值得更多人看到？</h3>
              <p className="text-xs text-afmuted-foreground">发布为帖子，邀请社区补充更多经验</p>
            </div>
            <button type="button" onClick={handlePublishAsPost} className="inline-flex items-center gap-1.5 h-9 px-5 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity shrink-0">
              <Send className="size-4" /> 发布为帖子
            </button>
          </div>
        </>
      ) : (
        // 未提问时展示历史问题
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-4">相关问题推荐</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            {RELATED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => { setQuestion(q); setSubmitted(true); setStreaming(true); setTimeout(() => setStreaming(false), 2000) }}
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
