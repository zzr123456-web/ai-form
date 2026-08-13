import React from 'react'
import { Link } from 'react-router-dom'
import { FileX, SearchX } from 'lucide-react'

/**
 * variant 与图标映射
 */
const ICON_MAP = {
  'no-data': FileX,
  'not-found': SearchX,
}

/**
 * 空状态组件
 * @param {'no-data'|'not-found'} variant 变体：no-data=无数据 FileX；not-found=404 SearchX
 * @param {string} title 主标题
 * @param {string} description 描述文案
 * @param {React.ReactNode} children 自定义 CTA 区域（按钮等）
 * @param {string} to 可选：提供 Link 跳转路径，children 作为链接内容
 */
export default function EmptyState({
  variant = 'no-data',
  title = '暂无内容',
  description = '',
  children = null,
  to = '',
}) {
  const Icon = ICON_MAP[variant] || ICON_MAP['no-data']

  // CTA 渲染：to 优先走 Link 跳转，否则直接渲染 children
  const renderCta = () => {
    if (!children) return null
    if (to) {
      return (
        <div className="mt-4">
          <Link to={to}>{children}</Link>
        </div>
      )
    }
    return <div className="mt-4">{children}</div>
  }

  return (
    <div className="w-full flex flex-col items-center justify-center text-center py-16 px-4">
      <Icon className="w-10 h-10 text-afmuted-foreground/60 mb-3" strokeWidth={1.5} />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="text-xs text-afmuted-foreground mt-1.5 max-w-xs">{description}</p>
      ) : null}
      {renderCta()}
    </div>
  )
}
