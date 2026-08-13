/**
 * AI 辅助论坛 · 工具函数
 */

/**
 * 相对时间格式化
 * 分档规则：<60s 刚刚、<1h 分钟前、<1d 小时前、其他 mm-dd 日期
 * 使用 Date.now() 保证真实相对时间展示
 */
export function formatRelativeTime(isoStr) {
  if (!isoStr) return ''
  const dt = new Date(isoStr)
  const diffMs = Date.now() - dt.getTime()
  // 兜底 sec<0：防止用户本地时钟偏差（如比服务器快）导致负秒数
  const sec = Math.max(0, Math.floor(diffMs / 1000))
  if (sec < 60) return '刚刚'
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`
  // 超过 1 天：格式化为 mm-dd，补齐两位数保证展示一致性
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${m}-${d}`
}

/**
 * 数字格式化
 * 规则：<1000 原数字；1000~9999 保留一位小数 + 'k'；≥10000 保留一位小数 + 'w'
 * 用 toFixed(1) 保留一位小数：兼顾精度与展示紧凑，避免 1.0k 太长 / 1k 又缺精度
 * 非数字/NaN 兜底返回 '0'
 */
export function formatNumber(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '0'
  if (n < 1000) return String(n)
  if (n < 10000) return (n / 1000).toFixed(1) + 'k'
  return (n / 10000).toFixed(1) + 'w'
}

/** 秒数格式化为 mm:ss */
export function formatTimer(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * 字符串截断（摘要兜底使用，即便有 CSS line-clamp 也提供 JS 层保证）
 * text 非字符串时兜底返回空字符串
 */
export function truncateText(text, maxLen = 120) {
  if (typeof text !== 'string') return ''
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text
}

/**
 * 旧版截断函数，兼容已有调用
 * @deprecated 推荐使用 truncateText
 */
export function truncate(str, len = 80) {
  if (!str) return ''
  return str.length > len ? str.slice(0, len) + '…' : str
}

/**
 * 涨跌百分比格式化（供后台指标卡使用）
 * 正数前加 + 号；负数保留 - 号；0 显示 ±0.0%
 */
export function formatCountDiff(delta) {
  const d = Number(delta)
  if (Number.isNaN(d)) return '±0.0%'
  if (d > 0) return '+' + d.toFixed(1) + '%'
  if (d < 0) return d.toFixed(1) + '%'
  return '±0.0%'
}

/** 根据用户 id 查找用户 */
export function findUser(users, id) {
  return users.find((u) => u.id === id) || null
}

/** 根据版块 id 查找版块 */
export function findBoard(boards, id) {
  return boards.find((b) => b.id === id) || null
}

/** 风险等级文案与样式映射 */
export const riskLevelMap = {
  none:   { label: '无风险',   className: 'text-afmuted-foreground' },
  low:    { label: '低风险',   className: 'text-success' },
  medium: { label: '中风险',   className: 'text-warning' },
  high:   { label: '高风险',   className: 'text-error' },
}

/** 审核状态映射 */
export const modStatusMap = {
  open:      { label: '待处理', className: 'bg-warning-bg text-warning' },
  assigned:  { label: '处理中', className: 'bg-info-bg text-info' },
  resolved:  { label: '已处理', className: 'bg-success-bg text-success' },
  rejected:  { label: '已驳回', className: 'bg-afmuted text-afmuted-foreground' },
}

/** 通知类型图标映射 */
export const notificationIconMap = {
  reply: 'message-square',
  follow: 'user-plus',
  system: 'bell',
  ai_reminder: 'sparkles',
  moderation_result: 'shield-check',
}

/** 来源类型徽章映射 */
export const sourceTypeMap = {
  post:            { label: '站内帖子',   className: 'bg-secondary text-secondary-foreground' },
  comment:         { label: '站内评论',   className: 'bg-secondary text-secondary-foreground' },
  knowledge_item:  { label: '官方知识库', className: 'bg-primary text-primary-foreground' },
  external_web:    { label: '外部信息',   className: 'bg-info-bg text-info' },
}
