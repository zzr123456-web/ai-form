import React, { useState } from 'react'
import { ArrowBigUp, ArrowBigDown } from 'lucide-react'

/**
 * 投票组件（用于 AI 答疑社区回答）
 */
export default function VoteButton({ initialScore = 0 }) {
  const [score, setScore] = useState(initialScore)
  const [vote, setVote] = useState(0) // 1 已赞, -1 已踩, 0 未投

  const handleUp = () => {
    if (vote === 1) { setVote(0); setScore((s) => s - 1) }
    else if (vote === -1) { setVote(1); setScore((s) => s + 2) }
    else { setVote(1); setScore((s) => s + 1) }
  }
  const handleDown = () => {
    if (vote === -1) { setVote(0); setScore((s) => s + 1) }
    else if (vote === 1) { setVote(-1); setScore((s) => s - 2) }
    else { setVote(-1); setScore((s) => s - 1) }
  }

  const iconCls = (active) => `size-5 transition-colors ${active ? 'text-foreground' : 'text-afmuted-foreground hover:text-foreground'}`

  return (
    <div className="flex flex-col items-center gap-0.5">
      <button type="button" onClick={handleUp} aria-label="赞同" className="p-1 hover:bg-afmuted rounded-af-md transition-colors">
        <ArrowBigUp className={iconCls(vote === 1)} fill={vote === 1 ? 'currentColor' : 'none'} />
      </button>
      <span className="text-xs font-semibold tabular-nums text-foreground">{score}</span>
      <button type="button" onClick={handleDown} aria-label="反对" className="p-1 hover:bg-afmuted rounded-af-md transition-colors">
        <ArrowBigDown className={iconCls(vote === -1)} fill={vote === -1 ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}
