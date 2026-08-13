import React from 'react'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'

/**
 * 生成显示的页码数组
 * 最多展示 7 页（避免长列表溢出容器，特别是窄屏），超过时用省略号替代
 * 规则：首页、末页始终展示；当前页左右各 2 页；中间缺口用 ...
 */
function buildPageList(current, total) {
  const MAX_VISIBLE = 7
  if (total <= MAX_VISIBLE) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  const pages = []
  // 始终展示第 1 页
  pages.push(1)

  const left = Math.max(2, current - 2)
  const right = Math.min(total - 1, current + 2)

  // 左侧缺口加省略号
  if (left > 2) pages.push('...')

  for (let i = left; i <= right; i++) {
    pages.push(i)
  }

  // 右侧缺口加省略号
  if (right < total - 1) pages.push('...')

  // 始终展示最后一页
  pages.push(total)

  return pages
}

/**
 * 分页组件
 * 当前页用朱红高亮（bg-vermilion），与 Phase0 主题色一致
 * @param {number} current 当前页码
 * @param {number} total 总页数
 * @param {number} page 单页数量（预留扩展，当前用于计算展示）
 * @param {function} onChange 页码变更回调 (pageNum) => void
 */
export default function Pagination({ current = 1, total = 1, page = 10, onChange }) {
  if (total <= 1) return null
  // 最多展示 7 页，中间省略号：避免长列表溢出容器，窄屏尤其重要
  const pageList = buildPageList(current, total)

  const btnBase = 'h-9 min-w-9 px-2 rounded-af-md text-sm font-medium transition-colors flex items-center justify-center'
  const btnNormal = 'text-foreground hover:bg-secondary'
  // 当前页朱红高亮，与作品集强调色体系一致
  const btnActive = 'bg-vermilion text-white'
  const btnDisabled = 'text-afmuted-foreground/40 cursor-not-allowed'
  const btnEllipsis = 'text-afmuted-foreground cursor-default'

  const handlePageClick = (p) => {
    if (p === '...') return
    if (p === current) return
    if (onChange) onChange(p)
  }

  return (
    <nav className="flex items-center justify-center gap-1.5" aria-label="分页">
      <button
        type="button"
        disabled={current <= 1}
        onClick={() => handlePageClick(current - 1)}
        className={`${btnBase} ${current <= 1 ? btnDisabled : btnNormal}`}
        aria-label="上一页"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      {pageList.map((p) => {
        // key 用页码数字/字符串，保证唯一（省略号用固定字符串 'ellipsis'）
        const keyVal = p === '...' ? `ellipsis-${pageList.indexOf(p)}` : p
        if (p === '...') {
          return (
            <span
              key={keyVal}
              className={`${btnBase} ${btnEllipsis}`}
            >
              <MoreHorizontal className="w-4 h-4" />
            </span>
          )
        }
        return (
          <button
            key={keyVal}
            type="button"
            onClick={() => handlePageClick(p)}
            className={`${btnBase} ${p === current ? btnActive : btnNormal}`}
            aria-current={p === current ? 'page' : undefined}
          >
            {p}
          </button>
        )
      })}
      <button
        type="button"
        disabled={current >= total}
        onClick={() => handlePageClick(current + 1)}
        className={`${btnBase} ${current >= total ? btnDisabled : btnNormal}`}
        aria-label="下一页"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  )
}
