/**
 * Deepseek LLM API 编排层
 * - 统一收口 DEEPSEEK_API_KEY（从 process.env 读取，不允许从参数传入）
 * - 提供非流式 / 流式 chat completion
 * - 提供 token 估算与日志截断工具
 *
 * 注意：API Key 格式类似 sk-xxx，必须通过 .env 或环境变量配置 DEEPSEEK_API_KEY
 */

const BASE_URL = 'https://api.deepseek.com'
const ENDPOINT = '/chat/completions'
const DEFAULT_MODEL = 'deepseek-chat'
const DEFAULT_TEMPERATURE = 0.7
const DEFAULT_MAX_TOKENS = 1024
const DEFAULT_TIMEOUT = 30000

function getApiKey() {
  return process.env.DEEPSEEK_API_KEY || ''
}

/**
 * LLM 健康检查：检查 API_KEY 是否存在
 * 为节省额度，不发送真实网络请求；key 非空即 ping=true
 * @returns {{ ok: boolean, model: string, ping: boolean, degraded?: boolean }}
 */
export function health() {
  const key = getApiKey()
  const ok = !!key
  return {
    ok,
    model: DEFAULT_MODEL,
    ping: ok,
    ...(ok ? {} : { degraded: true }),
  }
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('messages must be a non-empty array')
  }
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (!m || typeof m !== 'object') {
      throw new Error(`messages[${i}] is not a valid object`)
    }
    if (typeof m.role !== 'string' || !m.role) {
      throw new Error(`messages[${i}].role must be a non-empty string`)
    }
    if (typeof m.content !== 'string') {
      throw new Error(`messages[${i}].content must be a string`)
    }
  }
}

/**
 * 非流式调用 Chat Completion
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ model?: string, temperature?: number, max_tokens?: number, stream?: boolean }} [options]
 * @returns {Promise<{ content: string, usage: Object|null, raw: Object|null }>}
 */
export async function createChatCompletion(messages, options = {}) {
  const key = getApiKey()
  if (!key) {
    throw new Error('DEEPSEEK_API_KEY not configured')
  }

  validateMessages(messages)

  const model = options.model || DEFAULT_MODEL
  const temperature = typeof options.temperature === 'number' ? options.temperature : DEFAULT_TEMPERATURE
  const maxTokens = typeof options.max_tokens === 'number' ? options.max_tokens : DEFAULT_MAX_TOKENS

  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    stream: false,
    messages,
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

  try {
    const response = await fetch(BASE_URL + ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const rawText = await response.text()
    let rawData = null
    try {
      rawData = rawText ? JSON.parse(rawText) : null
    } catch {
      rawData = null
    }

    if (!response.ok) {
      const bodyPreview = rawText || '(empty response body)'
      throw new Error(`Deepseek API ${response.status}: ${bodyPreview}`)
    }

    const content = rawData?.choices?.[0]?.message?.content ?? ''
    const usage = rawData?.usage || null

    return { content, usage, raw: rawData }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 流式调用 Chat Completion（SSE）
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ model?: string, temperature?: number, max_tokens?: number }} [options]
 * @param {(text: string) => void} onChunk  每次收到增量文本回调（只给增量）
 * @param {(finalText: string, usage: Object|null) => void} onDone  结束回调
 */
export async function streamChatCompletion(messages, options = {}, onChunk, onDone) {
  const key = getApiKey()
  if (!key) {
    throw new Error('DEEPSEEK_API_KEY not configured')
  }

  validateMessages(messages)

  if (typeof onChunk !== 'function') {
    throw new Error('onChunk must be a function')
  }
  if (typeof onDone !== 'function') {
    throw new Error('onDone must be a function')
  }

  const model = options.model || DEFAULT_MODEL
  const temperature = typeof options.temperature === 'number' ? options.temperature : DEFAULT_TEMPERATURE
  const maxTokens = typeof options.max_tokens === 'number' ? options.max_tokens : DEFAULT_MAX_TOKENS

  const body = {
    model,
    temperature,
    max_tokens: maxTokens,
    stream: true,
    messages,
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

  try {
    const response = await fetch(BASE_URL + ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const rawText = await response.text()
      throw new Error(`Deepseek API ${response.status}: ${rawText || '(empty response body)'}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let finalText = ''
    let usage = null
    let done = false

    try {
      while (!done) {
        const { value, done: streamDone } = await reader.read()
        if (streamDone) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          if (trimmed === ': ping') continue
          if (!trimmed.startsWith('data: ')) continue

          const dataStr = trimmed.slice(6)
          if (dataStr === '[DONE]') {
            done = true
            break
          }

          let data
          try {
            data = JSON.parse(dataStr)
          } catch {
            continue
          }

          if (data.usage) {
            usage = data.usage
          }

          const delta = data?.choices?.[0]?.delta?.content
          if (delta && typeof delta === 'string') {
            finalText += delta
            onChunk(delta)
          }
        }
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // ignore
      }
    }

    onDone(finalText, usage)
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 粗略估算 token 数
 * - 中文字符：1 字 ≈ 1.5 token
 * - 英文单词：1 词 ≈ 1 token（按空格切分）
 * - 其他字符按字符数估算
 * 返回整数
 * @param {string} text
 * @returns {number}
 */
export function countTokensApprox(text) {
  if (!text || typeof text !== 'string') return 0
  let count = 0
  const chineseRe = /[\u4e00-\u9fa5]/g
  const chineseChars = text.match(chineseRe) || []
  count += Math.round(chineseChars.length * 1.5)

  const rest = text.replace(chineseRe, ' ')
  const words = rest.split(/\s+/).filter(Boolean)
  count += words.length

  return count
}

/**
 * 截断文本用于写日志，避免超长写入 ai_usage_logs
 * @param {string} text
 * @param {number} [max=1000]
 * @returns {string}
 */
export function truncateForLog(text, max = 1000) {
  if (!text || typeof text !== 'string') return ''
  if (text.length <= max) return text
  return text.slice(0, max) + '...(truncated)'
}
