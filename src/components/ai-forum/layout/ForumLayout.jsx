import React, { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../AuthProvider.jsx'
import ForumHeader from './ForumHeader.jsx'
import ForumFooter from './ForumFooter.jsx'
import GuestBanner from './GuestBanner.jsx'
import AuthModal from '../common/AuthModal.jsx'
import AuthGate from '../common/AuthGate.jsx'
import useGuestSession from '../../../hooks/useGuestSession.js'

/**
 * 论坛前台布局
 * - 结构从上至下：ForumHeader → GuestBanner → main → ForumFooter → AuthGate → AuthModal
 * - GuestBanner 仅在 expiring（剩余≤30s）时由内部控制显示
 * - AuthGate 全屏强制认证遮罩：访客 expired 时出现，遮罩点击不可关闭
 * - AuthModal 全局挂载，由 authModal 状态驱动
 * - 响应式 padding：<600px px-2，其他 px-4
 */
export default function ForumLayout() {
  const { theme, isAuthenticated } = useAuth()
  // 顶层调用 useGuestSession：确保 Hook 只初始化一份 deviceId/轮询状态，
  // 避免 GuestBanner / AuthGate 各自调用时产生多份轮询定时器与冗余请求
  useGuestSession()

  useEffect(() => {
    document.body.classList.add('af-active')
    return () => document.body.classList.remove('af-active')
  }, [])

  return (
    <div className={`af-app ${theme === 'dark' ? 'dark' : ''} flex flex-col min-h-screen`}>
      <ForumHeader />
      {/* GuestBanner 内部通过 useGuestSession + useAuth 控制是否显示，外部无条件挂载即可 */}
      <GuestBanner />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 max-[600px]:px-2 py-6">
        <Outlet />
      </main>
      <ForumFooter />
      {/* AuthModal 全局挂载：登录态隐藏 */}
      {isAuthenticated ? null : <AuthModal />}
      {/* AuthGate 强制认证遮罩：z-index 最高层级，访客 expired 时阻止页面操作 */}
      <AuthGate />
    </div>
  )
}
