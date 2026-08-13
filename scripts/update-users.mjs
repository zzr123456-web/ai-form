/**
 * 更新脚本：为已有用户补充 email 和 password_hash
 * 运行：npm run db:update-users
 *
 * 背景：线上数据库已有种子用户（通过 init-db + seed-db 导入），
 * 但缺少 email 和 password_hash 列的数据。
 * 此脚本不依赖 mockData.js，直接用 SQL 更新，避免容器中无 src/ 目录的问题。
 */
import { query, pool } from '../db/pool.js';
import bcrypt from 'bcryptjs';

// 默认密码 123456 的 bcrypt 哈希
const DEFAULT_PASSWORD_HASH = bcrypt.hashSync('123456', 10);

// 用户邮箱映射（id → email）
const EMAIL_MAP = {
  'u_alex': 'alex@ai-forum.dev',
  'u_chen': 'mingzhe@ai-forum.dev',
  'u_lin': 'xiaotong@ai-forum.dev',
  'u_wang': 'haoran@ai-forum.dev',
  'u_zhang': 'yuezhang@ai-forum.dev',
  'u_li': 'jingyi@ai-forum.dev',
  'u_zhao': 'zixuan@ai-forum.dev',
  'u_spam': 'spam@ai-forum.dev',
};

async function main() {
  console.log('🚀 开始更新已有用户的 email 和 password_hash...');
  try {
    // 查询所有用户
    const { rows } = await query(`SELECT id, nickname, email, password_hash FROM users`);
    console.log(`  查到 ${rows.length} 个用户`);

    let updated = 0;
    for (const u of rows) {
      const email = EMAIL_MAP[u.id] || `${u.id}@ai-forum.dev`;
      // 仅在字段为空时更新，避免覆盖已注册用户的数据
      const needEmail = !u.email;
      const needPassword = !u.password_hash;

      if (needEmail || needPassword) {
        await query(
          `UPDATE users SET email = COALESCE(email, $2), password_hash = COALESCE(password_hash, $3), updated_at = NOW() WHERE id = $1`,
          [u.id, email, DEFAULT_PASSWORD_HASH]
        );
        updated++;
        console.log(`  ✓ ${u.nickname} (${u.id}) — ${needEmail ? 'email ' : ''}${needPassword ? 'password_hash' : ''}`);
      }
    }

    console.log(`──────────────────────────────`);
    console.log(`✅ 更新完成：${updated}/${rows.length} 个用户已补充 email + password_hash`);
    console.log(`   默认密码：123456`);
  } catch (err) {
    console.error('❌ 更新失败:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
