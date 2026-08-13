/**
 * 认证字段迁移脚本
 * 为 users 表添加 password_hash 字段，并为现有用户设置默认密码（123456）
 * 运行：npm run db:migrate
 *
 * 幂等性：ALTER TABLE IF NOT EXISTS + 只更新 password_hash 为 NULL 的行
 */
import bcrypt from 'bcryptjs'
import { query, pool } from '../db/pool.js'

async function main() {
  const startTime = Date.now()
  try {
    console.log('🚀 开始认证字段迁移...')

    // 1. 添加 password_hash 列（IF NOT EXISTS 保证幂等）
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`)
    console.log('✓ users 表已添加 password_hash 列')

    // 2. 为未设置密码的用户生成默认密码哈希（123456）
    // saltRounds=10 平衡安全性与性能
    const defaultHash = bcrypt.hashSync('123456', 10)

    const result = await query(
      `UPDATE users SET password_hash = $1 WHERE password_hash IS NULL`,
      [defaultHash]
    )
    console.log(`✓ 已为 ${result.rowCount} 个用户设置默认密码（123456）`)

    const elapsed = Date.now() - startTime
    console.log('──────────────────────────────')
    console.log(`✅ 认证字段迁移完成，总耗时 ${elapsed}ms`)
  } catch (err) {
    console.error('❌ 迁移失败:', err.message)
    console.error(err.stack)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
