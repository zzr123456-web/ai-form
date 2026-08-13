import React from 'react'

/**
 * 头像尺寸映射：严格对齐 Task10 xs=20 sm=28 md=36 lg=80 像素
 */
const SIZE_MAP = {
  xs: 'w-[20px] h-[20px] text-[10px]',
  sm: 'w-[28px] h-[28px] text-xs',
  md: 'w-[36px] h-[36px] text-sm',
  lg: 'w-[80px] h-[80px] text-xl',
}

/**
 * 8 种主题色背景数组（朱红/赭黄/森林绿/墨蓝/灰/紫/青/棕）
 * 从 tailwind.config.js 中提取的作品集主题色，保证整体视觉一致，无 hex 硬编码
 */
const BG_COLORS = [
  'bg-vermilion text-white',
  'bg-ochre text-white',
  'bg-forest text-white',
  'bg-inkblue text-white',
  'bg-muted text-white',
  'bg-violet text-white',
  'bg-teal text-white',
  'bg-brown text-white',
]

/**
 * 简易 hashCode：将字符串映射为稳定整数
 * 同昵称每次渲染得到相同 hashCode，保证头像颜色稳定（避免每次渲染随机变色）
 */
function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

/**
 * 提取显示字符：中文取第一个字符，英文取首字母并大写
 * 空字符串兜底为 '?'
 */
function extractDisplayChar(text) {
  if (!text || typeof text !== 'string' || text.trim() === '') return '?'
  const trimmed = text.trim()
  const firstChar = trimmed.charAt(0)
  // ASCII 字母转大写，中文/其他字符原样返回
  return /^[a-zA-Z]$/.test(firstChar) ? firstChar.toUpperCase() : firstChar
}

/**
 * 头像组件
 * 用 hashCode 分散背景色：同昵称映射相同颜色，保证跨页面渲染一致
 * @param {string} text 昵称/文本（用于取首字与 hashCode 取色）
 * @param {string} size xs|sm|md|lg
 */
export default function Avatar({ text = '', size = 'sm', className = '' }) {
  const sizeCls = SIZE_MAP[size] || SIZE_MAP.sm
  const displayChar = extractDisplayChar(text)
  // 用 text 的 hashCode 映射到 BG_COLORS 数组索引，空文本用默认灰色
  const bgCls = text && text.trim() !== ''
    ? BG_COLORS[hashCode(text.trim()) % BG_COLORS.length]
    : 'bg-afmuted text-afmuted-foreground'

  return (
    <div
      className={`shrink-0 rounded-full flex items-center justify-center font-medium ${sizeCls} ${bgCls} ${className}`}
      aria-label={text ? `用户头像 ${text}` : '用户头像'}
    >
      {displayChar}
    </div>
  )
}
