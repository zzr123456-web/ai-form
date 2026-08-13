import React from 'react'

/**
 * 尺寸映射
 */
const SIZE_MAP = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-0.5 text-xs',
}

/**
 * 标签药丸组件
 * variant=solid 用朱红填充：Phase0 仅朱红强调色体系，多色标签留 Phase2 主题扩展
 * @param {'sm'|'md'} size 尺寸
 * @param {'solid'|'border'|'ghost'} variant 样式变体
 * @param {boolean} selected 是否选中态
 * @param {function} onClick 点击回调（传了则渲染为 button，否则为 span）
 */
export default function TagPill({
  children,
  variant = 'border',
  size = 'md',
  selected = false,
  className = '',
  onClick,
  ...rest
}) {
  const sizeCls = SIZE_MAP[size] || SIZE_MAP.md

  // variant 样式：选中态优先走 solid 朱红高亮，保证视觉分明
  // Phase0 仅朱红强调色体系（bg-vermilion），多色标签扩展留 Phase2
  let variantCls
  if (selected) {
    variantCls = 'bg-vermilion text-white border border-vermilion'
  } else {
    switch (variant) {
      case 'solid':
        variantCls = 'bg-vermilion text-white border border-vermilion hover:bg-vermilion-light'
        break
      case 'ghost':
        variantCls = 'bg-transparent text-afmuted-foreground border border-transparent hover:text-foreground'
        break
      case 'border':
      default:
        variantCls = 'bg-card text-foreground border border-border hover:border-afmuted hover:bg-afmuted/40'
        break
    }
  }

  const Tag = onClick ? 'button' : 'span'
  const typeAttr = onClick ? { type: 'button' } : {}

  return (
    <Tag
      className={`inline-flex items-center gap-1 rounded-full font-medium transition-all ${sizeCls} ${variantCls} ${className}`}
      onClick={onClick}
      {...typeAttr}
      {...rest}
    >
      {children}
    </Tag>
  )
}
