import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Search, X, Clock, TrendingUp, Sparkles, Loader2 } from 'lucide-react'
import Avatar from '../../components/ai-forum/common/Avatar.jsx'
import TagPill from '../../components/ai-forum/common/TagPill.jsx'
import EmptyState from '../../components/ai-forum/common/EmptyState.jsx'
import { searchPosts } from '../../utils/ai-forum/apiClient.js'
import { formatRelativeTime } from '../../utils/ai-forum/aiForumUtils.js'

const SEARCH_HISTORY = ['RAG 架构', 'JSON Mode', '本地部署']
const SEARCH_RECOMMEND = ['Agent 框架', '向量数据库']

// 分类 Tab 配置：key 与 URL 的 type 参数对应，默认 post
const TABS = [
  { key: 'post', label: '帖子' },
  { key: 'user', label: '用户' },
  { key: 'knowledge', label: '知识库' },
]

// 基础路径与 token key 与 apiClient.js 保持一致：复用同一鉴权模式
const BASE_URL = '/api/forum'
const TOKEN_KEY = 'af_token'

/**
 * 搜索专用 fetch：用户 / 知识库 / 摘要 走统一 /search 端点
 * 带 token 头（与 apiClient 一致），失败抛错由调用方处理
 * @param {string} path 不含 BASE_URL 的路径（含 query）
 * @returns {Promise<any>}
 */
async function searchFetch(path) {
  let token = null
  try {
    token = localStorage.getItem(TOKEN_KEY)
  } catch {
    token = null
  }
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE_URL}${path}`, { headers })
  const rawText = await res.text()
  let payload = null
  try {
    payload = rawText ? JSON.parse(rawText) : null
  } catch {
    payload = null
  }
  if (!res.ok) {
    throw new Error((payload && payload.error) || `HTTP ${res.status}`)
  }
  return payload
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const q = searchParams.get('q') || ''
  const type = searchParams.get('type') || 'post'

  const [keyword, setKeyword] = useState(q)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  // AI 摘要：独立 loading；失败/无内容时 summary=null，卡片自动隐藏
  const [summary, setSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function escapeHtml(text) {
    if (typeof text !== 'string') return ''
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  // 关键词高亮：先转义 HTML 再插入高亮 span，避免 XSS
  function renderHighlightedText(text, kw) {
    const escapedText = escapeHtml(text)
    if (!kw || !kw.trim()) {
      return <span>{escapedText}</span>
    }
    try {
      const regex = new RegExp(escapeRegExp(kw), 'gi')
      const replacedHTML = escapedText.replace(
        regex,
        '<span class="bg-primary/20 text-primary rounded px-0.5">$0</span>'
      )
      return <span dangerouslySetInnerHTML={{ __html: replacedHTML }} />
    } catch {
      return <span>{escapedText}</span>
    }
  }

  /**
   * 按当前 type 拉取结果：
   * - post：复用 searchPosts（走 /posts?search=）
   * - user / knowledge：走统一搜索端点 /search?q=&type=
   */
  async function fetchResults(word, currentType) {
    setLoading(true)
    try {
      let list = []
      if (currentType === 'post') {
        const data = await searchPosts({ keyword: word, limit: 50, offset: 0 })
        list = Array.isArray(data) ? data : data.items || []
      } else {
        const encoded = encodeURIComponent(word)
        const data = await searchFetch(`/search?q=${encoded}&type=${currentType}`)
        // 兼容数组 / {items} / {data} 多种返回形态
        if (Array.isArray(data)) list = data
        else if (data && Array.isArray(data.items)) list = data.items
        else if (data && Array.isArray(data.data)) list = data.data
      }
      setResults(list)
    } catch {
      setResults([])
    }
    setLoading(false)
  }

  /**
   * 拉取 AI 聚合摘要：GET /search/summary?q=
   * 失败置 null 隐藏卡片，不阻断主结果流
   */
  async function fetchSummary(word) {
    setSummaryLoading(true)
    setSummary(null)
    try {
      const encoded = encodeURIComponent(word)
      const data = await searchFetch(`/search/summary?q=${encoded}`)
      // 兼容字符串 / {summary} / {data} / {text} 多种返回形态
      const text = typeof data === 'string'
        ? data
        : (data?.summary || data?.data || data?.text || '')
      setSummary(text || null)
    } catch {
      setSummary(null)
    }
    setSummaryLoading(false)
  }

  /** 触发一次完整搜索：结果 + AI 摘要并行拉取 */
  async function doSearch(word, currentType) {
    if (!word.trim()) return
    setSearched(true)
    // 两个请求互不依赖，分别管理 loading，任一失败不影响另一个
    fetchResults(word, currentType)
    fetchSummary(word)
  }

  // q 或 type 变化时重新搜索（URL 驱动，支持前进/后退与初始载入）
  useEffect(() => {
    if (q) {
      setKeyword(q)
      doSearch(q, type)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, type])

  function handleSubmit(e) {
    e.preventDefault()
    setSearchParams({ q: keyword, type })
    doSearch(keyword, type)
  }

  function handleHistoryClick(h) {
    setKeyword(h)
    setSearchParams({ q: h, type })
    doSearch(h, type)
  }

  /** 切换分类 Tab：保留当前关键词，更新 type 并立即触发新类型搜索 */
  function handleTabChange(nextType) {
    if (nextType === type) return
    const params = { type: nextType }
    if (q) params.q = q
    setSearchParams(params)
    if (q) {
      doSearch(q, nextType)
    }
  }

  // ====== 各类型结果渲染 ======

  function renderPostResults() {
    return results.map((post) => {
      const author = post.author || {}
      const summary =
        (typeof post.summary === 'string' && post.summary) ||
        (typeof post.content === 'string' ? post.content : '')
      const excerpt = summary.length > 150 ? summary.slice(0, 150) + '...' : summary
      return (
        <div
          key={post.id}
          onClick={() => navigate(`/forum/post/${post.id}`)}
          className="rounded-af-lg bg-background border border-border p-4 hover:shadow-md transition-shadow mb-3 cursor-pointer"
        >
          <div className="flex items-center gap-2 mb-2 text-xs text-afmuted-foreground">
            <Avatar
              text={author.avatarText || author.nickname || '?'}
              size="xs"
              className="!w-5 !h-5 !text-[10px]"
            />
            <span className="font-medium text-foreground/80">
              {author.nickname || '匿名用户'}
            </span>
            <span>·</span>
            <span>{formatRelativeTime(post.createdAt || post.updatedAt)}</span>
          </div>
          <h3 className="text-base font-semibold text-foreground mb-2">
            {renderHighlightedText(post.title, keyword)}
          </h3>
          <p className="text-sm text-afmuted-foreground leading-relaxed line-clamp-2">
            {renderHighlightedText(excerpt, keyword)}
          </p>
        </div>
      )
    })
  }

  function renderUserResults() {
    return results.map((user) => {
      const nickname = user.nickname || user.handle || '匿名用户'
      const bio = user.bio || user.introduction || '暂无简介'
      return (
        <div
          key={user.id}
          className="rounded-af-lg bg-background border border-border p-4 hover:shadow-md transition-shadow mb-3"
        >
          <div className="flex items-start gap-3">
            <Avatar text={user.avatarText || nickname} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base font-semibold text-foreground">
                  {renderHighlightedText(nickname, keyword)}
                </span>
                {user.handle ? (
                  <span className="text-xs text-afmuted-foreground font-mono truncate">
                    @{user.handle}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-afmuted-foreground leading-relaxed line-clamp-2">
                {bio}
              </p>
              {(user.profession || user.city) ? (
                <p className="text-xs text-afmuted-foreground mt-1.5">
                  {[user.profession, user.city].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )
    })
  }

  function renderKnowledgeResults() {
    return results.map((item) => {
      const content = item.content || item.summary || ''
      const excerpt = content.length > 150 ? content.slice(0, 150) + '...' : content
      const updated = item.updatedAt || item.updated_at || item.createdAt || item.created_at
      return (
        <div
          key={item.id}
          className="rounded-af-lg bg-background border border-border p-4 hover:shadow-md transition-shadow mb-3"
        >
          <h3 className="text-base font-semibold text-foreground mb-2">
            {renderHighlightedText(item.title || '无标题', keyword)}
          </h3>
          {excerpt ? (
            <p className="text-sm text-afmuted-foreground leading-relaxed line-clamp-2 mb-2">
              {renderHighlightedText(excerpt, keyword)}
            </p>
          ) : null}
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
      )
    })
  }

  // 是否展示 AI 摘要卡：加载中或有内容时展示，失败则隐藏
  const showSummaryCard = searched && (summaryLoading || Boolean(summary))

  return (
    <div className="max-w-4xl mx-auto px-4 pt-6 pb-16">
      <div className="max-w-3xl mx-auto mb-6">
        <form onSubmit={handleSubmit} className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-afmuted-foreground pointer-events-none" />
          <input
            type="search"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索问题、话题或用户"
            className="w-full h-14 pl-12 pr-24 rounded-af-xl border border-input bg-card text-base text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {keyword ? (
              <button
                type="button"
                onClick={() => setKeyword('')}
                className="p-2 text-afmuted-foreground hover:text-foreground"
                aria-label="清除"
              >
                <X className="size-4" />
              </button>
            ) : null}
            <button
              type="submit"
              className="h-9 px-4 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              搜索
            </button>
          </div>
        </form>
        {!searched && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-afmuted-foreground">
              <Clock className="size-3.5" /> 历史
            </span>
            {SEARCH_HISTORY.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => handleHistoryClick(h)}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-foreground hover:bg-afmuted transition-colors"
              >
                {h}
              </button>
            ))}
            <span className="flex items-center gap-1 text-afmuted-foreground ml-2">
              <TrendingUp className="size-3.5" /> 推荐
            </span>
            {SEARCH_RECOMMEND.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => handleHistoryClick(h)}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-foreground hover:bg-afmuted transition-colors"
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 分类 Tab：搜索后展示，type 与 URL 参数同步 */}
      {searched ? (
        <div className="flex items-center gap-1 border-b border-border mb-4">
          {TABS.map((tab) => {
            const active = tab.key === type
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={`inline-flex items-center gap-1.5 px-4 h-11 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-afmuted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      ) : null}

      {/* AI 聚合摘要卡：loading 显示骨架文案，有内容展示摘要，失败隐藏 */}
      {showSummaryCard ? (
        <div className="mb-4 rounded-af-lg border border-primary/30 bg-primary/5 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="size-5 text-primary" />
            <span className="text-sm font-semibold text-foreground">AI 摘要</span>
            {summaryLoading ? (
              <Loader2 className="size-4 animate-spin text-afmuted-foreground" />
            ) : null}
          </div>
          {summaryLoading ? (
            <div className="space-y-2">
              <div className="h-3 w-full bg-afmuted/40 rounded animate-pulse" />
              <div className="h-3 w-4/5 bg-afmuted/40 rounded animate-pulse" />
            </div>
          ) : (
            <p className="text-sm text-foreground/85 leading-relaxed">{summary}</p>
          )}
        </div>
      ) : null}

      {loading && (
        <div className="w-full flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {!loading && !searched && (
        <EmptyState title="输入关键词开始搜索" description="搜索帖子标题、内容中的关键词" />
      )}

      {!loading && searched && results.length === 0 && (
        <EmptyState variant="not-found" title="没有找到相关内容" description="试试换个关键词或切换分类" />
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-0">
          {type === 'post' && renderPostResults()}
          {type === 'user' && renderUserResults()}
          {type === 'knowledge' && renderKnowledgeResults()}
        </div>
      )}
    </div>
  )
}
