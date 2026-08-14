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
 * @param {string} [deviceId] 访客设备 ID，用于后端登录时绑定访客会话（Task4 已支持）
 * @returns {Promise<{ok:boolean, data:any, error:string|null, status:number}>}
 */
export async function login(username, password, deviceId) {
  const body = { username, password }
  // 附带 deviceId：后端 Task4 在登录成功后据此 UPDATE guests SET user_id = $1 WHERE device_id = $2
  // 目的：登录后复用之前访客浏览记录，统一设备视角统计
  if (deviceId) body.deviceId = deviceId
  const res = await request('POST', '/auth/login', undefined, body)
  if (res.ok && res.data && res.data.token) {
    setToken(res.data.token)
  }
  return res
}

/**
 * 注册：POST /auth/register
 * 成功后将 token 存入 localStorage
 * @param {{nickname:string, email:string, password:string}} payload
 * @param {string} [deviceId] 访客设备 ID，用于后端注册后自动绑定访客会话
 * @returns {Promise<{ok:boolean, data:any, error:string|null, status:number}>}
 */
export async function register(payload, deviceId) {
  const { nickname, email, password, devLevel } = payload || {}
  const body = { nickname, email, password }
  // devLevel 只在有效取值时透传到后端（junior / senior）
  if (devLevel === 'junior' || devLevel === 'senior') body.devLevel = devLevel
  // 同登录：附带 deviceId 让后端 UPDATE guests 绑定
  if (deviceId) body.deviceId = deviceId
  const res = await request('POST', '/auth/register', undefined, body)
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

// === 搜索与用户多 Tab ===

/**
 * 搜索帖子
 * @param {Object} params 查询参数
 * @param {string} [params.keyword] 关键词
 * @param {string} [params.boardId] 版块 id
 * @param {string} [params.sort] 排序方式
 * @param {number} [params.limit] 每页数量
 * @param {number} [params.offset] 偏移量
 * @returns {Promise<{items:Array, total:number}>}
 */
export async function searchPosts({ keyword, boardId, sort, limit, offset } = {}) {
  const params = {}
  if (keyword !== undefined && keyword !== null) {
    params.search = encodeURIComponent(keyword)
  }
  if (boardId !== undefined && boardId !== null) params.boardId = boardId
  if (sort !== undefined && sort !== null) params.sort = sort
  if (limit !== undefined && limit !== null) params.limit = limit
  if (offset !== undefined && offset !== null) params.offset = offset
  const res = await request('GET', '/posts', params)
  const data = res.data
  if (data && Array.isArray(data.items)) {
    return { items: data.items, total: typeof data.total === 'number' ? data.total : data.items.length }
  }
  if (Array.isArray(data)) {
    return { items: data, total: data.length }
  }
  return { items: [], total: 0 }
}

/**
 * 获取用户详情
 * @param {string} userId 用户 id
 * @returns {Promise<Object|null>}
 */
export async function getUserProfile(userId) {
  if (!userId) return null
  const res = await request('GET', `/users/${userId}`)
  return res.ok ? res.data : null
}

/**
 * 获取用户发布的帖子列表
 * @param {string} userId 用户 id
 * @param {Object} [params] 分页参数
 * @returns {Promise<Array>}
 */
export async function getUserPosts(userId, { limit, offset } = {}) {
  if (!userId) return []
  const params = {}
  if (limit !== undefined && limit !== null) params.limit = limit
  if (offset !== undefined && offset !== null) params.offset = offset
  const res = await request('GET', `/users/${userId}/posts`, params)
  return Array.isArray(res.data) ? res.data : []
}

/**
 * 获取用户收藏的帖子列表
 * @param {string} userId 用户 id
 * @param {Object} [params] 分页参数
 * @returns {Promise<Array>}
 */
export async function getUserFavorites(userId, { limit, offset } = {}) {
  if (!userId) return []
  const params = {}
  if (limit !== undefined && limit !== null) params.limit = limit
  if (offset !== undefined && offset !== null) params.offset = offset
  const res = await request('GET', `/users/${userId}/favorites`, params)
  return Array.isArray(res.data) ? res.data : []
}

/**
 * 获取用户发表的评论列表
 * @param {string} userId 用户 id
 * @param {Object} [params] 分页参数
 * @returns {Promise<Array>}
 */
export async function getUserComments(userId, { limit, offset } = {}) {
  if (!userId) return []
  const params = {}
  if (limit !== undefined && limit !== null) params.limit = limit
  if (offset !== undefined && offset !== null) params.offset = offset
  const res = await request('GET', `/users/${userId}/comments`, params)
  return Array.isArray(res.data) ? res.data : []
}

// === Guest 会话 ===

/**
 * 访客会话启动
 * @param {string} [deviceId] 设备 id
 * @returns {Promise<Object|null>}
 */
export async function guestStart(deviceId) {
  const body = deviceId ? { deviceId } : {}
  const res = await request('POST', '/guest/start', undefined, body)
  return res.ok ? res.data : null
}

/**
 * 访客心跳
 * @param {string} [deviceId] 设备 id
 * @returns {Promise<Object|null>}
 */
export async function guestPing(deviceId) {
  if (!deviceId) return Promise.resolve(null)
  const res = await request('GET', '/guest/ping', { device_id: encodeURIComponent(deviceId) })
  return res.ok ? res.data : null
}

/**
 * 访客绑定到当前登录用户
 * @param {string} deviceId 设备 id
 * @returns {Promise<{ok:boolean, status?:string, error?:string}>}
 */
export async function guestBind(deviceId) {
  if (!deviceId) return { ok: false, error: '缺少 deviceId' }
  const res = await request('POST', '/guest/bind', undefined, { deviceId })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, status: res.data?.status }
}

// === AI 相关 ===

/**
 * AI 服务健康检查
 * @returns {Promise<any>}
 */
export async function aiHealth() {
  const res = await request('GET', '/ai/health')
  return res.data
}

/**
 * AI 生成（非流式）
 * @param {Object} params
 * @param {Array} params.messages
 * @param {string} [params.model]
 * @param {number} [params.temperature]
 * @param {number} [params.maxTokens]
 * @returns {Promise<{content:string, from_llm:boolean, usage:Object, ok?:boolean, error?:string}>}
 */
export async function aiGenerate({ messages, model, temperature, maxTokens }) {
  const body = { messages }
  if (model !== undefined && model !== null) body.model = model
  if (temperature !== undefined && temperature !== null) body.temperature = temperature
  if (maxTokens !== undefined && maxTokens !== null) body.max_tokens = maxTokens
  const res = await request('POST', '/ai/generate', undefined, body)
  if (!res.ok) return { ok: false, error: res.error }
  return res.data
}

/**
 * AI 流式生成（SSE）
 * @param {Object} params
 * @param {Array} params.messages
 * @param {string} [params.model]
 * @param {number} [params.temperature]
 * @param {number} [params.maxTokens]
 * @param {Function} onChunk 每接收到一段 content 的回调
 * @returns {Promise<void>}
 */
export async function aiStream({ messages, model, temperature, maxTokens }, onChunk) {
  const body = { messages }
  if (model !== undefined && model !== null) body.model = model
  if (temperature !== undefined && temperature !== null) body.temperature = temperature
  if (maxTokens !== undefined && maxTokens !== null) body.max_tokens = maxTokens

  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}/ai/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const raw = await res.text()
      try {
        const json = JSON.parse(raw)
        if (json && json.error) errMsg = json.error
      } catch {}
    } catch {}
    throw new Error(errMsg)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let boundary
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const rawSegment = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const lines = rawSegment.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const dataStr = line.slice(5).trim()
          if (!dataStr) continue
          if (dataStr === '[DONE]') return
          try {
            const parsed = JSON.parse(dataStr)
            if (parsed && typeof parsed.content === 'string' && onChunk) {
              onChunk(parsed.content)
            }
          } catch {
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {}
  }
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

// === Phase 2：AI 发帖助手 / 答疑 / 搜索摘要 / 相关帖 ===

/**
 * AI 发帖助手：根据正文生成标题候选、推荐标签、润色正文
 * @param {Object} data
 * @param {string} data.content 当前正文
 * @param {string} [data.board_id] 当前版块 id
 * @param {Array<string>} [data.current_tags] 当前已选标签
 * @returns {Promise<{ok:boolean, data:any, error:string|null}>}
 */
export async function aiPostAssist(data = {}) {
  const res = await request('POST', '/ai/post-assist', undefined, {
    content: data.content,
    board_id: data.board_id,
    current_tags: data.current_tags,
  })
  if (!res.ok) return { ok: false, data: null, error: res.error }
  return { ok: true, data: res.data, error: null }
}

/**
 * AI 答疑启动：提交问题，返回 question_id 与相似帖（作为引用来源）
 * @param {string} content 问题文本
 * @returns {Promise<{ok:boolean, data:any, error:string|null}>}
 */
export async function aiQAStart(content) {
  if (!content || !content.trim()) {
    return { ok: false, data: null, error: '问题内容不能为空' }
  }
  const res = await request('POST', '/ai/qa/start', undefined, { content })
  if (!res.ok) return { ok: false, data: null, error: res.error }
  return { ok: true, data: res.data, error: null }
}

/**
 * AI 答疑流式回答：通过 SSE 逐块接收答案
 * 解析 `data: {"content":"..."}` 行，每收到一段 content 调用 onChunk
 * 流结束或收到 [DONE] 时 resolve；若结束事件携带元数据（如 safety_label）则作为返回值
 * @param {string} questionId aiQAStart 返回的问题 id
 * @param {(chunk:string)=>void} onChunk 每段内容回调
 * @returns {Promise<Object|null>} 结束事件的元数据（无则 null）
 */
export async function aiQAStream(questionId, onChunk) {
  if (!questionId) throw new Error('缺少 questionId')

  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}/ai/qa/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ question_id: questionId }),
  })

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`
    try {
      const raw = await res.text()
      try {
        const json = JSON.parse(raw)
        if (json && json.error) errMsg = json.error
      } catch {}
    } catch {}
    throw new Error(errMsg)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let finalMeta = null

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let boundary
      // SSE 以空行（\n\n）分隔事件段
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const rawSegment = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const lines = rawSegment.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data:')) continue
          const dataStr = line.slice(5).trim()
          if (!dataStr) continue
          if (dataStr === '[DONE]') return finalMeta
          try {
            const parsed = JSON.parse(dataStr)
            if (parsed && typeof parsed.content === 'string' && onChunk) {
              onChunk(parsed.content)
            }
            // 捕获结束事件携带的元数据（safety_label 等），流真正结束时一并返回
            if (parsed && (parsed.done === true || parsed.event === 'done' || parsed.type === 'done')) {
              finalMeta = parsed
            }
          } catch {
            // 单行解析失败跳过，不中断整条流
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {}
  }
  return finalMeta
}

/**
 * AI 讨论总结：基于帖子内容与评论生成结构化总结
 * @param {string} postId 帖子 id
 * @returns {Promise<Object>} { core_points, controversies, suggestions, summary }
 */
export async function aiSummary(postId) {
  if (!postId) throw new Error('缺少 postId')
  const res = await request('POST', '/ai/summary', undefined, { postId })
  if (res.ok) return res.data
  throw new Error(res.error || '总结生成失败')
}

/**
 * 更新当前登录用户的开发者身份等级
 * @param {'junior'|'senior'|null} devLevel 初级 / 资深 / 清空
 * @returns {Promise<Object>} 返回更新后的 user 对象
 */
export async function updateDevLevel(devLevel) {
  const res = await request('PUT', '/users/me/level', undefined, { devLevel })
  if (res.ok) return res.data.user
  throw new Error(res.error || '更新失败')
}

/**
 * 搜索摘要：为搜索关键词生成 AI 摘要
 * @param {string} q 关键词
 * @returns {Promise<Object|null>} 摘要对象，失败返回 null
 */
export async function searchSummary(q) {
  if (!q) return null
  const res = await request('GET', '/search/summary', { q })
  return res.ok ? res.data : null
}

/**
 * 获取指定帖子的相关帖推荐
 * @param {string} postId 帖子 id
 * @returns {Promise<Array>} 相关帖数组，失败返回 []
 */
export async function getRelatedPosts(postId) {
  if (!postId) return []
  const res = await request('GET', `/posts/${postId}/related`)
  if (Array.isArray(res.data)) return res.data
  if (res.data && Array.isArray(res.data.items)) return res.data.items
  return []
}

// === 知识库管理（管理员） ===

/**
 * 获取知识库条目列表
 * @param {string} [search] 搜索关键词
 * @returns {Promise<Array>} 知识条目数组，失败返回 []
 */
export async function getKnowledgeItems(search) {
  const params = {}
  if (search !== undefined && search !== null) params.search = search
  const res = await request('GET', '/admin/knowledge', params)
  if (Array.isArray(res.data)) return res.data
  if (res.data && Array.isArray(res.data.items)) return res.data.items
  return []
}

/**
 * 新建知识库条目
 * @param {Object} data 条目数据
 * @returns {Promise<{ok:boolean, data:any, error:string|null}>}
 */
export async function createKnowledge(data = {}) {
  const res = await request('POST', '/admin/knowledge', undefined, data)
  if (!res.ok) return { ok: false, data: null, error: res.error }
  return { ok: true, data: res.data, error: null }
}

/**
 * 更新知识库条目
 * @param {string} id 条目 id
 * @param {Object} data 待更新字段
 * @returns {Promise<{ok:boolean, data:any, error:string|null}>}
 */
export async function updateKnowledge(id, data = {}) {
  if (!id) return { ok: false, data: null, error: '缺少 id' }
  const res = await request('PUT', `/admin/knowledge/${id}`, undefined, data)
  if (!res.ok) return { ok: false, data: null, error: res.error }
  return { ok: true, data: res.data, error: null }
}

/**
 * 归档（删除）知识库条目
 * @param {string} id 条目 id
 * @returns {Promise<{ok:boolean, error:string|null}>}
 */
export async function archiveKnowledge(id) {
  if (!id) return { ok: false, error: '缺少 id' }
  const res = await request('DELETE', `/admin/knowledge/${id}`)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, error: null }
}

// === 内容审核（管理员） ===

/**
 * 获取审核队列列表
 * @param {Object} [filters] 筛选条件 { status, risk_level }
 * @returns {Promise<Array>} 审核项数组，失败返回 []
 */
export async function getModerationList(filters = {}) {
  const res = await request('GET', '/admin/moderation', {
    status: filters.status,
    risk_level: filters.risk_level,
  })
  if (Array.isArray(res.data)) return res.data
  if (res.data && Array.isArray(res.data.items)) return res.data.items
  return []
}

/**
 * 处理审核项（通过/驳回等）
 * @param {string} id 审核 id
 * @param {string} action 处理动作
 * @param {string} [note] 处理备注
 * @returns {Promise<{ok:boolean, data:any, error:string|null}>}
 */
export async function resolveModeration(id, action, note) {
  if (!id) return { ok: false, data: null, error: '缺少 id' }
  const res = await request('POST', `/admin/moderation/${id}/resolve`, undefined, {
    action,
    note,
  })
  if (!res.ok) return { ok: false, data: null, error: res.error }
  return { ok: true, data: res.data, error: null }
}

// === 举报 ===

/**
 * 创建举报
 * @param {Object} data { target_type, target_id, reason }
 * @returns {Promise<{ok:boolean, data:any, error:string|null}>}
 */
export async function createReport(data = {}) {
  const res = await request('POST', '/reports', undefined, {
    target_type: data.target_type,
    target_id: data.target_id,
    reason: data.reason,
  })
  if (!res.ok) return { ok: false, data: null, error: res.error }
  return { ok: true, data: res.data, error: null }
}

/**
 * 获取举报列表（管理员）
 * @returns {Promise<Array>} 举报数组，失败返回 []
 */
export async function getReportList() {
  const res = await request('GET', '/admin/reports')
  if (Array.isArray(res.data)) return res.data
  if (res.data && Array.isArray(res.data.items)) return res.data.items
  return []
}

/**
 * 处理举报
 * @param {string} id 举报 id
 * @param {string} action 处理动作
 * @param {string} [note] 处理备注
 * @returns {Promise<{ok:boolean, data:any, error:string|null}>}
 */
export async function handleReport(id, action, note) {
  if (!id) return { ok: false, data: null, error: '缺少 id' }
  const res = await request('POST', `/admin/reports/${id}/handle`, undefined, {
    action,
    note,
  })
  if (!res.ok) return { ok: false, data: null, error: res.error }
  return { ok: true, data: res.data, error: null }
}

// === 管理员：用户管理 ===

/**
 * 获取用户列表（管理员）
 * @param {string} [search] 搜索关键词
 * @param {number} [limit] 每页数量
 * @param {number} [offset] 偏移量
 * @returns {Promise<Array>} 用户数组，失败返回 []
 */
export async function getAdminUsers(search, limit, offset) {
  const params = {}
  if (search !== undefined && search !== null) params.search = search
  if (limit !== undefined && limit !== null) params.limit = limit
  if (offset !== undefined && offset !== null) params.offset = offset
  const res = await request('GET', '/admin/users', params)
  if (Array.isArray(res.data)) return res.data
  if (res.data && Array.isArray(res.data.items)) return res.data.items
  return []
}

/**
 * 更新用户状态（封禁/解封等）
 * @param {string} id 用户 id
 * @param {string} status 目标状态
 * @returns {Promise<{ok:boolean, data:any, error:string|null}>}
 */
export async function updateUserStatus(id, status) {
  if (!id) return { ok: false, data: null, error: '缺少 id' }
  const res = await request('PUT', `/admin/users/${id}/status`, undefined, { status })
  if (!res.ok) return { ok: false, data: null, error: res.error }
  return { ok: true, data: res.data, error: null }
}

/**
 * 更新用户角色
 * @param {string} id 用户 id
 * @param {Array<string>} roles 角色数组
 * @returns {Promise<{ok:boolean, data:any, error:string|null}>}
 */
export async function updateUserRoles(id, roles) {
  if (!id) return { ok: false, data: null, error: '缺少 id' }
  const res = await request('PUT', `/admin/users/${id}/roles`, undefined, { roles })
  if (!res.ok) return { ok: false, data: null, error: res.error }
  return { ok: true, data: res.data, error: null }
}

// === 管理员：版块管理 ===

/**
 * 创建版块
 * @param {Object} data 版块数据
 * @returns {Promise<{ok:boolean, data:any, error:string|null}>}
 */
export async function createBoard(data = {}) {
  const res = await request('POST', '/admin/boards', undefined, data)
  if (!res.ok) return { ok: false, data: null, error: res.error }
  return { ok: true, data: res.data, error: null }
}

/**
 * 更新版块
 * @param {string} id 版块 id
 * @param {Object} data 待更新字段
 * @returns {Promise<{ok:boolean, data:any, error:string|null}>}
 */
export async function updateBoard(id, data = {}) {
  if (!id) return { ok: false, data: null, error: '缺少 id' }
  const res = await request('PUT', `/admin/boards/${id}`, undefined, data)
  if (!res.ok) return { ok: false, data: null, error: res.error }
  return { ok: true, data: res.data, error: null }
}

/**
 * 归档（删除）版块
 * @param {string} id 版块 id
 * @returns {Promise<{ok:boolean, error:string|null}>}
 */
export async function archiveBoard(id) {
  if (!id) return { ok: false, error: '缺少 id' }
  const res = await request('DELETE', `/admin/boards/${id}`)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, error: null }
}

// === 管理员：仪表盘 ===

/**
 * 获取管理员仪表盘统计数据
 * @returns {Promise<Object|null>} 仪表盘数据，失败返回 null
 */
export async function getAdminDashboard() {
  const res = await request('GET', '/admin/dashboard')
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
  searchPosts,
  getUserProfile,
  getUserPosts,
  getUserFavorites,
  getUserComments,
  guestStart,
  guestPing,
  guestBind,
  aiHealth,
  aiGenerate,
  aiStream,
  aiPostAssist,
  aiQAStart,
  aiQAStream,
  aiSummary,
  updateDevLevel,
  searchSummary,
  getRelatedPosts,
  getKnowledgeItems,
  createKnowledge,
  updateKnowledge,
  archiveKnowledge,
  getModerationList,
  resolveModeration,
  createReport,
  getReportList,
  handleReport,
  getAdminUsers,
  updateUserStatus,
  updateUserRoles,
  createBoard,
  updateBoard,
  archiveBoard,
  getAdminDashboard,
}
