/**
 * PostgreSQL 连接池模块
 * 统一管理数据库连接，供 scripts 与 server 端复用
 */
import dotenv from 'dotenv'
import { Pool } from 'pg'

// 加载项目根目录 .env 中的环境变量
dotenv.config()

const connectionString = process.env.DATABASE_URL

// 缺失 DATABASE_URL 时仅警告，不 crash（允许前端独立开发期运行）
if (!connectionString) {
  console.error('⚠️ 未配置 DATABASE_URL，数据库相关功能将不可用')
}

// 创建连接池：空闲 30s 回收，最大 10 个并发连接
const pool = new Pool({
  connectionString,
  idleTimeoutMillis: 30000,
  max: 10,
})

// 监听连接池级未预期错误，防止进程因单条连接异常而退出
pool.on('error', (err) => {
  console.error('数据库连接池发生未预期错误:', err.message)
})

// 绑定 query 方法，便于按需 import { query } 使用
export const query = (text, params) => pool.query(text, params)

/**
 * 健康检查：执行简单查询验证数据库连通性
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function healthCheck() {
  try {
    await pool.query('SELECT 1')
    return { ok: true, message: '数据库连接正常' }
  } catch (err) {
    return { ok: false, message: err.message }
  }
}

export { pool }
export default pool
