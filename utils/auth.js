/**
 * 认证工具模块
 * - JWT 签发与验证
 * - Redis Session 管理（白名单模式）
 * - bcrypt 密码哈希与验证
 *
 * Session 设计：白名单模式
 * - 登录时创建 session：SET af:session:{userId}:{jti} {token} EX 7d
 * - 验证时检查 session 存在：EXISTS af:session:{userId}:{jti}
 * - 登出时删除 session：DEL af:session:{userId}:{jti}
 * - 支持主动踢人（删除 session 即可使 token 失效）
 * - 支持多设备登录（不同 jti 对应不同 session）
 */
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { redis, isRedisConnected } from '../db/redis.js'

// JWT 密钥：缺失时用 fallback，仅开发环境允许
const JWT_SECRET = process.env.JWT_SECRET || 'dev_fallback_secret'
if (!process.env.JWT_SECRET) {
  console.warn('⚠️ 未配置 JWT_SECRET，使用 fallback 密钥（仅限开发环境）')
}

// JWT 有效期 7 天
const JWT_EXPIRES_IN = '7d'
// Session TTL 与 JWT 同步（秒）：7 天 = 604800 秒
const SESSION_TTL_SEC = 7 * 24 * 3600

/**
 * Session key 生成
 * 格式：af:session:{userId}:{jti}
 * @param {string} userId
 * @param {string} jti JWT ID
 */
function sessionKey(userId, jti) {
  return `af:session:${userId}:${jti}`
}

/**
 * 密码哈希
 * @param {string} plain 明文密码
 * @returns {string} bcrypt 哈希
 */
export function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10)
}

/**
 * 密码验证
 * @param {string} plain 明文密码
 * @param {string} hash bcrypt 哈希
 * @returns {boolean} 是否匹配
 */
export function verifyPassword(plain, hash) {
  if (!hash) return false
  return bcrypt.compareSync(plain, hash)
}

/**
 * 签发 JWT Token
 * payload 包含 userId、nickname、roles，额外注入 jti（唯一标识）
 * @param {Object} payload { userId, nickname, roles }
 * @returns {{ token: string, jti: string }}
 */
export function signToken(payload) {
  const jti = crypto.randomUUID()
  const token = jwt.sign(
    { ...payload, jti },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
  return { token, jti }
}

/**
 * 验证 JWT Token
 * @param {string} token
 * @returns {Object|null} payload 或 null（验证失败）
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

/**
 * 创建 Session（登录时调用）
 * 将 token 存入 Redis，TTL 与 JWT 同步
 * @param {string} userId
 * @param {string} jti
 * @param {string} token
 */
export async function createSession(userId, jti, token) {
  if (!redis || !isRedisConnected()) {
    // Redis 不可用时跳过 session 存储（降级为纯 JWT 验证）
    console.warn('[auth] Redis 不可用，跳过 session 创建')
    return
  }
  try {
    await redis.set(sessionKey(userId, jti), token, 'EX', SESSION_TTL_SEC)
  } catch (err) {
    console.error('[auth] 创建 session 失败:', err.message)
  }
}

/**
 * 验证 Session（每次请求时调用）
 * @param {string} userId
 * @param {string} jti
 * @returns {boolean} session 是否存在
 */
export async function verifySession(userId, jti) {
  if (!redis || !isRedisConnected()) {
    // Redis 不可用时降级为纯 JWT 验证（信任 token 本身）
    return true
  }
  try {
    const exists = await redis.exists(sessionKey(userId, jti))
    return exists === 1
  } catch (err) {
    console.error('[auth] 验证 session 失败:', err.message)
    // 验证失败时降级为信任（避免误踢用户）
    return true
  }
}

/**
 * 销毁 Session（登出时调用）
 * @param {string} userId
 * @param {string} jti
 */
export async function destroySession(userId, jti) {
  if (!redis || !isRedisConnected()) return
  try {
    await redis.del(sessionKey(userId, jti))
  } catch (err) {
    console.error('[auth] 销毁 session 失败:', err.message)
  }
}

export { JWT_EXPIRES_IN, SESSION_TTL_SEC }
