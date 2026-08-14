import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Plus, Pencil, Archive, X, BookOpen, Loader2 } from 'lucide-react'
import EmptyState from '../../../components/ai-forum/common/EmptyState.jsx'
import TagPill from '../../../components/ai-forum/common/TagPill.jsx'
import { StatusBadge } from '../../../components/ai-forum/common/Badges.jsx'
import { formatRelativeTime } from '../../../utils/ai-forum/aiForumUtils.js'

// 与 apiClient.js 保持一致：基础路径 /api/forum，token key 为 af_token
// 这里不修改 apiClient.js（另一 agent 正在更新），改用 inline fetch 复用同一鉴权模式
const BASE_URL = '/api/forum'
const TOKEN_KEY = 'af_token'

/**
 * 知识库管理专用请求封装：复用 apiClient 的鉴权头与 JSON 约定
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {string} path 不含 BASE_URL 的路径
 * @param {Object} [body] POST/PUT 请求体
 * @returns {Promise<{ok:boolean, data:any, error:string|null, status:number}>}
 */
async function adminRequest(method, path, body) {
  try {
    let token = null
    try {
      token = localStorage.getItem(TOKEN_KEY)
    } catch {
      token = null
    }
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const options = { method, headers }
    if (body !== undefined && body !== null && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body)
    }

    const res = await fetch(`${BASE_URL}${path}`, options)
    const rawText = await res.text()
    let payload = null
    try {
      payload = rawText ? JSON.parse(rawText) : null
    } catch {
      payload = null
    }

    if (!res.ok) {
      const errorMsg = (payload && payload.error) || `HTTP ${res.status}`
      return { ok: false, data: null, error: errorMsg, status: res.status }
    }
    return { ok: true, data: payload, error: null, status: res.status }
  } catch (err) {
    const errorMsg = err?.message || String(err)
    return { ok: false, data: null, error: errorMsg, status: 0 }
  }
}

// 知识条目状态 → StatusBadge tone 映射；未知状态兜底 neutral
const STATUS_TONE = {
  published: 'success',
  draft: 'warning',
  archived: 'neutral',
  active: 'success',
  pending: 'warning',
}
const STATUS_LABEL = {
  published: '已发布',
  draft: '草稿',
  archived: '已归档',
  active: '已发布',
  pending: '待审核',
}

/**
 * 新增 / 编辑知识条目弹窗
 * 受控组件：由父级通过 open / initialData 控制显隐与初始值
 */
function KnowledgeFormModal({ open, mode, initialData, onClose, onSubmit, submitting }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  // tags 以逗号分隔的字符串录入，提交时拆分为数组，便于用户快速输入
  const [tagsInput, setTagsInput] = useState('')

  // 每次打开弹窗时用 initialData 预填表单（编辑场景回显原值）
  useEffect(() => {
    if (!open) return
    setTitle(initialData?.title || '')
    setContent(initialData?.content || '')
    setTagsInput(Array.isArray(initialData?.tags) ? initialData.tags.join(', ') : '')
  }, [open, initialData])

  // 弹窗未打开时不渲染，避免无谓 DOM
  if (!open) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    // 拆分标签：按逗号分隔、去空白、去重、过滤空串
    const tags = Array.from(
      new Set(
        tagsInput
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean)
      )
    )
    onSubmit({ title: trimmedTitle, content: content.trim(), tags })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-af-xl bg-card border border-border shadow-af-2 p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            {mode === 'edit' ? '编辑条目' : '新增条目'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-afmuted-foreground hover:text-foreground rounded-af-md hover:bg-afmuted transition-colors"
            aria-label="关闭"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入知识条目标题"
              className="w-full h-10 px-3 rounded-af-md border border-input bg-background text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">内容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="请输入知识条目内容"
              rows={6}
              className="w-full rounded-af-md border border-input bg-background p-3 text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              标签<span className="text-afmuted-foreground font-normal">（逗号分隔）</span>
            </label>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="如：RAG, 向量数据库, Agent"
              className="w-full h-10 px-3 rounded-af-md border border-input bg-background text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-af-md border border-border bg-background text-sm font-medium text-foreground hover:bg-afmuted transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {submitting ? '提交中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function KnowledgeManagePage() {
  const [list, setList] = useState([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // 弹窗状态：open / mode / 编辑时回显的 initialData
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState('create') // 'create' | 'edit'
  const [editingItem, setEditingItem] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // 归档中条目 id，用于按钮 loading 态
  const [archivingId, setArchivingId] = useState(null)

  /**
   * 拉取知识库列表：GET /admin/knowledge
   * cancelled 标志避免组件卸载后 setState
   */
  const loadList = useCallback(async () => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const res = await adminRequest('GET', '/admin/knowledge')
    if (cancelled) return
    if (res.ok) {
      const data = res.data
      setList(Array.isArray(data) ? data : (data?.items || []))
    } else {
      setError(res.error || '加载知识库列表失败')
    }
    setLoading(false)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    loadList()
  }, [loadList])

  // 客户端按关键词过滤：标题 / 内容 / 标签任一命中即展示
  const filtered = useMemo(() => {
    if (keyword.trim() === '') return list
    const kw = keyword.trim().toLowerCase()
    return list.filter((item) => {
      const title = (item.title || '').toLowerCase()
      const content = (item.content || '').toLowerCase()
      const tags = Array.isArray(item.tags) ? item.tags.join(' ').toLowerCase() : ''
      return title.includes(kw) || content.includes(kw) || tags.includes(kw)
    })
  }, [list, keyword])

  /** 打开新增弹窗 */
  const handleOpenCreate = () => {
    setEditingItem(null)
    setModalMode('create')
    setModalOpen(true)
  }

  /** 打开编辑弹窗：传入当前条目作为回显数据 */
  const handleOpenEdit = (item) => {
    setEditingItem(item)
    setModalMode('edit')
    setModalOpen(true)
  }

  /** 提交新增 / 编辑：成功后刷新列表并关闭弹窗 */
  const handleSubmit = async (formData) => {
    setSubmitting(true)
    const isEdit = modalMode === 'edit' && editingItem?.id
    const res = isEdit
      ? await adminRequest('PUT', `/admin/knowledge/${editingItem.id}`, formData)
      : await adminRequest('POST', '/admin/knowledge', formData)
    setSubmitting(false)

    if (!res.ok) {
      alert(`保存失败：${res.error || '请稍后重试'}`)
      return
    }
    setModalOpen(false)
    setEditingItem(null)
    // 刷新列表以反映新增 / 修改
    loadList()
  }

  /** 归档（删除）：DELETE /admin/knowledge/:id，成功后从列表移除 */
  const handleArchive = async (item) => {
    if (!item?.id) return
    if (!window.confirm(`确定归档「${item.title || '该条目'}」吗？归档后将从列表移除。`)) return
    setArchivingId(item.id)
    const res = await adminRequest('DELETE', `/admin/knowledge/${item.id}`)
    setArchivingId(null)
    if (!res.ok) {
      alert(`归档失败：${res.error || '请稍后重试'}`)
      return
    }
    // 本地直接移除，避免整页刷新
    setList((prev) => prev.filter((x) => x.id !== item.id))
  }

  // 加载态
  if (loading) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground">知识库管理</h1>
          <p className="text-sm text-afmuted-foreground mt-1">维护官方知识条目，供 AI 检索与前台展示</p>
        </div>
        <div className="bg-card border border-border rounded-af-lg p-6 text-center text-afmuted-foreground">
          正在加载知识库列表...
        </div>
      </div>
    )
  }

  // 错误态：展示错误信息 + 重试按钮
  if (error) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold text-foreground">知识库管理</h1>
          <p className="text-sm text-afmuted-foreground mt-1">维护官方知识条目，供 AI 检索与前台展示</p>
        </div>
        <div className="bg-card border border-border rounded-af-lg p-6 text-center">
          <p className="text-sm text-error mb-3">{error}</p>
          <button
            type="button"
            onClick={loadList}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            重新加载
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">知识库管理</h1>
        <p className="text-sm text-afmuted-foreground mt-1">维护官方知识条目，供 AI 检索与前台展示</p>
      </div>

      {/* 顶部操作区：搜索框 + 新增按钮 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-afmuted-foreground pointer-events-none" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索标题、内容或标签"
            className="w-full h-10 pl-9 pr-3 rounded-af-md border border-input bg-background text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-1.5 h-10 px-4 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="size-4" />
          新增条目
        </button>
      </div>

      {/* 列表 / 空状态 */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={keyword.trim() ? '未找到匹配的知识条目' : '暂无知识条目'}
          description={keyword.trim() ? '尝试调整搜索关键词' : '点击「新增条目」创建第一条知识'}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            // 兼容 camelCase / snake_case 两种时间字段
            const updated = item.updatedAt || item.updated_at || item.createdAt || item.created_at
            const statusKey = item.status || 'draft'
            const tone = STATUS_TONE[statusKey] || 'neutral'
            const statusLabel = STATUS_LABEL[statusKey] || statusKey
            const isArchiving = archivingId === item.id
            return (
              <div
                key={item.id}
                className="bg-card border border-border rounded-af-lg p-4 sm:p-5 hover:shadow-af-1 transition-shadow"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    {/* 标题行 + 状态徽章 */}
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h3 className="text-base font-semibold text-foreground">{item.title || '无标题'}</h3>
                      <StatusBadge tone={tone}>{statusLabel}</StatusBadge>
                    </div>
                    {/* 内容摘要：最多 2 行 */}
                    {item.content ? (
                      <p className="text-sm text-afmuted-foreground leading-relaxed line-clamp-2 mb-2">
                        {item.content}
                      </p>
                    ) : null}
                    {/* 标签 pills + 更新时间 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {Array.isArray(item.tags) && item.tags.length > 0 ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.tags.map((tag) => (
                            <TagPill key={tag} size="sm">{tag}</TagPill>
                          ))}
                        </div>
                      ) : null}
                      {updated ? (
                        <span className="text-xs text-afmuted-foreground">
                          更新于 {formatRelativeTime(updated)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {/* 操作按钮：编辑 + 归档 */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(item)}
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-af-md border border-border bg-background text-xs font-medium text-foreground hover:bg-afmuted transition-colors"
                    >
                      <Pencil className="size-3.5" />
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchive(item)}
                      disabled={isArchiving}
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded-af-md border border-border bg-background text-xs font-medium text-afmuted-foreground hover:text-error hover:border-error/40 hover:bg-error-bg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isArchiving ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Archive className="size-3.5" />
                      )}
                      归档
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 新增 / 编辑弹窗 */}
      <KnowledgeFormModal
        open={modalOpen}
        mode={modalMode}
        initialData={editingItem}
        onClose={() => {
          setModalOpen(false)
          setEditingItem(null)
        }}
        onSubmit={handleSubmit}
        submitting={submitting}
      />
    </div>
  )
}
