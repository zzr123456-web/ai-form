import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { getCurrentUser, login as apiLogin, register as apiRegister, logout as apiLogout } from '../../utils/ai-forum/apiClient.js'

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

  // 初始化：检查 token 有效性，恢复登录态
  useEffect(() => {
    let cancelled = false
    // 检查 localStorage 是否有持久化登录标记（用户对象）
    let hasPersisted = false
    try {
      hasPersisted = !!localStorage.getItem(STORAGE_USER)
    } catch {
      hasPersisted = false
    }
    if (!hasPersisted) {
      setAuthReady(true)
      return () => { cancelled = true }
    }
    // 有持久化标记：调 /auth/me 验证 token 有效性
    getCurrentUser()
      .then((loaded) => {
        if (cancelled) return
        if (loaded) {
          setUser(loaded)
        } else {
          // token 无效或过期：清除本地存储
          try {
            localStorage.removeItem(STORAGE_USER)
          } catch {
            // 静默忽略
          }
        }
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true)
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 监听全局 auth:expired 事件：token 过期时清除登录态并弹出认证窗
  useEffect(() => {
    const handleExpired = () => {
      setUser(null)
      setGuestElapsed(0)
      setShowGuestBanner(false)
      try {
        localStorage.removeItem(STORAGE_USER)
      } catch {
        // 静默忽略
      }
      setAuthModal({ open: true, reason: '登录已过期，请重新登录' })
    }
    window.addEventListener('auth:expired', handleExpired)
    return () => window.removeEventListener('auth:expired', handleExpired)
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
   * 登录：调用后端 /auth/login 进行真实认证
   * 成功后持久化用户到 localStorage
   * @param {string} username 用户名（nickname 或 handle）
   * @param {string} password 密码
   * @returns {Promise<{user:Object|null, error:string|null}>} 成功返回 user，失败返回 error
   */
  const login = useCallback(async (username, password) => {
    const res = await apiLogin(username, password)
    if (res.ok && res.data && res.data.user) {
      setUser(res.data.user)
      try {
        localStorage.setItem(STORAGE_USER, JSON.stringify(res.data.user))
      } catch {
        // 隐私模式静默失败：登录态仅保留在内存中
      }
      setGuestElapsed(0)
      setShowGuestBanner(false)
      setAuthModal({ open: false, reason: '' })
      return { user: res.data.user, error: null }
    }
    return { user: null, error: res.error || '登录失败，请检查用户名和密码' }
  }, [])

  /**
   * 注册：调用后端 /auth/register 创建新用户，成功后自动登录
   * @param {{nickname:string, email:string, password:string}} payload
   * @returns {Promise<{user:Object|null, error:string|null}>}
   */
  const register = useCallback(async (payload) => {
    const res = await apiRegister(payload)
    if (res.ok && res.data && res.data.user) {
      setUser(res.data.user)
      try {
        localStorage.setItem(STORAGE_USER, JSON.stringify(res.data.user))
      } catch {
        // 隐私模式静默失败：登录态仅保留在内存中
      }
      setGuestElapsed(0)
      setShowGuestBanner(false)
      setAuthModal({ open: false, reason: '' })
      return { user: res.data.user, error: null }
    }
    return { user: null, error: res.error || '注册失败，请稍后重试' }
  }, [])

  /**
   * 退出登录：调用后端 /auth/logout 销毁 session，清除本地 token 与用户状态
   */
  const logout = useCallback(async () => {
    await apiLogout()
    setUser(null)
    setGuestElapsed(0)
    setShowGuestBanner(false)
    try {
      localStorage.removeItem(STORAGE_USER)
    } catch {
      // 静默忽略
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
    register,
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
    user, isAuthenticated, theme, toggleTheme, login, register, logout,
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
