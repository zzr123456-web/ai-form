/**
 * 阶段二迁移脚本：新增提问 / AI 答案 / 引用来源 / 知识库表及配套索引
 * 与 db/schema.sql 第 15-18 张表 + 新增索引保持一致
 * 全部使用 CREATE ... IF NOT EXISTS，可重复执行（幂等）
 * 执行方式：npm run db:migrate-phase2（在 package.json scripts 中定义）
 */
import { query, pool } from '../db/pool.js'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
  console.log('🚀 开始迁移：阶段二（提问 / AI 答案 / 引用来源 / 知识库）...')

  const statements = [
    /* 15. 提问表：user_id 级联删除，避免用户注销后遗留孤儿问题 */
    `CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      content TEXT,
      source_mode TEXT DEFAULT 'site_only',
      status TEXT DEFAULT 'submitted',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    /* 16. AI 答案表：question_id 级联删除，问题删除时答案随之清理 */
    `CREATE TABLE IF NOT EXISTS ai_answers (
      id TEXT PRIMARY KEY,
      question_id TEXT REFERENCES questions(id) ON DELETE CASCADE,
      content TEXT,
      safety_label TEXT DEFAULT 'normal',
      citation_ids TEXT[] DEFAULT '{}',
      generated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    /* 17. 引用来源表：answer_id 级联删除，答案删除时引用明细一并清理 */
    `CREATE TABLE IF NOT EXISTS source_citations (
      id TEXT PRIMARY KEY,
      answer_id TEXT REFERENCES ai_answers(id) ON DELETE CASCADE,
      source_type TEXT,
      source_id TEXT,
      title TEXT,
      url TEXT,
      excerpt TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    /* 18. 知识库条目表：updated_at 与 created_at 分离，便于追踪维护时间 */
    `CREATE TABLE IF NOT EXISTS knowledge_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      tags TEXT[] DEFAULT '{}',
      status TEXT DEFAULT 'active',
      updated_by TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    /* Phase 2 索引：覆盖按用户查问、按问题查答案、按答案查引用、按状态筛知识库 */
    'CREATE INDEX IF NOT EXISTS idx_questions_user_id ON questions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ai_answers_question_id ON ai_answers(question_id)',
    'CREATE INDEX IF NOT EXISTS idx_source_citations_answer_id ON source_citations(answer_id)',
    'CREATE INDEX IF NOT EXISTS idx_knowledge_items_status ON knowledge_items(status)',
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

  console.log('\n🎉 phase2 迁移完成')
  await pool.end()
}

main().catch((err) => {
  console.error('迁移脚本未预期错误:', err)
  process.exit(1)
})
