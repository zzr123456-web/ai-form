import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Mail, Lock, User, Code2, Globe, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useAuth } from '../AuthProvider.jsx'

export default function AuthModal() {
  const { authModal, closeAuthModal, login, register, guestStatus, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ nickname: '', email: '', password: '', devLevel: 'junior' })
  // 异步提交中：防止重复点击
  const [submitting, setSubmitting] = useState(false)
  // 错误提示：展示后端返回的 error 字段
  const [error, setError] = useState('')

  // 弹窗打开或切换 Tab 时清空错误，避免历史错误误导用户
  useEffect(() => {
    setError('')
  }, [authModal.open, mode])

  // 已登录状态下弹窗打开时直接关闭：避免异常状态残留
  useEffect(() => {
    if (isAuthenticated && authModal.open) {
      closeAuthModal()
    }
  }, [isAuthenticated, authModal.open, closeAuthModal])

  useEffect(() => {
    if (authModal.open) {
      const prevOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prevOverflow }
    }
    return undefined
  }, [authModal.open])

  if (!authModal.open) return null

  const forced = guestStatus === 'expired'

  /**
   * 登录/注册表单提交
   * - 注册模式：调用 register(nickname, email, password)，创建新用户后自动登录
   * - 登录模式：调用 login(username=email, password)，邮箱或昵称二选一支持
   * - 结果展示后端返回的 error 文案，便于用户理解失败原因
   */
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    if (mode === 'register') {
      if (!form.nickname || !form.email || !form.password) {
        setSubmitting(false)
        setError('请完善注册信息（昵称、邮箱、密码）')
        return
      }
      const { user, error: regError } = await register({
        nickname: form.nickname,
        email: form.email,
        password: form.password,
        devLevel: form.devLevel,
      })
      setSubmitting(false)
      if (!user) {
        setError(regError || '注册失败，请稍后重试')
        setForm((f) => ({ ...f, password: '' }))
      }
      return
    }

    // 登录模式：优先用邮箱，邮箱为空时降级用昵称
    const username = form.email || form.nickname
    if (!username || !form.password) {
      setSubmitting(false)
      setError('请输入用户名和密码')
      return
    }
    const { user, error: loginError } = await login(username, form.password)
    setSubmitting(false)
    if (!user) {
      setError(loginError || '用户名或密码错误')
      setForm((f) => ({ ...f, password: '' }))
    }
  }

  const goLoginPage = () => {
    closeAuthModal()
    navigate('/forum/login')
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
        onClick={forced ? undefined : closeAuthModal}
        aria-hidden={true}
      />

      <div className="relative w-full max-w-md bg-card border border-border rounded-af-xl shadow-af-3 overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary text-primary-foreground rounded-af-md flex items-center justify-center font-bold text-sm">AF</div>
            <h2 className="font-semibold text-foreground text-lg">登录 / 注册</h2>
          </div>
          {!forced ? (
            <button
              type="button"
              onClick={closeAuthModal}
              className="p-1.5 text-afmuted-foreground hover:text-foreground hover:bg-afmuted rounded-af-md transition-colors"
              aria-label="关闭"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="px-6 pb-6 pt-2">
          {authModal.reason ? (
            <div className={`flex items-start gap-2 rounded-af-lg p-3 mb-4 text-sm ${forced ? 'bg-warning-bg text-warning' : 'bg-info-bg text-info'}`}>
              {forced ? <AlertTriangle className="size-4 shrink-0 mt-0.5" /> : <ShieldCheck className="size-4 shrink-0 mt-0.5" />}
              <span className="text-foreground/90">{authModal.reason}</span>
            </div>
          ) : null}

          <div className="inline-flex items-center rounded-af-lg border border-border bg-background p-1 mb-5 w-full">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 px-4 py-1.5 rounded-af-md text-sm font-medium transition-colors ${
                  mode === m ? 'bg-primary text-primary-foreground' : 'text-afmuted-foreground hover:text-foreground'
                }`}
              >
                {m === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {error ? (
              <div className="flex items-start gap-2 rounded-af-md bg-error-bg p-3 text-sm text-error">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            ) : null}

            {mode === 'register' ? (
              <Field icon={User} placeholder="昵称" value={form.nickname}
                onChange={(v) => setForm((f) => ({ ...f, nickname: v }))} />
            ) : null}
            <Field icon={Mail} type="email" placeholder="邮箱（登录时可用邮箱或昵称）" value={form.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
            <Field icon={Lock} type="password" placeholder="密码" value={form.password}
              onChange={(v) => setForm((f) => ({ ...f, password: v }))} />

            {mode === 'register' ? (
              <div>
                <p className="text-xs text-afmuted-foreground mb-2">请选择您的开发者身份（AI 助手将据此调整回复话术）：</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'junior', title: 'AI 初级开发者', desc: '刚入门 AI 开发，希望回答直白易懂' },
                    { value: 'senior', title: '资深 AI 开发者', desc: '熟悉 AI 技术栈，希望回答专业深入' },
                  ].map((opt) => {
                    const selected = form.devLevel === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, devLevel: opt.value }))}
                        className={`p-2.5 rounded-af-md border text-left transition-colors ${
                          selected
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border bg-card hover:bg-afmuted text-afmuted-foreground'
                        }`}
                      >
                        <p className="text-sm font-medium mb-0.5">{opt.title}</p>
                        <p className="text-[10px] leading-snug opacity-80">{opt.desc}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-10 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '提交中…' : mode === 'login' ? '登录' : '注册并登录'}
            </button>
          </form>

          <div className="mt-5">
            <div className="flex items-center gap-3 text-xs text-afmuted-foreground my-3">
              <span className="flex-1 h-px bg-border" />第三方登录<span className="flex-1 h-px bg-border" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="flex items-center justify-center gap-2 h-9 rounded-af-md border border-border bg-card text-sm text-foreground hover:bg-afmuted transition-colors">
                <Code2 className="size-4" /> GitHub
              </button>
              <button type="button" className="flex items-center justify-center gap-2 h-9 rounded-af-md border border-border bg-card text-sm text-foreground hover:bg-afmuted transition-colors">
                <Globe className="size-4" /> Google
              </button>
            </div>
          </div>

          <button type="button" onClick={goLoginPage} className="mt-4 w-full text-xs text-afmuted-foreground hover:text-foreground transition-colors">
            前往完整登录页 →
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ icon: Icon, type = 'text', placeholder, value, onChange }) {
  return (
    <div className="relative">
      <Icon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-afmuted-foreground pointer-events-none" />
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 pl-9 pr-3 rounded-af-md border border-input bg-background text-sm text-foreground placeholder:text-afmuted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
      />
    </div>
  )
}
