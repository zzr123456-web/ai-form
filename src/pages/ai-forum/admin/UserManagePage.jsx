import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Users, X, Loader2 } from 'lucide-react'
import EmptyState from '../../../components/ai-forum/common/EmptyState.jsx'

// === 常量映射 ===

// 状态徽标配置：tone 对应项目语义色 token（success/warning/error）
const STATUS_MAP = {
  active:  { label: '正常', tone: 'success', cls: 'bg-success-bg text-success' },
  limited: { label: '限流', tone: 'warning', cls: 'bg-warning-bg text-warning' },
  banned:  { label: '封禁', tone: 'error',   cls: 'bg-error-bg text-error' },
}

// 角色徽标配置：user 灰、moderator 蓝、admin 红
const ROLE_MAP = {
  user:      { label: '用户',   cls: 'bg-secondary text-secondary-foreground' },
  moderator: { label: '版主',   cls: 'bg-info-bg text-info' },
  admin:     { label: '管理员', cls: 'bg-error-bg text-error font-semibold' },
}

// 全部可选角色（编辑角色 modal 复选框用）
const ALL_ROLES = ['user', 'moderator', 'admin']

const PAGE_SIZE = 20

// === 内联 fetch 封装 ===
// 复用 apiClient.js 的 auth 模式：af_token + Bearer 头，不引入对 apiClient.js 的依赖
// 避免与并行更新 apiClient.js 的 agent 产生冲突
const API_BASE = '/api/forum'

async function adminFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  try {
    const token = localStorage.getItem('af_token')
    if (token) headers.Authorization = `Bearer ${token}`
  } catch {
    // 隐私模式静默忽略
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const rawText = await res.text()
  let payload = null
  try {
    payload = rawText ? JSON.parse(rawText) : null
  } catch {
    payload = null
  }
  if (!res.ok) {
    const errorMsg = (payload && payload.error) || `HTTP ${res.status}`
    return { ok: false, error: errorMsg, status: res.status, data: null }
  }
  return { ok: true, data: payload, error: null, status: res.status }
}

// 格式化时间为本地可读字符串，兼容 ISO 与已有格式化字符串
function formatTime(input) {
  if (!input) return '-'
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) return input
  // 用本地时区展示，避免用户困惑
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// === 主组件 ===
export default function UserManagePage() {
  const [users, setUsers] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 搜索：searchInput 为输入框实时值，appliedSearch 为实际查询用的值（防抖后）
  const [searchInput, setSearchInput] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [offset, setOffset] = useState(0)

  // 状态编辑 modal：{ user, status } —— status 为待提交的临时选中值
  const [statusModal, setStatusModal] = useState(null)
  // 角色编辑 modal：{ user, roles } —— roles 为待提交的临时选中数组
  const [rolesModal, setRolesModal] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')

  // 防抖：输入框停止输入 400ms 后再触发查询，避免每次按键都打接口
  // cleanup 清除定时器，防止组件卸载后 setState
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(searchInput)
      setOffset(0) // 新搜索时回到第一页
    }, 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  // 加载用户列表：依赖 appliedSearch 与 offset，任一变化重新拉取
  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('search', appliedSearch)
      params.set('limit', String(PAGE_SIZE))
      params.set('offset', String(offset))
      const res = await adminFetch(`/admin/users?${params.toString()}`)
      if (!res.ok) {
        setError(res.error || '加载用户列表失败')
        setUsers([])
        setTotal(0)
        return
      }
      const data = res.data || {}
      setUsers(Array.isArray(data.users) ? data.users : [])
      setTotal(typeof data.total === 'number' ? data.total : 0)
    } catch (err) {
      setError(err?.message || '网络错误，加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }, [appliedSearch, offset])

  // loadUsers 用 useCallback 包裹，依赖变化时自动重新拉取
  // loadUsers 内部已 try/catch，不会抛出未捕获异常
  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  // === 操作处理 ===

  const handleOpenStatus = (user) => {
    setModalError('')
    setStatusModal({ user, status: user.status || 'active' })
  }

  const handleOpenRoles = (user) => {
    setModalError('')
    setRolesModal({ user, roles: Array.isArray(user.roles) ? [...user.roles] : [] })
  }

  const handleCloseModals = () => {
    setStatusModal(null)
    setRolesModal(null)
    setModalError('')
    setSubmitting(false)
  }

  // 提交状态更新：PUT /admin/users/:id/status
  const handleSubmitStatus = async () => {
    if (!statusModal) return
    setSubmitting(true)
    setModalError('')
    const res = await adminFetch(`/admin/users/${encodeURIComponent(statusModal.user.id)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: statusModal.status }),
    })
    setSubmitting(false)
    if (!res.ok) {
      setModalError(res.error || '更新状态失败')
      return
    }
    handleCloseModals()
    await loadUsers()
  }

  // 提交角色更新：PUT /admin/users/:id/roles
  const handleSubmitRoles = async () => {
    if (!rolesModal) return
    setSubmitting(true)
    setModalError('')
    const res = await adminFetch(`/admin/users/${encodeURIComponent(rolesModal.user.id)}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ roles: rolesModal.roles }),
    })
    setSubmitting(false)
    if (!res.ok) {
      setModalError(res.error || '更新角色失败')
      return
    }
    handleCloseModals()
    await loadUsers()
  }

  // 切换角色复选框
  const toggleRole = (role) => {
    setRolesModal((prev) => {
      if (!prev) return prev
      const exists = prev.roles.includes(role)
      const next = exists
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role]
      return { ...prev, roles: next }
    })
  }

  // === 渲染辅助 ===

  const renderStatusBadge = (status) => {
    const cfg = STATUS_MAP[status] || STATUS_MAP.active
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
        {cfg.label}
      </span>
    )
  }

  const renderRolePills = (roles) => {
    const arr = Array.isArray(roles) ? roles : []
    if (arr.length === 0) {
      return <span className="text-xs text-afmuted-foreground">-</span>
    }
    return (
      <div className="flex flex-wrap gap-1">
        {arr.map((r) => {
          const cfg = ROLE_MAP[r] || { label: r, cls: 'bg-secondary text-secondary-foreground' }
          return (
            <span key={r} className={`px-1.5 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>
              {cfg.label}
            </span>
          )
        })}
      </div>
    )
  }

  // 分页：上一页 / 下一页
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasPrev = offset > 0
  const hasNext = offset + PAGE_SIZE < total

  // === 渲染主体 ===

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">用户管理</h1>
        <p className="text-sm text-afmuted-foreground mt-1">查看用户信息、调整状态与角色权限</p>
      </div>

      {/* 搜索区 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-afmuted-foreground pointer-events-none" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="搜索昵称或邮箱"
            className="w-full h-10 pl-9 pr-3 rounded-af-md border border-input bg-background text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="text-sm text-afmuted-foreground">
          共 {total} 位用户
        </div>
      </div>

      {/* 加载态 */}
      {loading ? (
        <div className="bg-card border border-border rounded-af-lg p-6 text-center text-afmuted-foreground flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          正在加载用户列表...
        </div>
      ) : error ? (
        // 错误态：可见提示便于排查
        <div className="bg-card border border-border rounded-af-lg p-6 text-center text-error">
          {error}
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="未找到匹配用户" description="尝试调整搜索关键词" />
      ) : (
        <div className="bg-card border border-border rounded-af-lg overflow-hidden">
          {/* 桌面端表格 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full table-auto text-sm">
              <thead className="bg-afmuted/50 text-afmuted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">昵称</th>
                  <th className="text-left font-medium px-4 py-3">邮箱</th>
                  <th className="text-left font-medium px-4 py-3">状态</th>
                  <th className="text-left font-medium px-4 py-3">角色</th>
                  <th className="text-left font-medium px-4 py-3">注册时间</th>
                  <th className="text-right font-medium px-4 py-3 w-[200px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  // 使用用户 id 作为稳定 key，避免重排导致的渲染错乱
                  <tr key={u.id} className="hover:bg-afmuted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{u.nickname || '-'}</td>
                    <td className="px-4 py-3 text-afmuted-foreground">{u.email || '-'}</td>
                    <td className="px-4 py-3">{renderStatusBadge(u.status)}</td>
                    <td className="px-4 py-3">{renderRolePills(u.roles)}</td>
                    <td className="px-4 py-3 text-afmuted-foreground whitespace-nowrap">{formatTime(u.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenStatus(u)}
                          className="h-8 px-3 rounded-af-md border border-border bg-background text-xs font-medium text-foreground hover:bg-afmuted transition-colors"
                        >
                          编辑状态
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenRoles(u)}
                          className="h-8 px-3 rounded-af-md border border-border bg-background text-xs font-medium text-foreground hover:bg-afmuted transition-colors"
                        >
                          编辑角色
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 移动端卡片列表 */}
          <div className="md:hidden divide-y divide-border">
            {users.map((u) => (
              <div key={u.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground truncate">{u.nickname || '-'}</p>
                  {renderStatusBadge(u.status)}
                </div>
                <p className="text-xs text-afmuted-foreground truncate">{u.email || '-'}</p>
                <div className="flex items-center justify-between gap-2">
                  {renderRolePills(u.roles)}
                  <span className="text-xs text-afmuted-foreground whitespace-nowrap">{formatTime(u.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOpenStatus(u)}
                    className="flex-1 h-8 rounded-af-md border border-border bg-background text-xs text-foreground hover:bg-afmuted transition-colors"
                  >
                    编辑状态
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenRoles(u)}
                    className="flex-1 h-8 rounded-af-md border border-border bg-background text-xs text-foreground hover:bg-afmuted transition-colors"
                  >
                    编辑角色
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 分页控件：仅在总数超过单页时展示 */}
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border">
              <button
                type="button"
                disabled={!hasPrev}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="h-8 px-3 rounded-af-md border border-border bg-background text-xs font-medium text-foreground hover:bg-afmuted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <span className="text-xs text-afmuted-foreground">
                第 {currentPage} / {totalPages} 页
              </span>
              <button
                type="button"
                disabled={!hasNext}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="h-8 px-3 rounded-af-md border border-border bg-background text-xs font-medium text-foreground hover:bg-afmuted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          ) : null}
        </div>
      )}

      {/* 编辑状态 Modal */}
      {statusModal ? (
        <StatusEditModal
          user={statusModal.user}
          status={statusModal.status}
          onChange={(s) => setStatusModal((prev) => (prev ? { ...prev, status: s } : prev))}
          onClose={handleCloseModals}
          onSubmit={handleSubmitStatus}
          submitting={submitting}
          error={modalError}
        />
      ) : null}

      {/* 编辑角色 Modal */}
      {rolesModal ? (
        <RolesEditModal
          user={rolesModal.user}
          roles={rolesModal.roles}
          onToggle={toggleRole}
          onClose={handleCloseModals}
          onSubmit={handleSubmitRoles}
          submitting={submitting}
          error={modalError}
        />
      ) : null}
    </div>
  )
}

// === 子组件：状态编辑 Modal ===
function StatusEditModal({ user, status, onChange, onClose, onSubmit, submitting, error }) {
  // 弹窗打开时锁定 body 滚动，关闭时恢复
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={onClose} aria-hidden={true} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-af-xl shadow-af-3 overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="font-semibold text-foreground">编辑用户状态</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-afmuted-foreground hover:text-foreground hover:bg-afmuted rounded-af-md transition-colors"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-6 pb-6 space-y-3">
          <p className="text-sm text-afmuted-foreground">
            用户：<span className="font-medium text-foreground">{user.nickname}</span>
          </p>
          {error ? (
            <div className="rounded-af-md bg-error-bg p-3 text-sm text-error">{error}</div>
          ) : null}
          <div className="space-y-2">
            {Object.entries(STATUS_MAP).map(([value, cfg]) => (
              <label
                key={value}
                className={`flex items-center gap-3 h-11 px-3 rounded-af-md border cursor-pointer transition-colors ${
                  status === value ? 'border-ring bg-afmuted/40' : 'border-border hover:bg-afmuted/30'
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value={value}
                  checked={status === value}
                  onChange={() => onChange(value)}
                  className="accent-ring"
                />
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
                  {cfg.label}
                </span>
                <span className="text-xs text-afmuted-foreground">{value}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="w-full h-10 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '提交中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// === 子组件：角色编辑 Modal ===
function RolesEditModal({ user, roles, onToggle, onClose, onSubmit, submitting, error }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={onClose} aria-hidden={true} />
      <div className="relative w-full max-w-sm bg-card border border-border rounded-af-xl shadow-af-3 overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="font-semibold text-foreground">编辑用户角色</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-afmuted-foreground hover:text-foreground hover:bg-afmuted rounded-af-md transition-colors"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-6 pb-6 space-y-3">
          <p className="text-sm text-afmuted-foreground">
            用户：<span className="font-medium text-foreground">{user.nickname}</span>
          </p>
          {error ? (
            <div className="rounded-af-md bg-error-bg p-3 text-sm text-error">{error}</div>
          ) : null}
          <div className="space-y-2">
            {ALL_ROLES.map((r) => {
              const cfg = ROLE_MAP[r]
              const checked = roles.includes(r)
              return (
                <label
                  key={r}
                  className={`flex items-center gap-3 h-11 px-3 rounded-af-md border cursor-pointer transition-colors ${
                    checked ? 'border-ring bg-afmuted/40' : 'border-border hover:bg-afmuted/30'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(r)}
                    className="accent-ring"
                  />
                  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-afmuted-foreground">{r}</span>
                </label>
              )
            })}
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="w-full h-10 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '提交中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
