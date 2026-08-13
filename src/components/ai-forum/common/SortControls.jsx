import React from 'react'

/**
 * 分段排序控件
 * @param {Array<{key:string,label:string}>} options
 * @param {string} value 当前选中 key
 * @param {(key)=>void} onChange
 */
export default function SortControls({ options = [], value, onChange, className = '' }) {
  return (
    <div className={`inline-flex items-center rounded-af-lg border border-border bg-card p-1 ${className}`}>
      {options.map((opt) => {
        const active = opt.key === value
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange && onChange(opt.key)}
            className={`px-3 py-1.5 rounded-af-md text-sm font-medium transition-colors ${
              active
                ? 'bg-secondary text-secondary-foreground'
                : 'text-afmuted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
