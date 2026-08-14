import React, { useState, useEffect, useCallback } from 'react'
import { LayoutGrid, Plus, X, Loader2, Archive, Pencil } from 'lucide-react'
import EmptyState from '../../../components/ai-forum/common/EmptyState.jsx'

// === 常量映射 ===

// 治理模式徽标：loose 绿、quality_first 蓝、safety_first 红
const GOVERNANCE_MAP = {
  loose:         { label: '宽松',   cls: 'bg-success-bg text-success' },
  quality_first: { label: '质量优先', cls: 'bg-info-bg text-info' },
  safety_first:  { label: '安全优先', cls: 'bg-error-bg text-error' },
}

// 版块状态徽标：active 绿、archived 灰
const BOARD_STATUS_MAP = {
  active:   { label: '正常',   cls: 'bg-success-bg text-success' },
  archived: { label: '已归档', cls: 'bg-secondary text-secondary-foreground' },
}

// 治理模式可选项（表单 select 用）
const GOVERNANCE_OPTIONS = [
  { value: 'loose',         label: '宽松（loose）' },
  { value: 'quality_first', label: '质量优先（quality_first）' },
  { value: 'safety_first',  label: '安全优先（safety_first）' },
]

// 表单空初始值
const EMPTY_FORM = {
  name: '',
  description: '',
  icon: '',
  color: '#475569',
  governance_mode: 'loose',
}

// === 内联 fetch 封装 ===
// 复用 apiClient.js 的 auth 模式：af_token + Bearer 头，不修改 apiClient.js
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

// === 主组件 ===
export default function BoardManagePage() {
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 编辑/新增 modal：null 表示关闭；{ mode: 'create'|'edit', board, form } 表示打开
  const [modal, setModal] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')

  // 加载版块列表：GET /boards 复用公开接口（已过滤归档版块）
  const loadBoards = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminFetch('/boards')
      if (!res.ok) {
        setError(res.error || '加载版块列表失败')
        setBoards([])
        return
      }
      setBoards(Array.isArray(res.data) ? res.data : [])
    } catch (err) {
      setError(err?.message || '网络错误，加载版块列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBoards()
  }, [loadBoards])

  // === 操作处理 ===

  // 打开新增 modal：表单清空
  const handleOpenCreate = () => {
    setModalError('')
    setModal({ mode: 'create', board: null, form: { ...EMPTY_FORM } })
  }

  // 打开编辑 modal：用现有版块数据预填表单
  // 注意：GET /boards 返回 governanceMode（camelCase），提交时需转为 governance_mode（snake_case）
  const handleOpenEdit = (board) => {
    setModalError('')
    setModal({
      mode: 'edit',
      board,
      form: {
        name: board.name || '',
        description: board.description || '',
        icon: board.icon || '',
        color: board.color || '#475569',
        governance_mode: board.governanceMode || board.governance_mode || 'loose',
      },
    })
  }

  const handleCloseModal = () => {
    setModal(null)
    setModalError('')
    setSubmitting(false)
  }

  // 表单字段变更
  const handleFieldChange = (field, value) => {
    setModal((prev) => {
      if (!prev) return prev
      return { ...prev, form: { ...prev.form, [field]: value } }
    })
  }

  // 提交表单：新增走 POST，编辑走 PUT
  const handleSubmit = async () => {
    if (!modal) return
    const { mode, board, form } = modal
    if (!form.name.trim()) {
      setModalError('请填写版块名称')
      return
    }
    setSubmitting(true)
    setModalError('')
    // 统一用 snake_case 提交，匹配后端字段名
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      icon: form.icon.trim() || null,
      color: form.color || null,
      governance_mode: form.governance_mode,
    }
    const res = mode === 'create'
      ? await adminFetch('/admin/boards', { method: 'POST', body: JSON.stringify(body) })
      : await adminFetch(`/admin/boards/${encodeURIComponent(board.id)}`, { method: 'PUT', body: JSON.stringify(body) })
    setSubmitting(false)
    if (!res.ok) {
      setModalError(res.error || (mode === 'create' ? '创建版块失败' : '更新版块失败'))
      return
    }
    handleCloseModal()
    await loadBoards()
  }

  // 归档版块：DELETE 软删除，二次确认避免误操作
  const handleArchive = async (board) => {
    const ok = window.confirm(`确定归档版块「${board.name}」吗？归档后不再展示，但数据保留。`)
    if (!ok) return
    const res = await adminFetch(`/admin/boards/${encodeURIComponent(board.id)}`, { method: 'DELETE' })
    if (!res.ok) {
      window.alert(res.error || '归档失败')
      return
    }
    await loadBoards()
  }

  // === 渲染辅助 ===

  const renderGovernanceBadge = (mode) => {
    const cfg = GOVERNANCE_MAP[mode] || { label: mode || '-', cls: 'bg-secondary text-secondary-foreground' }
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
        {cfg.label}
      </span>
    )
  }

  const renderStatusBadge = (status) => {
    // GET /boards 已过滤归档版块，列表中均为 active；兜底显示 archived
    const s = status || 'active'
    const cfg = BOARD_STATUS_MAP[s] || BOARD_STATUS_MAP.active
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
        {cfg.label}
      </span>
    )
  }

  // === 渲染主体 ===

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">版块管理</h1>
          <p className="text-sm text-afmuted-foreground mt-1">创建版块、配置治理规则、归档无效版块</p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="size-4" />
          新增版块
        </button>
      </div>

      {/* 加载态 */}
      {loading ? (
        <div className="bg-card border border-border rounded-af-lg p-6 text-center text-afmuted-foreground flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          正在加载版块列表...
        </div>
      ) : error ? (
        <div className="bg-card border border-border rounded-af-lg p-6 text-center text-error">
          {error}
        </div>
      ) : boards.length === 0 ? (
        <EmptyState icon={LayoutGrid} title="暂无版块" description="点击「新增版块」创建第一个版块" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map((b) => (
            // 使用版块 id 作为稳定 key
            <div
              key={b.id}
              className="bg-card border border-border rounded-af-lg p-4 flex flex-col gap-3 hover:shadow-af-1 transition-shadow"
            >
              {/* 名称 + 颜色点 */}
              <div className="flex items-start gap-2.5">
                <span
                  className="mt-1 size-3 rounded-full shrink-0"
                  style={{ backgroundColor: b.color || '#475569' }}
                  aria-hidden={true}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {b.icon ? <span className="text-base leading-none">{b.icon}</span> : null}
                    <h3 className="font-semibold text-foreground truncate">{b.name}</h3>
                  </div>
                  <p className="text-xs text-afmuted-foreground mt-1 af-line-clamp-2">
                    {b.description || '暂无描述'}
                  </p>
                </div>
              </div>

              {/* 徽标区 */}
              <div className="flex flex-wrap items-center gap-2">
                {renderGovernanceBadge(b.governanceMode || b.governance_mode)}
                {renderStatusBadge(b.status)}
              </div>

              {/* 操作区 */}
              <div className="flex items-center gap-2 pt-1 mt-auto border-t border-border/60">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(b)}
                  className="flex-1 h-8 inline-flex items-center justify-center gap-1.5 rounded-af-md border border-border bg-background text-xs font-medium text-foreground hover:bg-afmuted transition-colors"
                >
                  <Pencil className="size-3.5" />
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => handleArchive(b)}
                  className="flex-1 h-8 inline-flex items-center justify-center gap-1.5 rounded-af-md border border-border bg-background text-xs font-medium text-afmuted-foreground hover:text-error hover:border-error/40 transition-colors"
                >
                  <Archive className="size-3.5" />
                  归档
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增 / 编辑 Modal */}
      {modal ? (
        <BoardFormModal
          mode={modal.mode}
          form={modal.form}
          onChange={handleFieldChange}
          onClose={handleCloseModal}
          onSubmit={handleSubmit}
          submitting={submitting}
          error={modalError}
        />
      ) : null}
    </div>
  )
}

// === 子组件：版块表单 Modal ===
function BoardFormModal({ mode, form, onChange, onClose, onSubmit, submitting, error }) {
  // 弹窗打开时锁定 body 滚动，关闭时恢复
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const isEdit = mode === 'edit'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={onClose} aria-hidden={true} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-af-xl shadow-af-3 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
          <h2 className="font-semibold text-foreground">{isEdit ? '编辑版块' : '新增版块'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-afmuted-foreground hover:text-foreground hover:bg-afmuted rounded-af-md transition-colors"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        <form
          className="px-6 pb-6 space-y-4 overflow-y-auto"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
        >
          {error ? (
            <div className="rounded-af-md bg-error-bg p-3 text-sm text-error">{error}</div>
          ) : null}

          {/* 版块名称 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">版块名称 <span className="text-error">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onChange('name', e.target.value)}
              placeholder="请输入版块名称"
              className="w-full h-10 px-3 rounded-af-md border border-input bg-background text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* 描述 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">版块描述</label>
            <textarea
              value={form.description}
              onChange={(e) => onChange('description', e.target.value)}
              placeholder="简要描述版块主题与规则"
              rows={3}
              className="w-full px-3 py-2 rounded-af-md border border-input bg-background text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* 图标 + 颜色 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">图标</label>
              <input
                type="text"
                value={form.icon}
                onChange={(e) => onChange('icon', e.target.value)}
                placeholder="emoji 或文字"
                className="w-full h-10 px-3 rounded-af-md border border-input bg-background text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">主题色</label>
              <div className="flex items-center gap-2 h-10 px-2 rounded-af-md border border-input bg-background">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => onChange('color', e.target.value)}
                  className="size-7 rounded border-0 cursor-pointer bg-transparent p-0"
                  aria-label="选择主题色"
                />
                <span className="text-sm text-afmuted-foreground font-mono">{form.color}</span>
              </div>
            </div>
          </div>

          {/* 治理模式 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">治理模式</label>
            <select
              value={form.governance_mode}
              onChange={(e) => onChange('governance_mode', e.target.value)}
              className="w-full h-10 px-3 rounded-af-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {GOVERNANCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-10 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '提交中…' : isEdit ? '保存修改' : '创建版块'}
          </button>
        </form>
      </div>
    </div>
  )
}
