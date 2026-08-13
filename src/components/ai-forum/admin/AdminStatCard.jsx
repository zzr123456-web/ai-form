import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

/**
 * 后台指标卡：左上图标（圆形背景）+ 右上数字 + 底部涨跌百分比
 * pendingReview 是负向指标：数值减少是好事（绿色），增加是坏事（红色）
 */
export default function AdminStatCard({ icon: Icon, label, value, delta, unit = '', isReverseMetric = false }) {
  const isPositive = delta >= 0
  // 为什么 isReverseMetric：待审核指标越少越好，涨跌色彩与常规相反
  const isGood = isReverseMetric ? !isPositive : isPositive

  return (
    <div className="bg-card border border-border rounded-af-lg p-5 hover:shadow-af-1 transition-shadow">
      <div className="flex items-start justify-between mb-4">
        {/* 左上：圆形图标背景 */}
        <div className={`w-11 h-11 rounded-full flex items-center justify-center ${
          isGood ? 'bg-success-bg' : 'bg-error-bg'
        }`}>
          <Icon className={`size-5 ${isGood ? 'text-success' : 'text-error'}`} />
        </div>
        {/* 右上：涨跌百分比 */}
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-1 rounded-full ${
          isGood ? 'bg-success-bg text-success' : 'bg-error-bg text-error'
        }`}>
          {isPositive ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
          {isPositive ? '+' : ''}{delta}{unit}
        </span>
      </div>
      {/* 下方：数字 + 标签 */}
      <p className="text-2xl font-bold text-foreground tabular-nums mb-1">{value.toLocaleString()}</p>
      <p className="text-xs text-afmuted-foreground">{label}</p>
    </div>
  )
}
