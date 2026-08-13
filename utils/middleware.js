/**
 * 鉴权中间件
 * - parseAuthToken：从 Authorization 头提取 token
 * - authenticate：验证 token + session，返回认证结果
 * - requireAuth：高阶函数，包装需要登录的 handler
 */
import { verifyToken, verifySession } from './auth.js'

/**
 * 从请求头提取 Bearer token
 * @param {Object} req Node.js http 请求对象
 * @returns {string|null}
 */
export function parseAuthToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization
  if (!auth) return null
  // 标准格式：Bearer <token>
  const parts = auth.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  return parts[1]
}

/**
 * 认证中间件：验证 token + session
 * @param {Object} req Node.js http 请求对象
 * @returns {Promise<{authenticated: boolean, user?: Object, message?: string}>}
 */
export async function authenticate(req) {
  const token = parseAuthToken(req)
  if (!token) {
    return { authenticated: false, message: '未登录' }
  }

  const payload = verifyToken(token)
  if (!payload) {
    return { authenticated: false, message: 'token 无效或已过期' }
  }

  // 验证 Redis session 是否存在（白名单模式）
  const sessionValid = await verifySession(payload.userId, payload.jti)
  if (!sessionValid) {
    return { authenticated: false, message: '会话已过期，请重新登录' }
  }

  return {
    authenticated: true,
    user: {
      userId: payload.userId,
      nickname: payload.nickname,
      roles: payload.roles || [],
      jti: payload.jti,
    },
  }
}

/**
 * 高阶函数：包装需要登录的 handler
 * 未认证时返回 401，认证通过后调用原 handler 并注入 authUser
 * @param {Function} handler 原始 handler (req, res, authUser, ...args) => boolean
 * @returns {Function} 包装后的 handler
 */
export function requireAuth(handler) {
  return async (req, res, ...args) => {
    const auth = await authenticate(req)
    if (!auth.authenticated) {
      return sendJson(res, 401, { error: auth.message })
    }
    // 注入 authUser 到 handler 的第三个参数
    return handler(req, res, auth.user, ...args)
  }
}

// sendJson 需要从 server.js 引入，但为避免循环依赖，这里内联一个简化版
// server.js 的 sendJson 会注入 CORS 头，这里保持一致
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
