import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../components/ai-forum/AuthProvider.jsx'

// localStorage key：项目前缀避免多项目同域冲突
const DEVICE_ID_KEY = 'af_device_id'
const TOKEN_KEY = 'af_token'
// 轮询间隔 15 秒：足够区分 30s 黄条 + 5 分钟阻断；避免本地时间和服务器时间不同步
const POLL_INTERVAL_MS = 15 * 1000

/**
 * 访客会话 Hook：基于 deviceId + 服务器端计时
 * - 服务器下发剩余时间，避免客户端篡改/时钟偏差
 * - 用户登录后自动 bind 绑定当前设备到用户账号
 */
export default function useGuestSession() {
  const { user } = useAuth()
  const [deviceId, setDeviceId] = useState(() => {
    try {
      return localStorage.getItem(DEVICE_ID_KEY) || null
    } catch {
      return null
    }
  })
  // 访客状态机：active（浏览中）| expiring（即将到期黄条）| expired（已过期强制认证）| bound（已登录绑定）
  const [status, setStatus] = useState('active')
  const [remainingSeconds, setRemainingSeconds] = useState(300)
  // 初始加载标记：防止 loading 期间误触发强制认证遮罩
  const [loading, setLoading] = useState(true)

  /**
   * 启动访客会话：POST /api/forum/guest/start
   * 若已存在 deviceId 则带上复用，否则服务器生成新 deviceId 返回
   */
  const start = useCallback(async () => {
    try {
      const res = await fetch('/api/forum/guest/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId || undefined }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.deviceId) {
          setDeviceId(data.deviceId)
          try {
            localStorage.setItem(DEVICE_ID_KEY, data.deviceId)
          } catch {
            // 隐私模式静默失败
          }
          if (typeof data.remainingSeconds === 'number') {
            setRemainingSeconds(data.remainingSeconds)
          }
          if (data.status) {
            setStatus(data.status)
          }
        }
      }
    } catch {
      // 网络异常静默：保持当前本地状态
    }
  }, [deviceId])

  /**
   * 心跳续期：GET /api/forum/guest/ping
   * 拉取最新状态与剩余秒数，与服务器时间对齐
   */
  const ping = useCallback(async () => {
    if (!deviceId) return
    try {
      const url = `/api/forum/guest/ping?device_id=${encodeURIComponent(deviceId)}`
      const res = await fetch(url, { method: 'GET' })
      if (res.ok) {
        const data = await res.json()
        if (data?.status) {
          setStatus(data.status)
        }
        if (typeof data?.remainingSeconds === 'number') {
          setRemainingSeconds(data.remainingSeconds)
        }
      } else if (res.status === 403 || res.status === 410) {
        // 设备会话已过期
        setStatus('expired')
        setRemainingSeconds(0)
      }
    } catch {
      // 网络异常静默
    }
  }, [deviceId])

  /**
   * 登录后绑定设备：POST /api/forum/guest/bind
   * 带 Authorization 头，后端根据 deviceId 更新 guest 会话关联到当前 userId
   */
  const bind = useCallback(async (userId) => {
    if (!userId || !deviceId) return
    try {
      let token = null
      try {
        token = localStorage.getItem(TOKEN_KEY)
      } catch {
        token = null
      }
      const headers = { 'Content-Type': 'application/json' }
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }
      const res = await fetch('/api/forum/guest/bind', {
        method: 'POST',
        headers,
        body: JSON.stringify({ deviceId }),
      })
      if (res.ok) {
        setStatus('bound')
      }
    } catch {
      // 绑定失败静默：不影响正常登录态使用
    }
  }, [deviceId])

  /**
   * useEffect 1：初始化
   * - user 已登录 → 先自动 bind，跳过计时，直接结束 loading
   * - 未登录无 deviceId → start() 拉取新会话
   * - 未登录有 deviceId → ping 一次同步服务器状态
   */
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      if (user?.id) {
        await bind(user.id)
        if (!cancelled) {
          setStatus('bound')
          setLoading(false)
        }
        return
      }
      if (!deviceId) {
        await start()
      } else {
        await ping()
      }
      if (!cancelled) {
        setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * useEffect 2：每 15 秒轮询 ping
   * 仅在未登录、未 bound、未 expired 时有效
   * 卸载或依赖变化必须清理定时器，防止内存泄漏
   */
  useEffect(() => {
    if (user || status === 'bound' || status === 'expired') return undefined
    if (!deviceId) return undefined
    const timer = setInterval(() => {
      ping()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [deviceId, status, user?.id, ping])

  /**
   * useEffect 3：监听 user.id 变化
   * user 刚从 null → truthy（登录成功）时，调用 bind 绑定会话
   */
  useEffect(() => {
    if (user?.id && deviceId && status !== 'bound') {
      bind(user.id)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return { deviceId, status, remainingSeconds, loading, bind, start, ping }
}
