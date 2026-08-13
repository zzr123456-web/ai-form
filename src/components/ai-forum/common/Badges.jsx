import React from 'react'
import { riskLevelMap, modStatusMap, sourceTypeMap } from '../../../utils/ai-forum/aiForumUtils.js'

/** 风险等级徽章 */
export function RiskBadge({ level = 'none' }) {
  const cfg = riskLevelMap[level] || riskLevelMap.none
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {cfg.label}
    </span>
  )
}

/** 审核状态徽章 */
export function ModStatusBadge({ status = 'open' }) {
  const cfg = modStatusMap[status] || modStatusMap.open
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

/** 来源类型徽章 */
export function SourceTypeBadge({ type = 'post' }) {
  const cfg = sourceTypeMap[type] || sourceTypeMap.post
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

/** AI 徽章（sparkles 图标） */
export function AiBadge({ children = 'AI', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-af-md bg-primary text-primary-foreground px-2 py-0.5 text-xs font-medium ${className}`}>
      <span className="size-1.5 rounded-full bg-primary-foreground/80" />
      {children}
    </span>
  )
}

/** 通用状态徽章 */
export function StatusBadge({ children, tone = 'neutral', className = '' }) {
  const toneCls = {
    neutral: 'bg-secondary text-secondary-foreground',
    success: 'bg-success-bg text-success',
    warning: 'bg-warning-bg text-warning',
    error:   'bg-error-bg text-error',
    info:    'bg-info-bg text-info',
  }[tone]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${toneCls} ${className}`}>
      {children}
    </span>
  )
}
