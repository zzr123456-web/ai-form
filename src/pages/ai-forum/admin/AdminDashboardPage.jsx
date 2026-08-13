import React, { useState, useEffect } from 'react'
import {
  Users, FileText, ShieldCheck, Sparkles,
} from 'lucide-react'
// 注意：adminStats 暂未提供后端 API，此处保留 mock 兜底（overview/weeklyTrend/governance）
// 其他动态数据（最近帖子、限流用户、版主列表）通过 apiClient 实时获取
import { adminStats } from '../../../utils/ai-forum/mockData.js'
import { getPosts, getUsers } from '../../../utils/ai-forum/apiClient'
import AdminStatCard from '../../../components/ai-forum/admin/AdminStatCard.jsx'

const METRICS = [
  { key: 'dau',          label: 'DAU 日活用户',   icon: Users,       value: adminStats.overview.dau,          delta: adminStats.overview.dauDelta,          unit: '%' },
  { key: 'newPosts',     label: '今日新帖数',     icon: FileText,    value: adminStats.overview.newPosts,     delta: adminStats.overview.newPostsDelta,     unit: '%' },
  // 待审核是负向指标：减少为好（色彩反转）
  { key: 'pendingReview', label: '待审核数量',    icon: ShieldCheck, value: adminStats.overview.pendingReview, delta: adminStats.overview.pendingReviewDelta, unit: '%', isReverseMetric: true },
  { key: 'aiCallCount',  label: 'AI 调用数',      icon: Sparkles,    value: adminStats.overview.aiCallCount,  delta: adminStats.overview.aiCallDelta,        unit: '%' },
]

export default function AdminDashboardPage() {
  // 实时数据快照：来自 apiClient，与上方 adminStats mock 形成混合数据来源
  const [recentPosts, setRecentPosts] = useState([])
  const [limitedUsers, setLimitedUsers] = useState([])
  const [moderators, setModerators] = useState([])
  const [liveError, setLiveError] = useState(null)

  // 并发拉取三类实时数据：最近 5 篇帖子、限流用户、版主列表
  // cleanup 用 cancelled 标志位避免组件卸载后 setState
  useEffect(() => {
    let cancelled = false
    async function loadLiveData() {
      try {
        const [postsData, limited, mods] = await Promise.all([
          getPosts({ limit: 5 }),
          getUsers({ status: 'limited' }),
          getUsers({ role: 'moderator' }),
        ])
        if (cancelled) return
        setRecentPosts(Array.isArray(postsData) ? postsData : [])
        setLimitedUsers(Array.isArray(limited) ? limited : [])
        setModerators(Array.isArray(mods) ? mods : [])
      } catch (err) {
        if (cancelled) return
        // 实时数据失败不影响主页面（adminStats mock 仍可展示），仅记录错误信息
        setLiveError(err?.message || '实时数据加载失败')
      }
    }
    loadLiveData()
    return () => { cancelled = true }
  }, [])

  // 周趋势图：按 active 值比例计算柱状高度，周五最高 13200 对应 h-48
  const maxActive = Math.max(...adminStats.weeklyTrend.map((d) => d.active))
  const BASE_HEIGHT = 192 // h-48 对应 192px

  // 治理概览：工单进度
  const { aiCases, resolved, pending } = adminStats.governance
  const caseProgress = (resolved / aiCases) * 100
  // AI 准确率数值 94.2%，来源 adminStats.governance.aiAccuracy
  const aiAccuracy = adminStats.governance.aiAccuracy

  return (
    <div className="space-y-6">
      {/* 标题区 */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">后台总览</h1>
        <p className="text-sm text-afmuted-foreground mt-1">社区运营状态与关键指标趋势</p>
      </div>

      {/* A) 4 个核心指标卡 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {METRICS.map((m) => (
          <AdminStatCard
            key={m.key}
            icon={m.icon}
            label={m.label}
            value={m.value}
            delta={m.delta}
            unit={m.unit}
            isReverseMetric={m.isReverseMetric}
          />
        ))}
      </div>

      {/* B) 周趋势图 */}
      <div className="w-full min-h-[256px] bg-card border border-border rounded-af-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">近 7 天活跃趋势</h2>
          <span className="text-xs text-afmuted-foreground">单位：活跃人数</span>
        </div>
        {/* 用 div 手工绘制 7 根柱状，高度按 active 值比例缩放 */}
        <div className="flex items-end justify-between gap-3 h-48 px-2">
          {adminStats.weeklyTrend.map((d) => {
            const heightPct = (d.active / maxActive) * 100
            const isToday = d.day === '周日'
            return (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-2 group">
                {/* 柱子容器，从底部起 */}
                <div className="w-full h-48 flex items-end justify-center">
                  <div
                    className={`w-full max-w-[32px] rounded-t-af-md transition-all duration-300 group-hover:opacity-80 ${
                      isToday ? 'bg-vermilion' : 'bg-gradient-to-t from-vermilion-light to-ochre'
                    }`}
                    style={{ height: `calc(${heightPct}% * 0.85 + 15%)` }}
                    title={`${d.day}：活跃 ${d.active.toLocaleString()} 人`}
                  />
                </div>
                {/* X 轴标签 */}
                <span className={`text-xs ${isToday ? 'text-vermilion font-semibold' : 'text-afmuted-foreground'}`}>
                  {d.day}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* C) 治理概览卡片 - 左右双栏 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        {/* 左卡：AI 工单统计 + 进度条 */}
        <div className="bg-card border border-border rounded-af-lg p-5">
          <div className="flex items-center gap-2 mb-5">
            <ShieldCheck className="size-5 text-vermilion" />
            <h2 className="font-semibold text-foreground">AI 工单统计</h2>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-afmuted/40 rounded-af-md p-3">
                <p className="text-2xl font-bold text-foreground tabular-nums">{aiCases}</p>
                <p className="text-xs text-afmuted-foreground mt-1">总数</p>
              </div>
              <div className="bg-success-bg/60 rounded-af-md p-3">
                <p className="text-2xl font-bold text-success tabular-nums">{resolved}</p>
                <p className="text-xs text-afmuted-foreground mt-1">已处理</p>
              </div>
              <div className="bg-warning-bg/60 rounded-af-md p-3">
                <p className="text-2xl font-bold text-warning tabular-nums">{pending}</p>
                <p className="text-xs text-afmuted-foreground mt-1">待处理</p>
              </div>
            </div>
            {/* 进度条：已处理 / 总数 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-afmuted-foreground">处理进度</span>
                <span className="text-xs font-semibold text-foreground tabular-nums">
                  {resolved} / {aiCases} · {caseProgress.toFixed(1)}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-afmuted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-vermilion to-vermilion-light rounded-full transition-all duration-500"
                  style={{ width: `${caseProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 右卡：AI 初审准确率 - 大圆形进度环 + 大数字 */}
        <div className="bg-card border border-border rounded-af-lg p-5">
          <div className="flex items-center gap-2 mb-5">
            <Sparkles className="size-5 text-vermilion" />
            <h2 className="font-semibold text-foreground">AI 初审准确率</h2>
          </div>
          {/*
            为什么 AI 准确率是 94.2%：
            数据来源 adminStats.governance.aiAccuracy（mock 数据），Phase0 用于骨架展示
          */}
          <div className="flex items-center justify-center py-3">
            {/* 圆形进度环：SVG 绘制 */}
            <div className="relative size-44">
              <svg className="size-full -rotate-90" viewBox="0 0 100 100">
                {/* 背景环 */}
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="8"
                  className="text-afmuted/50"
                />
                {/* 进度环：strokeDasharray 周长 264 = 2 * π * 42 */}
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="url(#accuracyGradient)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="264"
                  strokeDashoffset={264 - (264 * aiAccuracy) / 100}
                  className="transition-all duration-700"
                />
                <defs>
                  <linearGradient id="accuracyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#E5533A" />
                    <stop offset="100%" stopColor="#C8381D" />
                  </linearGradient>
                </defs>
              </svg>
              {/* 中心大数字 */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold text-foreground tabular-nums">{aiAccuracy}</span>
                <span className="text-sm text-afmuted-foreground -mt-1">%</span>
                <span className="text-[10px] text-afmuted-foreground mt-1">AI 初审准确率</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2 text-center">
            <div className="bg-afmuted/30 rounded-af-md py-2">
              <p className="text-xs text-afmuted-foreground">人工复核提升</p>
              <p className="text-sm font-semibold text-success tabular-nums">+2.8%</p>
            </div>
            <div className="bg-afmuted/30 rounded-af-md py-2">
              <p className="text-xs text-afmuted-foreground">误判率</p>
              <p className="text-sm font-semibold text-warning tabular-nums">5.8%</p>
            </div>
          </div>
        </div>
      </div>

      {/* D) 实时数据快照：来自 apiClient，与上方 adminStats mock 区分数据来源 */}
      <div className="bg-card border border-border rounded-af-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground">实时数据快照</h2>
          <span className="text-xs text-afmuted-foreground">数据源：API（/api/forum）</span>
        </div>
        {liveError ? (
          // 错误状态可见：便于运维排查后端连接问题
          <p className="text-sm text-error">{liveError}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 最近帖子数量 */}
            <div className="bg-afmuted/30 rounded-af-md p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="size-4 text-vermilion" />
                <span className="text-xs text-afmuted-foreground">最近帖子（限 5 条）</span>
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{recentPosts.length}</p>
              <p className="text-xs text-afmuted-foreground mt-1">已加载</p>
            </div>
            {/* 限流用户数量 */}
            <div className="bg-afmuted/30 rounded-af-md p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="size-4 text-warning" />
                <span className="text-xs text-afmuted-foreground">限流用户</span>
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{limitedUsers.length}</p>
              <p className="text-xs text-afmuted-foreground mt-1">status=limited</p>
            </div>
            {/* 版主数量 */}
            <div className="bg-afmuted/30 rounded-af-md p-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="size-4 text-info" />
                <span className="text-xs text-afmuted-foreground">版主</span>
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">{moderators.length}</p>
              <p className="text-xs text-afmuted-foreground mt-1">role=moderator</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
