import React from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, Filter, ArrowUpRight, Calendar } from 'lucide-react'
import EmptyState from '../../../components/ai-forum/common/EmptyState.jsx'

/**
 * 版块管理页 - Phase0 占位骨架
 * 为什么只做占位：版块分区治理规则、版主分配属于 Phase4 职责，当前阶段仅需页面骨架
 * 结构：Header（标题 + 描述）+ FilterBar（占位）+ MainContent（Phase4 空状态卡）
 */
export default function BoardManagePage() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">版块管理</h1>
          <p className="text-sm text-afmuted-foreground mt-1">创建版块、配置治理规则、分配版主与权限</p>
        </div>
      </div>

      {/* FilterBar 占位条 */}
      <div className="bg-card border border-border rounded-af-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="inline-flex items-center gap-2 text-sm text-afmuted-foreground">
            <Filter className="size-4" />
            <span>筛选条件占位</span>
          </div>
          <div className="flex-1 flex flex-wrap gap-2">
            {['版块状态', '治理模式', '版主分配', '帖子数量'].map((label) => (
              <div
                key={label}
                className="h-9 px-3 rounded-af-md border border-dashed border-border bg-background flex items-center gap-2 text-sm text-afmuted-foreground"
              >
                {label}
                <span className="text-afmuted-foreground/50">▾</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MainContent：Phase4 上线 EmptyState */}
      <div className="bg-card border border-border rounded-af-lg overflow-hidden">
        <EmptyState
          icon={LayoutGrid}
          title="Phase4 上线"
          description="版块分区治理规则、版主分配功能 Phase4 交付，敬请期待"
          action={
            <Link
              to="/forum/admin"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-af-md bg-vermilion text-white text-sm font-medium hover:bg-vermilion-light transition-colors"
            >
              <Calendar className="size-4" />
              去了解路线图
              <ArrowUpRight className="size-4" />
            </Link>
          }
        />
      </div>
    </div>
  )
}
