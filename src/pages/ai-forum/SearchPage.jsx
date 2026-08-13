import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Search, X, Clock, TrendingUp } from 'lucide-react'
import Avatar from '../../components/ai-forum/common/Avatar.jsx'
import EmptyState from '../../components/ai-forum/common/EmptyState.jsx'
import apiClient, { searchPosts } from '../../utils/ai-forum/apiClient.js'
import { formatRelativeTime } from '../../utils/ai-forum/aiForumUtils.js'

const SEARCH_HISTORY = ['RAG 架构', 'JSON Mode', '本地部署']
const SEARCH_RECOMMEND = ['Agent 框架', '向量数据库']

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const q = searchParams.get('q') || ''

  const [keyword, setKeyword] = useState(q)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

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

  async function doSearch(word) {
    if (!word.trim()) return
    setLoading(true)
    setSearchParams({ q: word })
    try {
      const data = await searchPosts({ keyword: word, limit: 50, offset: 0 })
      const list = Array.isArray(data) ? data : data.items || []
      setResults(list)
    } catch (e) {
      setResults([])
    }
    setSearched(true)
    setLoading(false)
  }

  useEffect(() => {
    if (q) {
      doSearch(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  function handleSubmit(e) {
    e.preventDefault()
    doSearch(keyword)
  }

  function handleHistoryClick(h) {
    setKeyword(h)
    doSearch(h)
  }

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

      {loading && (
        <div className="w-full flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
        </div>
      )}

      {!loading && !searched && (
        <EmptyState title="输入关键词开始搜索" description="搜索帖子标题、内容中的关键词" />
      )}

      {!loading && searched && results.length === 0 && (
        <EmptyState variant="not-found" title="没有找到相关帖子" description="试试换个关键词搜索" />
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-0">
          {results.map((post) => {
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
          })}
        </div>
      )}
    </div>
  )
}
