/**
 * AI 辅助论坛 · 前端 API 客户端层
 * 统一封装所有后端 API 调用，使用原生 fetch，不引入第三方库
 * 基础路径：/api/forum（由 vite.config.js 中的 proxy 转发到 http://localhost:8787）
 */

// 基础路径常量：相对路径，浏览器自动补充 origin，由 vite 代理转发
const BASE_URL = '/api/forum'

/**
 * 内部统一请求封装
 * - GET：params 拼接为 query string
 * - POST/PUT：body 转 JSON
 * - 网络错误或非 2xx 响应时返回 null，由调用方根据语义决定兜底值
 * @param {string} method HTTP 方法
 * @param {string} path 路径（不含 BASE_URL）
 * @param {Object} [params] GET 查询参数
 * @param {Object} [body] POST/PUT 请求体
 * @returns {Promise<Object|null>} 解析后的 JSON，失败返回 null
 */
async function request(method, path, params, body) {
  try {
    // 构造 URL：仅在 params 非空时拼接 query string，避免出现多余的「?」
    let url = `${BASE_URL}${path}`
    if (params && Object.keys(params).length > 0) {
      const qs = new URLSearchParams()
      Object.entries(params).forEach(([k, v]) => {
        // 过滤 undefined / null / 空字符串，避免发送无意义参数
        if (v !== undefined && v !== null && v !== '') {
          qs.set(k, v)
        }
      })
      const qsStr = qs.toString()
      if (qsStr) url += `?${qsStr}`
    }

    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    }
    // 仅 POST/PUT 携带请求体，避免 GET 请求误带 body 触发部分代理告警
    if (body !== undefined && body !== null && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body)
    }

    const res = await fetch(url, options)
    if (!res.ok) {
      console.warn(`[apiClient] ${method} ${path} 失败: HTTP ${res.status}`)
      return null
    }
    return await res.json()
  } catch (err) {
    // 网络错误（如后端未启动、代理失败）兜底，避免前端页面整体崩溃
    console.warn(`[apiClient] ${method} ${path} 网络错误:`, err?.message || err)
    return null
  }
}

// === 帖子相关 ===

/**
 * 获取帖子列表
 * @param {Object} [params] 查询参数
 * @param {string} [params.sort] 排序方式
 * @param {string} [params.boardId] 版块 id
 * @param {string} [params.tag] 标签
 * @param {number} [params.page] 页码
 * @param {number} [params.limit] 每页数量
 * @returns {Promise<Array>} 帖子数组，失败返回 []
 */
export async function getPosts(params = {}) {
  const data = await request('GET', '/posts', {
    sort: params.sort,
    boardId: params.boardId,
    tag: params.tag,
    page: params.page,
    limit: params.limit,
  })
  // 后端可能返回数组或 { items: [] } 结构，这里做轻量兼容兜底
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
  return await request('GET', `/posts/${id}`)
}

/**
 * 创建新帖子
 * @param {Object} payload 帖子数据
 * @returns {Promise<Object|null>} 新建帖子，失败返回 null
 */
export async function createPost(payload = {}) {
  return await request('POST', '/posts', undefined, {
    title: payload.title,
    content: payload.content,
    boardId: payload.boardId,
    tags: payload.tags,
    summary: payload.summary,
    authorId: payload.authorId,
  })
}

// === 评论相关 ===

/**
 * 获取指定帖子的评论树
 * @param {string} postId 帖子 id
 * @returns {Promise<Array>} 评论树数组，失败返回 []
 */
export async function getComments(postId) {
  if (!postId) return []
  const data = await request('GET', `/posts/${postId}/comments`)
  return Array.isArray(data) ? data : []
}

// === 版块与话题 ===

/**
 * 获取版块列表
 * @returns {Promise<Array>} 版块数组，失败返回 []
 */
export async function getBoards() {
  const data = await request('GET', '/boards')
  return Array.isArray(data) ? data : []
}

/**
 * 获取热门话题列表
 * @returns {Promise<Array>} 话题数组，失败返回 []
 */
export async function getTopics() {
  const data = await request('GET', '/topics')
  return Array.isArray(data) ? data : []
}

// === 用户相关 ===

/**
 * 获取用户列表
 * @param {Object} [params] 筛选参数
 * @param {string} [params.status] 用户状态
 * @param {string} [params.role] 用户角色
 * @returns {Promise<Array>} 用户数组，失败返回 []
 */
export async function getUsers(params = {}) {
  const data = await request('GET', '/users', {
    status: params.status,
    role: params.role,
  })
  return Array.isArray(data) ? data : []
}

/**
 * 获取当前登录用户
 * 约定：后端提供 GET /api/forum/users/u_alex 作为当前用户接口
 * @returns {Promise<Object|null>} 当前用户对象，失败返回 null
 */
export async function getCurrentUser() {
  return await request('GET', '/users/u_alex')
}

/**
 * 获取用户统计数据
 * @param {string} userId 用户 id
 * @returns {Promise<Object|null>} 用户统计对象，失败返回 null
 */
export async function getUserStats(userId) {
  if (!userId) return null
  return await request('GET', `/users/${userId}/stats`)
}

// === 健康检查 ===

/**
 * 后端健康检查
 * @returns {Promise<{db:string,ts:string}|null>} 健康状态对象，失败返回 null
 */
export async function getHealth() {
  return await request('GET', '/health')
}

// 默认导出：聚合所有方法，便于 import apiClient from '@/utils/ai-forum/apiClient' 后统一调用
export default {
  getPosts,
  getPost,
  createPost,
  getComments,
  getBoards,
  getTopics,
  getUsers,
  getCurrentUser,
  getUserStats,
  getHealth,
}
