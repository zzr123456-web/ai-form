/**
 * 缓存 key 生成与 TTL 常量
 * 所有 key 统一前缀 'af:'，避免与其他项目冲突
 */

// === TTL 常量（秒）===
export const TTL_BOARDS = 60
export const TTL_TOPICS = 300
export const TTL_USERS = 120
export const TTL_STATS = 300
export const TTL_POSTS = 30
export const TTL_POST_DETAIL = 60
export const TTL_COMMENTS = 30

// === Key 生成函数 ===

/** 版块列表 key */
export function boardListKey() {
  return 'af:boards'
}

/** 话题列表 key */
export function topicListKey() {
  return 'af:topics'
}

/**
 * 用户列表 key（按筛选条件区分）
 * @param {string} status 用户状态筛选
 * @param {string} role 角色筛选
 */
export function userListKey(status, role) {
  return `af:users:list:${status || 'all'}:${role || 'all'}`
}

/** 单个用户 key */
export function userKey(id) {
  return `af:user:${id}`
}

/** 用户统计 key */
export function userStatsKey(id) {
  return `af:user:${id}:stats`
}

/**
 * 帖子列表 key（复合 key，按查询参数区分）
 * @param {string} sort 排序方式
 * @param {string} boardId 版块 id
 * @param {string} tag 标签
 * @param {number} page 页码
 * @param {number} limit 每页数量
 */
export function postListKey(sort, boardId, tag, page, limit, search) {
  return `af:posts:list:${sort || 'latest'}:${boardId || 'all'}:${tag || 'all'}:${search || 'all'}:${page}:${limit}`
}

/** 帖子详情 key */
export function postKey(id) {
  return `af:post:${id}`
}

/** 评论树 key */
export function commentsKey(postId) {
  return `af:post:${postId}:comments`
}
