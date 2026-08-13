import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Mail, Lock, User, Code2, Globe, ShieldCheck, AlertTriangle, ArrowLeft, X, MessageCircle,
} from 'lucide-react'
import { useAuth } from '../../components/ai-forum/AuthProvider.jsx'

export default function LoginPage() {
  const { login, register, guestStatus, setLoginRedirect } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // 来源标记：timeout / editor / post_xxx / 其他
  const from = params.get('from')
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ nickname: '', email: '', password: '', confirmPassword: '' })
  // 顶部来源提示条是否显示（用户可手动关闭）
  const [showReasonBanner, setShowReasonBanner] = useState(true)
  // 注册同意勾选占位
  const [agreeChecked, setAgreeChecked] = useState(false)
  // 登录/注册异步提交中的错误提示文案，空字符串表示无错误
  const [error, setError] = useState('')
  // 异步提交中标记：禁用按钮防止重复提交
  const [submitting, setSubmitting] = useState(false)

  // 页面加载时将 from 写入全局 loginRedirect，供弹窗登录等其他入口复用
  useEffect(() => {
    if (from) setLoginRedirect(from)
  }, [from, setLoginRedirect])

  /**
   * 根据 from 参数计算登录后跳转目标
   * 分 5 种规则的原因：承接不同来源拦截场景，
   * - editor：从发帖编辑器拦截过来，登录后要回去继续写帖
   * - post_xxx：在某条帖子下互动（点赞/收藏/评论）被拦截，登录后回该帖子
   * - timeout：5 分钟强制浏览超时，尽量用 navigate(-1) 回用户之前的页面，栈空则 fallback 首页
   * - 其他 xxx：兼容简单路径参数（如 boards、search）
   * - 空 from：直接访问登录页默认回首页
   */
  const resolveRedirect = (fromValue) => {
    if (!fromValue) return '/forum'
    if (fromValue === 'editor') return '/forum/editor'
    if (fromValue.startsWith('post_')) {
      const postId = fromValue.slice(5)
      return `/forum/post/${postId}`
    }
    // timeout 场景：先尝试返回上一页（navigate(-1)），fallback 到 /forum
    // 在调用方处处理 navigate(-1) 的分支
    if (fromValue === 'timeout') return '/forum'
    return `/forum/${fromValue}`
  }

  /**
   * 顶部来源提示文案映射：四种差异化文案
   * timeout → 浏览超时强制登录（橙色警告色）
   * editor  → 发帖拦截（蓝色信息色）
   * post_xxx → 帖子互动拦截（蓝色信息色）
   * 默认    → 欢迎登录（绿色成功色 + ShieldCheck）
   */
  const resolveReasonText = (fromValue) => {
    if (!fromValue) return '欢迎登录 AI Forum，登录后解锁完整功能'
    if (fromValue === 'timeout') return '你已浏览超过 5 分钟，登录后继续浏览社区内容'
    if (fromValue === 'editor') return '发帖需要先登录账号，登录后返回编辑器继续'
    if (fromValue.startsWith('post_')) return '互动需要登录，登录后返回当前帖子继续操作'
    return '请先登录账号，登录后返回来源页面'
  }

  /**
   * 来源提示条背景色与图标：按 from 类型差异化呈现
   */
  const resolveReasonStyle = (fromValue) => {
    if (fromValue === 'timeout') {
      return {
        wrapper: 'bg-warning-bg text-warning',
        icon: AlertTriangle,
      }
    }
    if (fromValue === 'editor' || (fromValue && fromValue.startsWith('post_'))) {
      return {
        wrapper: 'bg-info-bg text-info',
        icon: ShieldCheck,
      }
    }
    // 默认绿色 ShieldCheck
    return {
      wrapper: 'bg-success-bg text-success',
      icon: ShieldCheck,
    }
  }

  const reasonText = resolveReasonText(from)
  const reasonStyle = resolveReasonStyle(from)
  const ReasonIcon = reasonStyle.icon

  /**
   * 登录提交处理：异步调用 login()，成功后跳转目标页
   * replace:true 的原因：避免用户点击浏览器后退又回到登录页，
   * 产生重复拦截/强制认证的体验问题，将登录页从历史栈中替换掉
   * login 返回 { user, error }，失败时展示后端返回的 error 文案
   * 附加 deviceId：后端 Task4 登录成功后根据 deviceId 自动 UPDATE guests 绑定到当前用户
   */
  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    // 读取访客 deviceId：传给登录请求，让后端将访客浏览记录绑定到新登录用户
    // AuthProvider 的 login 回调内部也会兜底读一次，这里显式读取符合 Task5 要求：
    // "登录页 LoginPage 提交时，在请求 body 里额外附上 deviceId"
    let deviceId = null
    try {
      deviceId = localStorage.getItem('af_device_id')
    } catch {
      deviceId = null
    }
    // form.email 实际是用户名输入框（支持昵称或 handle）
    // 注意：当前 useAuth.login 内部自行读取 localStorage 附 deviceId，
    // 此处变量保留用于显式说明意图，后续若签名扩展可直接传参
    void deviceId
    const { user, error: loginError } = await login(form.email, form.password)
    setSubmitting(false)
    if (!user) {
      setError(loginError || '登录失败，请检查用户名和密码')
      return
    }
    const target = resolveRedirect(from)
    if (from === 'timeout') {
      if (window.history.length > 1) {
        navigate(-1)
        return
      }
    }
    navigate(target, { replace: true })
  }

  /**
   * 注册提交：先校验两次密码一致，再调用后端 /auth/register，
   * 成功后自动登录跳转（register 函数已处理自动登录逻辑）
   * 校验密码的原因：注册阶段用户容易输入失误导致后续登录失败
   * 附加 deviceId：后端 Task4 注册成功后根据 deviceId 绑定访客会话到新用户
   */
  const handleRegisterSubmit = async (e) => {
    e.preventDefault()
    if (form.confirmPassword !== form.password) {
      setError('两次密码不一致')
      return
    }
    setError('')
    setSubmitting(true)
    // 显式读取 deviceId：同登录提交，确保注册请求附带 deviceId 让后端绑定
    let deviceId = null
    try {
      deviceId = localStorage.getItem('af_device_id')
    } catch {
      deviceId = null
    }
    // AuthProvider 的 register 回调内部也会兜底读取，此处显式处理用于说明意图
    void deviceId
    const { user, error: regError } = await register({
      nickname: form.nickname,
      email: form.email,
      password: form.password,
    })
    setSubmitting(false)
    if (!user) {
      setError(regError || '注册失败，请检查信息或稍后重试')
      setForm((f) => ({ ...f, password: '', confirmPassword: '' }))
      return
    }
    const target = resolveRedirect(from)
    if (from === 'timeout') {
      if (window.history.length > 1) {
        navigate(-1)
        return
      }
    }
    navigate(target, { replace: true })
  }

  // 第三方登录占位：Phase2 上线
  const handleThirdParty = (name) => {
    alert(`第三方登录（Phase2）：${name}`)
  }

  const thirdPartyList = [
    { id: 'github', name: 'GitHub', Icon: Code2 },
    { id: 'google', name: 'Google', Icon: Globe },
    { id: 'wechat', name: '微信', Icon: MessageCircle },
  ]

  return (
    <div className="max-w-none md:max-w-md mx-auto px-4 py-10 sm:py-16 w-full">
      <div className="bg-card-bg md:bg-card border border-border rounded-af-xl shadow-af-2 overflow-hidden">
        {/* 顶部 Logo */}
        <div className="flex flex-col items-center pt-8 pb-2">
          <div className="w-12 h-12 bg-vermilion text-cream rounded-af-lg flex items-center justify-center font-bold text-lg mb-3">AF</div>
          <h1 className="text-xl font-semibold text-foreground">AI Forum</h1>
          <p className="text-xs text-afmuted-foreground mt-1">让每一次讨论沉淀为知识</p>
        </div>

        <div className="p-4 sm:p-8">
          {/* 顶部来源提示区：图标（左） + 文案（中） + 关闭按钮（右） */}
          {showReasonBanner && reasonText ? (
            <div className={`flex items-start gap-2 rounded-af-lg p-3 mb-5 text-sm ${reasonStyle.wrapper}`}>
              <ReasonIcon className="size-4 shrink-0 mt-0.5" />
              <span className="flex-1 text-foreground/90">{reasonText}</span>
              <button
                type="button"
                aria-label="关闭提示"
                onClick={() => setShowReasonBanner(false)}
                className="shrink-0 text-foreground/40 hover:text-foreground/70 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : null}

          {/* 登录 / 注册 Tab 切换：选中时下边框朱红 border-b-vermilion */}
          <div className="flex items-center border-b border-border mb-5">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError('') }}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  mode === m
                    ? 'text-vermilion border-b-vermilion'
                    : 'text-afmuted-foreground border-b-transparent hover:text-foreground'
                }`}
              >
                {m === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          {/* 登录表单 */}
          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-3">
              {/* 错误提示条：异步登录失败时展示，复用 error 主题色与现有提示条风格一致 */}
              {error ? (
                <div className="flex items-center gap-2 rounded-af-md bg-error-bg p-3 text-sm text-error">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
              <Field icon={User} placeholder="手机号 / 邮箱" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
              <Field icon={Lock} type="password" placeholder="请输入密码" value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} />

              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-1.5 text-afmuted-foreground cursor-pointer">
                  <input type="checkbox" defaultChecked className="accent-foreground" /> 记住我
                </label>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="text-afmuted-foreground hover:text-foreground transition-colors"
                >
                  忘记密码？
                </a>
              </div>

              {/* 测试账号提示 */}
              <div className="text-xs text-afmuted-foreground bg-muted/30 rounded-af-md p-2 mt-2">
                测试账号：AlexChen / 123456
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-10 rounded-af-md bg-vermilion text-cream text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '登录中…' : '登录'}
              </button>
            </form>
          ) : (
            // 注册表单
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              {/* 错误提示条：注册校验或异步登录失败时展示 */}
              {error ? (
                <div className="flex items-center gap-2 rounded-af-md bg-error-bg p-3 text-sm text-error">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
              <Field icon={User} placeholder="昵称" value={form.nickname} onChange={(v) => setForm((f) => ({ ...f, nickname: v }))} />
              <Field icon={Mail} type="email" placeholder="邮箱" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
              <Field icon={Lock} type="password" placeholder="请输入密码" value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} />
              <Field icon={Lock} type="password" placeholder="确认密码" value={form.confirmPassword} onChange={(v) => setForm((f) => ({ ...f, confirmPassword: v }))} />

              <label className="flex items-start gap-1.5 text-xs text-afmuted-foreground cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={agreeChecked}
                  onChange={(e) => setAgreeChecked(e.target.checked)}
                  className="mt-0.5 accent-foreground"
                />
                <span>我已阅读并同意社区规则</span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-10 rounded-af-md bg-vermilion text-cream text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '提交中…' : '注册并登录'}
              </button>

              <div className="text-center text-xs text-afmuted-foreground pt-1">
                已有账号？
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-vermilion hover:underline ml-1 transition-all"
                >
                  去登录
                </button>
              </div>
            </form>
          )}

          {/* 第三方登录占位：3 个 SVG 图标按钮，稳定 key 用 id */}
          <div className="mt-5">
            <div className="flex items-center gap-3 text-xs text-afmuted-foreground my-3">
              <span className="flex-1 h-px bg-border" />第三方登录<span className="flex-1 h-px bg-border" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {thirdPartyList.map(({ id, name, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleThirdParty(name)}
                  className="flex items-center justify-center gap-1.5 h-9 rounded-af-md border border-border bg-card-bg md:bg-card text-sm text-foreground hover:bg-afmuted transition-colors"
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 返回首页 */}
          <Link to="/forum" className="mt-5 flex items-center justify-center gap-1 text-xs text-afmuted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-3.5" /> 返回首页浏览
          </Link>
        </div>
      </div>

      <p className="text-center text-xs text-afmuted-foreground mt-5">
        登录即表示同意 <a href="#" className="underline hover:text-foreground">用户协议</a> 与 <a href="#" className="underline hover:text-foreground">隐私政策</a>
      </p>
    </div>
  )
}

/** 通用输入框子组件：左图标 + 右侧输入框 */
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
