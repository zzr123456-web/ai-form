import React from 'react'
import { Sparkles, Tag, Wand2 } from 'lucide-react'

const FEATURES = [
  { icon: Sparkles, label: '生成标题' },
  { icon: Tag, label: '推荐标签' },
  { icon: Wand2, label: '润色正文' },
]

export default function AIDraftPanel() {
  const handleFeatureClick = () => {
    alert('该功能敬请期待（阶段二上线）')
  }

  const handleSafetyClick = () => {
    alert('AI 安全边界说明：\n1. 对于医疗、法律等高风险领域，AI 不输出绝对结论，仅提供参考性建议并提示咨询专业人士。\n2. 所有 AI 生成内容均标注来源提示，鼓励用户核实关键信息。\n3. AI 自动处罚功能触发的永久封禁，必须经由人工二次确认后方可生效。')
  }

  return (
    <div className="rounded-af-lg border border-border bg-gradient-to-br from-primary/5 via-primary/0 to-secondary/5 p-4 h-full">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span>✨</span>
          <h2 className="font-bold text-foreground">AI 发帖助手</h2>
        </div>
        <span className="text-[10px] text-afmuted-foreground bg-afmuted/50 px-2 py-0.5 rounded-full">
          阶段二上线
        </span>
      </div>

      <p className="text-xs text-afmuted-foreground mb-5 leading-relaxed">
        AI 辅助你写出结构清晰、标签准确、表达流畅的帖子。
      </p>

      <div className="flex flex-col gap-3 mb-5">
        {FEATURES.map(({ icon: Icon, label }) => (
          <button
            key={label}
            type="button"
            onClick={handleFeatureClick}
            className="relative opacity-70 cursor-pointer inline-flex items-center gap-2 px-3 py-2.5 rounded-af-md border border-border bg-card hover:bg-afmuted/50 transition-colors"
          >
            <Icon className="size-4 text-primary shrink-0" />
            <span className="text-sm font-medium text-foreground">{label}</span>
            <span className="absolute top-1.5 right-2 text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              BETA
            </span>
          </button>
        ))}
      </div>

      <div className="pt-4 border-t border-border/60">
        <p className="text-[11px] text-afmuted-foreground mb-3">
          使用 Deepseek-V4 模型
        </p>
        <button
          type="button"
          onClick={handleSafetyClick}
          className="w-full text-xs text-afmuted-foreground hover:text-foreground underline underline-offset-2 py-1"
        >
          了解 AI 安全边界
        </button>
      </div>
    </div>
  )
}
