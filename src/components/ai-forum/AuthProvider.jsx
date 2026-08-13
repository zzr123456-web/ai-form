import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { getCurrentUser } from '../../utils/ai-forum/apiClient.js'

const AuthContext = createContext(null)

// 5 分钟 = 300 秒：经过产品讨论，给予游客足够的浏览时长以建立初步体验，
// 同时避免无限制爬取内容；与强制认证弹窗文案保持一致
const GUEST_LIMIT_SECONDS = 300
// 4 分 30 秒 = 270 秒：提前 30 秒给出轻提示，给用户心理预期，
// 避免 5 分钟整直接阻断造成的突兀感
const GUEST_REMIND_SECONDS = 270
// localStorage key 加项目前缀，避免多项目同域下冲突
const STORAGE_USER = 'af_user'
const STORAGE_THEME = 'af_theme'

/**
 * 全局认证与未登录计时 Provider
 * - 登录态持久化到 localStorage
 * - 未登录用户启动 5 分钟浏览计时，4:30 轻提示，5:00 强制认证
 * - 主题（light/dark）切换
 * - 登录后跳转目标承接（loginRedirect）
 */
export function AuthProvider({ children }) {
  // user 初始化为 null：登录态由 useEffect 异步从后端拉取，避免使用可能过期的本地缓存
  const [user, setUser] = useState(null)
  // 初始认证检查是否完成：为 false 时抑制游客计时器，防止加载期间误触 5 分钟强制认证
  const [authReady, setAuthReady] = useState(false)
  // 初始化读取主题：同上，隐私模式兜底为 light
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_THEME) || 'light'
    } catch {
      return 'light'
    }
  })

  // 未登录浏览计时（秒），登录后置为 0
  const [guestElapsed, setGuestElapsed] = useState(0)
  // 认证弹窗状态：open 控制显隐，reason 展示来源文案
  const [authModal, setAuthModal] = useState({ open: false, reason: '' })
  // 轻提示横幅（4:30 出现，可手动关闭）
  const [showGuestBanner, setShowGuestBanner] = useState(false)
  // 登录后跳转目标：支持从 URL ?from= 写入，login() 成功后消费
  const [loginRedirect, setLoginRedirect] = useState(null)

  const isAuthenticated = !!user
  // 游客状态机：bound（已登录）→ active（浏览中）→ expiring（即将到期）→ expired（已超时）
  const guestStatus = useMemo(() => {
    if (isAuthenticated) return 'bound'
    if (guestElapsed >= GUEST_LIMIT_SECONDS) return 'expired'
    if (guestElapsed >= GUEST_REMIND_SECONDS) return 'expiring'
    return 'active'
  }, [isAuthenticated, guestElapsed])

  // 初始化异步加载当前用户：仅当 localStorage 存在持久化登录态时才请求后端，
  // 这样既能恢复登录态，又能拿到数据库中的最新用户数据。
  // cancelled 标志防止组件卸载后仍写入 state（满足 useEffect 必须清理的要求）
  useEffect(() => {
    let cancelled = false
    // 读取持久化登录标记：存在则视为上次已登录，需从后端拉取最新用户数据
    let hasPersisted = false
    try {
      hasPersisted = !!localStorage.getItem(STORAGE_USER)
    } catch {
      hasPersisted = false
    }
    // 无持久化登录态：直接标记就绪，进入游客计时流程
    if (!hasPersisted) {
      setAuthReady(true)
      return () => { cancelled = true }
    }
    getCurrentUser()
      .then((loaded) => {
        if (cancelled) return
        // 接口返回用户则恢复登录态；返回 null（如后端不可用）则保持未登录
        if (loaded) setUser(loaded)
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true)
      })
    return () => { cancelled = true }
    // 仅在挂载时执行一次：依赖为空数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 未登录计时器：仅在初始认证检查完成且未登录时启动，每秒 +1
  // 增加 authReady 依赖的原因：避免页面加载期间（正在异步拉取用户）误启动计时器，
  // 否则慢请求下可能出现已登录用户被强制认证弹窗阻断的问题
  useEffect(() => {
    if (!authReady || isAuthenticated) return undefined
    const timer = setInterval(() => {
      setGuestElapsed((prev) => {
        const next = prev + 1
        // 达到 4:30 显示轻提示横幅（非阻断，仅提醒）
        if (next === GUEST_REMIND_SECONDS) setShowGuestBanner(true)
        // 达到 5:00 强制认证：弹出阻断弹窗并卡住在 LIMIT（防止继续递增）
        if (next >= GUEST_LIMIT_SECONDS) {
          setAuthModal({ open: true, reason: '浏览已达 5 分钟，登录后继续浏览' })
          return GUEST_LIMIT_SECONDS
        }
        return next
      })
    }, 1000)
    // 清理定时器：组件卸载或登录态变化时必须清理，防止内存泄漏
    return () => clearInterval(timer)
  }, [authReady, isAuthenticated])

  // 持久化主题：同上
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_THEME, theme)
    } catch {
      // 忽略：主题仅在当前会话生效
    }
  }, [theme])

  /**
   * 登录：Phase0 不做真实认证，调用 getCurrentUser() 加载默认用户 u_alex 并标记已登录
   * 改为异步并返回 Promise，便于调用方 await 后再执行跳转/错误提示
   * 持久化逻辑从原 useEffect 迁移至此：避免 user 初始为 null 时误删 localStorage
   * username/password 参数预留给 Phase1 真实认证，当前阶段暂不使用
   */
  const login = useCallback(async (_username, _password) => {
    const loaded = await getCurrentUser()
    if (loaded) {
      setUser(loaded)
      try {
        localStorage.setItem(STORAGE_USER, JSON.stringify(loaded))
      } catch {
        // 隐私模式或存储满时静默失败：登录态仅保留在内存中，刷新后丢失
      }
    }
    // 登录后立即清零计时、关闭横幅、关闭弹窗
    setGuestElapsed(0)
    setShowGuestBanner(false)
    setAuthModal({ open: false, reason: '' })
    return loaded
  }, [])

  /** 退出登录：清空用户、清除持久化登录态并重置游客计时（从零开始重新计 5 分钟） */
  const logout = useCallback(() => {
    setUser(null)
    setGuestElapsed(0)
    setShowGuestBanner(false)
    try {
      localStorage.removeItem(STORAGE_USER)
    } catch {
      // 隐私模式下移除可能抛错，静默忽略
    }
  }, [])

  /** 切换明暗主题：light ↔ dark */
  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }, [])

  /**
   * 拦截需登录操作
   * - 已登录：执行 callback（可选）并返回 true
   * - 未登录：弹出认证窗并返回 false，调用方据此中断后续操作
   */
  const requireAuth = useCallback((action, callback) => {
    if (user) {
      if (typeof callback === 'function') callback()
      return true
    }
    setAuthModal({ open: true, reason: action || '请登录后继续操作' })
    return false
  }, [user])

  /** 手动打开认证弹窗（用于导航栏「登录」按钮等入口） */
  const openAuthModal = useCallback((reason = '') => {
    setAuthModal({ open: true, reason })
  }, [])

  /**
   * 关闭认证弹窗
   * - expired 状态下直接 return，实现「强制认证不可关闭」的产品要求
   * - 其他状态正常关闭
   */
  const closeAuthModal = useCallback(() => {
    if (guestStatus === 'expired') return
    setAuthModal({ open: false, reason: '' })
  }, [guestStatus])

  /** 关闭 4:30 轻提示横幅（用户可手动 dismiss，不影响后续 5:00 强制弹窗） */
  const dismissGuestBanner = useCallback(() => setShowGuestBanner(false), [])

  // 剩余秒数辅助：用于顶部导航栏展示倒计时，避免消费方重复计算
  const setGuestElapsedRemaining = useCallback((remaining) => {
    setGuestElapsed(Math.max(0, GUEST_LIMIT_SECONDS - remaining))
  }, [])

  const value = useMemo(() => ({
    user,
    isAuthenticated,
    theme,
    toggleTheme,
    login,
    logout,
    guestElapsed,
    guestStatus,
    showGuestBanner,
    dismissGuestBanner,
    authModal,
    openAuthModal,
    closeAuthModal,
    requireAuth,
    guestLimit: GUEST_LIMIT_SECONDS,
    loginRedirect,
    setLoginRedirect,
    setGuestElapsedRemaining,
  }), [
    user, isAuthenticated, theme, toggleTheme, login, logout,
    guestElapsed, guestStatus, showGuestBanner, dismissGuestBanner,
    authModal, openAuthModal, closeAuthModal, requireAuth,
    loginRedirect, setGuestElapsedRemaining,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return ctx
}
