/**
 * 迁移脚本：为 users 表添加开发者身份等级列 dev_level
 * 运行：npm run db:migrate-dev-level
 *
 * - dev_level：开发者身份，取值 'junior'（初级AI开发者）/ 'senior'（资深AI开发者）/ NULL（未设置）
 * - 默认 NULL，兼容已存在的老用户
 */
import { query, pool } from '../db/pool.js';

const migrations = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS dev_level TEXT`,
];

async function main() {
  console.log('🚀 开始迁移 users 表：添加 dev_level 列...');
  try {
    for (const sql of migrations) {
      await query(sql);
      const col = sql.match(/ADD COLUMN IF NOT EXISTS (\w+)/)?.[1];
      console.log(`  ✓ ${col}`);
    }
    console.log('✅ users.dev_level 迁移完成');
  } catch (err) {
    console.error('❌ 迁移失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
