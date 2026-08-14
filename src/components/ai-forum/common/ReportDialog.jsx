import React, { useState, useEffect } from 'react'
import { Flag, X, Send } from 'lucide-react'

/**
 * 通用举报弹窗组件
 * 被帖子详情页与评论组件共用，统一举报入口与交互
 * @param {string} target_type 举报目标类型：'post' | 'comment'
 * @param {string} target_id   举报目标 id
 * @param {Function} onClose   关闭弹窗回调
 */
export default function ReportDialog({ target_type, target_id, onClose }) {
  // 预设举报理由列表（与后端 reason 枚举对应）
  const REASONS = [
    { key: 'spam',      label: '垃圾内容' },
    { key: 'abuse',     label: '辱骂攻击' },
    { key: 'sensitive', label: '敏感信息' },
    { key: 'misinfo',   label: '错误信息' },
    { key: 'lowquality', label: '低质量内容' },
  ]

  const [selectedReason, setSelectedReason] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // toast 提示：提交成功后短暂展示，自动关闭弹窗
  const [toast, setToast] = useState(null)

  // ESC 键关闭弹窗，提升无障碍体验
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, submitting])

  // 点击遮罩关闭（提交中时禁止关闭，避免请求中断）
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !submitting) onClose()
  }

  /** 提交举报：调用 POST /api/forum/reports */
  const handleSubmit = async () => {
    if (!selectedReason || submitting) return

    setSubmitting(true)
    try {
      const token = localStorage.getItem('af_token')
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const res = await fetch('/api/forum/reports', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          target_type,
          target_id,
          reason: selectedReason,
          note: note.trim() || undefined,
        }),
      })

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`
        try {
          const data = await res.json()
          if (data?.error) errMsg = data.error
        } catch {}
        setToast({ type: 'error', msg: `举报失败：${errMsg}` })
        setSubmitting(false)
        return
      }

      // 成功：展示 toast 后延迟关闭弹窗
      setToast({ type: 'success', msg: '举报已提交，运营会尽快处理' })
      setSubmitting(false)
      setTimeout(() => onClose(), 1200)
    } catch (err) {
      setToast({ type: 'error', msg: `网络错误：${err?.message || '请稍后重试'}` })
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={handleOverlayClick}
    >
      <div className="w-full max-w-md bg-card border border-border rounded-af-xl shadow-af-2 overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Flag className="size-5 text-vermilion" />
            <h3 className="text-base font-semibold text-foreground">举报内容</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-afmuted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            aria-label="关闭"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* 主体内容 */}
        <div className="px-5 py-4 space-y-5">
          {/* 理由选择 */}
          <div>
            <p className="text-sm font-medium text-foreground mb-3">选择举报理由</p>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setSelectedReason(r.key)}
                  className={`px-3 py-2 rounded-af-md text-sm font-medium border transition-colors text-left ${
                    selectedReason === r.key
                      ? 'border-vermilion bg-vermilion/10 text-vermilion'
                      : 'border-border bg-background text-foreground hover:bg-afmuted'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* 补充说明（可选） */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">
              补充说明 <span className="text-afmuted-foreground font-normal">（可选）</span>
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="请描述具体问题，帮助运营更快处理..."
              rows={3}
              className="w-full rounded-af-md border border-input bg-background p-3 text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              disabled={submitting}
            />
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-afmuted/20">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-9 px-4 rounded-af-md border border-border bg-card text-foreground text-sm font-medium hover:bg-afmuted transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedReason || submitting}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md bg-vermilion text-white text-sm font-medium hover:bg-vermilion-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="size-3.5" />
            {submitting ? '提交中...' : '提交举报'}
          </button>
        </div>

        {/* Toast 提示浮层 */}
        {toast ? (
          <div
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-af-md text-sm font-medium shadow-af-2 z-50 ${
              toast.type === 'success'
                ? 'bg-success text-white'
                : 'bg-error text-white'
            }`}
          >
            {toast.msg}
          </div>
        ) : null}
      </div>
    </div>
  )
}
