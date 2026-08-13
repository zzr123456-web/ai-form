import React, { useEffect } from 'react'
import { useAuth } from '../AuthProvider.jsx'
import AuthModal from './AuthModal.jsx'
import useGuestSession from '../../../hooks/useGuestSession.js'

export default function AuthGate() {
  const { isAuthenticated, openAuthModal, setGuestElapsedRemaining } = useAuth()
  const { status, loading } = useGuestSession()

  // 当新访客计时系统判定 expired 时：
  // 1. 同步旧 AuthProvider 计时状态为 expired（setGuestElapsedRemaining(0) → guestElapsed=300 → guestStatus='expired'）
  //    目的：让 AuthModal 内部 forced=true 生效（点击遮罩不关闭 + 隐藏关闭按钮 + closeAuthModal 短路）
  // 2. 调用 openAuthModal 打开弹窗，展示强制认证 UI
  useEffect(() => {
    if (!loading && !isAuthenticated && status === 'expired') {
      setGuestElapsedRemaining(0)
      openAuthModal('浏览时间已达上限，登录后继续浏览社区内容')
    }
  }, [status, loading, isAuthenticated, setGuestElapsedRemaining, openAuthModal])

  // 渲染条件：未登录 + 非 loading + expired
  const shouldShow = !isAuthenticated && !loading && status === 'expired'
  if (!shouldShow) return null

  return (
    // 全屏半透明黑色遮罩：z-50 在页面内容之上，AuthModal z-[100] 在本遮罩之上；
    // 本层主要防止用户点击到页面内容进行操作（滚动、点击按钮等），
    // 点击空白不关闭：此处 wrapper 不绑定任何 onClick 关闭事件，AuthModal 内部 forced 已拦截遮罩点击
    <div
      className="bg-black/60 backdrop-blur-sm z-50 fixed inset-0"
      onClick={(e) => {
        // 阻止事件冒泡：防止意外触发页面下层元素的点击
        // 不调用 closeAuthModal：实现强制认证，点击空白不关闭
        e.stopPropagation()
        e.preventDefault()
      }}
    >
      {/* AuthModal 自己会判断 authModal.open 渲染，且内部 forced=true 模式已阻止遮罩点击关闭、隐藏 X 按钮、closeAuthModal 短路 */}
      <AuthModal />
    </div>
  )
}
