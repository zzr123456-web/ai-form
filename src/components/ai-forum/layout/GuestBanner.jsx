import React from 'react'
import { X, Shield, LogIn } from 'lucide-react'
import { useAuth } from '../AuthProvider.jsx'
import { formatTimer } from '../../../utils/ai-forum/aiForumUtils.js'

export default function GuestBanner() {
  const { guestElapsed, dismissGuestBanner, openAuthModal } = useAuth()

  return (
    <div className="w-full bg-cream-2 border-b border-vermilion/20">
      <div className="max-w-6xl mx-auto px-4 max-[600px]:px-2 py-3 flex items-center justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="shrink-0 w-8 h-8 rounded-af-md bg-vermilion/10 flex items-center justify-center text-vermilion mt-0.5">
            <Shield className="size-4" />
          </div>
          <p className="text-sm text-ink flex-1 min-w-0">
            你已浏览 <span className="font-mono font-semibold">{formatTimer(guestElapsed)}</span>
            ，登录后继续浏览、发帖、收藏并获取完整体验
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openAuthModal('登录后解锁完整功能')}
            className="hidden sm:inline-flex items-center gap-1.5 h-8 px-4 rounded-af-md bg-vermilion text-white text-sm font-medium hover:bg-vermilion-light transition-colors"
          >
            <LogIn className="size-3.5" />
            立即登录
          </button>
          <button
            type="button"
            onClick={() => openAuthModal('登录后解锁完整功能')}
            className="sm:hidden inline-flex items-center h-8 px-3 rounded-af-md bg-vermilion text-white text-sm font-medium hover:bg-vermilion-light transition-colors"
          >
            登录
          </button>
          <button
            type="button"
            onClick={dismissGuestBanner}
            className="p-1.5 text-muted hover:text-ink hover:bg-cream rounded-af-md transition-colors"
            aria-label="关闭提示"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
