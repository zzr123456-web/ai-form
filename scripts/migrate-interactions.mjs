/**
 * 线上数据库迁移脚本：新增点赞/收藏关联表及配套索引
 * 与 db/schema.sql 第 10/11 张表 + 新增索引保持一致
 * 全部使用 CREATE ... IF NOT EXISTS，可重复执行（幂等）
 * 执行方式：npm run db:migrate-interactions（在 package.json scripts 中定义）
 */
import { query, pool } from '../db/pool.js'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
  console.log('🚀 开始迁移：新增点赞/收藏关联表及索引...')

  const statements = [
    /* 10. 帖子点赞关联表 */
    `CREATE TABLE IF NOT EXISTS post_likes (
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (post_id, user_id),
      CONSTRAINT fk_post_likes_post
        FOREIGN KEY (post_id) REFERENCES posts(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_post_likes_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )`,

    /* 11. 帖子收藏关联表 */
    `CREATE TABLE IF NOT EXISTS post_favorites (
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (post_id, user_id),
      CONSTRAINT fk_post_favorites_post
        FOREIGN KEY (post_id) REFERENCES posts(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_post_favorites_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )`,

    /* 12. 评论点赞关联表 */
    `CREATE TABLE IF NOT EXISTS comment_likes (
      comment_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (comment_id, user_id),
      CONSTRAINT fk_comment_likes_comment
        FOREIGN KEY (comment_id) REFERENCES comments(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_comment_likes_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
    )`,

    /* 按用户维度查询点赞/收藏列表索引 */
    'CREATE INDEX IF NOT EXISTS idx_post_likes_user_id ON post_likes(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_post_favorites_user_id ON post_favorites(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_comment_likes_user_id ON comment_likes(user_id)',
    /* 评论作者索引（用于"我的评论"查询） */
    'CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id)',
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

  console.log('\n🎉 迁移完成！')
  await pool.end()
}

main().catch((err) => {
  console.error('迁移脚本未预期错误:', err)
  process.exit(1)
})
