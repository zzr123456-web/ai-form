/**
 * 阶段一迁移脚本：新增访客会话表、AI 使用日志表及配套索引
 * 与 db/schema.sql 第 13/14 张表 + 新增索引保持一致
 * 全部使用 CREATE ... IF NOT EXISTS，可重复执行（幂等）
 * 执行方式：npm run db:migrate-phase1（在 package.json scripts 中定义）
 */
import { query, pool } from '../db/pool.js'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
  console.log('🚀 开始迁移：阶段一（访客会话 + AI 使用日志）...')

  const statements = [
    /* 13. 访客会话表 */
    `CREATE TABLE IF NOT EXISTS guest_sessions (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL UNIQUE,
      started_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expiring','expired','bound')),
      bound_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      remaining_seconds INTEGER NOT NULL DEFAULT 300,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    /* 14. AI 使用日志表 */
    `CREATE TABLE IF NOT EXISTS ai_usage_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      model TEXT NOT NULL DEFAULT 'deepseek-chat',
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      latency_ms INTEGER DEFAULT 0,
      error_msg TEXT,
      raw_request_truncated TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    /* 访客会话与 AI 使用日志索引 */
    'CREATE INDEX IF NOT EXISTS idx_guest_sessions_device_id ON guest_sessions(device_id)',
    'CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id ON ai_usage_logs(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON ai_usage_logs(created_at)',
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

  console.log('\n🎉 phase1 迁移完成')
  await pool.end()
}

main().catch((err) => {
  console.error('迁移脚本未预期错误:', err)
  process.exit(1)
})
