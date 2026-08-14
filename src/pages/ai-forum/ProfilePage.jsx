import React, { useState, useEffect } from 'react'
import { useNavigate, Link, useParams, useSearchParams } from 'react-router-dom'
import {
  Heart, Mail, Pencil, UserPlus, File, Star, MessageCircle, Home,
  UserCheck, AlertTriangle, Check,
} from 'lucide-react'
import Avatar from '../../components/ai-forum/common/Avatar.jsx'
import EmptyState from '../../components/ai-forum/common/EmptyState.jsx'
import TagPill from '../../components/ai-forum/common/TagPill.jsx'
import { useAuth } from '../../components/ai-forum/AuthProvider.jsx'
import apiClient, { getUserProfile, getUserPosts, getUserFavorites, getUserComments } from '../../utils/ai-forum/apiClient.js'
import { formatRelativeTime, formatNumber } from '../../utils/ai-forum/aiForumUtils.js'

const TABS = [
  { key: 'posts',     label: '发帖' },
  { key: 'favorites', label: '收藏' },
  { key: 'comments',  label: '评论' },
]

export default function ProfilePage() {
  const navigate = useNavigate()
  const params = useParams()
  const { user, updateDevLevel } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const targetUserId = params.id || user?.id

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [profile, setProfile] = useState(null)
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'posts')
  const [userPosts, setUserPosts] = useState([])
  const [userFavorites, setUserFavorites] = useState([])
  const [userComments, setUserComments] = useState([])
  const [following, setFollowing] = useState(false)
  // 开发者身份编辑态：未保存时与全局 user 分离，保存时再同步至全局
  const [editingDevLevel, setEditingDevLevel] = useState(null)
  const [savingDevLevel, setSavingDevLevel] = useState(false)
  const [devLevelError, setDevLevelError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadAll() {
      setLoading(true)
      setError(null)
      try {
        const [p, posts, favs, comments] = await Promise.all([
          getUserProfile(targetUserId),
          getUserPosts(targetUserId, { limit: 50, offset: 0 }),
          getUserFavorites(targetUserId, { limit: 50, offset: 0 }),
          getUserComments(targetUserId, { limit: 50, offset: 0 }),
        ])
        if (cancelled) return
        if (!p) {
          setError('用户不存在')
          return
        }
        setProfile(p)
        // 若是自己的主页，初始化编辑态身份为已保存值
        if (isSelf && user) {
          setEditingDevLevel(p.devLevel || user.devLevel || 'junior')
        }
        setUserPosts(Array.isArray(posts) ? posts : posts.items || [])
        setUserFavorites(Array.isArray(favs) ? favs : favs.items || [])
        setUserComments(Array.isArray(comments) ? comments : comments.items || [])
      } catch (e) {
        if (cancelled) return
        setError(e.message || '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    targetUserId && loadAll()
    return () => { cancelled = true }
  }, [targetUserId])

  const handleTabChange = (key) => {
    setActiveTab(key)
    setSearchParams({ tab: key })
  }

  const handleFollowClick = () => {
    if (!user) {
      navigate('/forum/login')
      return
    }
    setFollowing((prev) => !prev)
  }

  const handleEditProfile = () => {
    alert('编辑主页（Phase3）')
  }

  /**
   * 保存开发者身份：
   * - 调用 AuthProvider.updateDevLevel 更新全局 user 状态（含 localStorage 持久化）
   * - 同步刷新本地 profile 展示，让身份徽标立即更新
   */
  const handleSaveDevLevel = async () => {
    if (!editingDevLevel || savingDevLevel) return
    setSavingDevLevel(true)
    setDevLevelError('')
    try {
      const updated = await updateDevLevel(editingDevLevel)
      setProfile((p) => (p ? { ...p, devLevel: updated.devLevel } : p))
    } catch (e) {
      setDevLevelError(e.message || '保存失败，请稍后重试')
      // 回滚编辑态为已保存值，避免用户以为保存成功
      setEditingDevLevel(user?.devLevel || profile?.devLevel || 'junior')
    } finally {
      setSavingDevLevel(false)
    }
  }

  const isSelf = user && profile ? user.id === profile.id : false
  const influencePercent = Math.min(((profile?.influenceScore || 0) / 10) * 100, 100)
  // 当前展示的等级：优先展示编辑态，用于身份徽标的实时预览
  const displayDevLevel = isSelf ? (editingDevLevel || profile?.devLevel || user?.devLevel || 'junior') : (profile?.devLevel || 'junior')
  const devLevelOptions = [
    { value: 'junior', title: 'AI 初级开发者', desc: 'AI 助手将用直白易懂的话语回答', badge: '初级' },
    { value: 'senior', title: '资深 AI 开发者', desc: 'AI 助手将使用专业术语深入解答', badge: '资深' },
  ]
  const currentDevLevelMeta = devLevelOptions.find((o) => o.value === displayDevLevel) || devLevelOptions[0]

  const renderPostsList = (posts) => (
    posts.length > 0 ? (
      <div className="space-y-3">
        {posts.map((p) => (
          <div
            key={p.id}
            onClick={() => navigate(`/forum/post/${p.id}`)}
            className="block bg-card border border-border rounded-af-lg p-5 hover:border-afmuted-foreground/30 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-afmuted-foreground">
                {formatRelativeTime(p.createdAt)}
              </span>
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1.5">{p.title}</h3>
            <p className="text-sm text-afmuted-foreground af-line-clamp-2 mb-3">{p.summary || (p.content && p.content.slice(0, 120)) || ''}</p>
            <div className="flex items-center gap-3 flex-wrap">
              {p.tags && p.tags.slice(0, 3).map((tag) => (
                <TagPill key={tag} variant="bg">{tag}</TagPill>
              ))}
              <div className="flex items-center gap-3 text-xs text-afmuted-foreground ml-auto">
                <span className="flex items-center gap-1">
                  <Heart className="size-3.5" /> {formatNumber(p.likes || p.likesCount || 0)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <EmptyState icon={File} title="暂无帖子" description="还没有发布过任何帖子" />
    )
  )

  const renderFavoritesList = () => (
    userFavorites.length > 0 ? (
      <div className="space-y-3">
        {userFavorites.map((p) => (
          <div
            key={p.id}
            onClick={() => navigate(`/forum/post/${p.id}`)}
            className="block bg-card border border-border rounded-af-lg p-5 hover:border-afmuted-foreground/30 transition-colors cursor-pointer"
          >
            <h3 className="text-base font-semibold text-foreground mb-1.5">{p.title}</h3>
            <p className="text-sm text-afmuted-foreground af-line-clamp-2 mb-3">{p.summary || (p.content && p.content.slice(0, 120)) || ''}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {p.tags && p.tags.slice(0, 3).map((tag) => (
                <TagPill key={tag} variant="bg">{tag}</TagPill>
              ))}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <EmptyState icon={Star} title="暂无收藏" description="快去收藏感兴趣的内容吧" />
    )
  )

  const renderCommentsList = () => (
    userComments.length > 0 ? (
      <div className="space-y-3">
        {userComments.map((c) => (
          <div key={c.id} className="flex gap-3 bg-card border border-border rounded-af-lg p-4">
            <Avatar text={profile?.avatarText || profile?.nickname || 'U'} size="md" className="shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground leading-relaxed break-words whitespace-pre-wrap">
                {c.content}
              </p>
              <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-afmuted-foreground">
                <span>来自帖子</span>
                <Link
                  to={`/forum/post/${c.postId}`}
                  className="text-vermilion hover:underline font-medium truncate max-w-[180px]"
                >
                  {c.postTitle || '查看原帖'}
                </Link>
                <span>·</span>
                <span>{formatRelativeTime(c.createdAt)}</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Heart className="size-3" /> {formatNumber(c.likes || c.likesCount || 0)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <EmptyState icon={MessageCircle} title="暂无评论" description="去互动，写下你的第一条评论吧" />
    )
  )

  if (!targetUserId) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <EmptyState
          variant="not-found"
          title="请先登录"
          description="登录后可查看个人主页或访问他人主页"
        >
          <button
            type="button"
            onClick={() => navigate('/forum/login')}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md bg-vermilion text-white text-sm font-medium hover:bg-vermilion/90 transition-colors"
          >
            去登录
          </button>
        </EmptyState>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-card border border-border rounded-af-lg p-6 md:p-8 text-center text-afmuted-foreground">
          正在加载主页数据...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <EmptyState
          variant="not-found"
          title="加载失败"
          description={error}
        >
          <button
            type="button"
            onClick={() => navigate('/forum')}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md bg-vermilion text-white text-sm font-medium hover:bg-vermilion/90 transition-colors"
          >
            <Home className="size-4" /> 返回首页
          </button>
        </EmptyState>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <EmptyState
          variant="not-found"
          title="用户不存在"
          description="该用户可能已被删除或链接无效"
        >
          <button
            type="button"
            onClick={() => navigate('/forum')}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md bg-vermilion text-white text-sm font-medium hover:bg-vermilion/90 transition-colors"
          >
            <Home className="size-4" /> 返回首页
          </button>
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <section className="bg-card border border-border rounded-af-lg p-6 md:p-8">
        <div className="flex">
          <Avatar text={profile.avatarText || profile.nickname} size="lg" className="!w-20 !h-20 !text-3xl shrink-0" />
          <div className="flex-1 ml-6">
            <div className="flex items-baseline flex-wrap gap-2">
              <h1 className="text-2xl font-bold text-foreground">{profile.nickname}</h1>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full ${
                currentDevLevelMeta.value === 'senior'
                  ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/20'
                  : 'bg-blue-500/15 text-blue-600 border border-blue-500/20'
              }`}>
                <UserCheck className="size-3" />
                {currentDevLevelMeta.badge}
              </span>
              <span className="text-afmuted-foreground">@{profile.handle || profile.username || 'user'}</span>
            </div>
            <div className="text-sm text-afmuted-foreground mt-1">
              {[profile.profession, profile.city, profile.joinedAt ? `加入于 ${profile.joinedAt}` : null].filter(Boolean).join(' · ')}
            </div>
            <p className="text-foreground mt-2 leading-relaxed">{profile.bio || '这个人很懒，什么都没留下'}</p>
            <div className="mt-4 flex gap-3 flex-wrap">
              {isSelf ? null : (
                <button
                  type="button"
                  onClick={handleFollowClick}
                  className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md text-sm font-medium transition-colors ${
                    following
                      ? 'border border-border bg-card text-foreground hover:bg-afmuted'
                      : 'bg-vermilion text-white hover:bg-vermilion/90'
                  }`}
                >
                  <UserPlus className="size-4" />
                  {following ? '✓ 已关注' : '+ 关注'}
                </button>
              )}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md border border-border bg-card text-foreground text-sm font-medium hover:bg-afmuted transition-colors"
              >
                <Mail className="size-4" />
                发消息
              </button>
              {isSelf ? (
                <button
                  type="button"
                  onClick={handleEditProfile}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md border border-border bg-card text-foreground text-sm font-medium hover:bg-afmuted transition-colors"
                >
                  <Pencil className="size-4" />
                  编辑主页
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* 开发者身份设置：仅在查看自己的主页时显示 */}
        {isSelf ? (
          <div className="mt-6 pt-6 border-t border-border">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <UserCheck className="size-4 text-primary" />
                  开发者身份
                </h3>
                <p className="text-xs text-afmuted-foreground mt-1">
                  AI 助手将根据您选择的身份调整回复的详细程度与用词风格
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveDevLevel}
                disabled={savingDevLevel || editingDevLevel === (profile?.devLevel || user?.devLevel)}
                className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-af-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="size-3.5" />
                {savingDevLevel ? '保存中…' : '保存'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {devLevelOptions.map((opt) => {
                const selected = editingDevLevel === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditingDevLevel(opt.value)}
                    className={`text-left p-3 rounded-af-md border transition-colors ${
                      selected
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-card hover:bg-afmuted text-afmuted-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">{opt.title}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                        opt.value === 'senior'
                          ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20'
                          : 'bg-blue-500/15 text-blue-600 border-blue-500/20'
                      }`}>
                        {opt.badge}
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug opacity-80">{opt.desc}</p>
                  </button>
                )
              })}
            </div>
            {devLevelError ? (
              <div className="flex items-start gap-2 mt-3 rounded-af-md bg-error-bg p-2.5 text-xs text-error">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                <span>{devLevelError}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 pt-6 border-t border-border">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <span className="text-2xl font-bold text-foreground tabular-nums">{profile.postCount || 0}</span>
              <p className="text-xs text-afmuted-foreground mt-1">帖子</p>
            </div>
            <div className="text-center">
              <span className="text-2xl font-bold text-foreground tabular-nums">{profile.commentsCount || 0}</span>
              <p className="text-xs text-afmuted-foreground mt-1">评论</p>
            </div>
            <div className="text-center">
              <span className="text-2xl font-bold text-foreground tabular-nums">{profile.likesSum || 0}</span>
              <p className="text-xs text-afmuted-foreground mt-1">获赞</p>
            </div>
            <div className="text-center">
              <span className="text-2xl font-bold text-foreground tabular-nums">{profile.favoritesCount || 0}</span>
              <p className="text-xs text-afmuted-foreground mt-1">收藏</p>
            </div>
            <div className="text-center">
              <span className="text-2xl font-bold text-foreground tabular-nums">{profile.influenceScore || 0}</span>
              <p className="text-xs text-afmuted-foreground mt-1">影响力</p>
            </div>
          </div>
          {(profile.influenceScore !== undefined && profile.influenceScore !== null) ? (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-afmuted-foreground">影响力评分</span>
                <span className="text-lg font-semibold text-foreground tabular-nums">{profile.influenceScore || 0}</span>
              </div>
              <div className="h-2 rounded-full bg-afmuted overflow-hidden">
                <div
                  className="h-full bg-vermilion rounded-full"
                  style={{ width: `${influencePercent}%` }}
                />
              </div>
              <p className="text-xs text-afmuted-foreground mt-2 text-center md:text-left">
                社区影响力
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="bg-card border border-border rounded-af-lg overflow-hidden">
        <div className="flex border-b border-border overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => handleTabChange(t.key)}
              className={`px-4 py-3 whitespace-nowrap text-sm transition-colors border-b-2 ${
                activeTab === t.key
                  ? 'border-b-vermilion font-semibold text-foreground'
                  : 'border-b-transparent text-afmuted-foreground hover:bg-afmuted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-4 md:p-6 min-h-[300px]">
          {activeTab === 'posts' && renderPostsList(userPosts)}
          {activeTab === 'favorites' && renderFavoritesList()}
          {activeTab === 'comments' && renderCommentsList()}
        </div>
      </section>
    </div>
  )
}
