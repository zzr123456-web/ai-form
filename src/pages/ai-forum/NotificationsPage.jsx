import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell, MessageSquare, UserPlus, Sparkles, ShieldCheck, Settings, CheckCheck,
} from 'lucide-react'
import EmptyState from '../../components/ai-forum/common/EmptyState.jsx'
import { useAuth } from '../../components/ai-forum/AuthProvider.jsx'
import { notifications } from '../../utils/ai-forum/mockData.js'
import { formatRelativeTime } from '../../utils/ai-forum/aiForumUtils.js'

const TABS = [
  { key: 'all',             label: '全部' },
  { key: 'reply',           label: '回复' },
  { key: 'follow',          label: '关注' },
  { key: 'ai_reminder',     label: 'AI 提醒' },
  { key: 'system',          label: '系统' },
  { key: 'moderation_result', label: '审核' },
]

const TYPE_ICON = {
  reply: { icon: MessageSquare, bg: 'bg-info-bg text-info' },
  follow: { icon: UserPlus, bg: 'bg-success-bg text-success' },
  ai_reminder: { icon: Sparkles, bg: 'bg-primary text-primary-foreground' },
  system: { icon: Bell, bg: 'bg-secondary text-secondary-foreground' },
  moderation_result: { icon: ShieldCheck, bg: 'bg-warning-bg text-warning' },
}

export default function NotificationsPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState('all')
  const [readIds, setReadIds] = useState(new Set())

  const list = useMemo(() => {
    let arr = notifications
    if (tab !== 'all') arr = arr.filter((n) => n.type === tab)
    return arr
  }, [tab])

  const unreadCount = list.filter((n) => !n.readAt && !readIds.has(n.id)).length

  const markAllRead = () => {
    setReadIds(new Set(list.map((n) => n.id)))
  }
  const isUnread = (n) => !n.readAt && !readIds.has(n.id)

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <EmptyState
          icon={Bell}
          title="登录后查看通知"
          description="评论回复、关注动态、系统通知和 AI 提醒将汇总在这里"
          action={<Link to="/forum/login" className="inline-flex items-center h-9 px-4 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">前往登录</Link>}
        />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* 顶部 */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-foreground">通知中心</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={markAllRead} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-af-md border border-border bg-card text-foreground text-xs font-medium hover:bg-afmuted transition-colors">
            <CheckCheck className="size-3.5" /> 全部已读
          </button>
          <button type="button" className="p-2 text-afmuted-foreground hover:text-foreground hover:bg-afmuted rounded-af-md transition-colors" aria-label="通知设置">
            <Settings className="size-4" />
          </button>
        </div>
      </div>

      {/* 分类 Tab */}
      <div className="flex items-center gap-1 overflow-x-auto af-no-scrollbar border-b border-border mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-foreground text-foreground' : 'border-transparent text-afmuted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 通知列表 */}
      {list.length === 0 ? (
        <EmptyState icon={Bell} title="暂无通知" description="新的互动和提醒会出现在这里" />
      ) : (
        <div className="space-y-2">
          {list.map((n) => {
            const cfg = TYPE_ICON[n.type] || TYPE_ICON.system
            const Icon = cfg.icon
            const unread = isUnread(n)
            const linkTo = n.targetId ? (n.type === 'follow' ? '/forum/profile' : n.type === 'ai_reminder' ? '/forum/search' : `/forum/post/${n.targetId}`) : null
            const Wrapper = linkTo ? Link : 'div'
            return (
              <Wrapper
                key={n.id}
                to={linkTo || undefined}
                className={`flex gap-3 p-4 rounded-af-lg border bg-card transition-colors ${unread ? 'border-foreground/20' : 'border-border'} ${linkTo ? 'hover:border-afmuted-foreground/30 cursor-pointer' : ''}`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                    <span className="text-xs text-afmuted-foreground shrink-0">{formatRelativeTime(n.createdAt)}</span>
                  </div>
                  {n.body ? <p className="text-sm text-afmuted-foreground leading-relaxed">{n.body}</p> : null}
                </div>
                {unread ? <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" aria-label="未读" /> : null}
              </Wrapper>
            )
          })}
        </div>
      )}
    </div>
  )
}
