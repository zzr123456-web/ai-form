/**
 * AI 辅助论坛 · 前端 API 客户端层
 * 统一封装所有后端 API 调用，使用原生 fetch，不引入第三方库
 * 基础路径：/api/forum（由 vite.config.js 中的 proxy 转发到 http://localhost:8787）
 */

// 基础路径常量：相对路径，浏览器自动补充 origin，由 vite 代理转发
const BASE_URL = '/api/forum'

// Token 持久化 key：localStorage 存储 JWT
const TOKEN_KEY = 'af_token'

/** 获取 token（localStorage 读写均 try/catch 兜底隐私模式） */
function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

/** 设置 token */
function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // 隐私模式静默失败
  }
}

/** 清除 token */
function removeToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 静默忽略
  }
}

/**
 * 内部统一请求封装
 * - GET：params 拼接为 query string
 * - POST/PUT：body 转 JSON
 * - 返回 { ok, data, error, status } 完整结构，调用方据此判断
 *   - ok=true: data 为解析后的 JSON
 *   - ok=false: error 为错误说明字符串，status 为 HTTP 码
 * @param {string} method HTTP 方法
 * @param {string} path 路径（不含 BASE_URL）
 * @param {Object} [params] GET 查询参数
 * @param {Object} [body] POST/PUT 请求体
 * @returns {Promise<{ok:boolean, data:any, error:string|null, status:number}>}
 */
async function request(method, path, params, body) {
  try {
    let url = `${BASE_URL}${path}`
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams()
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          qs.set(k, v)
        }
      })
      const qsStr = qs.toString()
      if (qsStr) url += `?${qsStr}`
    }

    const headers = { 'Content-Type': 'application/json' }
    const token = getToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const options = { method, headers }
    if (body !== undefined && body !== null && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body)
    }

    const res = await fetch(url, options)

    // 先解析响应体（无论成功失败都尝试解析 error 字段）
    let payload = null
    const rawText = await res.text()
    try {
      payload = rawText ? JSON.parse(rawText) : null
    } catch {
      payload = null
    }

    // 401 统一处理：清除 token + 触发全局过期事件
    if (res.status === 401) {
      removeToken()
      window.dispatchEvent(new Event('auth:expired'))
      return {
        ok: false,
        data: null,
        error: (payload && payload.error) || '登录已过期，请重新登录',
        status: res.status,
      }
    }

    if (!res.ok) {
      const errorMsg = (payload && payload.error) || `HTTP ${res.status}`
      console.warn(`[apiClient] ${method} ${path} 失败: ${errorMsg}`)
      return { ok: false, data: null, error: errorMsg, status: res.status }
    }

    return { ok: true, data: payload, error: null, status: res.status }
  } catch (err) {
    const errorMsg = err?.message || String(err)
    console.warn(`[apiClient] ${method} ${path} 网络错误:`, errorMsg)
    return { ok: false, data: null, error: errorMsg, status: 0 }
  }
}

// === 帖子相关 ===

/**
 * 获取帖子列表
 * @param {Object} [params] 查询参数
 * @returns {Promise<Array>} 帖子数组，失败返回 []
 */
export async function getPosts(params = {}) {
  const res = await request('GET', '/posts', {
    sort: params.sort,
    boardId: params.boardId,
    tag: params.tag,
    page: params.page,
    limit: params.limit,
  })
  const data = res.data
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.items)) return data.items
  return []
}

/**
 * 获取单个帖子详情
 * @param {string} id 帖子 id
 * @returns {Promise<Object|null>} 帖子对象，失败返回 null
 */
export async function getPost(id) {
  if (!id) return null
  const res = await request('GET', `/posts/${id}`)
  return res.ok ? res.data : null
}

/**
 * 创建新帖子
 * @param {Object} payload 帖子数据
 * @returns {Promise<Object|null>} 新建帖子，失败返回 null
 */
export async function createPost(payload = {}) {
  const res = await request('POST', '/posts', undefined, {
    title: payload.title,
    content: payload.content,
    boardId: payload.boardId,
    tags: payload.tags,
    summary: payload.summary,
    authorId: payload.authorId,
  })
  return res.ok ? res.data : null
}

// === 评论相关 ===

/**
 * 获取指定帖子的评论树
 * @param {string} postId 帖子 id
 * @returns {Promise<Array>} 评论树数组，失败返回 []
 */
export async function getComments(postId) {
  if (!postId) return []
  const res = await request('GET', `/posts/${postId}/comments`)
  return Array.isArray(res.data) ? res.data : []
}

// === 互动相关：点赞 / 收藏 / 评论写入 ===

/**
 * 获取当前用户对该帖的互动状态（点赞、收藏、评论点赞）
 * 未登录也可调用（返回全 false）
 * @param {string} postId 帖子 id
 * @returns {Promise<{liked:boolean, favored:boolean, likedCommentIds:string[]}|null>}
 */
export async function getInteractions(postId) {
  if (!postId) return null
  const res = await request('GET', `/posts/${postId}/interactions`)
  return res.ok ? res.data : null
}

/**
 * 帖子点赞 / 取消点赞（toggle）
 * @param {string} postId 帖子 id
 * @returns {Promise<{ok:boolean, liked?:boolean, delta?:number, error?:string}>}
 */
export async function togglePostLike(postId) {
  if (!postId) return { ok: false, error: '缺少 postId' }
  const res = await request('POST', `/posts/${postId}/like`)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, liked: !!res.data?.liked, delta: res.data?.delta || 0 }
}

/**
 * 帖子收藏 / 取消收藏（toggle）
 * @param {string} postId 帖子 id
 * @returns {Promise<{ok:boolean, favored?:boolean, delta?:number, error?:string}>}
 */
export async function togglePostFavorite(postId) {
  if (!postId) return { ok: false, error: '缺少 postId' }
  const res = await request('POST', `/posts/${postId}/favorite`)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, favored: !!res.data?.favored, delta: res.data?.delta || 0 }
}

/**
 * 创建评论（支持楼中楼回复）
 * @param {string} postId  帖子 id
 * @param {string} content 评论内容
 * @param {string} [parentId] 父评论 id（回复时传）
 * @returns {Promise<{ok:boolean, comments?:Array, id?:string, error?:string}>}
 */
export async function createComment(postId, content, parentId) {
  if (!postId) return { ok: false, error: '缺少 postId' }
  if (!content || !content.trim()) return { ok: false, error: '评论内容不能为空' }
  const res = await request('POST', `/posts/${postId}/comments`, undefined, {
    content: content.trim(),
    parentId: parentId || null,
  })
  if (!res.ok) return { ok: false, error: res.error }
  return {
    ok: true,
    id: res.data?.id,
    comments: Array.isArray(res.data?.comments) ? res.data.comments : [],
  }
}

/**
 * 评论点赞 / 取消点赞（toggle）
 * @param {string} commentId 评论 id
 * @returns {Promise<{ok:boolean, liked?:boolean, delta?:number, error?:string}>}
 */
export async function toggleCommentLike(commentId) {
  if (!commentId) return { ok: false, error: '缺少 commentId' }
  const res = await request('POST', `/comments/${commentId}/like`)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, liked: !!res.data?.liked, delta: res.data?.delta || 0 }
}

// === 版块与话题 ===

/**
 * 获取版块列表
 * @returns {Promise<Array>} 版块数组，失败返回 []
 */
export async function getBoards() {
  const res = await request('GET', '/boards')
  return Array.isArray(res.data) ? res.data : []
}

/**
 * 获取热门话题列表
 * @returns {Promise<Array>} 话题数组，失败返回 []
 */
export async function getTopics() {
  const res = await request('GET', '/topics')
  return Array.isArray(res.data) ? res.data : []
}

// === 用户相关 ===

/**
 * 获取用户列表
 * @param {Object} [params] 筛选参数
 * @returns {Promise<Array>} 用户数组，失败返回 []
 */
export async function getUsers(params = {}) {
  const res = await request('GET', '/users', {
    status: params.status,
    role: params.role,
  })
  return Array.isArray(res.data) ? res.data : []
}

// === 认证相关 ===

/**
 * 登录：POST /auth/login
 * 成功后将 token 存入 localStorage
 * @param {string} username 用户名（支持 nickname 或 handle）
 * @param {string} password 密码
 * @returns {Promise<{ok:boolean, data:any, error:string|null, status:number}>}
 */
export async function login(username, password) {
  const res = await request('POST', '/auth/login', undefined, { username, password })
  if (res.ok && res.data && res.data.token) {
    setToken(res.data.token)
  }
  return res
}

/**
 * 注册：POST /auth/register
 * 成功后将 token 存入 localStorage
 * @param {{nickname:string, email:string, password:string}} payload
 * @returns {Promise<{ok:boolean, data:any, error:string|null, status:number}>}
 */
export async function register(payload) {
  const { nickname, email, password } = payload || {}
  const res = await request('POST', '/auth/register', undefined, { nickname, email, password })
  if (res.ok && res.data && res.data.token) {
    setToken(res.data.token)
  }
  return res
}

/**
 * 登出：POST /auth/logout
 * 无论成功失败都清除本地 token
 */
export async function logout() {
  await request('POST', '/auth/logout')
  removeToken()
}

/**
 * 获取当前登录用户：GET /auth/me
 * @returns {Promise<Object|null>}
 */
export async function getMe() {
  const res = await request('GET', '/auth/me')
  if (res.ok && res.data && res.data.user) return res.data.user
  return null
}

/**
 * 获取当前登录用户
 * @returns {Promise<Object|null>}
 */
export async function getCurrentUser() {
  return await getMe()
}

/**
 * 获取用户统计数据
 * @param {string} userId 用户 id
 * @returns {Promise<Object|null>} 用户统计对象，失败返回 null
 */
export async function getUserStats(userId) {
  if (!userId) return null
  const res = await request('GET', `/users/${userId}/stats`)
  return res.ok ? res.data : null
}

// === 健康检查 ===

/**
 * 后端健康检查
 * @returns {Promise<{db:string,ts:string}|null>} 健康状态对象，失败返回 null
 */
export async function getHealth() {
  const res = await request('GET', '/health')
  return res.ok ? res.data : null
}

// 默认导出：聚合所有方法
export default {
  getPosts,
  getPost,
  createPost,
  getComments,
  getInteractions,
  togglePostLike,
  togglePostFavorite,
  createComment,
  toggleCommentLike,
  getBoards,
  getTopics,
  getUsers,
  getCurrentUser,
  getUserStats,
  getHealth,
  login,
  register,
  logout,
  getMe,
}
