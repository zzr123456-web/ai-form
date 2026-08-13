import React, { useState, useEffect, useMemo } from 'react'
import { Search, Users, Eye, Ban, Gauge, Shield, ChevronDown, ChevronUp } from 'lucide-react'
import Avatar from '../../../components/ai-forum/common/Avatar.jsx'
import EmptyState from '../../../components/ai-forum/common/EmptyState.jsx'
import { StatusBadge } from '../../../components/ai-forum/common/Badges.jsx'
import { getUsers } from '../../../utils/ai-forum/apiClient'

const STATUS_LABEL = {
  active:  { label: '正常', tone: 'success' },
  limited: { label: '限流', tone: 'warning' },
  banned:  { label: '封禁', tone: 'error' },
  deleted: { label: '已删除', tone: 'neutral' },
}

const ROLE_OPTIONS = [
  { value: 'all',       label: '全部角色' },
  { value: 'user',      label: '普通用户' },
  { value: 'moderator', label: '版主' },
  { value: 'admin',     label: '管理员' },
]

export default function UserManagePage() {
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null) // 展开的用户详情卡 id
  // 用户列表来自 API：初始为空，加载完成后填充
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 异步加载全部用户：一次性拉取后客户端筛选，避免每次 filter 变化都打接口
  // cleanup 用 cancelled 标志位避免组件卸载后 setState（防止内存泄漏警告）
  useEffect(() => {
    let cancelled = false
    async function loadUsers() {
      try {
        const data = await getUsers()
        if (cancelled) return
        setList(Array.isArray(data) ? data : [])
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err?.message || '加载用户列表失败')
        setLoading(false)
      }
    }
    loadUsers()
    return () => { cancelled = true }
  }, [])

  // 按条件筛选用户
  const filtered = useMemo(() => {
    let arr = list
    if (keyword.trim() !== '') {
      const kw = keyword.trim().toLowerCase()
      arr = arr.filter((u) =>
        u.nickname.toLowerCase().includes(kw) ||
        u.handle.toLowerCase().includes(kw)
      )
    }
    if (statusFilter !== 'all') arr = arr.filter((u) => u.status === statusFilter)
    // roles 是数组，所以用 includes 判断角色归属
    if (roleFilter !== 'all') arr = arr.filter((u) => u.roles?.includes(roleFilter))
    return arr
  }, [list, keyword, statusFilter, roleFilter])

  const updateStatus = (id, status) => {
    setList((prev) => prev.map((u) => (u.id === id ? { ...u, status } : u)))
  }

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  // 渲染角色徽标：moderator 蓝色，其他默认灰
  const renderRoleBadges = (roles) => {
    if (!roles || roles.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1">
        {roles.map((r) => {
          const cls =
            r === 'moderator'
              ? 'bg-info-bg text-info'
              : r === 'admin'
              ? 'bg-vermilion/15 text-vermilion font-semibold'
              : 'bg-secondary text-secondary-foreground'
          return (
            <span key={r} className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
              {r === 'moderator' ? '版主' : r === 'admin' ? '管理员' : '用户'}
            </span>
          )
        })}
      </div>
    )
  }

  // 加载态：保留 Header 上下文，内容区显示加载提示，避免渲染半成品表格
  if (loading) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground">用户管理</h1>
          <p className="text-sm text-afmuted-foreground mt-1">查看用户信息、调整权限、处理违规用户</p>
        </div>
        <div className="bg-card border border-border rounded-af-lg p-6 text-center text-afmuted-foreground">
          正在加载用户列表...
        </div>
      </div>
    )
  }

  // 错误态：可见的错误提示，便于排查后端连接问题
  if (error) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground">用户管理</h1>
          <p className="text-sm text-afmuted-foreground mt-1">查看用户信息、调整权限、处理违规用户</p>
        </div>
        <div className="bg-card border border-border rounded-af-lg p-6 text-center text-error">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">用户管理</h1>
        <p className="text-sm text-afmuted-foreground mt-1">查看用户信息、调整权限、处理违规用户</p>
      </div>

      {/* A) 顶部筛选区：搜索框 + 状态 select + 角色 select */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* 搜索框 */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-afmuted-foreground pointer-events-none" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索用户名或 Handle"
            className="w-full h-10 pl-9 pr-3 rounded-af-md border border-input bg-background text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {/* 状态筛选 */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 px-3 rounded-af-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">全部状态</option>
          <option value="active">正常 active</option>
          <option value="limited">限流 limited</option>
          <option value="banned">封禁 banned</option>
        </select>
        {/* 角色筛选 */}
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-10 px-3 rounded-af-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* B) 用户列表 / 空状态 */}
      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="未找到匹配用户" description="尝试调整筛选条件" />
      ) : (
        <div className="bg-card border border-border rounded-af-lg overflow-hidden">
          {/* 桌面端表格 */}
          <div className="hidden md:block">
            <table className="w-full table-auto text-sm">
              <thead className="bg-afmuted/50 text-afmuted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3 w-[240px]">用户</th>
                  <th className="text-left font-medium px-4 py-3">Handle</th>
                  <th className="text-left font-medium px-4 py-3">职业 · 城市</th>
                  <th className="text-left font-medium px-4 py-3">状态</th>
                  <th className="text-left font-medium px-4 py-3">角色</th>
                  <th className="text-left font-medium px-4 py-3">注册时间</th>
                  <th className="text-right font-medium px-4 py-3 w-[120px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((u) => {
                  const st = STATUS_LABEL[u.status] || STATUS_LABEL.active
                  const isExpanded = expandedId === u.id
                  return (
                    // 必须使用实体 id 作为 key，不使用 index
                    <React.Fragment key={u.id}>
                      <tr
                        className="hover:bg-afmuted/30 transition-colors cursor-pointer"
                        onClick={() => toggleExpand(u.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar text={u.avatarText} size="sm" />
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{u.nickname}</p>
                            </div>
                            {/* 展开指示箭头 */}
                            {isExpanded
                              ? <ChevronUp className="size-4 text-afmuted-foreground shrink-0 ml-1" />
                              : <ChevronDown className="size-4 text-afmuted-foreground shrink-0 ml-1" />
                            }
                          </div>
                        </td>
                        <td className="px-4 py-3 text-afmuted-foreground font-mono text-xs">@{u.handle}</td>
                        <td className="px-4 py-3 text-afmuted-foreground">
                          <span>{u.profession || '-'}</span>
                          <span className="text-afmuted-foreground/60 mx-1">·</span>
                          <span>{u.city || '-'}</span>
                        </td>
                        <td className="px-4 py-3"><StatusBadge tone={st.tone}>{st.label}</StatusBadge></td>
                        <td className="px-4 py-3">{renderRoleBadges(u.roles)}</td>
                        <td className="px-4 py-3 text-afmuted-foreground">{u.joinedAt}</td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" className="p-1.5 text-afmuted-foreground hover:text-foreground hover:bg-afmuted rounded-af-md transition-colors" aria-label="查看详情">
                              <Eye className="size-4" />
                            </button>
                            {u.status !== 'banned' ? (
                              <button
                                type="button"
                                onClick={() => updateStatus(u.id, 'banned')}
                                className="p-1.5 text-afmuted-foreground hover:text-error hover:bg-error-bg rounded-af-md transition-colors"
                                aria-label="封禁"
                              >
                                <Ban className="size-4" />
                              </button>
                            ) : null}
                            {u.status === 'active' ? (
                              <button
                                type="button"
                                onClick={() => updateStatus(u.id, 'limited')}
                                className="p-1.5 text-afmuted-foreground hover:text-warning hover:bg-warning-bg rounded-af-md transition-colors"
                                aria-label="限流"
                              >
                                <Gauge className="size-4" />
                              </button>
                            ) : null}
                            <button type="button" className="p-1.5 text-afmuted-foreground hover:text-foreground hover:bg-afmuted rounded-af-md transition-colors" aria-label="权限管理">
                              <Shield className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* 展开的用户详情卡 */}
                      {isExpanded ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-0">
                            <div className="bg-afmuted/30 -mx-4 px-4 py-4 border-t border-border animate-[fadeIn_0.2s_ease]">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <p className="text-xs text-afmuted-foreground mb-1">个人简介</p>
                                  <p className="text-foreground">{u.bio || '未填写'}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-afmuted-foreground mb-1">用户 ID</p>
                                  <p className="text-foreground font-mono text-xs">{u.id}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-afmuted-foreground mb-1">角色列表</p>
                                  <div className="flex flex-wrap gap-1">{renderRoleBadges(u.roles)}</div>
                                </div>
                                <div>
                                  <p className="text-xs text-afmuted-foreground mb-1">账号状态</p>
                                  <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                                </div>
                              </div>
                              {/* 操作占位 */}
                              <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border/60">
                                <button type="button" className="h-8 px-3 rounded-af-md border border-border bg-background text-xs font-medium text-foreground hover:bg-afmuted transition-colors">
                                  查看全部帖子
                                </button>
                                <button type="button" className="h-8 px-3 rounded-af-md border border-border bg-background text-xs font-medium text-foreground hover:bg-afmuted transition-colors">
                                  管理权限
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 移动端卡片列表 */}
          <div className="md:hidden divide-y divide-border">
            {filtered.map((u) => {
              const st = STATUS_LABEL[u.status] || STATUS_LABEL.active
              const isExpanded = expandedId === u.id
              return (
                <div key={u.id} className="p-4">
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => toggleExpand(u.id)}
                  >
                    <Avatar text={u.avatarText} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="font-medium text-foreground truncate">{u.nickname}</p>
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      </div>
                      <p className="text-xs text-afmuted-foreground truncate mb-2">
                        @{u.handle} · {u.profession || '-'} · {u.city || '-'}
                      </p>
                      <div className="flex items-center justify-between">
                        {renderRoleBadges(u.roles)}
                        <span className="text-xs text-afmuted-foreground">
                          {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 展开详情 */}
                  {isExpanded ? (
                    <div className="mt-3 pt-3 border-t border-border/60 text-sm">
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <p className="text-xs text-afmuted-foreground mb-0.5">注册时间</p>
                          <p className="text-foreground">{u.joinedAt}</p>
                        </div>
                        <div>
                          <p className="text-xs text-afmuted-foreground mb-0.5">ID</p>
                          <p className="text-foreground font-mono text-xs truncate">{u.id}</p>
                        </div>
                      </div>
                      <div className="mb-3">
                        <p className="text-xs text-afmuted-foreground mb-0.5">简介</p>
                        <p className="text-foreground text-xs">{u.bio || '未填写'}</p>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="flex-1 h-8 rounded-af-md border border-border bg-background text-xs text-foreground hover:bg-afmuted transition-colors"
                        >
                          查看详情
                        </button>
                        {u.status !== 'banned' ? (
                          <button
                            type="button"
                            onClick={() => updateStatus(u.id, 'banned')}
                            className="flex-1 h-8 rounded-af-md bg-error-bg text-error text-xs font-medium hover:opacity-90 transition-opacity"
                          >
                            封禁
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
