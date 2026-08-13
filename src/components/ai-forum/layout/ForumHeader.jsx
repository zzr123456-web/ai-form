import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, PenSquare, Bell, Sun, Moon, Menu, LogOut, User, Settings, Home } from 'lucide-react'
import { useAuth } from '../AuthProvider.jsx'
import Avatar from '../common/Avatar.jsx'
import { formatTimer } from '../../../utils/ai-forum/aiForumUtils.js'

const GUEST_LIMIT = 300

export default function ForumHeader({ onMenuClick }) {
  const {
    user, isAuthenticated, theme, toggleTheme,
    requireAuth, openAuthModal, logout,
    guestElapsed, guestStatus,
  } = useAuth()
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [avatarOpen, setAvatarOpen] = useState(false)
  const avatarDropdownRef = useRef(null)

  const remaining = Math.max(0, GUEST_LIMIT - guestElapsed)
  const isModerator = user?.roles?.includes('moderator') || user?.roles?.includes('admin')

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (avatarDropdownRef.current && !avatarDropdownRef.current.contains(e.target)) {
        setAvatarOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    const q = searchInput.trim()
    navigate(q ? `/forum/search?q=${encodeURIComponent(q)}` : '/forum/search')
  }

  const handleEditor = () => {
    requireAuth('发帖需要登录', () => navigate('/forum/editor'))
  }

  const handleNotifications = () => {
    requireAuth('登录后查看通知', () => navigate('/forum/notifications'))
  }

  const handleLogout = () => {
    setAvatarOpen(false)
    logout()
  }

  return (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur border-b border-border supports-[backdrop-filter]:bg-background/75">
      <div className="max-w-6xl mx-auto px-4 max-[600px]:px-2 h-14 flex items-center justify-between gap-2 md:gap-4">
        <div className="flex items-center gap-2 shrink-0">
          {onMenuClick ? (
            <button type="button" onClick={onMenuClick} className="md:hidden p-2 -ml-2 text-afmuted-foreground hover:text-foreground" aria-label="菜单">
              <Menu className="size-5" />
            </button>
          ) : null}
          <Link to="/forum" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary text-primary-foreground rounded-af-md flex items-center justify-center font-bold text-sm">AF</div>
            <span className="font-semibold text-foreground hidden sm:block">AI Forum</span>
          </Link>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md hidden md:block">
          <div className="flex items-center gap-2 w-full h-9 px-3 rounded-af-md bg-secondary text-afmuted-foreground focus-within:ring-2 focus-within:ring-ring transition-all">
            <Search className="size-4 shrink-0" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索问题、话题或用户"
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none"
            />
          </div>
        </form>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <form onSubmit={handleSearchSubmit} className="md:hidden">
            <button type="submit" className="p-2 text-afmuted-foreground hover:text-foreground" aria-label="搜索">
              <Search className="size-5" />
            </button>
          </form>

          <button
            type="button"
            onClick={handleEditor}
            className="inline-flex items-center gap-1.5 h-9 px-3 sm:px-4 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <PenSquare className="size-4" />
            <span className="hidden md:inline">发帖</span>
          </button>

          <button
            type="button"
            onClick={handleNotifications}
            className="relative p-2 text-afmuted-foreground hover:text-foreground transition-colors"
            aria-label="通知"
          >
            <Bell className="size-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-vermilion rounded-full" />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 text-afmuted-foreground hover:text-foreground transition-colors"
            aria-label="切换主题"
          >
            {theme === 'light' ? <Moon className="size-5" /> : <Sun className="size-5" />}
          </button>

          {isAuthenticated ? (
            <div className="relative" ref={avatarDropdownRef}>
              <button
                type="button"
                onClick={() => setAvatarOpen((v) => !v)}
                className="shrink-0"
                aria-label="用户菜单"
                aria-haspopup="menu"
                aria-expanded={avatarOpen}
              >
                <Avatar text={user?.avatarText} size="sm" className="hover:ring-2 hover:ring-ring transition-all" />
              </button>
              {avatarOpen ? (
                <div className="absolute right-0 top-full mt-2 w-56 rounded-af-lg border border-border bg-card shadow-af-3 overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-sm font-medium text-foreground">{user?.nickname}</p>
                    <p className="text-xs text-afmuted-foreground">@{user?.handle}</p>
                  </div>
                  <ul className="py-1">
                    <li>
                      <button
                        type="button"
                        onClick={() => { setAvatarOpen(false); navigate('/forum/profile') }}
                        className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-afmuted transition-colors flex items-center gap-2"
                      >
                        <User className="size-4" />个人主页
                      </button>
                    </li>
                    <li>
                      <button
                        type="button"
                        onClick={() => { setAvatarOpen(false); navigate('/forum/notifications') }}
                        className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-afmuted transition-colors flex items-center gap-2"
                      >
                        <Bell className="size-4" />通知中心
                      </button>
                    </li>
                    {isModerator ? (
                      <li>
                        <button
                          type="button"
                          onClick={() => { setAvatarOpen(false); navigate('/forum/admin') }}
                          className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-afmuted transition-colors flex items-center gap-2"
                        >
                          <Settings className="size-4" />后台管理
                        </button>
                      </li>
                    ) : null}
                  </ul>
                  <div className="border-t border-border py-1">
                    <li>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full px-4 py-2 text-left text-sm text-error hover:bg-afmuted transition-colors flex items-center gap-2"
                      >
                        <LogOut className="size-4" />退出登录
                      </button>
                    </li>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => openAuthModal('登录后查看完整浏览进度')}
                className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-af-md border border-border bg-card text-xs sm:text-sm text-foreground hover:bg-afmuted transition-colors"
                title="游客浏览剩余时间"
              >
                <Home className="size-3.5 text-afmuted-foreground" />
                <span className="font-mono text-afmuted-foreground">
                  剩余 {formatTimer(remaining)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('登录后解锁完整功能')}
                className="h-9 px-3 sm:px-4 rounded-af-md border border-primary text-primary text-sm font-medium hover:bg-primary/5 transition-colors"
              >
                登录/注册
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
