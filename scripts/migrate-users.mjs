/**
 * 迁移脚本：为 users 表添加注册功能所需的列
 * 运行：npm run db:migrate-users
 *
 * 背景：初始 schema 缺少 email、created_at、updated_at 列，
 * 导致 handleRegister 的 INSERT 语句因列不存在而报错。
 * 使用 ALTER TABLE ... ADD COLUMN IF NOT EXISTS 保证幂等。
 */
import { query, pool } from '../db/pool.js';

const migrations = [
  // email：注册时使用的邮箱
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`,
  // created_at：注册时间，默认当前时间
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  // updated_at：更新时间，默认当前时间
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
];

async function main() {
  console.log('🚀 开始迁移 users 表...');
  try {
    for (const sql of migrations) {
      await query(sql);
      console.log(`  ✓ ${sql.split('ADD COLUMN IF NOT EXISTS')[1].split(' ')[1]}`);
    }
    console.log('✅ users 表迁移完成');
  } catch (err) {
    console.error('❌ 迁移失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
