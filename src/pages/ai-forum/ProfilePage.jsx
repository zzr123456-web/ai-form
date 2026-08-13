import React, { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Heart, Mail, Pencil, UserPlus,
} from 'lucide-react'
import Avatar from '../../components/ai-forum/common/Avatar.jsx'
import EmptyState from '../../components/ai-forum/common/EmptyState.jsx'
import TagPill from '../../components/ai-forum/common/TagPill.jsx'
import { useAuth } from '../../components/ai-forum/AuthProvider.jsx'
// users/boards 仍用 mock：Phase0 关注/粉丝/收藏尚无后端关系 API，仅作 UI 兜底
import { users, boards } from '../../utils/ai-forum/mockData.js'
import { getCurrentUser, getUserStats, getPosts } from '../../utils/ai-forum/apiClient'
import { formatRelativeTime, formatNumber } from '../../utils/ai-forum/aiForumUtils.js'

const TABS = [
  { key: 'posts',     label: '发帖' },
  { key: 'favorites', label: '收藏' },
  { key: 'following', label: '关注' },
  { key: 'followers', label: '粉丝' },
]

// userStats 为 null 时的零值兜底，保证 UI 结构完整不报错
const EMPTY_STATS = {
  postCount: 0,
  favoriteCount: 0,
  followingCount: 0,
  followerCount: 0,
  influenceScore: 0,
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, requireAuth } = useAuth()

  // 异步加载的资料数据：currentUser/userStats/userPosts 来自后端 API
  const [currentUser, setCurrentUser] = useState(null)
  const [userStats, setUserStats] = useState(null)
  const [userPosts, setUserPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [selectedTab, setSelectedTab] = useState('posts')
  const [following, setFollowing] = useState(false)

  // 串行加载：先 getCurrentUser 拿到 id，再并发拉取 stats 与 posts，减少总等待时长
  // cleanup 用 cancelled 标志位避免组件卸载后 setState（防止内存泄漏警告）
  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      try {
        const u = await getCurrentUser()
        if (cancelled) return
        if (!u) {
          // 后端返回 null（未启动或代理失败）：给出可见错误状态而非空白
          setError('未能获取用户信息，请检查后端服务是否启动')
          setLoading(false)
          return
        }
        setCurrentUser(u)
        const [stats, postsData] = await Promise.all([
          getUserStats(u.id),
          getPosts({ authorId: u.id }),
        ])
        if (cancelled) return
        setUserStats(stats)
        setUserPosts(Array.isArray(postsData) ? postsData : [])
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        // 兜底：网络异常或 JSON 解析失败时给出可见错误
        setError(err?.message || '加载主页数据失败')
        setLoading(false)
      }
    }
    loadProfile()
    return () => { cancelled = true }
  }, [])

  // isSelf：登录后比较 id；未登录时保留 Phase0 行为（默认视为本人主页，展示编辑入口）
  const isSelf = user && currentUser ? user.id === currentUser.id : true

  // 收藏列表：Phase0 无后端关系 API，用已加载的发帖前 3 条 mock 展示
  const favoritePosts = userPosts.slice(0, 3)
  // 关注列表：Phase0 无后端关系 API，排除自己后取前 5 位 mock
  const followingUsers = currentUser
    ? users.filter((u) => u.id !== currentUser.id).slice(0, 5)
    : []
  // 粉丝列表：Phase0 无后端关系 API，另取 5 位 mock（从 index 2 开始避免重复）
  const followerUsers = users.slice(2, 7)

  const handleFollowClick = () => {
    // 未登录关注需先登录
    if (!requireAuth('登录后关注用户')) return
    setFollowing((prev) => !prev)
  }

  // 编辑主页仅自己可见：避免他人访问时看到编辑入口（隐私保护）
  const handleEditProfile = () => {
    alert('编辑主页（Phase3）')
  }

  // 加载态：骨架占位，避免渲染半成品 UI
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-card border border-border rounded-af-lg p-6 md:p-8 text-center text-afmuted-foreground">
          正在加载主页数据...
        </div>
      </div>
    )
  }

  // 错误态：可见的错误提示，便于排查后端连接问题
  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-card border border-border rounded-af-lg p-6 md:p-8 text-center text-error">
          {error}
        </div>
      </div>
    )
  }

  // 数据未就绪兜底：currentUser 为空时不再渲染主资料卡
  if (!currentUser) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-card border border-border rounded-af-lg p-6 md:p-8 text-center text-afmuted-foreground">
          未找到用户信息
        </div>
      </div>
    )
  }

  // userStats 兜底：API 失败时使用零值，保持 UI 结构完整
  const stats = userStats || EMPTY_STATS
  // 影响力评分百分比映射：8.6/10 = 86%，用于进度条宽度
  const influencePercent = (stats.influenceScore / 10) * 100

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* A) 资料卡 section */}
      <section className="bg-card border border-border rounded-af-lg p-6 md:p-8">
        <div className="flex">
          {/* 左侧大号头像 */}
          <Avatar text={currentUser.avatarText} size="lg" className="!w-20 !h-20 !text-3xl shrink-0" />

          {/* 右侧信息区 */}
          <div className="flex-1 ml-6">
            {/* i) 昵称 + Handle 行 */}
            <div className="flex items-baseline flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">{currentUser.nickname}</h1>
              <span className="text-afmuted-foreground ml-2">@{currentUser.handle}</span>
            </div>

            {/* ii) 职业 / 城市 / 加入时间 行 */}
            <div className="text-sm text-afmuted-foreground mt-1">
              {currentUser.profession} · {currentUser.city} · 加入于 {currentUser.joinedAt}
            </div>

            {/* iii) bio 简介段落 */}
            <p className="text-foreground mt-2 leading-relaxed">{currentUser.bio}</p>

            {/* iv) 操作区 */}
            <div className="mt-4 flex gap-3 flex-wrap">
              {/* 关注按钮：自己主页不展示，他人主页切换状态 */}
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

              {/* 发消息占位按钮 */}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md border border-border bg-card text-foreground text-sm font-medium hover:bg-afmuted transition-colors"
              >
                <Mail className="size-4" />
                发消息
              </button>

              {/* 编辑主页按钮：仅当这是自己个人主页时显示（Phase3 上线） */}
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

        {/* 下方指标卡：前4个在 <600px 用 grid-cols-2，影响力评分单独占一行 */}
        <div className="mt-6 pt-6 border-t border-border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-semibold text-foreground tabular-nums">{stats.postCount}</p>
              <p className="text-xs text-afmuted-foreground mt-1">发帖</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-foreground tabular-nums">{stats.followingCount}</p>
              <p className="text-xs text-afmuted-foreground mt-1">关注</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-foreground tabular-nums">{stats.followerCount}</p>
              <p className="text-xs text-afmuted-foreground mt-1">粉丝</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-foreground tabular-nums">{stats.favoriteCount}</p>
              <p className="text-xs text-afmuted-foreground mt-1">收藏</p>
            </div>
          </div>

          {/* 影响力评分：<600px 单独占满一行 100%，桌面与其他指标并列 md:grid-cols-5 */}
          <div className="mt-4 md:mt-0 md:col-span-1 w-full md:w-auto pt-4 md:pt-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-afmuted-foreground">影响力评分</span>
              <span className="text-lg font-semibold text-foreground tabular-nums">{stats.influenceScore}</span>
            </div>
            {/* 进度条视觉化：宽度 = 8.6/10 * 100% = 86% */}
            <div className="h-2 rounded-full bg-afmuted overflow-hidden">
              <div
                className="h-full bg-vermilion rounded-full"
                style={{ width: `${influencePercent}%` }}
              />
            </div>
            <p className="text-xs text-afmuted-foreground mt-2 text-center md:text-left">
              社区影响力 · 超过 85% 的创作者
            </p>
          </div>
        </div>
      </section>

      {/* B) Tab 切换区 */}
      <section className="bg-card border border-border rounded-af-lg overflow-hidden">
        {/* Tab 顶栏 */}
        <div className="flex border-b border-border overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setSelectedTab(t.key)}
              className={`px-4 py-3 whitespace-nowrap text-sm transition-colors border-b-2 ${
                selectedTab === t.key
                  ? 'border-b-vermilion font-semibold text-foreground'
                  : 'border-b-transparent text-afmuted-foreground hover:bg-afmuted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab 内容区 */}
        <div className="p-4 md:p-6 min-h-[300px]">
          {selectedTab === 'posts' ? (
            userPosts.length > 0 ? (
              <div className="space-y-3">
                {userPosts.map((p) => {
                  const board = boards.find((b) => b.id === p.boardId)
                  return (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/forum/post/${p.id}`)}
                      className="block bg-card border border-border rounded-af-lg p-5 hover:border-afmuted-foreground/30 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {board ? (
                          <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-xs">
                            {board.name}
                          </span>
                        ) : null}
                        <span className="text-xs text-afmuted-foreground">
                          {formatRelativeTime(p.createdAt)}
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-foreground mb-1.5">{p.title}</h3>
                      <p className="text-sm text-afmuted-foreground af-line-clamp-2 mb-3">{p.summary}</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        {p.tags.slice(0, 3).map((tag) => (
                          <TagPill key={tag} variant="bg">{tag}</TagPill>
                        ))}
                        <div className="flex items-center gap-3 text-xs text-afmuted-foreground ml-auto">
                          <span className="flex items-center gap-1">
                            <Heart className="size-3.5" /> {formatNumber(p.likes)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState icon={Pencil} title="还没有发布过帖子" description="点击右上角发帖，分享你的第一篇内容" />
            )
          ) : null}

          {selectedTab === 'favorites' ? (
            favoritePosts.length > 0 ? (
              <div className="space-y-3">
                {favoritePosts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/forum/post/${p.id}`)}
                    className="block bg-card border border-border rounded-af-lg p-5 hover:border-afmuted-foreground/30 transition-colors cursor-pointer"
                  >
                    <h3 className="text-base font-semibold text-foreground mb-1.5">{p.title}</h3>
                    <p className="text-sm text-afmuted-foreground af-line-clamp-2 mb-3">{p.summary}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {p.tags.slice(0, 3).map((tag) => (
                        <TagPill key={tag} variant="bg">{tag}</TagPill>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Heart} title="还没有收藏帖子" description="浏览帖子时点击收藏，这里会展示你的收藏" />
            )
          ) : null}

          {selectedTab === 'following' ? (
            followingUsers.length > 0 ? (
              <div className="space-y-3">
                {followingUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 bg-card border border-border rounded-af-lg p-4">
                    <Avatar text={u.avatarText} size="md" />
                    <div className="flex-1 min-w-0">
                      <Link to="/forum/profile" className="text-sm font-semibold text-foreground hover:underline">
                        {u.nickname}
                      </Link>
                      <p className="text-xs text-afmuted-foreground truncate">
                        @{u.handle} · {u.profession}
                      </p>
                      {u.bio ? (
                        <p className="text-xs text-afmuted-foreground mt-1 truncate">{u.bio}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={handleFollowClick}
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-af-md border border-border bg-card text-foreground text-xs font-medium hover:bg-afmuted transition-colors shrink-0"
                    >
                      已关注
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={UserPlus} title="还没有关注任何人" description="去发现页关注感兴趣的创作者吧" />
            )
          ) : null}

          {selectedTab === 'followers' ? (
            followerUsers.length > 0 ? (
              <div className="space-y-3">
                {followerUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 bg-card border border-border rounded-af-lg p-4">
                    <Avatar text={u.avatarText} size="md" />
                    <div className="flex-1 min-w-0">
                      <Link to="/forum/profile" className="text-sm font-semibold text-foreground hover:underline">
                        {u.nickname}
                      </Link>
                      <p className="text-xs text-afmuted-foreground truncate">
                        @{u.handle} · {u.profession}
                      </p>
                      {u.bio ? (
                        <p className="text-xs text-afmuted-foreground mt-1 truncate">{u.bio}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={handleFollowClick}
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-af-md border border-border bg-card text-foreground text-xs font-medium hover:bg-afmuted transition-colors shrink-0"
                    >
                      回关
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={UserPlus} title="还没有粉丝" description="多发优质帖子，吸引更多关注者吧" />
            )
          ) : null}
        </div>
      </section>
    </div>
  )
}
