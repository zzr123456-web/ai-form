import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Mail, Lock, User, Code2, Globe, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useAuth } from '../AuthProvider.jsx'

export default function AuthModal() {
  const { authModal, closeAuthModal, login, guestStatus, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ nickname: '', email: '', password: '' })

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
   * - 注册模式：使用昵称作为 username（后端同时支持 nickname/handle）
   * - 登录模式：使用邮箱作为 username
   * 注意：login 失败返回 null 时，调用方（AuthProvider）不处理提示，
   * 这里临时使用简单的错误展示（真实产品会有更完善的表单校验反馈）
   */
  const handleSubmit = async (e) => {
    e.preventDefault()
    const username = mode === 'register' ? form.nickname : form.email
    if (!username || !form.password) return
    const result = await login(username, form.password)
    if (!result) {
      // 登录失败：简单重置密码字段，用户可重试
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
            {mode === 'register' ? (
              <Field icon={User} placeholder="昵称" value={form.nickname}
                onChange={(v) => setForm((f) => ({ ...f, nickname: v }))} />
            ) : null}
            <Field icon={Mail} type="email" placeholder="邮箱" value={form.email}
              onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
            <Field icon={Lock} type="password" placeholder="密码" value={form.password}
              onChange={(v) => setForm((f) => ({ ...f, password: v }))} />

            <button type="submit" className="w-full h-10 rounded-af-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              {mode === 'login' ? '登录' : '注册并登录'}
            </button>
          </form>

          <div className="mt-5">
            <div className="flex items-center gap-3 text-xs text-afmuted-foreground my-3">
              <span className="flex-1 h-px bg-border" />第三方登录<span className="flex-1 h-px bg-border" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={login} className="flex items-center justify-center gap-2 h-9 rounded-af-md border border-border bg-card text-sm text-foreground hover:bg-afmuted transition-colors">
                <Code2 className="size-4" /> GitHub
              </button>
              <button type="button" onClick={login} className="flex items-center justify-center gap-2 h-9 rounded-af-md border border-border bg-card text-sm text-foreground hover:bg-afmuted transition-colors">
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
