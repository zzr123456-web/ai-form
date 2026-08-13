import React from 'react'
import { Link } from 'react-router-dom'
import { FileX, SearchX } from 'lucide-react'

const ICON_MAP = {
  'no-data': FileX,
  'not-found': SearchX,
}

export default function EmptyState({
  variant = 'no-data',
  icon,
  title = '暂无内容',
  description = '',
  children = null,
  to = '',
}) {
  const Icon = icon || ICON_MAP[variant] || ICON_MAP['no-data']

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
