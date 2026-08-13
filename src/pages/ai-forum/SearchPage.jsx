import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, X, Clock, TrendingUp, FileText, Users, BookOpen,
  MessageCircle, ThumbsUp, Plus, ChevronLeft, ChevronRight, Sparkles,
} from 'lucide-react'
import Avatar from '../../components/ai-forum/common/Avatar.jsx'
import TagPill from '../../components/ai-forum/common/TagPill.jsx'
import Pagination from '../../components/ai-forum/common/Pagination.jsx'
import { useAuth } from '../../components/ai-forum/AuthProvider.jsx'
import { posts, users, knowledgeItems, boards } from '../../utils/ai-forum/mockData.js'
import { formatRelativeTime, formatNumber } from '../../utils/ai-forum/aiForumUtils.js'

const CATEGORIES = [
  { key: 'all',    label: '全部',   icon: FileText, count: 9 },
  { key: 'post',   label: '帖子',   icon: FileText, count: 6 },
  { key: 'user',   label: '用户',   icon: Users,    count: 2 },
  { key: 'kb',     label: '知识库', icon: BookOpen, count: 3 },
]

const SEARCH_HISTORY = ['RAG 架构', 'JSON Mode', '本地部署']
const SEARCH_RECOMMEND = ['Agent 框架', '向量数据库']

export default function SearchPage() {
  const { requireAuth } = useAuth()
  const [keyword, setKeyword] = useState('RAG')
  const [category, setCategory] = useState('all')
  const [page, setPage] = useState(1)

  // mock：把帖子/用户/知识库合并为统一结果列表
  const results = useMemo(() => {
    const postResults = posts.map((p) => ({
      type: 'post', id: p.id, title: p.title, excerpt: p.summary,
      author: users.find((u) => u.id === p.authorId), tags: p.tags,
      likes: p.likes, comments: p.comments, time: p.createdAt, board: boards.find((b) => b.id === p.boardId),
    }))
    const userResults = users.filter((u) => u.status === 'active').slice(0, 2).map((u) => ({
      type: 'user', id: u.id, title: u.nickname, excerpt: u.bio, author: u, tags: [],
      profession: u.profession, city: u.city,
    }))
    const kbResults = knowledgeItems.map((k) => ({
      type: 'kb', id: k.id, title: k.title, excerpt: k.content, tags: k.tags, time: k.updatedAt,
    }))
    let list = [...postResults, ...userResults, ...kbResults]
    if (category === 'post') list = postResults
    else if (category === 'user') list = userResults
    else if (category === 'kb') list = kbResults
    return list
  }, [category])

  return (
    <div className="max-w-6xl mx-auto px-4 pt-6 pb-16">
      {/* 搜索栏 */}
      <div className="max-w-3xl mx-auto mb-6">
        <div className="relative">
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
              <button type="button" onClick={() => setKeyword('')} className="p-2 text-afmuted-foreground hover:text-foreground" aria-label="清除"><X className="size-4" /></button>
            ) : null}
            <button type="button" className="h-9 px-4 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">搜索</button>
          </div>
        </div>
        {/* 历史/推荐 */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-afmuted-foreground"><Clock className="size-3.5" /> 历史</span>
          {SEARCH_HISTORY.map((h) => (
            <button key={h} type="button" onClick={() => setKeyword(h)} className="rounded-full border border-border bg-card px-2.5 py-1 text-foreground hover:bg-afmuted transition-colors">{h}</button>
          ))}
          <span className="flex items-center gap-1 text-afmuted-foreground ml-2"><TrendingUp className="size-3.5" /> 推荐</span>
          {SEARCH_RECOMMEND.map((h) => (
            <button key={h} type="button" onClick={() => setKeyword(h)} className="rounded-full border border-border bg-card px-2.5 py-1 text-foreground hover:bg-afmuted transition-colors">{h}</button>
          ))}
        </div>
      </div>

      {/* 筛选与排序 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="inline-flex items-center rounded-af-lg border border-border bg-card p-1" role="tablist">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={category === c.key}
              onClick={() => { setCategory(c.key); setPage(1) }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-af-md text-sm font-medium transition-colors ${
                category === c.key ? 'af-tab-active' : 'text-afmuted-foreground hover:text-foreground'
              }`}
            >
              <c.icon className="size-4" />
              <span className="hidden sm:inline">{c.label}</span>
              <span className={`af-tab-count inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-semibold ${category === c.key ? '' : 'bg-afmuted text-afmuted-foreground'}`}>{c.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <select className="h-8 px-2 rounded-af-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option>综合排序</option>
            <option>最新发布</option>
            <option>最多点赞</option>
          </select>
          <select className="h-8 px-2 rounded-af-md border border-input bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
            <option>全部时间</option>
            <option>近一天</option>
            <option>近一周</option>
            <option>近一月</option>
          </select>
        </div>
      </div>

      {/* AI 聚合摘要 */}
      <div className="bg-card border border-border rounded-af-2xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1 rounded-af-md bg-primary text-primary-foreground px-2 py-0.5 text-xs font-medium">
            <Sparkles className="size-3" /> AI 聚合
          </span>
          <span className="text-xs text-afmuted-foreground">基于 {results.length} 条结果生成</span>
        </div>
        <h3 className="text-base font-semibold text-foreground mb-2">关于「{keyword || 'RAG'}」的 AI 摘要</h3>
        <div className="text-sm text-foreground/90 leading-relaxed space-y-2">
          <p>RAG（检索增强生成）是大模型落地知识问答的主流架构，核心包含<strong className="font-semibold">向量检索 + 上下文拼接 + 模型生成</strong>三阶段。</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>向量库选型：Milvus 适合大规模，Qdrant 部署轻量</li>
            <li>Embedding 模型与 LLM 的搭配影响最终效果</li>
            <li>检索策略上，混合检索（关键词+语义）召回率更优</li>
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-xs text-afmuted-foreground">相关标签：</span>
          {['RAG', '向量数据库', 'Embedding', 'LangChain'].map((t) => (
            <TagPill key={t} variant="border">{t}</TagPill>
          ))}
        </div>
      </div>

      {/* 结果双栏 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-6">
        {/* 左：结果列表 */}
        <div className="space-y-3">
          {results.map((r) => {
            if (r.type === 'user') {
              return (
                <div key={`${r.type}-${r.id}`} className="bg-card border border-border rounded-af-xl p-5 hover:border-afmuted-foreground/30 hover:shadow-af-1 transition-all">
                  <div className="flex items-start gap-4">
                    <Avatar text={r.author.avatarText} size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Link to="/forum/profile" className="text-base font-semibold text-foreground hover:underline">{r.title}</Link>
                        <span className="text-xs text-afmuted-foreground">@{r.author.handle}</span>
                      </div>
                      <p className="text-sm text-afmuted-foreground mb-2">{r.excerpt}</p>
                      <div className="flex items-center gap-3 text-xs text-afmuted-foreground">
                        <span>{r.profession}</span><span>·</span><span>{r.city}</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => requireAuth('登录后关注')} className="inline-flex items-center gap-1 h-8 px-3 rounded-af-md border border-border bg-card text-foreground text-xs font-medium hover:bg-afmuted transition-colors shrink-0">
                      <Plus className="size-3.5" /> 关注
                    </button>
                  </div>
                </div>
              )
            }
            if (r.type === 'kb') {
              return (
                <div key={`${r.type}-${r.id}`} className="bg-card border border-border rounded-af-xl p-5 hover:border-afmuted-foreground/30 hover:shadow-af-1 transition-all">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1 rounded bg-info-bg text-info px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      <BookOpen className="size-3" /> 知识库
                    </span>
                    <span className="text-xs text-afmuted-foreground">更新于 {r.time}</span>
                  </div>
                  <Link to="/forum/search" className="block">
                    <h3 className="text-base font-semibold text-foreground mb-1.5 hover:text-afmuted-foreground transition-colors">{r.title}</h3>
                    <p className="text-sm text-afmuted-foreground af-line-clamp-2 mb-2">{r.excerpt}</p>
                    <div className="flex flex-wrap gap-1.5">{r.tags.map((t) => <TagPill key={t} variant="bg">{t}</TagPill>)}</div>
                  </Link>
                </div>
              )
            }
            // 帖子结果
            return (
              <article key={`${r.type}-${r.id}`} className="bg-card border border-border rounded-af-xl p-5 hover:border-afmuted-foreground/30 hover:shadow-af-1 transition-all cursor-pointer">
                <Link to={`/forum/post/${r.id}`} className="block">
                  <h3 className="text-base font-semibold text-foreground mb-1.5">{r.title}</h3>
                  <p className="text-sm text-afmuted-foreground af-line-clamp-2 mb-3">{r.excerpt}</p>
                  <div className="flex items-center gap-3 text-xs text-afmuted-foreground flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <Avatar text={r.author?.avatarText} size="xs" className="!w-5 !h-5 !text-[10px]" />
                      {r.author?.nickname}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{r.board?.name}</span>
                    <span className="hidden sm:inline">{formatRelativeTime(r.time)}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="size-3.5" /> {r.comments}</span>
                    <span className="flex items-center gap-1"><ThumbsUp className="size-3.5" /> {formatNumber(r.likes)}</span>
                  </div>
                </Link>
              </article>
            )
          })}
          <div className="pt-4"><Pagination current={page} total={3} onChange={setPage} /></div>
        </div>

        {/* 右侧栏 */}
        <aside className="space-y-4 hidden lg:block">
          <div className="bg-card border border-border rounded-af-lg p-5">
            <h3 className="font-semibold text-foreground mb-3">相关问题</h3>
            <ul className="space-y-3">
              {['RAG 和微调如何选择？', '向量数据库选型建议', '如何评估 RAG 系统效果？', 'Embedding 模型对比'].map((q) => (
                <li key={q} className="text-sm">
                  <Link to="/forum/search" className="text-foreground hover:text-afmuted-foreground transition-colors">{q}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-card border border-border rounded-af-lg p-5">
            <h3 className="font-semibold text-foreground mb-3">热门版块</h3>
            <ul className="space-y-1">
              {boards.slice(0, 4).map((b) => (
                <li key={b.id}>
                  <Link to="/forum/boards" className="flex items-center justify-between px-2 py-1.5 rounded-af-md hover:bg-afmuted transition-colors">
                    <span className="text-sm text-foreground">{b.name}</span>
                    <span className="text-xs text-afmuted-foreground">{formatNumber(b.postCount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
