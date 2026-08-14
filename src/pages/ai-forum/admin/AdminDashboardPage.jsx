import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, FileText, MessageCircle, ShieldCheck,
  UserPlus, FilePlus, ArrowRight,
} from 'lucide-react'

/**
 * 后台总览页
 * 数据来源：GET /api/forum/admin/dashboard
 * 展示 6 项核心指标卡，其中"待审核数"可点击跳转至审核页
 */
export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 挂载时拉取 dashboard 聚合数据
  // cancelled 标志防止组件卸载后 setState
  useEffect(() => {
    let cancelled = false
    async function loadDashboard() {
      setLoading(true)
      setError(null)
      try {
        const token = localStorage.getItem('af_token')
        const headers = {}
        if (token) headers.Authorization = `Bearer ${token}`

        const res = await fetch('/api/forum/admin/dashboard', { headers })
        if (!res.ok) {
          let errMsg = `HTTP ${res.status}`
          try {
            const data = await res.json()
            if (data?.error) errMsg = data.error
          } catch {}
          throw new Error(errMsg)
        }
        const data = await res.json()
        if (cancelled) return
        setStats(data)
      } catch (err) {
        if (cancelled) return
        setError(err?.message || '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadDashboard()
    return () => { cancelled = true }
  }, [])

  // 6 个指标卡配置：key 对应后端字段（兼容 snake_case / camelCase 多种命名）
  const METRICS = [
    { key: 'totalUsers',     label: '总用户数',     icon: Users,        color: 'text-info' },
    { key: 'totalPosts',     label: '总帖子数',     icon: FileText,     color: 'text-vermilion' },
    { key: 'totalComments',  label: '总评论数',     icon: MessageCircle, color: 'text-success' },
    { key: 'pendingReview',  label: '待审核数',     icon: ShieldCheck,  color: 'text-warning', link: '/forum/admin/review' },
    { key: 'todayNewUsers',  label: '今日新增用户', icon: UserPlus,     color: 'text-info' },
    { key: 'todayNewPosts',  label: '今日新增帖子', icon: FilePlus,     color: 'text-vermilion' },
  ]

  // 兼容多种字段命名风格（camelCase / snake_case）
  const getStatValue = (key) => {
    if (!stats) return 0
    // camelCase 优先
    if (typeof stats[key] === 'number') return stats[key]
    // snake_case 兜底
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
    if (typeof stats[snakeKey] === 'number') return stats[snakeKey]
    return 0
  }

  // ====== Loading：骨架屏 ======
  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">后台总览</h1>
          <p className="text-sm text-afmuted-foreground mt-1">社区运营状态与关键指标趋势</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-af-lg p-5 animate-pulse">
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-full bg-afmuted/50" />
              </div>
              <div className="h-7 w-20 bg-afmuted/50 rounded mb-2" />
              <div className="h-3 w-16 bg-afmuted/30 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ====== Error ======
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">后台总览</h1>
          <p className="text-sm text-afmuted-foreground mt-1">社区运营状态与关键指标趋势</p>
        </div>
        <div className="bg-error-bg/40 border border-error/30 rounded-af-lg p-6 text-center">
          <p className="text-sm text-error font-medium mb-2">数据加载失败</p>
          <p className="text-xs text-afmuted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 h-8 px-4 rounded-af-md bg-vermilion text-white text-sm font-medium hover:bg-vermilion-light transition-colors"
          >
            重新加载
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 标题区 */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">后台总览</h1>
        <p className="text-sm text-afmuted-foreground mt-1">社区运营状态与关键指标趋势</p>
      </div>

      {/* 6 个核心指标卡 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {METRICS.map((m) => {
          const value = getStatValue(m.key)
          const Icon = m.icon
          // 待审核卡可点击跳转
          const isClickable = Boolean(m.link)
          const cardCls = `bg-card border border-border rounded-af-lg p-5 transition-all ${
            isClickable
              ? 'hover:shadow-af-2 hover:border-vermilion/40 cursor-pointer'
              : 'hover:shadow-af-1'
          }`

          const inner = (
            <>
              <div className="flex items-start justify-between mb-4">
                {/* 圆形图标背景 */}
                <div className={`w-11 h-11 rounded-full flex items-center justify-center bg-afmuted/40`}>
                  <Icon className={`size-5 ${m.color}`} />
                </div>
                {/* 可点击卡显示跳转箭头 */}
                {isClickable ? (
                  <ArrowRight className="size-4 text-afmuted-foreground" />
                ) : null}
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums mb-1">
                {value.toLocaleString()}
              </p>
              <p className="text-xs text-afmuted-foreground">{m.label}</p>
            </>
          )

          return isClickable ? (
            <Link key={m.key} to={m.link} className={cardCls}>
              {inner}
            </Link>
          ) : (
            <div key={m.key} className={cardCls}>
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}
