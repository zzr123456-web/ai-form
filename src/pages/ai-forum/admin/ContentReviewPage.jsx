import React, { useState, useEffect, useCallback } from 'react'
import { FileCheck, Filter, Loader2, CheckCircle2, ChevronsDown, Trash2 } from 'lucide-react'
import EmptyState from '../../../components/ai-forum/common/EmptyState.jsx'
import { formatRelativeTime, truncateText } from '../../../utils/ai-forum/aiForumUtils.js'

// 风险等级徽章配置：red=high, orange=medium, yellow=low
const RISK_BADGE = {
  high:   { label: '高风险', className: 'bg-red-100 text-red-700' },
  medium: { label: '中风险', className: 'bg-orange-100 text-orange-700' },
  low:    { label: '低风险', className: 'bg-yellow-100 text-yellow-700' },
  none:   { label: '无风险', className: 'bg-afmuted text-afmuted-foreground' },
}

// 目标类型中文映射
const TARGET_TYPE_LABEL = {
  post: '帖子',
  comment: '评论',
}

// 来源类型中文映射
const SOURCE_LABEL = {
  ai: 'AI初审',
  report: '用户举报',
  manual: '人工提交',
}

// 审核动作映射（对应后端 resolve 接口 action 参数）
const ACTIONS = [
  { key: 'approve', label: '通过', icon: CheckCircle2, className: 'text-success hover:bg-success-bg' },
  { key: 'collapse', label: '折叠', icon: ChevronsDown, className: 'text-warning hover:bg-warning-bg' },
  { key: 'delete', label: '删除', icon: Trash2, className: 'text-error hover:bg-error-bg' },
]

/**
 * 内容审核页
 * 数据来源：GET /api/forum/admin/moderation?status=...
 * 处理动作：POST /api/forum/admin/moderation/:id/resolve
 */
export default function ContentReviewPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // 筛选条件
  const [riskFilter, setRiskFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('open')
  // 动作提交中状态（按 item id 记录，避免并发误操作）
  const [actioningId, setActioningId] = useState(null)
  // toast 提示
  const [toast, setToast] = useState(null)

  /** 拉取审核队列数据 */
  const loadItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('af_token')
      const headers = {}
      if (token) headers.Authorization = `Bearer ${token}`

      // 拼接查询参数：status 必传，risk_level 可选
      const params = new URLSearchParams()
      params.set('status', statusFilter)
      if (riskFilter !== 'all') params.set('risk_level', riskFilter)

      const res = await fetch(`/api/forum/admin/moderation?${params.toString()}`, { headers })
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
  }, [statusFilter, riskFilter])

  // 筛选条件变化时重新拉取
  useEffect(() => {
    loadItems()
  }, [loadItems])

  // toast 自动消失
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(timer)
  }, [toast])

  /** 处理单条审核动作 */
  const handleAction = async (item, action) => {
    if (actioningId) return
    setActioningId(item.id)
    try {
      const token = localStorage.getItem('af_token')
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`

      const res = await fetch(`/api/forum/admin/moderation/${item.id}/resolve`, {
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

      // 成功：从列表移除该条目 + 显示 toast
      setItems((prev) => prev.filter((x) => x.id !== item.id))
      const actionLabel = ACTIONS.find((a) => a.key === action)?.label || action
      setToast({ type: 'success', msg: `已${actionLabel}该条内容` })
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
        <h1 className="text-xl font-semibold text-foreground">内容审核</h1>
        <p className="text-sm text-afmuted-foreground mt-1">处理 AI 初筛与人工举报的待审内容，批量过审与风险处理</p>
      </div>

      {/* 筛选栏 */}
      <div className="bg-card border border-border rounded-af-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="inline-flex items-center gap-2 text-sm text-afmuted-foreground">
            <Filter className="size-4" />
            <span>筛选</span>
          </div>

          {/* 风险等级筛选 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-afmuted-foreground">风险等级</span>
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="h-9 px-3 rounded-af-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="all">全部</option>
              <option value="none">无风险</option>
              <option value="low">低风险</option>
              <option value="medium">中风险</option>
              <option value="high">高风险</option>
            </select>
          </div>

          {/* 状态筛选 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-afmuted-foreground">状态</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-af-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="open">待处理</option>
              <option value="resolved">已处理</option>
            </select>
          </div>
        </div>
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
            icon={FileCheck}
            title="暂无待审内容"
            description="当前筛选条件下没有审核任务"
          />
        ) : (
          // 审核队列列表
          <div className="divide-y divide-border">
            {items.map((item) => {
              const riskLevel = getField(item, 'risk_level', 'riskLevel', 'level') || 'none'
              const targetType = getField(item, 'target_type', 'targetType') || 'post'
              const contentSummary = getField(item, 'content_summary', 'contentSummary', 'content', 'title') || ''
              const source = getField(item, 'source') || 'ai'
              const createdAt = getField(item, 'created_at', 'createdAt', 'created')
              const riskCfg = RISK_BADGE[riskLevel] || RISK_BADGE.none

              return (
                <div key={item.id} className="p-4 hover:bg-afmuted/20 transition-colors">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    {/* 左侧：信息区 */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* 徽章行 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* 风险等级徽章 */}
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${riskCfg.className}`}>
                          <span className="size-1.5 rounded-full bg-current" />
                          {riskCfg.label}
                        </span>
                        {/* 目标类型 */}
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-secondary text-secondary-foreground">
                          {TARGET_TYPE_LABEL[targetType] || targetType}
                        </span>
                        {/* 来源 */}
                        <span className="text-xs text-afmuted-foreground">
                          来源：{SOURCE_LABEL[source] || source}
                        </span>
                        {/* 创建时间 */}
                        <span className="text-xs text-afmuted-foreground">
                          {formatRelativeTime(createdAt)}
                        </span>
                      </div>
                      {/* 内容摘要 */}
                      <p className="text-sm text-foreground/90 line-clamp-2 leading-relaxed">
                        {contentSummary ? truncateText(contentSummary, 200) : '（无内容摘要）'}
                      </p>
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
                            disabled={isBusy}
                            className={`inline-flex items-center gap-1 h-8 px-3 rounded-af-md text-xs font-medium border border-border bg-card transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${act.className}`}
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
