import React, { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../AuthProvider.jsx'
import ForumHeader from './ForumHeader.jsx'
import ForumFooter from './ForumFooter.jsx'
import GuestBanner from './GuestBanner.jsx'
import AuthModal from '../common/AuthModal.jsx'

/**
 * 论坛前台布局
 * - 结构从上至下：ForumHeader → GuestBanner → main → ForumFooter
 * - AuthModal 全局挂载，由 authModal 状态驱动
 * - 响应式 padding：<600px px-2，其他 px-4
 */
export default function ForumLayout() {
  const { theme, showGuestBanner, isAuthenticated } = useAuth()

  useEffect(() => {
    document.body.classList.add('af-active')
    return () => document.body.classList.remove('af-active')
  }, [])

  return (
    <div className={`af-app ${theme === 'dark' ? 'dark' : ''} flex flex-col min-h-screen`}>
      <ForumHeader />
      {showGuestBanner ? <GuestBanner /> : null}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 max-[600px]:px-2 py-6">
        <Outlet />
      </main>
      <ForumFooter />
      {isAuthenticated ? null : <AuthModal />}
    </div>
  )
}
