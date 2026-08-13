import React, { useState, useEffect } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, FileCheck, Users, LayoutGrid, Flag, Settings,
  Sun, Moon, Menu, X, ArrowLeft, Bell
} from 'lucide-react'
import { useAuth } from '../AuthProvider.jsx'
import { currentUser } from '../../../utils/ai-forum/mockData.js'
import Avatar from '../common/Avatar.jsx'

const NAV = [
  { to: '/forum/admin',          label: '总览',     icon: LayoutDashboard, end: true },
  { to: '/forum/admin/review',   label: '内容审核', icon: FileCheck },
  { to: '/forum/admin/users',    label: '用户管理', icon: Users },
  { to: '/forum/admin/boards',   label: '版块管理', icon: LayoutGrid },
  { to: '/forum/admin/reports',  label: '举报处理', icon: Flag },
  { to: '/forum/admin/config',   label: '运营配置', icon: Settings },
]

/**
 * 后台布局：左侧固定侧栏 w-64 sticky + 顶部 header + 主内容区
 * Phase0 简化：<768px 不做抽屉，侧栏默认隐藏，内容区全宽
 */
export default function AdminLayout() {
  const { theme, toggleTheme, requireAuth } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  // 路由守卫：未登录时跳转登录页
  useEffect(() => {
    requireAuth?.('登录后访问后台')
  }, [requireAuth])

  // 路由切换时关闭抽屉
  useEffect(() => { setDrawerOpen(false) }, [location.pathname])

  useEffect(() => {
    document.body.classList.add('af-active')
    return () => document.body.classList.remove('af-active')
  }, [])

  const SidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo 区 */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-border shrink-0">
        <div className="w-9 h-9 bg-vermilion text-white rounded-af-md flex items-center justify-center font-bold text-sm">AF</div>
        <div>
          <span className="font-semibold text-foreground block text-sm">管理后台</span>
          <span className="text-[10px] text-afmuted-foreground">AI Forum Admin</span>
        </div>
      </div>
      {/* 导航区：6 个入口，active 时朱红背景高亮 */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto af-no-scrollbar">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-af-md text-sm font-medium transition-all ${
                // active 路由使用朱红背景高亮，符合 Neo-Editorial 视觉
                isActive
                  ? 'bg-vermilion text-white shadow-af-1'
                  : 'text-afmuted-foreground hover:text-foreground hover:bg-afmuted'
              }`
            }
          >
            <item.icon className="size-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )

  return (
    <div className={`af-app ${theme === 'dark' ? 'dark' : ''} min-h-screen`}>
      {/* 桌面端侧栏：w-64 sticky top-0 h-screen */}
      <aside className="hidden md:flex fixed top-0 left-0 bottom-0 w-64 bg-card border-r border-border flex-col z-30">
        {SidebarContent}
      </aside>

      {/* 移动端抽屉（Phase0 简化，默认不展开） */}
      {drawerOpen ? (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-foreground/50" onClick={() => setDrawerOpen(false)} />
          <aside className="md:hidden fixed top-0 left-0 bottom-0 w-64 bg-card border-r border-border z-50 animate-[fadeIn_0.2s_ease]">
            <button type="button" onClick={() => setDrawerOpen(false)} className="absolute top-3 right-3 p-1.5 text-afmuted-foreground hover:text-foreground" aria-label="关闭">
              <X className="size-4" />
            </button>
            {SidebarContent}
          </aside>
        </>
      ) : null}

      {/* 主区域 */}
      <div className="md:pl-64">
        {/* 顶部 header */}
        <header className="sticky top-0 z-20 h-16 bg-card/95 backdrop-blur border-b border-border flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDrawerOpen(true)} className="md:hidden p-2 -ml-2 text-afmuted-foreground hover:text-foreground" aria-label="菜单">
              <Menu className="size-5" />
            </button>
            <span className="text-sm font-medium text-foreground">运营管理后台</span>
          </div>
          {/* 右栏：返回前台 + 通知 + 主题切换 + 用户头像+昵称 */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* 返回前台按钮 */}
            <Link
              to="/forum"
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-af-md border border-border bg-background text-sm font-medium text-foreground hover:bg-afmuted transition-colors"
            >
              <ArrowLeft className="size-4" />
              返回前台
            </Link>
            <button type="button" className="relative p-2 text-afmuted-foreground hover:text-foreground" aria-label="通知">
              <Bell className="size-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-vermilion rounded-full" />
            </button>
            <button type="button" onClick={toggleTheme} className="p-2 text-afmuted-foreground hover:text-foreground" aria-label="切换主题">
              {theme === 'light' ? <Moon className="size-5" /> : <Sun className="size-5" />}
            </button>
            {/* 用户头像 + 昵称 */}
            <div className="flex items-center gap-2.5 pl-1 sm:pl-2 border-l border-border ml-1">
              <Avatar text={currentUser.avatarText} size="sm" />
              <div className="hidden sm:block min-w-0">
                <p className="text-sm font-medium text-foreground truncate leading-tight">{currentUser.nickname}</p>
                <p className="text-[10px] text-afmuted-foreground truncate leading-tight">管理员</p>
              </div>
            </div>
          </div>
        </header>
        {/* 主内容区 */}
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
