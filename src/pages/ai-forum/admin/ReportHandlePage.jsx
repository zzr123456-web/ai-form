import React, { useState, useEffect, useCallback } from 'react'
import { Flag, Loader2, Ban, AlertTriangle, Trash2, XCircle } from 'lucide-react'
import EmptyState from '../../../components/ai-forum/common/EmptyState.jsx'
import { formatRelativeTime, truncateText } from '../../../utils/ai-forum/aiForumUtils.js'

// 举报状态徽章配置：pending=yellow, resolved=green, rejected=gray
const STATUS_BADGE = {
  pending:  { label: '待处理', className: 'bg-yellow-100 text-yellow-700' },
  resolved: { label: '已处理', className: 'bg-green-100 text-green-700' },
  rejected: { label: '已驳回', className: 'bg-gray-200 text-gray-600' },
}

// 目标类型中文映射
const TARGET_TYPE_LABEL = {
  post: '帖子',
  comment: '评论',
}

// 举报理由中文映射（兼容预设理由与自定义文本）
const REASON_LABEL = {
  spam: '垃圾内容',
  abuse: '辱骂攻击',
  sensitive: '敏感信息',
  misinfo: '错误信息',
  lowquality: '低质量内容',
}

// 处理动作映射（对应后端 handle 接口 action 参数）
const ACTIONS = [
  { key: 'reject',         label: '驳回',     icon: XCircle,        className: 'text-afmuted-foreground hover:bg-afmuted' },
  { key: 'warn',           label: '警告',     icon: AlertTriangle,  className: 'text-warning hover:bg-warning-bg' },
  { key: 'delete', label: '删除内容', icon: Trash2,         className: 'text-error hover:bg-error-bg' },
  { key: 'ban',    label: '封禁用户', icon: Ban,            className: 'text-error hover:bg-error-bg' },
]

/**
 * 举报处理页
 * 数据来源：GET /api/forum/admin/reports
 * 处理动作：POST /api/forum/admin/reports/:id/handle
 */
export default function ReportHandlePage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // 动作提交中状态（按 item id 记录）
  const [actioningId, setActioningId] = useState(null)
  // toast 提示
  const [toast, setToast] = useState(null)

  /** 拉取举报列表 */
  const loadItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('af_token')
      const headers = {}
      if (token) headers.Authorization = `Bearer ${token}`

      const res = await fetch('/api/forum/admin/reports', { headers })
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`
        try {
          const data = await res.json()
          if (data?.error) errMsg = data.error
        } catch {}
        throw new Error(errMsg)
      }
      const data = await res.json()
      // 兼容数组与 { items: [] } 两种返回结构
      const list = Array.isArray(data) ? data : (data?.items || [])
      setItems(list)
    } catch (err) {
      setError(err?.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  // toast 自动消失
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(timer)
  }, [toast])

  /** 处理单条举报动作 */
  const handleAction = async (item, action) => {
    if (actioningId) return
    setActioningId(item.id)
    try {
      const token = localStorage.getItem('af_token')
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const res = await fetch(`/api/forum/admin/reports/${item.id}/handle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`
        try {
          const data = await res.json()
          if (data?.error) errMsg = data.error
        } catch {}
        throw new Error(errMsg)
      }

      // 成功：更新该条目状态（驳回 → rejected，其他 → resolved）
      const newStatus = action === 'reject' ? 'rejected' : 'resolved'
      setItems((prev) =>
        prev.map((x) => (x.id === item.id ? { ...x, status: newStatus } : x))
      )
      const actionLabel = ACTIONS.find((a) => a.key === action)?.label || action
      setToast({ type: 'success', msg: `已执行：${actionLabel}` })
    } catch (err) {
      setToast({ type: 'error', msg: `操作失败：${err?.message || '请稍后重试'}` })
    } finally {
      setActioningId(null)
    }
  }

  // 兼容多种字段命名
  const getField = (obj, ...keys) => {
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null) return obj[k]
    }
    return ''
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">举报处理</h1>
        <p className="text-sm text-afmuted-foreground mt-1">审核用户举报的内容，分配处理人并与审核工单联动</p>
      </div>

      {/* 主体内容区 */}
      <div className="bg-card border border-border rounded-af-lg overflow-hidden">
        {/* Loading 状态 */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 text-vermilion animate-spin" />
            <span className="ml-2 text-sm text-afmuted-foreground">加载中...</span>
          </div>
        ) : error ? (
          // 错误状态
          <div className="p-6 text-center">
            <p className="text-sm text-error font-medium mb-2">数据加载失败</p>
            <p className="text-xs text-afmuted-foreground mb-4">{error}</p>
            <button
              type="button"
              onClick={loadItems}
              className="h-8 px-4 rounded-af-md bg-vermilion text-white text-sm font-medium hover:bg-vermilion-light transition-colors"
            >
              重新加载
            </button>
          </div>
        ) : items.length === 0 ? (
          // 空状态
          <EmptyState
            icon={Flag}
            title="暂无举报记录"
            description="当前没有待处理的用户举报"
          />
        ) : (
          // 举报列表
          <div className="divide-y divide-border">
            {items.map((item) => {
              const reporterName = getField(item, 'reporter_name', 'reporterName', 'reporter') || '匿名用户'
              const targetType = getField(item, 'target_type', 'targetType') || 'post'
              const targetSummary = getField(item, 'target_summary', 'targetSummary', 'content', 'title') || ''
              const reason = getField(item, 'reason') || ''
              const status = getField(item, 'status') || 'pending'
              const createdAt = getField(item, 'created_at', 'createdAt', 'created')
              const statusCfg = STATUS_BADGE[status] || STATUS_BADGE.pending
              const reasonLabel = REASON_LABEL[reason] || reason || '未说明'
              // 已处理项禁用操作按钮
              const isHandled = status === 'resolved' || status === 'rejected'

              return (
                <div key={item.id} className="p-4 hover:bg-afmuted/20 transition-colors">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    {/* 左侧：信息区 */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* 第一行：举报人 + 状态徽章 + 时间 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          举报人：{reporterName}
                        </span>
                        {/* 状态徽章 */}
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.className}`}>
                          {statusCfg.label}
                        </span>
                        <span className="text-xs text-afmuted-foreground">
                          {formatRelativeTime(createdAt)}
                        </span>
                      </div>
                      {/* 第二行：目标类型 + 内容摘要 */}
                      <div className="flex items-start gap-2">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground shrink-0">
                          {TARGET_TYPE_LABEL[targetType] || targetType}
                        </span>
                        <p className="text-sm text-foreground/90 line-clamp-2 leading-relaxed flex-1 min-w-0">
                          {targetSummary ? truncateText(targetSummary, 150) : '（无内容摘要）'}
                        </p>
                      </div>
                      {/* 第三行：举报理由 */}
                      <div className="flex items-center gap-1.5 text-xs text-afmuted-foreground">
                        <Flag className="size-3" />
                        <span>理由：{reasonLabel}</span>
                      </div>
                    </div>

                    {/* 右侧：操作按钮 */}
                    <div className="flex items-center gap-1 shrink-0">
                      {ACTIONS.map((act) => {
                        const Icon = act.icon
                        const isBusy = actioningId === item.id
                        return (
                          <button
                            key={act.key}
                            type="button"
                            onClick={() => handleAction(item, act.key)}
                            disabled={isBusy || isHandled}
                            className={`inline-flex items-center gap-1 h-8 px-3 rounded-af-md text-xs font-medium border border-border bg-card transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${act.className}`}
                          >
                            <Icon className="size-3.5" />
                            {act.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Toast 提示 */}
      {toast ? (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-af-md text-sm font-medium shadow-af-2 z-50 ${
            toast.type === 'success' ? 'bg-success text-white' : 'bg-error text-white'
          }`}
        >
          {toast.msg}
        </div>
      ) : null}
    </div>
  )
}
