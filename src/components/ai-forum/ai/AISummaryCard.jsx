import React from 'react'

export default function AISummaryCard() {
  const handleGenerateClick = () => {
    alert('该功能敬请期待（阶段二上线）')
  }

  return (
    <div className="rounded-af-lg border border-primary/20 bg-primary/[0.03] p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span>🤖</span>
          <h2 className="font-bold text-foreground">AI 讨论总结</h2>
        </div>
        <span className="text-[10px] text-afmuted-foreground bg-afmuted/50 px-2 py-0.5 rounded-full">
          即将上线
        </span>
      </div>

      <div className="mb-4">
        <div className="h-3 w-4/5 bg-primary/10 rounded animate-pulse mb-2" />
        <div className="h-3 w-full bg-primary/10 rounded animate-pulse mb-2" />
        <div className="h-3 w-3/5 bg-primary/10 rounded animate-pulse" />
      </div>

      <button
        type="button"
        onClick={handleGenerateClick}
        className="w-full opacity-70 cursor-pointer px-4 py-2 rounded-af-md border border-primary/30 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors mb-3"
      >
        生成讨论总结（阶段二）
      </button>

      <p className="text-[11px] text-afmuted-foreground">
        总结将包含主要观点、分歧点、补充信息。
      </p>
    </div>
  )
}
