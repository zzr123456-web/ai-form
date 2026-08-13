import React, { useState, useEffect } from 'react'
import { LogIn, X } from 'lucide-react'
import { useAuth } from '../AuthProvider.jsx'
import { formatSeconds } from '../../../utils/ai-forum/aiForumUtils.js'
import useGuestSession from '../../../hooks/useGuestSession.js'

export default function GuestBanner() {
  const { openAuthModal } = useAuth()
  const { status, remainingSeconds, loading } = useGuestSession()
  // hiddenUntil：稍后再说隐藏的截止时间戳（ms），1 分钟后再次显示
  const [hiddenUntil, setHiddenUntil] = useState(0)
  // 当前时间戳：用于每 1 秒刷新展示判断 hiddenUntil 是否过期
  const [now, setNow] = useState(Date.now())

  // 每秒刷新一次 now，确保「稍后再说」隐藏 1 分钟后能自动重新显示
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // 读取当前登录用户：从 useGuestSession 的内部依赖中无法直接取，
  // 故再次通过 useAuth 读取 isAuthenticated 作为展示条件（避免有 user 登录后仍显示黄条）
  const { isAuthenticated } = useAuth()

  // 显示条件：未登录 + 非 loading + status=expiring + 未被「稍后再说」临时隐藏
  const shouldShow = !isAuthenticated && !loading && status === 'expiring' && now >= hiddenUntil

  if (!shouldShow) return null

  const handleLater = () => {
    // 临时隐藏 1 分钟：避免黄条持续干扰，但到期后仍会重新显示提醒用户
    setHiddenUntil(Date.now() + 60 * 1000)
  }

  return (
    // 顶部黄条：bg-yellow-50 + border-yellow-200，暗色模式下降低对比度防止刺眼
    <div className="w-full bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200 border-b border-yellow-200 dark:border-yellow-700/40">
      <div className="max-w-6xl mx-auto px-4 max-[600px]:px-2 py-3 flex items-center justify-between gap-3">
        <p className="text-sm flex-1 min-w-0 truncate">
          距离浏览上限还有 <span className="font-mono font-semibold">{formatSeconds(remainingSeconds)}</span>
          ，登录后继续浏览、发帖、收藏，解锁完整体验
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openAuthModal('登录后解锁完整功能')}
            className="inline-flex items-center gap-1.5 h-8 px-3 sm:px-4 rounded-af-md bg-yellow-600 text-white text-sm font-medium hover:bg-yellow-700 transition-colors"
          >
            <LogIn className="size-3.5 hidden sm:block" />
            立即登录
          </button>
          <button
            type="button"
            onClick={handleLater}
            className="p-1.5 text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 rounded-af-md transition-colors"
            aria-label="稍后再说"
            title="稍后再说（1 分钟后再次显示）"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
