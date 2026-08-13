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
import { cacheGet, cacheSet, cacheDel, cacheDelPattern, isRedisConnected, healthCheckRedis, closeRedis } from './db/redis.js'
import {
  boardListKey, topicListKey, userListKey, userKey, userStatsKey,
  postListKey, postKey, commentsKey,
  TTL_BOARDS, TTL_TOPICS, TTL_USERS, TTL_STATS, TTL_POSTS, TTL_POST_DETAIL, TTL_COMMENTS,
} from './utils/cache.js'
import { verifyPassword, hashPassword, signToken, createSession, destroySession } from './utils/auth.js'
import { authenticate, requireAuth } from './utils/middleware.js'

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
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
  const limit = Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10))
  const offset = (page - 1) * limit

  const cacheKey = postListKey(sort, boardId, tag, page, limit)
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
  if (cached) return sendJson(res, 200, cached)
  const post = await fetchPostById(id)
  if (!post) {
    return sendJson(res, 404, { error: '帖子不存在' })
  }
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
  const { rows } = await dbQuery(`SELECT * FROM user_stats WHERE user_id = $1`, [id])
  if (rows.length === 0) {
    return sendJson(res, 404, { error: '用户统计不存在' })
  }
  const result = mapUserStats(rows[0])
  await cacheSet(cacheKey, result, TTL_STATS)
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
  const passwordHash = hashPassword(password)
  const userId = crypto.randomUUID()
  try {
    await dbQuery(
      `INSERT INTO users (id, nickname, handle, email, password_hash, status, roles, avatar_text, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', ARRAY[], '', NOW(), NOW())`,
      [userId, nickname, handle, email, passwordHash]
    )
  } catch (err) {
    console.error('[register] 插入用户失败:', err.message)
    return sendJson(res, 500, { error: '注册失败，请稍后重试' })
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
        supportedMethods.push('GET')
        if (method === 'GET') return await handleListComments(req, res, id)
      }
    }

    if (parts[0] === 'users' && parts.length >= 2) {
      const id = decodeURIComponent(parts[1])
      if (parts.length === 2) {
        supportedMethods.push('GET')
        if (method === 'GET') return await handleGetUser(req, res, id)
      }
      if (parts.length === 3 && parts[2] === 'stats') {
        supportedMethods.push('GET')
        if (method === 'GET') return await handleGetUserStats(req, res, id)
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
