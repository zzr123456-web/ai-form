/**
 * AI 辅助论坛 · 全栈服务（API + 前端静态文件）
 * 基于 Node.js 内置 http 模块，零第三方 Web 框架依赖
 * 同时服务 /api/forum/* API 请求和 dist/ 前端静态文件
 * 监听端口 8787（可通过 process.env.PORT 覆盖）
 * 数据库连接池由 db/pool.js 提供
 * 集成 Redis 缓存层（db/redis.js）与 JWT 认证（utils/auth.js）
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { query as dbQuery, pool as dbPool, healthCheck as dbHealthCheck } from './db/pool.js'
import { cacheGet, cacheSet, cacheDel, cacheDelPattern, isRedisConnected, healthCheckRedis, closeRedis, redis } from './db/redis.js'
import {
  boardListKey, topicListKey, userListKey, userKey, userStatsKey,
  postListKey, postKey, commentsKey,
  TTL_BOARDS, TTL_TOPICS, TTL_USERS, TTL_STATS, TTL_POSTS, TTL_POST_DETAIL, TTL_COMMENTS,
} from './utils/cache.js'
import { verifyPassword, hashPassword, signToken, createSession, destroySession } from './utils/auth.js'
import { authenticate, requireAuth } from './utils/middleware.js'
import { health as llmHealth, createChatCompletion, streamChatCompletion, truncateForLog } from './utils/llm.js'

dotenv.config()

// === 静态文件服务配置 ===
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.join(__dirname, 'dist')

// MIME 类型映射
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.map': 'application/json; charset=utf-8',
}

// 数据库连接状态：启动后由 healthCheck 异步设置，未连接时不阻断服务，仅影响 /health 端点
let dbConnected = false
// Redis 连接状态：缓存与 session 依赖，断连时缓存层自动降级跳过（由 db/redis.js 内部处理）
let redisConnected = false

const PORT = process.env.PORT || 8787

// === 工具函数 ===

/**
 * 统一 JSON 响应
 * 注入 CORS 头与字符集，返回 true 表示请求已处理（便于路由函数直接 return sendJson(...)）
 */
function sendJson(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json; charset=utf-8',
  })
  res.end(body)
  return true
}

/**
 * 读取并解析请求 body
 * 仅收集请求体字符串后 JSON.parse，空 body 返回 {}，非法 JSON 抛错由调用方 catch
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('请求体不是合法的 JSON'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * 将 pg 返回的 TIMESTAMP/DATE（Date 对象）统一转换为 ISO 字符串
 * 前端期望 createdAt 等字段为 ISO 字符串（与 mockData 格式一致）
 */
function toISO(value) {
  if (!value) return value
  if (value instanceof Date) return value.toISOString()
  return value
}

function computeGuestStatus(sessionRow) {
  if (sessionRow.bound_user_id) {
    return { remainingSeconds: sessionRow.remaining_seconds ?? 300, status: 'bound' }
  }
  const expiresAt = sessionRow.expires_at instanceof Date ? sessionRow.expires_at : new Date(sessionRow.expires_at)
  const now = Date.now()
  const diffMs = expiresAt.getTime() - now
  const remainingSeconds = Math.max(0, Math.floor(diffMs / 1000))
  let status
  if (remainingSeconds === 0) {
    status = 'expired'
  } else if (remainingSeconds <= 30) {
    status = 'expiring'
  } else {
    status = 'active'
  }
  return { remainingSeconds, status }
}

async function aiRateLimit(userId, limit = 10, windowSeconds = 60) {
  const key = `af:ratelimit:ai:${userId}`
  try {
    if (!redis || !isRedisConnected()) {
      return { ok: true, remaining: limit, limit }
    }
    const count = await redis.incr(key)
    if (count === 1) {
      await redis.expire(key, windowSeconds)
    }
    const ok = count <= limit
    const remaining = Math.max(0, limit - count)
    return { ok, remaining, limit }
  } catch (err) {
    console.warn(`[aiRateLimit] Redis 频控降级: ${err.message}`)
    return { ok: true, remaining: limit, limit }
  }
}

// === 字段映射：DB snake_case → 前端 camelCase ===

function mapUser(row) {
  if (!row) return null
  return {
    id: row.id,
    nickname: row.nickname,
    email: row.email || '',
    avatarText: row.avatar_text,
    bio: row.bio,
    handle: row.handle,
    profession: row.profession,
    city: row.city,
    joinedAt: toISO(row.joined_at),
    status: row.status,
    roles: row.roles || [],
  }
}

function mapBoard(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    todayPosts: row.today_posts,
    postCount: row.post_count,
    followers: row.followers,
    governanceMode: row.governance_mode,
    color: row.color,
  }
}

function mapTopic(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    heat: row.heat,
  }
}

function mapUserStats(row) {
  if (!row) return null
  return {
    userId: row.user_id,
    postCount: row.post_count,
    favoriteCount: row.favorite_count,
    followingCount: row.following_count,
    followerCount: row.follower_count,
    influenceScore: row.influence_score,
    totalLikes: row.total_likes,
    totalFavorited: row.total_favorited,
  }
}

/**
 * 帖子行映射（含 JOIN 出来的 author/board 嵌套字段）
 * row 需包含 u_id/u_nickname/u_avatar_text 与 b_id/b_name/b_color 前缀字段
 * tags 由调用方传入（已批量查询避免 N+1）
 */
function mapPostRow(row, tags = []) {
  if (!row) return null
  const author = row.u_id
    ? { id: row.u_id, nickname: row.u_nickname, avatarText: row.u_avatar_text }
    : null
  const board = row.b_id
    ? { id: row.b_id, name: row.b_name, color: row.b_color }
    : null
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    authorId: row.author_id,
    boardId: row.board_id,
    likes: row.likes,
    commentsCount: row.comments_count,
    views: row.views,
    favoritesCount: row.favorites_count,
    sharesCount: row.shares_count,
    createdAt: toISO(row.created_at),
    aiSummary: row.ai_summary,
    aiRiskLevel: row.ai_risk_level,
    qualityScore: row.quality_score,
    riskLevel: row.risk_level,
    status: row.status,
    sourceType: row.source_type,
    author,
    board,
    tags,
  }
}

// === 复用查询：单条帖子（含 author、board、tags 嵌套） ===

/**
 * 按 id 查询单条帖子并组装嵌套结构
 * GET /posts/:id 与 POST /posts 创建后回查均复用此函数
 */
async function fetchPostById(id) {
  const { rows } = await dbQuery(
    `SELECT posts.*,
            users.id AS u_id, users.nickname AS u_nickname, users.avatar_text AS u_avatar_text,
            boards.id AS b_id, boards.name AS b_name, boards.color AS b_color
     FROM posts
     LEFT JOIN users ON posts.author_id = users.id
     LEFT JOIN boards ON posts.board_id = boards.id
     WHERE posts.id = $1`,
    [id]
  )
  if (rows.length === 0) return null
  const tagRows = await dbQuery(
    `SELECT tag_name FROM post_tags WHERE post_id = $1`,
    [id]
  )
  const tags = tagRows.rows.map((r) => r.tag_name)
  return mapPostRow(rows[0], tags)
}

// === API 端点处理函数 ===

async function handleHealth(req, res) {
  return sendJson(res, 200, {
    db: dbConnected ? 'connected' : 'disconnected',
    redis: redisConnected ? 'connected' : 'disconnected',
    ts: Date.now(),
  })
}

async function handleListBoards(req, res) {
  const cacheKey = boardListKey()
  const cached = await cacheGet(cacheKey)
  if (cached) return sendJson(res, 200, cached)
  // 动态统计每个版块的真实帖子数和今日新帖数，避免 boards 表静态字段与实际数据脱节
  // 过滤已归档版块（status='archived' 不展示，NULL 兼容历史无 status 字段的数据）
  const { rows } = await dbQuery(
    `SELECT b.*,
            COALESCE(pc.cnt, 0) AS real_post_count,
            COALESCE(tc.cnt, 0) AS real_today_posts
     FROM boards b
     LEFT JOIN (
       SELECT board_id, COUNT(*) AS cnt
       FROM posts
       WHERE status = 'published'
       GROUP BY board_id
     ) pc ON pc.board_id = b.id
     LEFT JOIN (
       SELECT board_id, COUNT(*) AS cnt
       FROM posts
       WHERE status = 'published'
         AND created_at >= CURRENT_DATE
       GROUP BY board_id
     ) tc ON tc.board_id = b.id
     WHERE b.status != 'archived' OR b.status IS NULL
     ORDER BY real_post_count DESC`
  )
  const result = rows.map((row) => ({
    ...mapBoard(row),
    postCount: parseInt(row.real_post_count, 10) || 0,
    todayPosts: parseInt(row.real_today_posts, 10) || 0,
    // 关注功能尚未实现，清零种子假数据，避免显示 3.2k 等不实数字
    followers: 0,
  }))
  await cacheSet(cacheKey, result, TTL_BOARDS)
  return sendJson(res, 200, result)
}

async function handleListTopics(req, res) {
  const cacheKey = topicListKey()
  const cached = await cacheGet(cacheKey)
  if (cached) return sendJson(res, 200, cached)
  // 动态计算话题热度：统计近 7 天已发布帖子中各标签的使用次数作为真实热度
  // 静态 heat 字段无法反映近期活跃度，故基于 post_tags 实时聚合
  const { rows } = await dbQuery(
    `SELECT t.*, COALESCE(tag_count.cnt, 0) AS real_heat
     FROM topics t
     LEFT JOIN (
       SELECT pt.tag_name, COUNT(*) AS cnt
       FROM post_tags pt
       JOIN posts p ON pt.post_id = p.id
       WHERE p.status = 'published' AND p.created_at >= NOW() - INTERVAL '7 days'
       GROUP BY pt.tag_name
     ) tag_count ON tag_count.tag_name = t.name
     ORDER BY real_heat DESC`
  )
  // 过滤掉近 7 天无帖子的冷门话题（real_heat = 0），并用真实热度覆盖静态 heat
  const result = rows
    .filter((row) => parseInt(row.real_heat, 10) > 0)
    .map((row) => ({ ...mapTopic(row), heat: parseInt(row.real_heat, 10) }))
  await cacheSet(cacheKey, result, TTL_TOPICS)
  return sendJson(res, 200, result)
}

/**
 * 帖子列表：支持 sort / boardId / tag / page / limit
 * - sort=hot 与 quality 的 ORDER BY 表达式不接收外部输入，避免 SQL 注入
 * - tags 批量查询后在 JS 层分组，避免 N+1
 * - 缓存 key 由查询参数组合生成，保证不同筛选互不污染
 */
async function handleListPosts(req, res, url) {
  const sort = url.searchParams.get('sort') || 'latest'
  const boardId = url.searchParams.get('boardId')
  const tag = url.searchParams.get('tag')
  // 兼容 /posts?search= 与 /search?q= 两种参数命名
  const search = url.searchParams.get('search') || url.searchParams.get('q')
  // type 控制搜索目标：user=用户、knowledge=知识库、post/缺省=帖子
  const type = url.searchParams.get('type') || 'post'
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
  const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10))
  const offset = (page - 1) * limit

  // 分类搜索：type=user 走用户表，按昵称/handle 模糊匹配
  if (type === 'user') {
    if (!search) return sendJson(res, 200, [])
    const userCacheKey = `af:search:users:${search}`
    const userCached = await cacheGet(userCacheKey)
    if (userCached) return sendJson(res, 200, userCached)
    const { rows: userRows } = await dbQuery(
      `SELECT * FROM users WHERE nickname ILIKE $1 OR handle ILIKE $1 ORDER BY joined_at DESC`,
      [`%${search}%`]
    )
    const userResult = userRows.map(mapUser)
    await cacheSet(userCacheKey, userResult, TTL_USERS)
    return sendJson(res, 200, userResult)
  }

  // 分类搜索：type=knowledge 走知识库表；表可能尚未创建，try-catch 降级返回空数组
  if (type === 'knowledge') {
    if (!search) return sendJson(res, 200, [])
    const kwCacheKey = `af:search:knowledge:${search}`
    const kwCached = await cacheGet(kwCacheKey)
    if (kwCached) return sendJson(res, 200, kwCached)
    try {
      const { rows: kwRows } = await dbQuery(
        `SELECT * FROM knowledge_items WHERE title ILIKE $1 OR content ILIKE $1 ORDER BY created_at DESC`,
        [`%${search}%`]
      )
      await cacheSet(kwCacheKey, kwRows, TTL_POSTS)
      return sendJson(res, 200, kwRows)
    } catch {
      // knowledge_items 表不存在时静默降级，避免阻塞搜索功能
      return sendJson(res, 200, [])
    }
  }

  const cacheKey = postListKey(sort, boardId, tag, page, limit, search)
  const cached = await cacheGet(cacheKey)
  if (cached) return sendJson(res, 200, cached)

  // 动态构建 WHERE 子句与参数数组
  const where = []
  const params = []
  if (boardId) {
    params.push(boardId)
    where.push(`posts.board_id = $${params.length}`)
  }
  if (tag) {
    params.push(tag)
    where.push(`EXISTS (SELECT 1 FROM post_tags WHERE post_id = posts.id AND tag_name = $${params.length})`)
  }
  if (search) {
    params.push(`%${search}%`)
    where.push(`(posts.title ILIKE $${params.length} OR posts.content ILIKE $${params.length})`)
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  // 排序方向使用白名单拼接（非用户原始输入），排序参数本身安全
  let orderClause
  if (sort === 'hot') {
    orderClause = 'ORDER BY (posts.likes + posts.comments_count * 2 + posts.views / 10) DESC'
  } else if (sort === 'quality') {
    orderClause = 'ORDER BY posts.quality_score DESC NULLS LAST'
  } else if (sort === 'recommended') {
    // 推荐流综合分：质量分(0.4) + 点赞(0.3) + 时间衰减(0.3)
    // 时间衰减项 1/(1+天数) 让新帖权重更高，避免老帖长期霸榜；COALESCE 兜底 NULL 字段
    orderClause = 'ORDER BY (COALESCE(posts.quality_score, 0) * 0.4 + COALESCE(posts.likes, 0) * 0.3 + (1.0 / (1 + EXTRACT(EPOCH FROM NOW() - posts.created_at) / 86400)) * 0.3) DESC'
  } else {
    orderClause = 'ORDER BY posts.created_at DESC'
  }

  // 分页参数追加到最后
  params.push(limit)
  const limitParam = `$${params.length}`
  params.push(offset)
  const offsetParam = `$${params.length}`

  const sql = `
    SELECT posts.*,
           users.id AS u_id, users.nickname AS u_nickname, users.avatar_text AS u_avatar_text,
           boards.id AS b_id, boards.name AS b_name, boards.color AS b_color
    FROM posts
    LEFT JOIN users ON posts.author_id = users.id
    LEFT JOIN boards ON posts.board_id = boards.id
    ${whereClause}
    ${orderClause}
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `
  const { rows } = await dbQuery(sql, params)

  // 批量查询所有命中帖子的 tags，按 post_id 分组，避免逐条查询（N+1）
  const tagsByPost = new Map()
  if (rows.length > 0) {
    const postIds = rows.map((r) => r.id)
    const tagRows = await dbQuery(
      `SELECT post_id, tag_name FROM post_tags WHERE post_id = ANY($1::text[])`,
      [postIds]
    )
    for (const tr of tagRows.rows) {
      if (!tagsByPost.has(tr.post_id)) {
        tagsByPost.set(tr.post_id, [])
      }
      tagsByPost.get(tr.post_id).push(tr.tag_name)
    }
  }

  const result = rows.map((r) => mapPostRow(r, tagsByPost.get(r.id) || []))
  await cacheSet(cacheKey, result, TTL_POSTS)
  return sendJson(res, 200, result)
}

async function handleGetPost(req, res, id) {
  const cacheKey = postKey(id)
  const cached = await cacheGet(cacheKey)

  // 异步增加阅读量：不等待结果，避免阻塞响应
  // 阅读量写入需要时间，用户期望立即看到帖子内容
  dbQuery(`UPDATE posts SET views = COALESCE(views, 0) + 1 WHERE id = $1`, [id]).catch(() => {})
  // 同时失效帖子列表缓存（列表中显示的帖子也带阅读量）
  await cacheDel(postListKey())

  if (cached) {
    // 缓存命中时也更新阅读量（缓存中的旧 views 值 + 1）
    if (cached && typeof cached.views === 'number') {
      cached.views += 1
      await cacheSet(cacheKey, cached, TTL_POST_DETAIL)
    }
    return sendJson(res, 200, cached)
  }

  const post = await fetchPostById(id)
  if (!post) {
    return sendJson(res, 404, { error: '帖子不存在' })
  }
  // 返回给前端的帖子对象也反映最新阅读量
  if (typeof post.views === 'number') post.views += 1
  await cacheSet(cacheKey, post, TTL_POST_DETAIL)
  return sendJson(res, 200, post)
}

/**
 * 隐私信息检测：扫描文本中的手机号 / 身份证号 / 地址关键字
 * 用于发帖前拦截，避免用户无意间公开个人敏感信息（隐私合规要求）
 * @param {string} text 待检测文本
 * @returns {Array<{type: string, match: string, position: number}>} 命中的敏感片段列表
 */
function detectSensitiveInfo(text) {
  if (!text || typeof text !== 'string') return []
  const segments = []
  // 手机号：1 开头 + 第 2 位 3-9 + 9 位数字，共 11 位
  const phoneRe = /1[3-9]\d{9}/g
  // 身份证号：前 17 位数字 + 末位数字或 X/x，共 18 位
  const idCardRe = /\d{17}[\dXx]/g
  // 地址关键字：明确指向居住信息的词
  const addressRe = /地址|住址|门牌号/g
  let m
  while ((m = phoneRe.exec(text)) !== null) {
    segments.push({ type: 'phone', match: m[0], position: m.index })
  }
  while ((m = idCardRe.exec(text)) !== null) {
    segments.push({ type: 'id_card', match: m[0], position: m.index })
  }
  while ((m = addressRe.exec(text)) !== null) {
    segments.push({ type: 'address', match: m[0], position: m.index })
  }
  return segments
}

/**
 * AI 内容风险分级：调用 LLM 对内容进行风险分级，返回 { risk_level, risk_type }
 * - 失败时返回默认值 { risk_level: 'none', risk_type: 'none' }，永不抛错（避免影响主流程）
 * - boardId 用于查询版块治理模式：safety_first 版块将 low 提升为 medium（降低阈值）
 */
async function detectContentRisk(content, boardId) {
  try {
    if (!content || typeof content !== 'string') {
      return { risk_level: 'none', risk_type: 'none' }
    }
    console.log(`[AI:risk] 开始风险检测 内容长度=${content.length} boardId=${boardId || '无'}`)
    const systemPrompt = `你是一个内容安全审核助手。请对以下内容进行风险分级，只返回JSON：
{"risk_level": "none|low|medium|high", "risk_type": "spam|abuse|sensitive|misinformation|low_quality|none"}
风险分级标准：
- none: 正常内容
- low: 轻微不当但不违规
- medium: 可能违规但不确定
- high: 明显违规或高风险`
    const { content: raw } = await createChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content },
    ], { temperature: 0, max_tokens: 128 })
    // 兼容 LLM 可能包裹 ```json``` 或多余文本的情况，提取首个 JSON 对象
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) {
      console.warn('[AI:risk] LLM 返回无 JSON，降级为 none')
      return { risk_level: 'none', risk_type: 'none' }
    }
    const parsed = JSON.parse(match[0])
    const riskLevel = ['none', 'low', 'medium', 'high'].includes(parsed.risk_level)
      ? parsed.risk_level
      : 'none'
    const riskType = parsed.risk_type || 'none'

    // 版块治理模式 safety_first：将 low 提升为 medium（降低阈值，更严格）
    if (riskLevel === 'low' && boardId) {
      const { rows } = await dbQuery(
        `SELECT governance_mode FROM boards WHERE id = $1`,
        [boardId]
      )
      if (rows.length > 0 && rows[0].governance_mode === 'safety_first') {
        console.log(`[AI:risk] 风险升级 low→medium（safety_first版块） risk_type=${riskType}`)
        return { risk_level: 'medium', risk_type: riskType }
      }
    }
    console.log(`[AI:risk] 风险检测完成 risk_level=${riskLevel} risk_type=${riskType}`)
    return { risk_level: riskLevel, risk_type: riskType }
  } catch (err) {
    // LLM 调用失败或解析失败时降级为无风险，避免阻断主流程
    console.warn('[AI:risk] 风险分级失败:', err.message)
    return { risk_level: 'none', risk_type: 'none' }
  }
}

/**
 * 异步写入风险检测结果：
 * 1. 更新 posts/comments 的 risk_level
 * 2. medium/high 时创建 moderation_case 进入审核队列
 * 该函数不抛错、不阻塞主流程，统一用 .catch 兜底
 */
async function applyContentRisk({ targetType, targetId, content, boardId }) {
  try {
    console.log(`[AI:applyRisk] 异步风险检测开始 targetType=${targetType} targetId=${targetId}`)
    const { risk_level, risk_type } = await detectContentRisk(content, boardId)
    if (targetType === 'post') {
      await dbQuery(`UPDATE posts SET risk_level = $1 WHERE id = $2`, [risk_level, targetId])
    } else {
      await dbQuery(`UPDATE comments SET risk_level = $1 WHERE id = $2`, [risk_level, targetId])
    }
    console.log(`[AI:applyRisk] 风险等级已写入 risk_level=${risk_level} targetId=${targetId}`)
    // 仅 medium / high 级别进入审核队列，避免低风险内容淹没队列
    if (risk_level === 'medium' || risk_level === 'high') {
      await dbQuery(
        `INSERT INTO moderation_cases (id, target_type, target_id, source, risk_type, risk_level, status, created_at)
         VALUES ($1, $2, $3, 'ai', $4, $5, 'open', NOW())`,
        [crypto.randomUUID(), targetType, targetId, risk_type, risk_level]
      )
      console.log(`[AI:applyRisk] 已创建审核工单 risk_level=${risk_level} targetId=${targetId}`)
    }
  } catch (err) {
    // 异步流程，失败不阻塞主流程
    console.warn(`[AI:applyRisk] 异步风险检测异常: ${err.message}`)
  }
}

/**
 * 创建帖子（需登录，banned 用户禁止发帖）
 * 必填：title、content、boardId；可选：tags、summary
 * 作者 ID 取自鉴权用户 authUser.userId，不再信任客户端传入
 */
async function handleCreatePost(req, res, authUser) {
  // token 不含 status 且可能过期（如管理员刚封禁该用户，旧 token 仍有效），
  // 从 DB 拉取最新状态后再判断，避免被封禁用户继续发帖
  const { rows: authRows } = await dbQuery(`SELECT status FROM users WHERE id = $1`, [authUser.userId])
  if (authRows.length > 0) authUser.status = authRows[0].status
  if (authUser.status === 'banned') {
    return sendJson(res, 403, { error: '账号已被封禁，无法发帖' })
  }
  const body = await readJsonBody(req)
  const { title, content, boardId } = body
  if (!title || !content || !boardId) {
    return sendJson(res, 400, { error: '缺少必填字段：title, content, boardId' })
  }
  // 隐私检测：在写入数据库前拦截，避免敏感信息落库后被缓存/索引难以彻底清除
  const sensitiveSegments = detectSensitiveInfo(content)
  if (sensitiveSegments.length > 0) {
    return sendJson(res, 400, {
      error: '内容包含敏感信息',
      sensitive_segments: sensitiveSegments,
    })
  }
  const authorId = authUser.userId
  const tags = Array.isArray(body.tags) ? body.tags : []
  const summary = body.summary || null
  const id = `p_${Date.now()}`

  await dbQuery(
    `INSERT INTO posts (id, title, summary, content, author_id, board_id, created_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'published')`,
    [id, title, summary, content, authorId, boardId]
  )

  // 同步写入标签关联（每个 tag 一行，ON CONFLICT 容错重复）
  for (const tagName of tags) {
    await dbQuery(
      `INSERT INTO post_tags (post_id, tag_name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, tagName]
    )
  }

  // 回查完整对象（含 author、board、tags 嵌套）
  const post = await fetchPostById(id)
  if (!post) {
    return sendJson(res, 500, { error: '帖子创建后回查失败' })
  }
  // 异步触发 AI 风险分级：不阻塞响应，失败静默忽略（不影响发帖主流程）
  applyContentRisk({ targetType: 'post', targetId: id, content, boardId }).catch(() => {})
  // 异步触发 AI 小助手自动评论：发帖后 AI 自动生成一条评论参与讨论
  generateAICommentForPost(id).catch(() => {})
  // 发帖后清除列表缓存（排序变化）和版块缓存（post_count 变化），避免脏读
  await cacheDelPattern('af:posts:list:*')
  await cacheDel(boardListKey())
  return sendJson(res, 201, post)
}

/**
 * 评论列表：查询指定帖子的全部评论，在 JS 层构建评论树
 * parent_id IS NULL 为顶层，其余按 parent_id 分组挂为 replies
 */
async function handleListComments(req, res, postId) {
  const cacheKey = commentsKey(postId)
  const cached = await cacheGet(cacheKey)
  if (cached) return sendJson(res, 200, cached)
  const { rows } = await dbQuery(
    `SELECT comments.*,
            users.id AS u_id, users.nickname AS u_nickname, users.avatar_text AS u_avatar_text
     FROM comments
     LEFT JOIN users ON comments.author_id = users.id
     WHERE comments.post_id = $1
     ORDER BY comments.created_at ASC`,
    [postId]
  )

  // 按 parent_id 分组，parent_id 为 null 的归入顶层
  const repliesByParent = new Map()
  const topComments = []
  for (const row of rows) {
    const comment = {
      id: row.id,
      postId: row.post_id,
      authorId: row.author_id,
      parentId: row.parent_id,
      content: row.content,
      likes: row.likes,
      createdAt: toISO(row.created_at),
      author: row.u_id
        ? { id: row.u_id, nickname: row.u_nickname, avatarText: row.u_avatar_text }
        : null,
      replies: [],
    }
    if (row.parent_id) {
      if (!repliesByParent.has(row.parent_id)) {
        repliesByParent.set(row.parent_id, [])
      }
      repliesByParent.get(row.parent_id).push(comment)
    } else {
      topComments.push(comment)
    }
  }

  // 将回复挂载到对应顶层评论
  for (const top of topComments) {
    top.replies = repliesByParent.get(top.id) || []
  }
  await cacheSet(cacheKey, topComments, TTL_COMMENTS)
  return sendJson(res, 200, topComments)
}

/**
 * 相关推荐：先按共享标签查找相关帖，不足 5 条时用同版块帖子补齐
 * 排序：点赞数优先，其次质量分；排除当前帖自身
 */
async function handleRelatedPosts(req, res, id) {
  const cacheKey = `af:post:${id}:related`
  const cached = await cacheGet(cacheKey)
  if (cached) return sendJson(res, 200, cached)

  // 先查当前帖的 board_id，用于后续同版块补齐；同时校验帖子存在
  const { rows: curRows } = await dbQuery(`SELECT board_id FROM posts WHERE id = $1`, [id])
  if (curRows.length === 0) {
    return sendJson(res, 404, { error: '帖子不存在' })
  }
  const boardId = curRows[0].board_id

  // 第一步：通过共享标签匹配相关帖（排除自身），按点赞与质量分排序，取 5 条
  const { rows: tagRows } = await dbQuery(
    `SELECT DISTINCT posts.*,
            users.id AS u_id, users.nickname AS u_nickname, users.avatar_text AS u_avatar_text,
            boards.id AS b_id, boards.name AS b_name, boards.color AS b_color
     FROM posts
     LEFT JOIN users ON posts.author_id = users.id
     LEFT JOIN boards ON posts.board_id = boards.id
     JOIN post_tags pt ON pt.post_id = posts.id
     WHERE pt.tag_name IN (SELECT tag_name FROM post_tags WHERE post_id = $1)
       AND posts.id != $1
       AND posts.status = 'published'
     ORDER BY posts.likes DESC NULLS LAST, posts.quality_score DESC NULLS LAST
     LIMIT 5`,
    [id]
  )

  let rows = tagRows
  // 第二步：标签匹配不足 5 条时，用同版块帖子补齐（排除当前帖与已选帖）
  if (rows.length < 5) {
    const excludeIds = [id, ...rows.map((r) => r.id)]
    const { rows: fillRows } = await dbQuery(
      `SELECT posts.*,
              users.id AS u_id, users.nickname AS u_nickname, users.avatar_text AS u_avatar_text,
              boards.id AS b_id, boards.name AS b_name, boards.color AS b_color
       FROM posts
       LEFT JOIN users ON posts.author_id = users.id
       LEFT JOIN boards ON posts.board_id = boards.id
       WHERE posts.board_id = $1
         AND posts.id != ALL($2::text[])
         AND posts.status = 'published'
       ORDER BY posts.likes DESC NULLS LAST, posts.quality_score DESC NULLS LAST
       LIMIT $3`,
      [boardId, excludeIds, 5 - rows.length]
    )
    rows = rows.concat(fillRows)
  }

  // 批量查询 tags，按 post_id 分组，避免逐条查询（N+1）
  const tagsByPost = new Map()
  if (rows.length > 0) {
    const postIds = rows.map((r) => r.id)
    const tagRows2 = await dbQuery(
      `SELECT post_id, tag_name FROM post_tags WHERE post_id = ANY($1::text[])`,
      [postIds]
    )
    for (const tr of tagRows2.rows) {
      if (!tagsByPost.has(tr.post_id)) {
        tagsByPost.set(tr.post_id, [])
      }
      tagsByPost.get(tr.post_id).push(tr.tag_name)
    }
  }

  const result = rows.map((r) => mapPostRow(r, tagsByPost.get(r.id) || []))
  await cacheSet(cacheKey, result, TTL_POSTS)
  return sendJson(res, 200, result)
}

/**
 * 搜索聚合摘要：调用 Deepseek 对搜索词生成 2-3 句总结
 * 结果缓存 5 分钟，避免相同搜索词重复消耗 LLM 额度
 */
async function handleSearchSummary(req, res, url) {
  const q = url.searchParams.get('q')
  if (!q) {
    return sendJson(res, 400, { error: '缺少必填参数：q' })
  }
  const cacheKey = `af:search:summary:${q}`
  const cached = await cacheGet(cacheKey)
  if (cached) return sendJson(res, 200, cached)

  try {
    const { content } = await createChatCompletion(
      [
        { role: 'system', content: '你是一个论坛搜索助手。请用2-3句话总结以下搜索词的相关内容。' },
        { role: 'user', content: `搜索词：${q}` },
      ],
      { max_tokens: 256 }
    )
    const result = { summary: content }
    // 缓存 5 分钟（300 秒），平衡内容新鲜度与 LLM 调用成本
    await cacheSet(cacheKey, result, 300)
    return sendJson(res, 200, result)
  } catch (e) {
    return sendJson(res, 502, { error: e.message || 'AI 摘要生成失败' })
  }
}

// ======== 互动接口：点赞 / 收藏 / 评论写入 ========

/**
 * 获取当前用户对帖子 + 所有评论的互动状态
 * 未登录返回全 false（不报错，避免前端额外 try/catch）
 * 不缓存：用户维度个性化，不走 Redis 通用缓存
 */
async function handleGetInteractions(req, res, postId, authUser) {
  const userId = authUser?.userId
  const result = {
    liked: false,       // 当前用户是否点赞此帖
    favored: false,     // 当前用户是否收藏此帖
    likedCommentIds: [], // 当前用户点赞过的评论 id 列表
  }
  if (!userId) return sendJson(res, 200, result)

  const [likeRow, favRow, commentLikeRows] = await Promise.all([
    dbQuery(`SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2`, [postId, userId]),
    dbQuery(`SELECT 1 FROM post_favorites WHERE post_id = $1 AND user_id = $2`, [postId, userId]),
    dbQuery(
      `SELECT c.id FROM comments c
       JOIN comment_likes cl ON cl.comment_id = c.id
       WHERE c.post_id = $1 AND cl.user_id = $2`,
      [postId, userId]
    ).catch(() => ({ rows: [] })), // comment_likes 表可能还没迁移，容错返回空
  ])

  result.liked = likeRow.rows.length > 0
  result.favored = favRow.rows.length > 0
  result.likedCommentIds = commentLikeRows.rows.map((r) => r.id)
  return sendJson(res, 200, result)
}

/**
 * 帖子点赞 / 取消点赞（toggle 模式）
 * - 已存在记录 → 删除 → 计数 -1
 * - 不存在记录 → 插入 → 计数 +1
 * 同时失效帖子详情缓存 + 评论缓存（含点赞数）+ 列表缓存（显示点赞数）
 */
async function handleTogglePostLike(req, res, authUser, postId) {
  const userId = authUser.userId
  const { rows: existing } = await dbQuery(
    `SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2`,
    [postId, userId]
  )

  let delta = 0
  if (existing.length > 0) {
    // 取消点赞
    await dbQuery(`DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2`, [postId, userId])
    delta = -1
  } else {
    // 新增点赞
    try {
      await dbQuery(
        `INSERT INTO post_likes (post_id, user_id, created_at) VALUES ($1, $2, NOW())`,
        [postId, userId]
      )
      delta = 1
    } catch (err) {
      // 并发下主键冲突，视为已点赞成功（幂等）
      if (err.code === '23505') delta = 0
      else throw err
    }
  }

  // 同步更新 posts.likes 计数：COALESCE 防止 NULL 导致计算失败
  if (delta !== 0) {
    await dbQuery(
      `UPDATE posts SET likes = COALESCE(likes, 0) + $1 WHERE id = $2`,
      [delta, postId]
    )
  }

  // 失效相关缓存：帖子详情 / 帖子列表 / 评论列表（评论本身不受影响，但列表可能显示帖子点赞数）
  await Promise.all([
    cacheDel(postKey(postId)),
    cacheDelPattern('af:posts:list:*'),
  ])

  return sendJson(res, 200, {
    liked: delta >= 0 && existing.length === 0 ? true : (delta === 0 ? true : false),
    delta,
  })
}

/**
 * 帖子收藏 / 取消收藏（toggle 模式）
 */
async function handleTogglePostFavorite(req, res, authUser, postId) {
  const userId = authUser.userId
  const { rows: existing } = await dbQuery(
    `SELECT 1 FROM post_favorites WHERE post_id = $1 AND user_id = $2`,
    [postId, userId]
  )

  let delta = 0
  if (existing.length > 0) {
    await dbQuery(`DELETE FROM post_favorites WHERE post_id = $1 AND user_id = $2`, [postId, userId])
    delta = -1
  } else {
    try {
      await dbQuery(
        `INSERT INTO post_favorites (post_id, user_id, created_at) VALUES ($1, $2, NOW())`,
        [postId, userId]
      )
      delta = 1
    } catch (err) {
      if (err.code === '23505') delta = 0
      else throw err
    }
  }

  if (delta !== 0) {
    await dbQuery(
      `UPDATE posts SET favorites_count = COALESCE(favorites_count, 0) + $1 WHERE id = $2`,
      [delta, postId]
    )
  }

  await Promise.all([
    cacheDel(postKey(postId)),
    cacheDelPattern('af:posts:list:*'),
    cacheDel(userStatsKey(userId)), // 用户统计含 favorite_count
  ])

  return sendJson(res, 200, {
    favored: delta >= 0 && existing.length === 0 ? true : (delta === 0 ? true : false),
    delta,
  })
}

/**
 * 创建评论（支持楼中楼：parentId 可选）
 * 必填：content；可选：parentId
 * 成功后回查评论树并返回最新全量数据，同时更新 posts.comments_count
 */
async function handleCreateComment(req, res, authUser, postId) {
  // token 不含 status 且可能过期，从 DB 拉取最新状态，封禁用户禁止评论
  const { rows: authRows } = await dbQuery(`SELECT status FROM users WHERE id = $1`, [authUser.userId])
  if (authRows.length > 0) authUser.status = authRows[0].status
  if (authUser.status === 'banned') {
    return sendJson(res, 403, { error: '账号已被封禁，无法评论' })
  }
  const body = await readJsonBody(req)
  const { content, parentId } = body
  if (!content || !content.trim()) {
    return sendJson(res, 400, { error: '评论内容不能为空' })
  }

  // 校验帖子是否存在（同时取 board_id 用于评论风险分级的版块治理模式判断）
  const { rows: postRows } = await dbQuery(`SELECT id, board_id FROM posts WHERE id = $1`, [postId])
  if (postRows.length === 0) {
    return sendJson(res, 404, { error: '帖子不存在' })
  }
  const postBoardId = postRows[0].board_id

  // 若有 parentId，校验父评论属于同一条帖子
  if (parentId) {
    const { rows: parentRows } = await dbQuery(
      `SELECT id, post_id FROM comments WHERE id = $1`,
      [parentId]
    )
    if (parentRows.length === 0) {
      return sendJson(res, 404, { error: '回复的评论不存在' })
    }
    if (parentRows[0].post_id !== postId) {
      return sendJson(res, 400, { error: '无法回复其他帖子的评论' })
    }
  }

  const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  await dbQuery(
    `INSERT INTO comments (id, post_id, author_id, parent_id, content, likes, created_at)
     VALUES ($1, $2, $3, $4, $5, 0, NOW())`,
    [id, postId, authUser.userId, parentId || null, content.trim()]
  )

  // 同步帖子评论计数
  await dbQuery(
    `UPDATE posts SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = $1`,
    [postId]
  )

  // 失效相关缓存
  await Promise.all([
    cacheDel(commentsKey(postId)),
    cacheDel(postKey(postId)),
    cacheDelPattern('af:posts:list:*'),
  ])

  // 异步触发 AI 风险分级：不阻塞响应，失败静默忽略（不影响评论主流程）
  applyContentRisk({
    targetType: 'comment',
    targetId: id,
    content: content.trim(),
    boardId: postBoardId,
  }).catch(() => {})

  // 检测评论中是否 @ai小助手，触发 AI 自动回复（异步不阻塞）
  const trimmedContent = content.trim().toLowerCase()
  if (trimmedContent.includes('@ai小助手') || trimmedContent.includes('@ai助手') || trimmedContent.includes('@ai-assistant')) {
    generateAIReplyForComment(id, postId).catch(() => {})
  }

  // 回查最新评论树，返回给前端替换（保证强一致）
  const listResult = await handleListCommentsNoSend(postId)
  return sendJson(res, 201, { id, comments: listResult })
}

/**
 * 复用 handleListComments 的内部查询逻辑，但不发送响应（供写入接口回查使用）
 */
async function handleListCommentsNoSend(postId) {
  const { rows } = await dbQuery(
    `SELECT comments.*,
            users.id AS u_id, users.nickname AS u_nickname, users.avatar_text AS u_avatar_text
     FROM comments
     LEFT JOIN users ON comments.author_id = users.id
     WHERE comments.post_id = $1
     ORDER BY comments.created_at ASC`,
    [postId]
  )
  const repliesByParent = new Map()
  const topComments = []
  for (const row of rows) {
    const comment = {
      id: row.id,
      postId: row.post_id,
      authorId: row.author_id,
      parentId: row.parent_id,
      content: row.content,
      likes: row.likes,
      createdAt: toISO(row.created_at),
      author: row.u_id
        ? { id: row.u_id, nickname: row.u_nickname, avatarText: row.u_avatar_text }
        : null,
      replies: [],
    }
    if (row.parent_id) {
      if (!repliesByParent.has(row.parent_id)) repliesByParent.set(row.parent_id, [])
      repliesByParent.get(row.parent_id).push(comment)
    } else {
      topComments.push(comment)
    }
  }
  for (const top of topComments) {
    top.replies = repliesByParent.get(top.id) || []
  }
  await cacheSet(commentsKey(postId), topComments, TTL_COMMENTS)
  return topComments
}

/**
 * 评论点赞 / 取消点赞（toggle 模式）
 * 容错：comment_likes 表未迁移时仅更新计数（不报错）
 */
async function handleToggleCommentLike(req, res, authUser, commentId) {
  const userId = authUser.userId

  // 先查询评论是否存在 + 获取 post_id 便于失效缓存
  const { rows: commentRows } = await dbQuery(
    `SELECT id, post_id FROM comments WHERE id = $1`,
    [commentId]
  )
  if (commentRows.length === 0) {
    return sendJson(res, 404, { error: '评论不存在' })
  }
  const postId = commentRows[0].post_id

  let delta = 0
  try {
    const { rows: existing } = await dbQuery(
      `SELECT 1 FROM comment_likes WHERE comment_id = $1 AND user_id = $2`,
      [commentId, userId]
    )
    if (existing.length > 0) {
      await dbQuery(`DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2`, [commentId, userId])
      delta = -1
    } else {
      await dbQuery(
        `INSERT INTO comment_likes (comment_id, user_id, created_at) VALUES ($1, $2, NOW())`,
        [commentId, userId]
      )
      delta = 1
    }
  } catch (err) {
    // comment_likes 表不存在（未迁移）：仅做计数增减，不报错
    // 42P01 = undefined_table，23505 = unique_violation（并发插入主键冲突视为 0 增量）
    if (err.code === '42P01') {
      delta = delta || 1 // 默认 toggle：若表不存在，未记录则取反（简单 +1 处理，不记录用户维度状态）
    } else if (err.code === '23505') {
      delta = 0
    } else {
      throw err
    }
  }

  if (delta !== 0) {
    await dbQuery(
      `UPDATE comments SET likes = COALESCE(likes, 0) + $1 WHERE id = $2`,
      [delta, commentId]
    )
  }

  // 失效评论缓存（全评论树都包含被操作的评论）
  await cacheDel(commentsKey(postId))

  return sendJson(res, 200, {
    liked: delta > 0 ? true : (delta === 0 ? true : false),
    delta,
  })
}

// ======== AI 接口 ========

async function handleAIHealth(req, res) {
  return sendJson(res, 200, llmHealth())
}

async function handleAIGenerate(req, res, authUser) {
  const userId = authUser.userId
  const rate = await aiRateLimit(userId)
  if (!rate.ok) {
    return sendJson(res, 429, { error: 'AI 调用过于频繁，请稍后再试' })
  }

  const body = await readJsonBody(req)
  const { messages, model, temperature, max_tokens } = body
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, { error: '缺少必填字段：messages（非空数组）' })
  }

  const startMs = Date.now()
  let success = false
  let errorMsg = null
  let usage = null
  let content = ''

  try {
    const result = await createChatCompletion(messages, { model, temperature, max_tokens })
    success = true
    usage = result.usage
    content = result.content
  } catch (e) {
    errorMsg = String(e.message || e).slice(0, 500)
  }

  const latMs = Date.now() - startMs
  const logId = `aul_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const logModel = model || 'deepseek-chat'
  const promptTokens = usage?.prompt_tokens ?? 0
  const completionTokens = usage?.completion_tokens ?? 0
  const rawReq = truncateForLog(JSON.stringify({ messages }), 1000)

  dbQuery(
    `INSERT INTO ai_usage_logs (id, user_id, model, prompt_tokens, completion_tokens, latency_ms, error_msg, raw_request_truncated, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [logId, userId, logModel, promptTokens, completionTokens, latMs, errorMsg, rawReq]
  ).catch((err) => console.warn('[ai_usage_logs] 写入失败:', err.message))

  if (success) {
    return sendJson(res, 200, { content, from_llm: true, usage: usage || null })
  }
  return sendJson(res, 502, { error: errorMsg || 'LLM 调用失败', from_llm: false })
}

async function handleAIStream(req, res, authUser) {
  const userId = authUser.userId
  const rate = await aiRateLimit(userId)
  if (!rate.ok) {
    return sendJson(res, 429, { error: 'AI 调用过于频繁，请稍后再试' })
  }

  const body = await readJsonBody(req)
  const { messages, model, temperature, max_tokens } = body
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, { error: '缺少必填字段：messages（非空数组）' })
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })

  const startMs = Date.now()
  let success = false
  let errorMsg = null
  let usage = null
  const logId = `aul_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const logModel = model || 'deepseek-chat'
  const rawReq = truncateForLog(JSON.stringify({ messages }), 1000)

  function writeUsageLog() {
    const latMs = Date.now() - startMs
    const promptTokens = usage?.prompt_tokens ?? 0
    const completionTokens = usage?.completion_tokens ?? 0
    dbQuery(
      `INSERT INTO ai_usage_logs (id, user_id, model, prompt_tokens, completion_tokens, latency_ms, error_msg, raw_request_truncated, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [logId, userId, logModel, promptTokens, completionTokens, latMs, errorMsg, rawReq]
    ).catch((err) => console.warn('[ai_usage_logs] 写入失败:', err.message))
  }

  try {
    await streamChatCompletion(
      messages,
      { model, temperature, max_tokens },
      (text) => {
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`)
      },
      (finalText, finalUsage) => {
        success = true
        usage = finalUsage
        writeUsageLog()
        res.write(`data: [DONE]\n\n`)
        res.end()
      }
    )
  } catch (e) {
    errorMsg = String(e.message || e).slice(0, 500)
    writeUsageLog()
    res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`)
    res.write(`data: [DONE]\n\n`)
    res.end()
  }

  return true
}

/**
 * AI 发帖辅助：分析草稿内容，返回标题候选 / 标签建议 / 润色正文
 * 调用 LLM 后解析 JSON，解析失败返回 502；成功记录到 ai_usage_logs
 */
async function handleAIPostAssist(req, res, authUser) {
  const userId = authUser.userId
  console.log(`[AI:post-assist] 收到请求 userId=${userId}`)
  const rate = await aiRateLimit(userId)
  if (!rate.ok) {
    console.warn(`[AI:post-assist] 限流拦截 userId=${userId}`)
    return sendJson(res, 429, { error: 'AI 调用过于频繁，请稍后再试' })
  }

  const body = await readJsonBody(req)
  const { content, board_id, current_tags } = body
  if (!content || typeof content !== 'string') {
    console.warn(`[AI:post-assist] 参数缺失 content长度=${content?.length ?? 0}`)
    return sendJson(res, 400, { error: '缺少必填字段：content' })
  }
  console.log(`[AI:post-assist] 草稿长度=${content.length} board_id=${board_id || '无'} tags=${Array.isArray(current_tags) ? current_tags.length : 0}个`)

  const systemPrompt = `你是一个论坛发帖助手。请分析用户的草稿内容，返回JSON格式的辅助建议：
{"title_candidates": ["标题1","标题2","标题3"], "tag_suggestions": ["标签1","标签2","标签3","标签4"], "polished_content": "润色后的正文", "recommended_board_id": null}
注意：标签3-5个，标题区分求助/讨论/经验类型，保留用户原意不灌水。只返回JSON，不要其他文本。`

  // 把用户当前标签与板块作为上下文传入，便于模型给出差异化建议
  const userMessage = `草稿内容：${content}\n当前板块ID：${board_id || '未指定'}\n当前标签：${Array.isArray(current_tags) ? current_tags.join('、') : '无'}`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]

  const startMs = Date.now()
  let success = false
  let errorMsg = null
  let usage = null
  let parsed = null

  try {
    console.log('[AI:post-assist] 开始调用 LLM...')
    const result = await createChatCompletion(messages, { temperature: 0.5, max_tokens: 1024 })
    success = true
    usage = result.usage
    // 容错处理：模型可能在外层包裹 ```json 代码块，先剥离再解析
    const raw = result.content || ''
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    parsed = JSON.parse(jsonStr)
    console.log(`[AI:post-assist] LLM 返回成功 解析JSON成功 标题数=${parsed.title_candidates?.length ?? 0} 标签数=${parsed.tag_suggestions?.length ?? 0}`)
  } catch (e) {
    errorMsg = String(e.message || e).slice(0, 500)
    console.error(`[AI:post-assist] LLM 调用或解析失败: ${errorMsg}`)
  }

  const latMs = Date.now() - startMs
  const logId = `aul_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const promptTokens = usage?.prompt_tokens ?? 0
  const completionTokens = usage?.completion_tokens ?? 0
  const rawReq = truncateForLog(JSON.stringify({ content: content.slice(0, 200) }), 1000)

  dbQuery(
    `INSERT INTO ai_usage_logs (id, user_id, model, prompt_tokens, completion_tokens, latency_ms, error_msg, raw_request_truncated, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [logId, userId, 'deepseek-chat', promptTokens, completionTokens, latMs, errorMsg, rawReq]
  ).catch((err) => console.warn('[ai_usage_logs] 写入失败:', err.message))

  if (success && parsed) {
    return sendJson(res, 200, parsed)
  }
  return sendJson(res, 502, { error: errorMsg || 'AI 响应解析失败', from_llm: false })
}

/**
 * AI 答疑启动：创建问题记录，检索相似帖子与知识库条目
 * 不直接调用 LLM，仅做上下文准备；实际流式生成在 /ai/qa/stream
 */
async function handleAIQAStart(req, res, authUser) {
  const userId = authUser.userId
  const body = await readJsonBody(req)
  const { content } = body
  if (!content || typeof content !== 'string') {
    return sendJson(res, 400, { error: '缺少必填字段：content' })
  }
  console.log(`[AI:qa/start] 收到请求 userId=${userId} 问题长度=${content.length} 问题摘要="${content.slice(0, 80)}"`)

  // 创建问题记录，状态置为 answering 表示生成中
  const questionId = crypto.randomUUID()
  await dbQuery(
    `INSERT INTO questions (id, user_id, content, source_mode, status, created_at)
     VALUES ($1, $2, $3, 'site_only', 'answering', NOW())`,
    [questionId, userId, content]
  )
  console.log(`[AI:qa/start] 问题记录已创建 question_id=${questionId}`)

  // 相似帖子检索：标题 / 摘要 / 正文三字段任一命中即召回
  let similarPosts = []
  try {
    const { rows } = await dbQuery(
      `SELECT id, title, summary FROM posts
       WHERE status='published'
         AND (title ILIKE '%'||$1||'%' OR summary ILIKE '%'||$1||'%' OR content ILIKE '%'||$1||'%')
       LIMIT 5`,
      [content]
    )
    similarPosts = rows.map((r) => ({ id: r.id, title: r.title, summary: r.summary }))
    console.log(`[AI:qa/start] 相似帖子检索完成 命中=${similarPosts.length}条`)
  } catch (err) {
    // posts 表查询失败不阻断流程，降级为空列表
    console.warn('[AI:qa/start] 相似帖子查询失败:', err.message)
  }

  // 知识库检索：失败降级，避免知识库表缺失导致整个接口 500
  let knowledgeItems = []
  try {
    const { rows } = await dbQuery(
      `SELECT id, title, content FROM knowledge_items
       WHERE status='active'
         AND (title ILIKE '%'||$1||'%' OR content ILIKE '%'||$1||'%')
       LIMIT 3`,
      [content]
    )
    knowledgeItems = rows.map((r) => ({ id: r.id, title: r.title, content: r.content }))
    console.log(`[AI:qa/start] 知识库检索完成 命中=${knowledgeItems.length}条`)
  } catch (err) {
    console.warn('[AI:qa/start] 知识库查询失败:', err.message)
  }

  console.log(`[AI:qa/start] 返回响应 question_id=${questionId}`)
  return sendJson(res, 200, {
    question_id: questionId,
    similar_posts: similarPosts,
    knowledge_items: knowledgeItems,
  })
}

/**
 * AI 答疑流式生成：SSE 推送回答片段，结束后写 ai_answers / source_citations
 * 敏感话题检测：回答包含 [敏感问题] 标记则 safety_label='sensitive'
 */
async function handleAIQAStream(req, res, authUser) {
  const userId = authUser.userId
  console.log(`[AI:qa/stream] 收到请求 userId=${userId}`)
  const rate = await aiRateLimit(userId)
  if (!rate.ok) {
    console.warn(`[AI:qa/stream] 限流拦截 userId=${userId}`)
    return sendJson(res, 429, { error: 'AI 调用过于频繁，请稍后再试' })
  }

  const body = await readJsonBody(req)
  const { question_id } = body
  if (!question_id) {
    console.warn('[AI:qa/stream] 缺少 question_id')
    return sendJson(res, 400, { error: '缺少必填字段：question_id' })
  }
  console.log(`[AI:qa/stream] question_id=${question_id}`)

  // 回查问题记录拿到原文，重新检索上下文（questions 表未存储检索结果）
  const { rows: qRows } = await dbQuery(
    `SELECT id, content FROM questions WHERE id = $1`,
    [question_id]
  )
  if (qRows.length === 0) {
    console.warn(`[AI:qa/stream] 问题不存在 question_id=${question_id}`)
    return sendJson(res, 404, { error: '问题不存在' })
  }
  const question = qRows[0]
  console.log(`[AI:qa/stream] 回查问题成功 内容长度=${question.content.length}`)

  // 重新检索相似帖子，作为 LLM 上下文与后续引用来源
  let similarPosts = []
  try {
    const { rows } = await dbQuery(
      `SELECT id, title, summary FROM posts
       WHERE status='published'
         AND (title ILIKE '%'||$1||'%' OR summary ILIKE '%'||$1||'%' OR content ILIKE '%'||$1||'%')
       LIMIT 5`,
      [question.content]
    )
    similarPosts = rows.map((r) => ({ id: r.id, title: r.title, summary: r.summary }))
    console.log(`[AI:qa/stream] 相似帖子检索完成 命中=${similarPosts.length}条`)
  } catch (err) {
    console.warn('[AI:qa/stream] 相似帖子查询失败:', err.message)
  }

  let knowledgeItems = []
  try {
    const { rows } = await dbQuery(
      `SELECT id, title, content FROM knowledge_items
       WHERE status='active'
         AND (title ILIKE '%'||$1||'%' OR content ILIKE '%'||$1||'%')
       LIMIT 3`,
      [question.content]
    )
    knowledgeItems = rows.map((r) => ({ id: r.id, title: r.title, content: r.content }))
    console.log(`[AI:qa/stream] 知识库检索完成 命中=${knowledgeItems.length}条`)
  } catch (err) {
    console.warn('[AI:qa/stream] 知识库查询失败:', err.message)
  }

  // 拼装上下文：把相似帖子与知识库条目作为参考资料喂给模型
  const postContext = similarPosts.length > 0
    ? similarPosts.map((p, i) => `帖子${i + 1}《${p.title}》：${p.summary || ''}`).join('\n')
    : '（暂无相关帖子）'
  const knowledgeContext = knowledgeItems.length > 0
    ? knowledgeItems.map((k, i) => `知识${i + 1}《${k.title}》：${(k.content || '').slice(0, 200)}`).join('\n')
    : '（暂无相关知识）'

  const systemPrompt = `你是一个论坛AI助手。请回答用户的问题。
规则：
1. 如果问题涉及医疗、法律、投资、政治、人身安全等敏感话题，在回答开头标注[敏感问题]并附上"以上信息仅供参考，请咨询专业渠道获取准确建议"
2. 引用站内帖子时请注明来源
3. 不得输出绝对结论
4. 以下是站内相关帖子供参考：
${postContext}

以下是知识库相关条目供参考：
${knowledgeContext}`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: question.content },
  ]

  console.log(`[AI:qa/stream] 上下文准备完成 systemPrompt长度=${systemPrompt.length} 开始流式调用 LLM...`)

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })

  const startMs = Date.now()
  let success = false
  let errorMsg = null
  let usage = null
  let fullAnswer = ''
  const logId = `aul_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const rawReq = truncateForLog(JSON.stringify({ question_id }), 1000)

  function writeUsageLog() {
    const latMs = Date.now() - startMs
    const promptTokens = usage?.prompt_tokens ?? 0
    const completionTokens = usage?.completion_tokens ?? 0
    dbQuery(
      `INSERT INTO ai_usage_logs (id, user_id, model, prompt_tokens, completion_tokens, latency_ms, error_msg, raw_request_truncated, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [logId, userId, 'deepseek-chat', promptTokens, completionTokens, latMs, errorMsg, rawReq]
    ).catch((err) => console.warn('[ai_usage_logs] 写入失败:', err.message))
  }

  try {
    await streamChatCompletion(
      messages,
      { temperature: 0.7, max_tokens: 1024 },
      (text) => {
        fullAnswer += text
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`)
      },
      (finalText, finalUsage) => {
        // onDone 给出权威完整文本，覆盖累加值避免丢字符；DB 写入延后到 await 完成后执行
        fullAnswer = finalText
        usage = finalUsage
      }
    )

    // 流式完成，开始落库
    success = true
    const safetyLabel = fullAnswer.includes('[敏感问题]') ? 'sensitive' : 'normal'
    const answerId = crypto.randomUUID()
    const citationIds = similarPosts.map((p) => p.id)
    console.log(`[AI:qa/stream] 流式完成 回答长度=${fullAnswer.length} safety_label=${safetyLabel} 开始落库...`)

    try {
      await dbQuery(
        `INSERT INTO ai_answers (id, question_id, content, safety_label, citation_ids, generated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [answerId, question_id, fullAnswer, safetyLabel, citationIds]
      )
      // 为每个相似帖子写入引用来源明细
      for (const post of similarPosts) {
        await dbQuery(
          `INSERT INTO source_citations (id, answer_id, source_type, source_id, title, excerpt, created_at)
           VALUES ($1, $2, 'post', $3, $4, $5, NOW())`,
          [crypto.randomUUID(), answerId, post.id, post.title, post.summary]
        )
      }
      // 更新问题状态为已回答
      await dbQuery(`UPDATE questions SET status='answered' WHERE id=$1`, [question_id])
      console.log(`[AI:qa/stream] 落库成功 answer_id=${answerId} citations=${citationIds.length}条`)
    } catch (err) {
      console.warn('[AI:qa/stream] 落库失败:', err.message)
    }

    writeUsageLog()
    res.write(`data: ${JSON.stringify({ done: true, safety_label: safetyLabel, question_id })}\n\n`)
    res.end()
    console.log(`[AI:qa/stream] SSE 响应已结束 question_id=${question_id}`)
  } catch (e) {
    errorMsg = String(e.message || e).slice(0, 500)
    console.error(`[AI:qa/stream] 流式生成失败: ${errorMsg}`)
    writeUsageLog()
    res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`)
    res.write(`data: ${JSON.stringify({ done: true, safety_label: 'normal', question_id })}\n\n`)
    res.end()
  }

  return true
}

/**
 * 知识库列表：支持按 title 模糊搜索，排除已归档条目
 */
async function handleAdminListKnowledge(req, res, authUser, url) {
  if (!requireAdmin(authUser)) {
    return sendJson(res, 403, { error: '需要管理员权限' })
  }
  const search = url?.searchParams?.get('search') || null
  const { rows } = await dbQuery(
    `SELECT id, title, content, tags, status, updated_at
     FROM knowledge_items
     WHERE status != 'archived'
       AND ($1::text IS NULL OR title ILIKE '%'||$1||'%')
     ORDER BY updated_at DESC`,
    [search]
  )
  return sendJson(res, 200, rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    tags: r.tags || [],
    status: r.status,
    updatedAt: toISO(r.updated_at),
  })))
}

/**
 * 知识库新增：id 用 crypto.randomUUID 生成，记录最近维护人
 */
async function handleAdminCreateKnowledge(req, res, authUser) {
  if (!requireAdmin(authUser)) {
    return sendJson(res, 403, { error: '需要管理员权限' })
  }
  const body = await readJsonBody(req)
  const { title, content, tags } = body
  if (!title) {
    return sendJson(res, 400, { error: '缺少必填字段：title' })
  }
  const id = crypto.randomUUID()
  const tagArr = Array.isArray(tags) ? tags : []
  await dbQuery(
    `INSERT INTO knowledge_items (id, title, content, tags, status, updated_by, updated_at, created_at)
     VALUES ($1, $2, $3, $4, 'active', $5, NOW(), NOW())`,
    [id, title, content || null, tagArr, authUser.userId]
  )
  return sendJson(res, 201, { id, title, content: content || null, tags: tagArr, status: 'active' })
}

/**
 * 知识库编辑：更新标题 / 正文 / 标签，刷新 updated_at
 */
async function handleAdminUpdateKnowledge(req, res, authUser, id) {
  if (!requireAdmin(authUser)) {
    return sendJson(res, 403, { error: '需要管理员权限' })
  }
  const body = await readJsonBody(req)
  const { title, content, tags } = body
  const tagArr = Array.isArray(tags) ? tags : []
  const { rowCount } = await dbQuery(
    `UPDATE knowledge_items
     SET title=$1, content=$2, tags=$3, updated_by=$4, updated_at=NOW()
     WHERE id=$5`,
    [title, content, tagArr, authUser.userId, id]
  )
  if (rowCount === 0) {
    return sendJson(res, 404, { error: '知识库条目不存在' })
  }
  return sendJson(res, 200, { id, title, content, tags: tagArr })
}

/**
 * 知识库归档（软删除）：仅置 status='archived'，保留数据可恢复
 */
async function handleAdminDeleteKnowledge(req, res, authUser, id) {
  if (!requireAdmin(authUser)) {
    return sendJson(res, 403, { error: '需要管理员权限' })
  }
  const { rowCount } = await dbQuery(
    `UPDATE knowledge_items SET status='archived' WHERE id=$1`,
    [id]
  )
  if (rowCount === 0) {
    return sendJson(res, 404, { error: '知识库条目不存在' })
  }
  return sendJson(res, 200, { id, status: 'archived' })
}

/**
 * 启动时自动确保 Phase1 新增表存在（幂等）
 * 避免部署后忘记执行迁移脚本导致 guest_sessions / ai_usage_logs 缺表 → 500
 */
async function ensurePhase1Tables() {
  const statements = [
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
    'CREATE INDEX IF NOT EXISTS idx_guest_sessions_device_id ON guest_sessions(device_id)',
    'CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id ON ai_usage_logs(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON ai_usage_logs(created_at)',
  ]
  for (const sql of statements) {
    try {
      await dbQuery(sql)
    } catch (err) {
      // 单条失败不阻断启动（可能 users 表尚未创建等，后续 migrate 脚本会补全）
      console.warn('[ensurePhase1Tables] 语句执行失败（可忽略）:', err.message)
    }
  }
  console.log('📦 Phase1 表自检完成（guest_sessions / ai_usage_logs）')
}

/**
 * 启动时自动确保 Phase2 新增表存在（幂等）
 * 覆盖 questions / ai_answers / source_citations / knowledge_items，避免缺表导致问答与知识库接口 500
 */
async function ensurePhase2Tables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      content TEXT,
      source_mode TEXT DEFAULT 'site_only',
      status TEXT DEFAULT 'submitted',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS ai_answers (
      id TEXT PRIMARY KEY,
      question_id TEXT REFERENCES questions(id) ON DELETE CASCADE,
      content TEXT,
      safety_label TEXT DEFAULT 'normal',
      citation_ids TEXT[] DEFAULT '{}',
      generated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
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
    'CREATE INDEX IF NOT EXISTS idx_questions_user_id ON questions(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_ai_answers_question_id ON ai_answers(question_id)',
    'CREATE INDEX IF NOT EXISTS idx_source_citations_answer_id ON source_citations(answer_id)',
    'CREATE INDEX IF NOT EXISTS idx_knowledge_items_status ON knowledge_items(status)',
  ]
  for (const sql of statements) {
    try {
      await dbQuery(sql)
    } catch (err) {
      // 单条失败不阻断启动（依赖的父表可能尚未创建，后续 migrate 脚本会补全）
      console.warn('[ensurePhase2Tables] 语句执行失败（可忽略）:', err.message)
    }
  }
  console.log('📦 Phase2 表自检完成')
}

/**
 * 启动时自动确保 Phase4 内容审核相关表与字段存在（幂等）
 * - moderation_cases / reports 两张表
 * - posts/comments/boards 的风险等级与状态字段
 * 避免缺表/缺字段导致审核与举报接口 500
 */
async function ensurePhase4Tables() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS moderation_cases (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      source TEXT DEFAULT 'manual',
      risk_type TEXT,
      risk_level TEXT DEFAULT 'none',
      status TEXT DEFAULT 'open',
      assignee_id TEXT,
      resolution_note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      resolved_at TIMESTAMPTZ
    )`,
    `CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    // posts 已存在 risk_level 列，IF NOT EXISTS 保证幂等不报错
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'none'`,
    `ALTER TABLE posts ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'normal'`,
    `ALTER TABLE comments ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'none'`,
    `ALTER TABLE comments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published'`,
    `ALTER TABLE boards ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`,
    'CREATE INDEX IF NOT EXISTS idx_moderation_cases_status ON moderation_cases(status)',
    'CREATE INDEX IF NOT EXISTS idx_moderation_cases_risk_level ON moderation_cases(risk_level)',
    'CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)',
  ]
  for (const sql of statements) {
    try {
      await dbQuery(sql)
    } catch (err) {
      // 单条失败不阻断启动（可能依赖表尚未创建等，后续 migrate 脚本会补全）
      console.warn('[ensurePhase4Tables] 语句执行失败（可忽略）:', err.message)
    }
  }
  console.log('📦 Phase4 表自检完成')
}

/**
 * AI 小助手的固定用户 ID，发帖自动回复和 @ai小助手 触发的回复都以该用户身份发布
 */
const AI_ASSISTANT_USER_ID = 'u_ai_assistant'

/**
 * 启动时确保 AI 小助手用户存在（幂等）
 * 头像文字为 "AI"，昵称 "AI小助手"，roles 标记为 ai_assistant 便于前端识别
 */
async function ensureAIAssistantUser() {
  try {
    await dbQuery(
      `INSERT INTO users (id, nickname, email, avatar_text, bio, handle, status, roles, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        AI_ASSISTANT_USER_ID,
        'AI小助手',
        'ai-assistant@ai-forum.local',
        'AI',
        '我是论坛的 AI 小助手，可以帮你解答问题、补充观点。在评论中 @ai小助手 即可召唤我。',
        'ai_assistant',
        ['user', 'ai_assistant'],
      ]
    )
    console.log('🤖 AI 小助手用户已就绪')
  } catch (err) {
    console.warn('[ensureAIAssistantUser] 初始化失败（可忽略，首次调用时再创建）:', err.message)
  }
}

/**
 * 发帖后异步生成 AI 评论：读取帖子标题+正文，调用 LLM 生成一条简短评论
 * - 不阻塞发帖响应，失败静默忽略
 * - AI 评论的 author_id 为 AI_ASSISTANT_USER_ID
 * - 内容控制在 200 字以内，风格友好、有观点增量
 */
async function generateAICommentForPost(postId) {
  try {
    console.log(`[AI:auto-comment] 开始为帖子 ${postId} 生成 AI 评论`)
    const { rows } = await dbQuery(
      `SELECT id, title, content, summary FROM posts WHERE id = $1`,
      [postId]
    )
    if (rows.length === 0) {
      console.warn(`[AI:auto-comment] 帖子不存在 postId=${postId}`)
      return
    }
    const post = rows[0]
    const postContext = `标题：${post.title}\n摘要：${post.summary || '无'}\n正文：${(post.content || '').slice(0, 800)}`

    const systemPrompt = `你是一个论坛的 AI 小助手。用户刚发了一篇帖子，请你作为社区参与者写一条简短评论。
要求：
1. 评论内容 50-150 字，友好、有观点增量（不要单纯复述帖子内容）
2. 可以补充一个相关视角、提一个引导性问题、或分享一个相关经验
3. 不要使用 markdown 格式，纯文本即可
4. 不要说"作为AI"，直接以社区成员口吻评论`

    const result = await createChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: postContext },
      ],
      { temperature: 0.8, max_tokens: 256 }
    )
    const reply = (result.content || '').trim()
    if (!reply) {
      console.warn(`[AI:auto-comment] LLM 返回空内容 postId=${postId}`)
      return
    }

    const commentId = `c_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    await dbQuery(
      `INSERT INTO comments (id, post_id, author_id, parent_id, content, likes, created_at)
       VALUES ($1, $2, $3, NULL, $4, 0, NOW())`,
      [commentId, postId, AI_ASSISTANT_USER_ID, reply]
    )
    // 帖子评论计数 +1
    await dbQuery(
      `UPDATE posts SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = $1`,
      [postId]
    )
    // 失效评论缓存，让前端下次拉取能看到 AI 评论
    await cacheDel(commentsKey(postId))
    await cacheDel(postKey(postId))
    console.log(`[AI:auto-comment] AI 评论已生成 commentId=${commentId} 长度=${reply.length}`)
  } catch (err) {
    console.warn(`[AI:auto-comment] 生成失败 postId=${postId}:`, err.message)
  }
}

/**
 * @ai小助手 触发的 AI 回复：用户在评论中 @ai小助手，AI 以子评论身份回复
 * - 读取触发评论 + 帖子上下文 + 同帖其他评论，调用 LLM 生成回复
 * - 回复的 parent_id 指向触发评论，author_id 为 AI_ASSISTANT_USER_ID
 */
async function generateAIReplyForComment(commentId, postId) {
  try {
    console.log(`[AI:reply-comment] 开始为评论 ${commentId} 生成 AI 回复`)
    // 读取触发评论内容
    const { rows: commentRows } = await dbQuery(
      `SELECT id, content, author_id FROM comments WHERE id = $1`,
      [commentId]
    )
    if (commentRows.length === 0) {
      console.warn(`[AI:reply-comment] 评论不存在 commentId=${commentId}`)
      return
    }
    const triggerComment = commentRows[0]

    // 读取帖子上下文
    const { rows: postRows } = await dbQuery(
      `SELECT id, title, content FROM posts WHERE id = $1`,
      [postId]
    )
    if (postRows.length === 0) {
      console.warn(`[AI:reply-comment] 帖子不存在 postId=${postId}`)
      return
    }
    const post = postRows[0]

    // 读取同帖最近 5 条评论作为对话上下文
    const { rows: contextRows } = await dbQuery(
      `SELECT c.content, u.nickname
       FROM comments c
       LEFT JOIN users u ON c.author_id = u.id
       WHERE c.post_id = $1 AND c.id != $2
       ORDER BY c.created_at DESC
       LIMIT 5`,
      [postId, commentId]
    )
    const contextText = contextRows.length > 0
      ? contextRows.map((r) => `${r.nickname || '匿名'}：${r.content}`).join('\n')
      : '（暂无其他评论）'

    const systemPrompt = `你是一个论坛的 AI 小助手。用户在评论中 @你，请你回复。
帖子标题：${post.title}
帖子正文：${(post.content || '').slice(0, 500)}

对话上下文（最近评论）：
${contextText}

要求：
1. 回复内容 50-200 字，直接回应用户的评论
2. 友好、有帮助，可以补充信息、解答疑问或提供不同视角
3. 不要使用 markdown 格式，纯文本
4. 不要说"作为AI"，以社区成员口吻回复`

    const userMessage = `用户${triggerComment.author_id === AI_ASSISTANT_USER_ID ? '（另一用户）' : ''}说：${triggerComment.content}`

    const result = await createChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      { temperature: 0.8, max_tokens: 384 }
    )
    const reply = (result.content || '').trim()
    if (!reply) {
      console.warn(`[AI:reply-comment] LLM 返回空内容 commentId=${commentId}`)
      return
    }

    const replyId = `c_ai_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    await dbQuery(
      `INSERT INTO comments (id, post_id, author_id, parent_id, content, likes, created_at)
       VALUES ($1, $2, $3, $4, $5, 0, NOW())`,
      [replyId, postId, AI_ASSISTANT_USER_ID, commentId, reply]
    )
    // 帖子评论计数 +1
    await dbQuery(
      `UPDATE posts SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = $1`,
      [postId]
    )
    // 失效评论缓存
    await cacheDel(commentsKey(postId))
    await cacheDel(postKey(postId))
    console.log(`[AI:reply-comment] AI 回复已生成 replyId=${replyId} 长度=${reply.length}`)
  } catch (err) {
    console.warn(`[AI:reply-comment] 生成失败 commentId=${commentId}:`, err.message)
  }
}

// ======== Phase4：内容审核 / 举报 / 后台管理 ========

/**
 * 鉴权辅助：检查是否为管理员或版主
 * roles 包含 admin / moderator / super_admin 任一即通过
 */
function requireAdminOrMod(authUser) {
  if (!authUser || !Array.isArray(authUser.roles)) return false
  return authUser.roles.some((r) => r === 'admin' || r === 'moderator' || r === 'super_admin')
}

/**
 * 鉴权辅助：检查是否为管理员（仅 admin / super_admin）
 * 用于用户管理与版块管理这类高权限操作
 */
function requireAdmin(authUser) {
  if (!authUser || !Array.isArray(authUser.roles)) return false
  return authUser.roles.some((r) => r === 'admin' || r === 'super_admin')
}

/**
 * 失效指定用户在 Redis 中的全部 session（封禁/限制时调用，使 token 立即失效）
 * 通过 SCAN 匹配 af:session:{userId}:* 后批量 DEL，避免阻塞
 */
async function invalidateUserSessions(userId) {
  if (!redis || !isRedisConnected()) return
  try {
    const pattern = `af:session:${userId}:*`
    let cursor = '0'
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      if (keys.length > 0) {
        await redis.del(...keys)
      }
      cursor = nextCursor
    } while (cursor !== '0')
  } catch (err) {
    console.warn('[invalidateUserSessions] 失败:', err.message)
  }
}

// ======== Task 16：审核队列 API ========

/**
 * 审核队列列表：支持 status / risk_level / board_id 筛选
 * 按风险等级（high→medium→low→其他）排序，同级按创建时间倒序
 * 同时回查每条 case 对应的目标内容（帖子标题或评论内容）用于后台展示
 */
async function handleListModeration(req, res, authUser, url) {
  if (!requireAdminOrMod(authUser)) {
    return sendJson(res, 403, { error: '需要管理员或版主权限' })
  }
  const status = url.searchParams.get('status') || 'open'
  const riskLevel = url.searchParams.get('risk_level')
  const boardId = url.searchParams.get('board_id')

  // 动态拼接 WHERE：status 必填，risk_level / board_id 可选
  const params = [status]
  let where = `WHERE mc.status = $1`
  let idx = 2
  if (riskLevel) {
    where += ` AND mc.risk_level = $${idx++}`
    params.push(riskLevel)
  }
  if (boardId) {
    // board_id 不在 moderation_cases 表中，通过子查询关联 post 的 board_id（仅 post 类型 case 受影响）
    where += ` AND EXISTS (SELECT 1 FROM posts p WHERE p.id = mc.target_id AND mc.target_type = 'post' AND p.board_id = $${idx++})`
    params.push(boardId)
  }

  const { rows } = await dbQuery(
    `SELECT mc.*, u.nickname AS reporter_name
     FROM moderation_cases mc
     LEFT JOIN users u ON mc.assignee_id = u.id
     ${where}
     ORDER BY CASE mc.risk_level WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
              mc.created_at DESC
     LIMIT 50`,
    params
  )

  // 批量回查目标内容，避免 N+1：分别收集 post / comment 的 id
  const postIds = rows.filter((r) => r.target_type === 'post').map((r) => r.target_id)
  const commentIds = rows.filter((r) => r.target_type === 'comment').map((r) => r.target_id)
  const postTitleMap = new Map()
  const commentContentMap = new Map()
  if (postIds.length > 0) {
    const { rows: postRows } = await dbQuery(
      `SELECT id, title FROM posts WHERE id = ANY($1::text[])`,
      [postIds]
    )
    for (const r of postRows) postTitleMap.set(r.id, r.title)
  }
  if (commentIds.length > 0) {
    const { rows: commentRows } = await dbQuery(
      `SELECT id, content FROM comments WHERE id = ANY($1::text[])`,
      [commentIds]
    )
    for (const r of commentRows) commentContentMap.set(r.id, r.content)
  }

  const result = rows.map((r) => ({
    id: r.id,
    targetType: r.target_type,
    targetId: r.target_id,
    source: r.source,
    riskType: r.risk_type,
    riskLevel: r.risk_level,
    status: r.status,
    assigneeId: r.assignee_id,
    reporterName: r.reporter_name,
    resolutionNote: r.resolution_note,
    createdAt: toISO(r.created_at),
    resolvedAt: toISO(r.resolved_at),
    // 附加目标内容快照，便于后台直接展示而无需二次请求
    targetContent:
      r.target_type === 'post'
        ? postTitleMap.get(r.target_id) || null
        : commentContentMap.get(r.target_id) || null,
  }))
  return sendJson(res, 200, result)
}

/**
 * 处理审核 case：approve / fold / delete
 * - approve：仅标记 case 已解决，不改目标状态
 * - fold：评论折叠（status='folded'）
 * - delete：目标 status='removed'
 */
async function handleResolveModeration(req, res, authUser, id) {
  if (!requireAdminOrMod(authUser)) {
    return sendJson(res, 403, { error: '需要管理员或版主权限' })
  }
  const body = await readJsonBody(req)
  const { action, note } = body
  if (!['approve', 'fold', 'delete'].includes(action)) {
    return sendJson(res, 400, { error: 'action 必须为 approve / fold / delete' })
  }

  // 先查出 case 以拿到 target_type / target_id，决定后续目标状态变更
  const { rows: caseRows } = await dbQuery(
    `SELECT * FROM moderation_cases WHERE id = $1`,
    [id]
  )
  if (caseRows.length === 0) {
    return sendJson(res, 404, { error: '审核 case 不存在' })
  }
  const target = caseRows[0]

  // 标记 case 已解决
  await dbQuery(
    `UPDATE moderation_cases SET status = 'resolved', resolution_note = $1, resolved_at = NOW() WHERE id = $2`,
    [note || null, id]
  )

  // 根据动作变更目标状态
  if (action === 'fold' && target.target_type === 'comment') {
    await dbQuery(`UPDATE comments SET status = 'folded' WHERE id = $1`, [target.target_id])
  } else if (action === 'delete') {
    if (target.target_type === 'post') {
      await dbQuery(`UPDATE posts SET status = 'removed' WHERE id = $1`, [target.target_id])
    } else if (target.target_type === 'comment') {
      await dbQuery(`UPDATE comments SET status = 'removed' WHERE id = $1`, [target.target_id])
    }
  }
  // approve 不变更目标状态
  return sendJson(res, 200, { ok: true })
}

// ======== Task 17：举报 API ========

/**
 * 创建举报：写入 reports 表，并同步创建 moderation_case 进入审核队列
 */
async function handleCreateReport(req, res, authUser) {
  const body = await readJsonBody(req)
  const { target_type, target_id, reason } = body
  if (!target_type || !target_id || !reason) {
    return sendJson(res, 400, { error: '缺少必填字段：target_type, target_id, reason' })
  }
  const reportId = crypto.randomUUID()
  const caseId = crypto.randomUUID()
  await dbQuery(
    `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', NOW())`,
    [reportId, authUser.userId, target_type, target_id, reason]
  )
  // 同步进入审核队列，source='report' 区分来源
  await dbQuery(
    `INSERT INTO moderation_cases (id, target_type, target_id, source, risk_type, status, created_at)
     VALUES ($1, $2, $3, 'report', $4, 'open', NOW())`,
    [caseId, target_type, target_id, reason]
  )
  return sendJson(res, 201, { ok: true })
}

/**
 * 举报列表：按创建时间倒序，最多 50 条
 */
async function handleListReports(req, res, authUser) {
  if (!requireAdminOrMod(authUser)) {
    return sendJson(res, 403, { error: '需要管理员或版主权限' })
  }
  const { rows } = await dbQuery(
    `SELECT r.*, u.nickname AS reporter_name
     FROM reports r
     LEFT JOIN users u ON r.reporter_id = u.id
     ORDER BY r.created_at DESC
     LIMIT 50`
  )
  const result = rows.map((r) => ({
    id: r.id,
    reporterId: r.reporter_id,
    reporterName: r.reporter_name,
    targetType: r.target_type,
    targetId: r.target_id,
    reason: r.reason,
    status: r.status,
    createdAt: toISO(r.created_at),
  }))
  return sendJson(res, 200, result)
}

/**
 * 处理举报：reject / warn / delete / ban
 * - reject：举报被驳回
 * - warn：仅记录（标 resolved）
 * - delete：删除被举报内容（status='removed'）
 * - ban：封禁内容作者（查询目标找出 author_id 后 UPDATE users status='banned'）
 */
async function handleHandleReport(req, res, authUser, id) {
  if (!requireAdminOrMod(authUser)) {
    return sendJson(res, 403, { error: '需要管理员或版主权限' })
  }
  const body = await readJsonBody(req)
  const { action, note } = body
  if (!['reject', 'warn', 'delete', 'ban'].includes(action)) {
    return sendJson(res, 400, { error: 'action 必须为 reject / warn / delete / ban' })
  }

  const { rows: reportRows } = await dbQuery(`SELECT * FROM reports WHERE id = $1`, [id])
  if (reportRows.length === 0) {
    return sendJson(res, 404, { error: '举报记录不存在' })
  }
  const report = reportRows[0]

  // reject → rejected，其余 → resolved
  const newStatus = action === 'reject' ? 'rejected' : 'resolved'
  await dbQuery(
    `UPDATE reports SET status = $1 WHERE id = $2`,
    [newStatus, id]
  )

  // delete：将目标内容标记为 removed
  if (action === 'delete') {
    if (report.target_type === 'post') {
      await dbQuery(`UPDATE posts SET status = 'removed' WHERE id = $1`, [report.target_id])
    } else if (report.target_type === 'comment') {
      await dbQuery(`UPDATE comments SET status = 'removed' WHERE id = $1`, [report.target_id])
    }
  }

  // ban：封禁内容作者（注意是作者，不是举报人）
  if (action === 'ban') {
    let authorId = null
    if (report.target_type === 'post') {
      const { rows } = await dbQuery(`SELECT author_id FROM posts WHERE id = $1`, [report.target_id])
      authorId = rows[0]?.author_id || null
    } else if (report.target_type === 'comment') {
      const { rows } = await dbQuery(`SELECT author_id FROM comments WHERE id = $1`, [report.target_id])
      authorId = rows[0]?.author_id || null
    }
    if (authorId) {
      await dbQuery(`UPDATE users SET status = 'banned' WHERE id = $1`, [authorId])
      // 失效该作者的所有 session，使其 token 立即失效
      await invalidateUserSessions(authorId)
    }
  }

  // note 暂存到 moderation_cases 关联记录（如有），此处仅记录到日志便于审计
  if (note) {
    console.log(`[report:${id}] action=${action} note=${note}`)
  }
  return sendJson(res, 200, { ok: true })
}

// ======== Task 18：用户管理 API ========

/**
 * 用户列表（后台）：支持 search 模糊搜索 + 分页
 * 返回 { users, total } 便于前端分页展示
 */
async function handleAdminListUsers(req, res, authUser, url) {
  if (!requireAdmin(authUser)) {
    return sendJson(res, 403, { error: '需要管理员权限' })
  }
  const search = url.searchParams.get('search') || null
  const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10))
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10))

  // $1::text IS NULL 让无 search 时跳过筛选；ILIKE 模糊匹配 nickname / email
  const { rows } = await dbQuery(
    `SELECT id, nickname, email, status, roles, created_at
     FROM users
     WHERE ($1::text IS NULL OR nickname ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [search, limit, offset]
  )
  const { rows: countRows } = await dbQuery(
    `SELECT COUNT(*)::int AS total
     FROM users
     WHERE ($1::text IS NULL OR nickname ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')`,
    [search]
  )
  const users = rows.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    email: r.email,
    status: r.status,
    roles: r.roles || [],
    createdAt: toISO(r.created_at),
  }))
  return sendJson(res, 200, { users, total: countRows[0]?.total || 0 })
}

/**
 * 更新用户状态：active / limited / banned
 * 封禁时同步失效 Redis session，使该用户 token 立即失效
 */
async function handleAdminUpdateUserStatus(req, res, authUser, id) {
  if (!requireAdmin(authUser)) {
    return sendJson(res, 403, { error: '需要管理员权限' })
  }
  const body = await readJsonBody(req)
  const { status } = body
  if (!['active', 'limited', 'banned'].includes(status)) {
    return sendJson(res, 400, { error: 'status 必须为 active / limited / banned' })
  }
  await dbQuery(`UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id])
  // 封禁时清空所有 session，强制下线
  if (status === 'banned') {
    await invalidateUserSessions(id)
  }
  // 清除用户相关缓存
  await cacheDel(userKey(id))
  await cacheDel(userListKey())
  return sendJson(res, 200, { ok: true })
}

/**
 * 更新用户角色：roles 为字符串数组
 * 使用 $1::text[] 显式类型，兼容 PostgreSQL 严格模式
 */
async function handleAdminUpdateUserRoles(req, res, authUser, id) {
  if (!requireAdmin(authUser)) {
    return sendJson(res, 403, { error: '需要管理员权限' })
  }
  const body = await readJsonBody(req)
  const { roles } = body
  if (!Array.isArray(roles)) {
    return sendJson(res, 400, { error: 'roles 必须为字符串数组' })
  }
  await dbQuery(
    `UPDATE users SET roles = $1::text[], updated_at = NOW() WHERE id = $2`,
    [roles, id]
  )
  await cacheDel(userKey(id))
  await cacheDel(userListKey())
  return sendJson(res, 200, { ok: true })
}

// ======== Task 19：版块管理 API ========

/**
 * 创建版块：id 用 UUID，status 默认 'active'
 * 创建后失效版块列表缓存
 */
async function handleAdminCreateBoard(req, res, authUser) {
  if (!requireAdmin(authUser)) {
    return sendJson(res, 403, { error: '需要管理员权限' })
  }
  const body = await readJsonBody(req)
  const { name, description, icon, color, governance_mode } = body
  if (!name) {
    return sendJson(res, 400, { error: '缺少必填字段：name' })
  }
  const id = crypto.randomUUID()
  await dbQuery(
    `INSERT INTO boards (id, name, description, icon, color, governance_mode, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
    [id, name, description || null, icon || null, color || null, governance_mode || 'open']
  )
  await cacheDel(boardListKey())
  return sendJson(res, 201, { id, ok: true })
}

/**
 * 编辑版块：仅更新提供的字段（动态拼接 SET 子句）
 */
async function handleAdminEditBoard(req, res, authUser, id) {
  if (!requireAdmin(authUser)) {
    return sendJson(res, 403, { error: '需要管理员权限' })
  }
  const body = await readJsonBody(req)
  const allowedFields = ['name', 'description', 'icon', 'color', 'governance_mode']
  const setClauses = []
  const params = []
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      params.push(body[field])
      setClauses.push(`${field} = $${params.length}`)
    }
  }
  if (setClauses.length === 0) {
    return sendJson(res, 400, { error: '未提供任何可更新字段' })
  }
  params.push(id)
  await dbQuery(
    `UPDATE boards SET ${setClauses.join(', ')} WHERE id = $${params.length}`,
    params
  )
  await cacheDel(boardListKey())
  return sendJson(res, 200, { ok: true })
}

/**
 * 归档版块：软删除，status='archived'（不在列表展示，但保留数据）
 */
async function handleAdminArchiveBoard(req, res, authUser, id) {
  if (!requireAdmin(authUser)) {
    return sendJson(res, 403, { error: '需要管理员权限' })
  }
  await dbQuery(`UPDATE boards SET status = 'archived' WHERE id = $1`, [id])
  await cacheDel(boardListKey())
  return sendJson(res, 200, { ok: true })
}

// ======== Task 20：后台总览 API ========

/**
 * 后台总览：6 个 COUNT 查询并行执行，返回关键运营指标
 */
async function handleAdminDashboard(req, res, authUser) {
  if (!requireAdminOrMod(authUser)) {
    return sendJson(res, 403, { error: '需要管理员或版主权限' })
  }
  const [
    usersRes,
    postsRes,
    commentsRes,
    moderationRes,
    todayUsersRes,
    todayPostsRes,
  ] = await Promise.all([
    dbQuery(`SELECT COUNT(*)::int AS cnt FROM users WHERE status != 'deleted'`),
    dbQuery(`SELECT COUNT(*)::int AS cnt FROM posts WHERE status = 'published'`),
    dbQuery(`SELECT COUNT(*)::int AS cnt FROM comments WHERE status = 'published'`),
    dbQuery(`SELECT COUNT(*)::int AS cnt FROM moderation_cases WHERE status = 'open'`),
    dbQuery(`SELECT COUNT(*)::int AS cnt FROM users WHERE created_at >= CURRENT_DATE`),
    dbQuery(`SELECT COUNT(*)::int AS cnt FROM posts WHERE created_at >= CURRENT_DATE`),
  ])
  return sendJson(res, 200, {
    total_users: usersRes.rows[0]?.cnt || 0,
    total_posts: postsRes.rows[0]?.cnt || 0,
    total_comments: commentsRes.rows[0]?.cnt || 0,
    pending_moderation: moderationRes.rows[0]?.cnt || 0,
    today_new_users: todayUsersRes.rows[0]?.cnt || 0,
    today_new_posts: todayPostsRes.rows[0]?.cnt || 0,
  })
}

async function handleGuestStart(req, res) {
  const body = await readJsonBody(req)
  let deviceId = body.deviceId || req.headers['x-device-id']
  if (!deviceId) {
    deviceId = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  }

  let session
  const { rows: existingRows } = await dbQuery(
    `SELECT * FROM guest_sessions WHERE device_id = $1 LIMIT 1`,
    [deviceId]
  )

  if (existingRows.length > 0) {
    const existing = existingRows[0]
    const { status: computedStatus } = computeGuestStatus(existing)

    if (existing.status === 'bound' || computedStatus === 'expired' || existing.status === 'expired') {
      await dbQuery(
        `UPDATE guest_sessions SET status = 'active', started_at = NOW(), expires_at = NOW() + INTERVAL '300 seconds', remaining_seconds = 300, bound_user_id = NULL, updated_at = NOW() WHERE device_id = $1`,
        [deviceId]
      )
    }
    const { rows: updatedRows } = await dbQuery(
      `SELECT * FROM guest_sessions WHERE device_id = $1 LIMIT 1`,
      [deviceId]
    )
    session = updatedRows[0]
  } else {
    const id = `gs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
    await dbQuery(
      `INSERT INTO guest_sessions (id, device_id, started_at, expires_at, status, bound_user_id, remaining_seconds) VALUES ($1, $2, NOW(), NOW() + INTERVAL '300 seconds', 'active', NULL, 300)`,
      [id, deviceId]
    )
    const { rows: insertedRows } = await dbQuery(
      `SELECT * FROM guest_sessions WHERE device_id = $1 LIMIT 1`,
      [deviceId]
    )
    session = insertedRows[0]
  }

  const { remainingSeconds, status } = computeGuestStatus(session)
  await dbQuery(
    `UPDATE guest_sessions SET remaining_seconds = $1, status = $2, updated_at = NOW() WHERE device_id = $3`,
    [remainingSeconds, status, deviceId]
  )

  return sendJson(res, 200, {
    deviceId,
    startedAt: toISO(session.started_at),
    expiresAt: toISO(session.expires_at),
    status,
    remainingSeconds,
  })
}

async function handleGuestPing(req, res, url) {
  const deviceId = url.searchParams.get('device_id')
  if (!deviceId) {
    return sendJson(res, 400, { error: '缺少 device_id' })
  }

  const { rows } = await dbQuery(
    `SELECT * FROM guest_sessions WHERE device_id = $1 LIMIT 1`,
    [deviceId]
  )
  if (rows.length === 0) {
    return sendJson(res, 404, { error: '会话不存在，请重新发起 start' })
  }

  const session = rows[0]
  let remainingSeconds, status

  if (session.bound_user_id) {
    remainingSeconds = session.remaining_seconds ?? 300
    status = 'bound'
  } else {
    const computed = computeGuestStatus(session)
    remainingSeconds = computed.remainingSeconds
    status = computed.status
  }

  await dbQuery(
    `UPDATE guest_sessions SET remaining_seconds = $1, status = $2, updated_at = NOW() WHERE device_id = $3`,
    [remainingSeconds, status, deviceId]
  )

  return sendJson(res, 200, {
    deviceId,
    startedAt: toISO(session.started_at),
    expiresAt: toISO(session.expires_at),
    status,
    remainingSeconds,
  })
}

async function handleGuestBind(req, res, authUser) {
  const body = await readJsonBody(req)
  const deviceId = body.deviceId
  if (!deviceId) {
    return sendJson(res, 400, { error: '缺少 deviceId' })
  }

  const { rows } = await dbQuery(
    `SELECT * FROM guest_sessions WHERE device_id = $1 LIMIT 1`,
    [deviceId]
  )
  if (rows.length === 0) {
    return sendJson(res, 404, { error: '会话不存在' })
  }

  await dbQuery(
    `UPDATE guest_sessions SET bound_user_id = $1, status = 'bound', remaining_seconds = 300, updated_at = NOW() WHERE device_id = $2`,
    [authUser.userId, deviceId]
  )

  return sendJson(res, 200, { ok: true, deviceId, status: 'bound' })
}

/**
 * 用户列表：支持 status / role 筛选
 * role 筛选使用 = ANY(roles) 匹配数组元素（用户可有多个角色）
 */
async function handleListUsers(req, res, url) {
  const status = url.searchParams.get('status')
  const role = url.searchParams.get('role')
  const cacheKey = userListKey(status, role)
  const cached = await cacheGet(cacheKey)
  if (cached) return sendJson(res, 200, cached)
  const where = []
  const params = []
  if (status) {
    params.push(status)
    where.push(`status = $${params.length}`)
  }
  if (role) {
    params.push(role)
    where.push(`$${params.length} = ANY(roles)`)
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const { rows } = await dbQuery(
    `SELECT * FROM users ${whereClause} ORDER BY joined_at DESC`,
    params
  )
  const result = rows.map(mapUser)
  await cacheSet(cacheKey, result, TTL_USERS)
  return sendJson(res, 200, result)
}

async function handleGetUser(req, res, id) {
  const cacheKey = userKey(id)
  const cached = await cacheGet(cacheKey)
  if (cached) return sendJson(res, 200, cached)
  const { rows } = await dbQuery(`SELECT * FROM users WHERE id = $1`, [id])
  if (rows.length === 0) {
    return sendJson(res, 404, { error: '用户不存在' })
  }
  const result = mapUser(rows[0])
  await cacheSet(cacheKey, result, TTL_USERS)
  return sendJson(res, 200, result)
}

async function handleGetUserStats(req, res, id) {
  const cacheKey = userStatsKey(id)
  const cached = await cacheGet(cacheKey)
  if (cached) return sendJson(res, 200, cached)
  let { rows } = await dbQuery(`SELECT * FROM user_stats WHERE user_id = $1`, [id])

  // 懒初始化：新注册用户没有 user_stats 记录，自动创建默认记录
  if (rows.length === 0) {
    await dbQuery(
      `INSERT INTO user_stats (user_id, post_count, favorite_count, following_count, follower_count, influence_score, total_likes, total_favorited)
       VALUES ($1, 0, 0, 0, 0, 0, 0, 0)`,
      [id]
    )
    ;({ rows } = await dbQuery(`SELECT * FROM user_stats WHERE user_id = $1`, [id]))
  }

  const result = mapUserStats(rows[0])
  await cacheSet(cacheKey, result, TTL_STATS)
  return sendJson(res, 200, result)
}

const TTL_USER_PROFILE = 60

function userProfileCacheKey(userId) {
  return `af:user:profile:${userId}`
}

async function handleGetUserProfile(req, res, userId) {
  const cacheKey = userProfileCacheKey(userId)
  const cached = await cacheGet(cacheKey)
  if (cached) return sendJson(res, 200, cached)

  const { rows: userRows } = await dbQuery(
    `SELECT id, handle, nickname, avatar_text, bio, profession, city, joined_at, created_at, updated_at FROM users WHERE id = $1`,
    [userId]
  )
  if (userRows.length === 0) {
    return sendJson(res, 404, { error: '用户不存在' })
  }
  const user = userRows[0]

  const [postCountRes, commentsCountRes, likesSumRes, favoritesCountRes] = await Promise.all([
    dbQuery(`SELECT COUNT(*) FROM posts WHERE author_id = $1 AND status = 'published'`, [userId]),
    dbQuery(`SELECT COUNT(*) FROM comments WHERE author_id = $1`, [userId]),
    dbQuery(`SELECT COALESCE(SUM(likes), 0) FROM posts WHERE author_id = $1 AND status = 'published'`, [userId]),
    dbQuery(`SELECT COUNT(*) FROM post_favorites WHERE user_id = $1`, [userId]),
  ])

  const postCount = parseInt(postCountRes.rows[0].count, 10)
  const commentsCount = parseInt(commentsCountRes.rows[0].count, 10)
  const likesSum = parseInt(likesSumRes.rows[0].coalesce, 10) || 0
  const favoritesCount = parseInt(favoritesCountRes.rows[0].count, 10)
  const influenceScore = Math.round((postCount * 3 + commentsCount * 1 + likesSum * 0.5) * 10) / 10

  const result = {
    id: user.id,
    username: user.handle,
    nickname: user.nickname,
    avatarText: user.avatar_text,
    bio: user.bio,
    profession: user.profession,
    city: user.city,
    joinedAt: toISO(user.joined_at),
    createdAt: toISO(user.created_at),
    updatedAt: toISO(user.updated_at),
    postCount,
    commentsCount,
    likesSum,
    favoritesCount,
    influenceScore,
  }

  await cacheSet(cacheKey, result, TTL_USER_PROFILE)
  return sendJson(res, 200, result)
}

async function handleGetUserPosts(req, res, userId, url) {
  const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10))
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10))

  const sql = `
    SELECT p.*,
           u.id AS u_id, u.nickname AS u_nickname, u.avatar_text AS u_avatar_text,
           b.id AS b_id, b.name AS b_name, b.color AS b_color
    FROM posts p
    LEFT JOIN users u ON p.author_id = u.id
    LEFT JOIN boards b ON p.board_id = b.id
    WHERE p.author_id = $1 AND p.status = 'published'
    ORDER BY p.created_at DESC
    LIMIT $2 OFFSET $3
  `
  const { rows } = await dbQuery(sql, [userId, limit, offset])

  const tagsByPost = new Map()
  if (rows.length > 0) {
    const postIds = rows.map((r) => r.id)
    const tagRows = await dbQuery(
      `SELECT post_id, tag_name FROM post_tags WHERE post_id = ANY($1::text[])`,
      [postIds]
    )
    for (const tr of tagRows.rows) {
      if (!tagsByPost.has(tr.post_id)) tagsByPost.set(tr.post_id, [])
      tagsByPost.get(tr.post_id).push(tr.tag_name)
    }
  }

  const result = rows.map((r) => mapPostRow(r, tagsByPost.get(r.id) || []))
  return sendJson(res, 200, result)
}

async function handleGetUserFavorites(req, res, userId, url) {
  const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10))
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10))

  const sql = `
    SELECT p.*,
           u.id AS u_id, u.nickname AS u_nickname, u.avatar_text AS u_avatar_text,
           b.id AS b_id, b.name AS b_name, b.color AS b_color
    FROM post_favorites pf
    JOIN posts p ON pf.post_id = p.id
    LEFT JOIN users u ON p.author_id = u.id
    LEFT JOIN boards b ON p.board_id = b.id
    WHERE pf.user_id = $1 AND p.status = 'published'
    ORDER BY pf.created_at DESC
    LIMIT $2 OFFSET $3
  `
  const { rows } = await dbQuery(sql, [userId, limit, offset])

  const tagsByPost = new Map()
  if (rows.length > 0) {
    const postIds = rows.map((r) => r.id)
    const tagRows = await dbQuery(
      `SELECT post_id, tag_name FROM post_tags WHERE post_id = ANY($1::text[])`,
      [postIds]
    )
    for (const tr of tagRows.rows) {
      if (!tagsByPost.has(tr.post_id)) tagsByPost.set(tr.post_id, [])
      tagsByPost.get(tr.post_id).push(tr.tag_name)
    }
  }

  const result = rows.map((r) => mapPostRow(r, tagsByPost.get(r.id) || []))
  return sendJson(res, 200, result)
}

async function handleGetUserComments(req, res, userId, url) {
  const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10))
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10))

  const sql = `
    SELECT c.id, c.post_id, c.content, c.likes, c.created_at, p.title AS post_title
    FROM comments c
    JOIN posts p ON c.post_id = p.id
    WHERE c.author_id = $1
    ORDER BY c.created_at DESC
    LIMIT $2 OFFSET $3
  `
  const { rows } = await dbQuery(sql, [userId, limit, offset])

  const result = rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    postTitle: r.post_title,
    content: r.content,
    likes: r.likes,
    createdAt: toISO(r.created_at),
  }))

  return sendJson(res, 200, result)
}

// === 认证端点 ===

/**
 * 登录：验证用户名密码，签发 JWT + 创建 Redis session
 * 用户名匹配：同时支持 nickname 和 handle
 */
async function handleLogin(req, res) {
  const body = await readJsonBody(req)
  const { username, password } = body
  if (!username || !password) {
    return sendJson(res, 400, { error: '请输入用户名和密码' })
  }

  // 按 nickname、handle 或 email 查询用户（三种方式登录）
  const { rows } = await dbQuery(
    `SELECT * FROM users WHERE nickname = $1 OR handle = $1 OR email = $1`,
    [username]
  )
  if (rows.length === 0) {
    return sendJson(res, 401, { error: '用户名或密码错误' })
  }

  const user = rows[0]
  // 验证密码
  if (!verifyPassword(password, user.password_hash)) {
    return sendJson(res, 401, { error: '用户名或密码错误' })
  }

  // 封禁用户禁止登录
  if (user.status === 'banned') {
    return sendJson(res, 403, { error: '账号已被封禁' })
  }

  // 签发 JWT + 创建 session（白名单模式，登出时可主动失效）
  const { token, jti } = signToken({
    userId: user.id,
    nickname: user.nickname,
    roles: user.roles || [],
  })
  await createSession(user.id, jti, token)

  if (body.deviceId) {
    dbQuery(
      `UPDATE guest_sessions SET bound_user_id = $1, status = 'bound', remaining_seconds = 300 WHERE device_id = $2`,
      [user.id, body.deviceId]
    ).catch(() => {})
  }

  return sendJson(res, 200, { token, user: mapUser(user) })
}

/**
 * 注册：创建新用户（nickname + email 唯一校验），成功后直接签发 JWT
 * - 用户名：nickname，显示用
 * - 用户 handle：自动生成（取 nickname 首字母，重复则加 4 位随机字符）
 * - 密码：使用 bcrypt 哈希后存储
 * - 注册成功后自动登录，省去用户二次操作
 */
async function handleRegister(req, res) {
  const body = await readJsonBody(req)
  const { nickname, email, password } = body
  if (!nickname || !email || !password) {
    return sendJson(res, 400, { error: '请完善注册信息（昵称、邮箱、密码）' })
  }

  // 校验字段格式
  if (nickname.length < 2 || nickname.length > 20) {
    return sendJson(res, 400, { error: '昵称长度需在 2-20 字符之间' })
  }
  if (password.length < 6) {
    return sendJson(res, 400, { error: '密码至少 6 位' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(res, 400, { error: '邮箱格式不正确' })
  }

  // 检查 nickname 或 email 是否已存在
  const { rows: existing } = await dbQuery(
    `SELECT nickname, email FROM users WHERE nickname = $1 OR email = $2`,
    [nickname, email]
  )
  if (existing.length > 0) {
    const usedFields = existing.map((r) => {
      if (r.nickname === nickname && r.email === email) return '昵称和邮箱'
      if (r.nickname === nickname) return '昵称'
      return '邮箱'
    }).join(' + ')
    return sendJson(res, 409, { error: `${usedFields} 已被占用，请换一个` })
  }

  // 生成 handle：基于 nickname 转 ASCII 后截断，冲突则追加随机后缀
  function generateHandle(nick) {
    const base = nick
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // 去除中文声调标记
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') // 仅保留小写字母数字
      .slice(0, 10)
    if (base.length >= 3) {
      const rand = Math.random().toString(36).slice(2, 6)
      return `u_${base}_${rand}`
    }
    const rand = Math.random().toString(36).slice(2, 8)
    return `u_${rand}`
  }

  let handle = generateHandle(nickname)
  // handle 唯一校验：冲突时重试最多 5 次，失败则追加 UUID 片段
  for (let i = 0; i < 5; i++) {
    const { rows: handleCheck } = await dbQuery(`SELECT id FROM users WHERE handle = $1`, [handle])
    if (handleCheck.length === 0) break
    handle = generateHandle(nickname)
  }

  // 密码哈希后写入（列名严格对齐 schema.sql：users 表无 avatar_url，用 avatar_text）
  // roles 使用 ARRAY[]::text[] 显式类型，兼容 PostgreSQL 严格模式（否则会报错：cannot determine type of empty array）
  const passwordHash = hashPassword(password)
  const userId = crypto.randomUUID()
  try {
    await dbQuery(
      `INSERT INTO users (id, nickname, handle, email, password_hash, status, roles, avatar_text, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', ARRAY[]::text[], '', NOW(), NOW())`,
      [userId, nickname, handle, email, passwordHash]
    )
  } catch (err) {
    console.error('[register] 插入用户失败:', err.message)
    // 把具体数据库错误信息返回给前端，便于调试（生产环境可替换为通用文案）
    return sendJson(res, 500, { error: `注册失败：${err.message}` })
  }

  // 缓存失效：用户列表变更，清除对应 key
  await cacheDel(userListKey())

  // 查询新建的用户用于返回
  const { rows: inserted } = await dbQuery(`SELECT * FROM users WHERE id = $1`, [userId])
  if (inserted.length === 0) {
    return sendJson(res, 500, { error: '注册后查询用户失败' })
  }
  const user = inserted[0]

  // 注册成功直接登录：签发 JWT + 创建 Session
  const { token, jti } = signToken({
    userId: user.id,
    nickname: user.nickname,
    roles: user.roles || [],
  })
  await createSession(user.id, jti, token)

  if (body.deviceId) {
    dbQuery(
      `UPDATE guest_sessions SET bound_user_id = $1, status = 'bound', remaining_seconds = 300 WHERE device_id = $2`,
      [user.id, body.deviceId]
    ).catch(() => {})
  }

  return sendJson(res, 201, { token, user: mapUser(user) })
}

/**
 * 登出：删除 Redis session，使 token 失效
 * requireAuth 包装，需携带有效 token
 */
async function handleLogout(req, res, authUser) {
  await destroySession(authUser.userId, authUser.jti)
  return sendJson(res, 200, { message: '已登出' })
}

/**
 * 获取当前登录用户信息
 * requireAuth 包装，从 DB 拉取最新用户数据（避免缓存中角色/状态过期）
 */
async function handleMe(req, res, authUser) {
  const { rows } = await dbQuery(`SELECT * FROM users WHERE id = $1`, [authUser.userId])
  if (rows.length === 0) {
    return sendJson(res, 404, { error: '用户不存在' })
  }
  return sendJson(res, 200, { user: mapUser(rows[0]) })
}

// === 路由匹配器 ===

/**
 * 匹配所有 /api/forum/* 路径
 * 返回 true 表示已处理，false 表示未匹配（交给兜底 404/405）
 * 返回 {methodMatched: true} 表示路径匹配但方法不支持（调用方返回 405）
 * 整体 try/catch 兜底，异常返回 500
 */
async function matchForumRoute(req, res, pathname, method, url) {
  try {
    // OPTIONS 预检
    if (method === 'OPTIONS') {
      return sendJson(res, 204, {})
    }

    // 去掉 /api/forum 前缀，得到子路径（如 '/posts/p1/comments'）
    const sub = pathname.slice('/api/forum'.length)

    // 记录该路径支持的方法（用于判断是否返回 405）
    const supportedMethods = []

    // === 静态路由 ===
    if (sub === '/health') {
      supportedMethods.push('GET')
      if (method === 'GET') return handleHealth(req, res)
    }
    if (sub === '/boards') {
      supportedMethods.push('GET')
      if (method === 'GET') return await handleListBoards(req, res)
    }
    if (sub === '/topics') {
      supportedMethods.push('GET')
      if (method === 'GET') return await handleListTopics(req, res)
    }
    if (sub === '/posts') {
      supportedMethods.push('GET', 'POST')
      if (method === 'GET') return await handleListPosts(req, res, url)
      if (method === 'POST') return await requireAuth(handleCreatePost)(req, res)
    }
    if (sub === '/users') {
      supportedMethods.push('GET')
      if (method === 'GET') return await handleListUsers(req, res, url)
    }
    if (sub === '/search/summary') {
      supportedMethods.push('GET')
      if (method === 'GET') return await handleSearchSummary(req, res, url)
    }
    // 通用搜索端点：复用 handleListPosts，由其内部按 type=user/knowledge/post 分流
    if (sub === '/search') {
      supportedMethods.push('GET')
      if (method === 'GET') return await handleListPosts(req, res, url)
    }
    // 举报提交：需要登录
    if (sub === '/reports') {
      supportedMethods.push('POST')
      if (method === 'POST') return await requireAuth(handleCreateReport)(req, res)
    }

    // === 认证路由 ===
    if (sub === '/auth/login') {
      supportedMethods.push('POST')
      if (method === 'POST') return await handleLogin(req, res)
    }
    if (sub === '/auth/register') {
      supportedMethods.push('POST')
      if (method === 'POST') return await handleRegister(req, res)
    }
    if (sub === '/auth/logout') {
      supportedMethods.push('POST')
      if (method === 'POST') return await requireAuth(handleLogout)(req, res)
    }
    if (sub === '/auth/me') {
      supportedMethods.push('GET')
      if (method === 'GET') return await requireAuth(handleMe)(req, res)
    }

    // === 动态路由：按 '/' 分段解析 ===
    const parts = sub.split('/').filter(Boolean)

    if (parts[0] === 'posts' && parts.length >= 2) {
      const id = decodeURIComponent(parts[1])
      if (parts.length === 2) {
        supportedMethods.push('GET')
        if (method === 'GET') return await handleGetPost(req, res, id)
      }
      if (parts.length === 3 && parts[2] === 'comments') {
        supportedMethods.push('GET', 'POST')
        if (method === 'GET') return await handleListComments(req, res, id)
        if (method === 'POST') return await requireAuth(handleCreateComment)(req, res, id)
      }
      if (parts.length === 3 && parts[2] === 'like') {
        supportedMethods.push('POST')
        if (method === 'POST') return await requireAuth(handleTogglePostLike)(req, res, id)
      }
      if (parts.length === 3 && parts[2] === 'favorite') {
        supportedMethods.push('POST')
        if (method === 'POST') return await requireAuth(handleTogglePostFavorite)(req, res, id)
      }
      if (parts.length === 3 && parts[2] === 'interactions') {
        supportedMethods.push('GET')
        if (method === 'GET') {
          // 互动状态查询：允许未登录（返回全 false），不使用 requireAuth 拦截
          const auth = await authenticate(req)
          return await handleGetInteractions(req, res, id, auth.authenticated ? auth.user : null)
        }
      }
      if (parts.length === 3 && parts[2] === 'related') {
        supportedMethods.push('GET')
        if (method === 'GET') return await handleRelatedPosts(req, res, id)
      }
    }

    // comments 路由（comment id 维度操作）
    if (parts[0] === 'comments' && parts.length >= 2) {
      const cid = decodeURIComponent(parts[1])
      if (parts.length === 3 && parts[2] === 'like') {
        supportedMethods.push('POST')
        if (method === 'POST') return await requireAuth(handleToggleCommentLike)(req, res, cid)
      }
    }

    if (parts[0] === 'users' && parts.length >= 2) {
      const id = decodeURIComponent(parts[1])
      if (parts.length === 2) {
        supportedMethods.push('GET')
        if (method === 'GET') return await handleGetUserProfile(req, res, id)
      }
      if (parts.length === 3 && parts[2] === 'stats') {
        supportedMethods.push('GET')
        if (method === 'GET') return await handleGetUserStats(req, res, id)
      }
      if (parts.length === 3 && parts[2] === 'posts') {
        supportedMethods.push('GET')
        if (method === 'GET') return await handleGetUserPosts(req, res, id, url)
      }
      if (parts.length === 3 && parts[2] === 'favorites') {
        supportedMethods.push('GET')
        if (method === 'GET') return await handleGetUserFavorites(req, res, id, url)
      }
      if (parts.length === 3 && parts[2] === 'comments') {
        supportedMethods.push('GET')
        if (method === 'GET') return await handleGetUserComments(req, res, id, url)
      }
    }

    if (parts[0] === 'ai' && parts.length >= 2) {
      if (parts[1] === 'health') {
        supportedMethods.push('GET')
        if (method === 'GET') return await handleAIHealth(req, res)
      }
      if (parts[1] === 'generate') {
        supportedMethods.push('POST')
        if (method === 'POST') return await requireAuth(handleAIGenerate)(req, res)
      }
      if (parts[1] === 'stream') {
        supportedMethods.push('POST')
        if (method === 'POST') return await requireAuth(handleAIStream)(req, res)
      }
      // AI 发帖辅助：分析草稿返回标题/标签/润色建议
      if (parts[1] === 'post-assist') {
        supportedMethods.push('POST')
        if (method === 'POST') return await requireAuth(handleAIPostAssist)(req, res)
      }
      // AI 答疑：/ai/qa/start 启动提问、/ai/qa/stream 流式生成回答
      if (parts[1] === 'qa' && parts.length >= 3) {
        if (parts[2] === 'start') {
          supportedMethods.push('POST')
          if (method === 'POST') return await requireAuth(handleAIQAStart)(req, res)
        }
        if (parts[2] === 'stream') {
          supportedMethods.push('POST')
          if (method === 'POST') return await requireAuth(handleAIQAStream)(req, res)
        }
      }
    }

    if (parts[0] === 'guest' && parts.length >= 2) {
      if (parts[1] === 'start') {
        supportedMethods.push('POST')
        if (method === 'POST') return await handleGuestStart(req, res)
      }
      if (parts[1] === 'ping') {
        supportedMethods.push('GET')
        if (method === 'GET') return await handleGuestPing(req, res, url)
      }
      if (parts[1] === 'bind') {
        supportedMethods.push('POST')
        if (method === 'POST') return await requireAuth(handleGuestBind)(req, res)
      }
    }

    // 管理员知识库管理：CRUD，均需管理员角色（handler 内通过 requireAdmin 校验）
    if (parts[0] === 'admin' && parts.length >= 2 && parts[1] === 'knowledge') {
      if (parts.length === 2) {
        supportedMethods.push('GET', 'POST')
        if (method === 'GET') return await requireAuth(handleAdminListKnowledge)(req, res, url)
        if (method === 'POST') return await requireAuth(handleAdminCreateKnowledge)(req, res)
      }
      if (parts.length === 3) {
        const kid = decodeURIComponent(parts[2])
        supportedMethods.push('PUT', 'DELETE')
        if (method === 'PUT') return await requireAuth(handleAdminUpdateKnowledge)(req, res, kid)
        if (method === 'DELETE') return await requireAuth(handleAdminDeleteKnowledge)(req, res, kid)
      }
    }

    // ======== Phase4：审核 / 举报 / 用户 / 版块 / 总览 ========
    if (parts[0] === 'admin' && parts.length >= 2) {
      // GET /api/forum/admin/moderation —— 审核队列列表（admin/mod）
      if (parts[1] === 'moderation' && parts.length === 2) {
        supportedMethods.push('GET')
        if (method === 'GET') return await requireAuth(handleListModeration)(req, res, url)
      }
      // POST /api/forum/admin/moderation/:id/resolve —— 处理审核 case（admin/mod）
      if (parts[1] === 'moderation' && parts.length === 4 && parts[3] === 'resolve') {
        supportedMethods.push('POST')
        const mid = decodeURIComponent(parts[2])
        if (method === 'POST') return await requireAuth(handleResolveModeration)(req, res, mid)
      }
      // GET /api/forum/admin/reports —— 举报列表（admin/mod）
      if (parts[1] === 'reports' && parts.length === 2) {
        supportedMethods.push('GET')
        if (method === 'GET') return await requireAuth(handleListReports)(req, res)
      }
      // POST /api/forum/admin/reports/:id/handle —— 处理举报（admin/mod）
      if (parts[1] === 'reports' && parts.length === 4 && parts[3] === 'handle') {
        supportedMethods.push('POST')
        const rid = decodeURIComponent(parts[2])
        if (method === 'POST') return await requireAuth(handleHandleReport)(req, res, rid)
      }
      // GET /api/forum/admin/users —— 用户列表（admin）
      if (parts[1] === 'users' && parts.length === 2) {
        supportedMethods.push('GET')
        if (method === 'GET') return await requireAuth(handleAdminListUsers)(req, res, url)
      }
      // PUT /api/forum/admin/users/:id/status | /roles —— 更新用户状态/角色（admin）
      if (parts[1] === 'users' && parts.length === 4) {
        const uid = decodeURIComponent(parts[2])
        if (parts[3] === 'status') {
          supportedMethods.push('PUT')
          if (method === 'PUT') return await requireAuth(handleAdminUpdateUserStatus)(req, res, uid)
        }
        if (parts[3] === 'roles') {
          supportedMethods.push('PUT')
          if (method === 'PUT') return await requireAuth(handleAdminUpdateUserRoles)(req, res, uid)
        }
      }
      // GET /api/forum/admin/dashboard —— 后台总览（admin/mod）
      if (parts[1] === 'dashboard' && parts.length === 2) {
        supportedMethods.push('GET')
        if (method === 'GET') return await requireAuth(handleAdminDashboard)(req, res)
      }
      // POST /api/forum/admin/boards —— 创建版块（admin）
      if (parts[1] === 'boards' && parts.length === 2) {
        supportedMethods.push('POST')
        if (method === 'POST') return await requireAuth(handleAdminCreateBoard)(req, res)
      }
      // PUT /api/forum/admin/boards/:id —— 编辑版块；DELETE —— 归档版块（admin）
      if (parts[1] === 'boards' && parts.length === 3) {
        const bid = decodeURIComponent(parts[2])
        supportedMethods.push('PUT', 'DELETE')
        if (method === 'PUT') return await requireAuth(handleAdminEditBoard)(req, res, bid)
        if (method === 'DELETE') return await requireAuth(handleAdminArchiveBoard)(req, res, bid)
      }
    }

    // 路径匹配但方法不支持：返回 405，告知支持的方法
    if (supportedMethods.length > 0) {
      res.writeHead(405, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json; charset=utf-8',
        Allow: supportedMethods.join(', '),
      })
      res.end(JSON.stringify({
        error: `Method Not Allowed，支持的方法: ${supportedMethods.join(', ')}`,
      }))
      return true
    }

    return false
  } catch (err) {
    return sendJson(res, 500, { error: err.message })
  }
}

// === 静态文件服务 ===

/**
 * 服务静态文件：根据请求路径查找 dist/ 下的对应文件
 * 找不到文件则返回 false（由调用方决定是否 SPA fallback）
 */
function serveStaticFile(req, res, pathname) {
  // 安全检查：防止路径遍历攻击
  const sanitizedPath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const filePath = path.join(DIST_DIR, sanitizedPath)

  // 确保解析后的路径在 DIST_DIR 内
  if (!filePath.startsWith(DIST_DIR)) {
    return false
  }

  try {
    // 检查文件是否存在
    fs.accessSync(filePath, fs.constants.F_OK)

    // 如果是目录，尝试返回 index.html
    const stat = fs.statSync(filePath)
    const actualPath = stat.isDirectory()
      ? path.join(filePath, 'index.html')
      : filePath

    if (!fs.existsSync(actualPath)) {
      return false
    }

    const ext = path.extname(actualPath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'
    const content = fs.readFileSync(actualPath)

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html'
        ? 'no-cache, must-revalidate'
        : 'public, max-age=31536000, immutable',
    })
    res.end(content)
    return true
  } catch {
    return false
  }
}

/**
 * SPA fallback：返回 index.html 供 React Router 处理
 */
function serveSpaFallback(res) {
  const indexPath = path.join(DIST_DIR, 'index.html')
  try {
    const content = fs.readFileSync(indexPath)
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, must-revalidate',
    })
    res.end(content)
    return true
  } catch {
    return false
  }
}

// === HTTP 服务器主流程 ===

const llmStatus = llmHealth()
if (llmStatus.ok) {
  console.log(`✅ LLM configured: model=${llmStatus.model}`)
} else {
  console.log('⚠️  DEEPSEEK_API_KEY not set, AI routes degraded')
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const pathname = url.pathname
  const method = req.method

  // OPTIONS 预检统一返回 204
  if (method === 'OPTIONS') {
    sendJson(res, 204, {})
    return
  }

  // 优先匹配 API 路由
  if (pathname.startsWith('/api/forum')) {
    const handled = await matchForumRoute(req, res, pathname, method, url)
    if (handled) return
    // API 路由未匹配到，返回 404 JSON
    sendJson(res, 404, { error: 'API Not Found' })
    return
  }

  // GET/HEAD 请求尝试服务静态文件
  if (method === 'GET' || method === 'HEAD') {
    // 根路径直接返回 index.html
    if (pathname === '/' || pathname === '') {
      if (serveStaticFile(req, res, '/index.html')) return
    }

    // 尝试匹配静态文件
    if (serveStaticFile(req, res, pathname)) return

    // 静态文件未找到 → SPA fallback（让 React Router 处理路由）
    if (serveSpaFallback(res)) return
  }

  // 兜底 404
  sendJson(res, 404, { error: 'Not Found' })
})

server.listen(PORT, async () => {
  console.log(`🚀 AI 论坛 API 服务已启动：http://localhost:${PORT}`)
  // 数据库健康检查
  try {
    const health = await dbHealthCheck()
    dbConnected = health.ok
    console.log(`📦 数据库连接：${health.ok ? '✅ ' + health.message : '⚠️ ' + health.message}`)
  } catch (err) {
    dbConnected = false
    console.error('⚠️ 数据库健康检查失败:', err.message)
  }
  // 数据库连接正常时自动确保 Phase1 表存在，避免缺表导致 guest/AI 接口 500
  if (dbConnected) {
    await ensurePhase1Tables()
    // Phase2：问答 / AI 答案 / 引用来源 / 知识库相关表
    await ensurePhase2Tables()
    // Phase4：内容审核相关表与字段（moderation_cases / reports 等）
    await ensurePhase4Tables()
    // AI 小助手用户初始化（发帖自动评论和 @ai小助手 回复的身份）
    await ensureAIAssistantUser()
  }
  // Redis 健康检查，失败仅告警不阻断服务（缓存层自动降级）
  try {
    const redisHealth = await healthCheckRedis()
    redisConnected = redisHealth.ok
    console.log(`📦 Redis 连接：${redisHealth.ok ? '✅ ' + redisHealth.message : '⚠️ ' + redisHealth.message}`)
  } catch (err) {
    redisConnected = false
    console.error('⚠️ Redis 健康检查失败:', err.message)
  }
})

// 优雅关闭：SIGINT/SIGTERM 时先停 HTTP 再关闭连接池与 Redis
function shutdown(signal) {
  console.log(`\n收到 ${signal} 信号，正在关闭服务...`)
  server.close(async () => {
    try {
      await dbPool.end()
      console.log('📦 数据库连接池已关闭')
    } catch (err) {
      console.error('关闭连接池出错:', err.message)
    }
    try {
      await closeRedis()
      console.log('📦 Redis 连接已关闭')
    } catch (err) {
      console.error('关闭 Redis 出错:', err.message)
    }
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
