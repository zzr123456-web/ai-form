/**
 * 阶段四迁移脚本：内容审核相关表 + 帖子/评论/板块状态字段补充
 * - 新增 moderation_cases（审核工单）、reports（用户举报）两张表及配套索引
 * - 为 posts/comments/boards 补充风险等级与状态字段（幂等）
 * 全部使用 CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS，可重复执行
 * 执行方式：npm run db:migrate-phase4（在 package.json scripts 中定义）
 */
import { query, pool } from '../db/pool.js'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
  console.log('🚀 开始迁移：阶段四（内容审核 + 状态字段补充）...')

  const statements = [
    /* 15. 审核工单表（记录人工/自动审核任务及处置结果） */
    `CREATE TABLE IF NOT EXISTS moderation_cases (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      risk_type TEXT,
      risk_level TEXT DEFAULT 'none',
      status TEXT DEFAULT 'open',
      assignee_id TEXT,
      resolution_note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )`,

    /* 16. 用户举报表（记录针对帖子/评论等内容的举报） */
    `CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    /* 帖子审核字段：风险等级 + 审核状态
       注：posts 已存在 risk_level 列，IF NOT EXISTS 保证幂等不报错 */
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'none'`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'normal'`,

    /* 评论审核字段：风险等级 + 发布状态 */
    `ALTER TABLE comments ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'none'`,
    `ALTER TABLE comments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published'`,

    /* 板块状态字段：用于板块级启用/停用 */
    `ALTER TABLE boards ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`,

    /* 审核工单与举报索引（覆盖按状态/风险等级筛选的查询路径） */
    'CREATE INDEX IF NOT EXISTS idx_moderation_cases_status ON moderation_cases(status)',
    'CREATE INDEX IF NOT EXISTS idx_moderation_cases_risk_level ON moderation_cases(risk_level)',
    'CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)',
  ]

  for (const sql of statements) {
    try {
      await query(sql)
      const name = sql.split(' ').slice(0, 3).join(' ')
      console.log(`✅ ${name} ... 执行成功`)
    } catch (err) {
      console.error(`❌ 执行失败: ${err.message}`)
      console.error(`   SQL: ${sql.slice(0, 120)}...`)
      process.exit(1)
    }
  }

  console.log('\n🎉 phase4 迁移完成')
  await pool.end()
}

main().catch((err) => {
  console.error('迁移脚本未预期错误:', err)
  process.exit(1)
})
