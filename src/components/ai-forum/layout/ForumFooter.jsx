import React from 'react'
import { Link } from 'react-router-dom'

const QUICK_LINKS = [
  { label: '首页', to: '/forum' },
  { label: '版块', to: '/forum/boards' },
  { label: '答疑', to: '/forum/qa' },
  { label: '搜索', to: '/forum/search' },
]

export default function ForumFooter() {
  return (
    <footer className="border-t border-border bg-background mt-auto">
      <div className="max-w-6xl mx-auto px-4 max-[600px]:px-2 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-afmuted-foreground">
              © 2026 AI Forum · 让每一次讨论都沉淀为可被发现的知识
            </p>
          </div>

          <nav aria-label="快速导航" className="flex items-center gap-1 sm:gap-4">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-sm text-afmuted-foreground hover:text-foreground transition-colors px-2 sm:px-0"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-sm text-afmuted-foreground hover:text-foreground transition-colors"
            >
              社区规则
            </a>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="text-sm text-afmuted-foreground hover:text-foreground transition-colors"
            >
              关于我们
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
