/**
 * Redis 连接与缓存工具
 * 基于 ioredis，提供缓存读写与批量删除能力
 * 缺失 REDIS_URL 时降级为无缓存模式（不 crash）
 */
import dotenv from 'dotenv'
import Redis from 'ioredis'

dotenv.config()

// 连接状态：启动后由 healthCheckRedis 设置
let redisConnected = false

// 缺失连接串时仅告警，允许服务继续运行（降级为直查 DB）
const redisUrl = process.env.REDIS_URL
if (!redisUrl) {
  console.warn('⚠️ 未配置 REDIS_URL，缓存层已降级（所有请求直查数据库）')
}

// 创建 Redis 客户端；maxRetriesPerRequest: 3 避免无限重试阻塞请求
const redis = redisUrl
  ? new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    })
  : null

if (redis) {
  redis.on('connect', () => {
    redisConnected = true
    console.log('✅ Redis 已连接')
  })
  redis.on('error', (err) => {
    // 连接错误不 crash，仅标记断开
    redisConnected = false
    console.error('⚠️ Redis 连接错误:', err.message)
  })
  redis.on('reconnecting', () => {
    console.log('🔄 Redis 重连中...')
  })
}

/** 获取 Redis 连接状态 */
export function isRedisConnected() {
  return redisConnected
}

/**
 * 获取缓存：返回 JSON 解析后的对象，未命中或 Redis 不可用时返回 null
 * @param {string} key 缓存键
 * @returns {Promise<Object|null>}
 */
export async function cacheGet(key) {
  if (!redis || !redisConnected) return null
  try {
    const raw = await redis.get(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (err) {
    console.warn(`[cache] 读取失败 ${key}:`, err.message)
    return null
  }
}

/**
 * 设置缓存：JSON 序列化后写入，带 TTL 过期
 * Redis 不可用时静默跳过
 * @param {string} key 缓存键
 * @param {*} value 任意可序列化值
 * @param {number} ttlSec 过期秒数
 */
export async function cacheSet(key, value, ttlSec) {
  if (!redis || !redisConnected) return
  try {
    const raw = JSON.stringify(value)
    await redis.set(key, raw, 'EX', ttlSec)
  } catch (err) {
    console.warn(`[cache] 写入失败 ${key}:`, err.message)
  }
}

/**
 * 删除单个缓存键
 * @param {string} key
 */
export async function cacheDel(key) {
  if (!redis || !redisConnected) return
  try {
    await redis.del(key)
  } catch (err) {
    console.warn(`[cache] 删除失败 ${key}:`, err.message)
  }
}

/**
 * 批量删除匹配模式的缓存键（用 SCAN 避免阻塞）
 * @param {string} pattern 如 'af:posts:list:*'
 */
export async function cacheDelPattern(pattern) {
  if (!redis || !redisConnected) return
  try {
    let cursor = '0'
    do {
      // SCAN 返回 [nextCursor, keys[]]
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      if (keys.length > 0) {
        await redis.del(...keys)
      }
      cursor = nextCursor
    } while (cursor !== '0')
  } catch (err) {
    console.warn(`[cache] 批量删除失败 ${pattern}:`, err.message)
  }
}

/**
 * Redis 健康检查
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function healthCheckRedis() {
  if (!redis) {
    return { ok: false, message: '未配置 REDIS_URL' }
  }
  try {
    const result = await redis.ping()
    return { ok: result === 'PONG', message: result === 'PONG' ? 'Redis 已连接' : 'Redis PING 异常' }
  } catch (err) {
    return { ok: false, message: err.message }
  }
}

/** 关闭 Redis 连接（优雅关闭时调用） */
export async function closeRedis() {
  if (redis) {
    await redis.quit()
  }
}

export { redis }
export default redis
