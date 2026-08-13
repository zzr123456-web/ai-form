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
  const { rows } = await dbQuery(`SELECT * FROM boards ORDER BY post_count DESC`)
  const result = rows.map(mapBoard)
  await cacheSet(cacheKey, result, TTL_BOARDS)
  return sendJson(res, 200, result)
}

async function handleListTopics(req, res) {
  const cacheKey = topicListKey()
  const cached = await cacheGet(cacheKey)
  if (cached) return sendJson(res, 200, cached)
  const { rows } = await dbQuery(`SELECT * FROM topics ORDER BY heat DESC`)
  const result = rows.map(mapTopic)
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
  const search = url.searchParams.get('search')
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
  const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10))
  const offset = (page - 1) * limit

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
 * 创建帖子
 * 必填：title、content、boardId；可选：authorId（默认 u_alex）、tags、summary
 */
async function handleCreatePost(req, res) {
  const body = await readJsonBody(req)
  const { title, content, boardId } = body
  if (!title || !content || !boardId) {
    return sendJson(res, 400, { error: '缺少必填字段：title, content, boardId' })
  }
  const authorId = body.authorId || 'u_alex'
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
  const body = await readJsonBody(req)
  const { content, parentId } = body
  if (!content || !content.trim()) {
    return sendJson(res, 400, { error: '评论内容不能为空' })
  }

  // 校验帖子是否存在
  const { rows: postRows } = await dbQuery(`SELECT id FROM posts WHERE id = $1`, [postId])
  if (postRows.length === 0) {
    return sendJson(res, 404, { error: '帖子不存在' })
  }

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
    `SELECT id, username, nickname, avatar_text, bio, created_at, updated_at FROM users WHERE id = $1`,
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
    username: user.username,
    nickname: user.nickname,
    avatarText: user.avatar_text,
    bio: user.bio,
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
      if (method === 'POST') return await handleCreatePost(req, res)
    }
    if (sub === '/users') {
      supportedMethods.push('GET')
      if (method === 'GET') return await handleListUsers(req, res, url)
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
