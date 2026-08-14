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
    console.error('[LLM:createChatCompletion] DEEPSEEK_API_KEY 未配置，无法调用 AI')
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

  console.log(`[LLM:createChatCompletion] 开始调用 model=${model} temp=${temperature} maxTokens=${maxTokens} messages=${messages.length}条`)

  const startMs = Date.now()
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

    console.log(`[LLM:createChatCompletion] 收到响应 status=${response.status} ok=${response.ok}`)

    const rawText = await response.text()
    let rawData = null
    try {
      rawData = rawText ? JSON.parse(rawText) : null
    } catch {
      rawData = null
    }

    if (!response.ok) {
      const bodyPreview = rawText.slice(0, 300) || '(empty response body)'
      console.error(`[LLM:createChatCompletion] API 返回错误 ${response.status}: ${bodyPreview}`)
      throw new Error(`Deepseek API ${response.status}: ${bodyPreview}`)
    }

    const content = rawData?.choices?.[0]?.message?.content ?? ''
    const usage = rawData?.usage || null
    const latency = Date.now() - startMs
    console.log(`[LLM:createChatCompletion] 成功 content长度=${content.length} prompt_tokens=${usage?.prompt_tokens ?? '?'} completion_tokens=${usage?.completion_tokens ?? '?'} 耗时=${latency}ms`)

    return { content, usage, raw: rawData }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error(`[LLM:createChatCompletion] 请求超时（${DEFAULT_TIMEOUT}ms）`)
    } else if (!err.message?.startsWith('Deepseek API')) {
      console.error('[LLM:createChatCompletion] 网络异常:', err.message)
    }
    throw err
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
    console.error('[LLM:streamChatCompletion] DEEPSEEK_API_KEY 未配置，无法调用 AI')
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

  const startMs = Date.now()
  console.log(`[LLM:streamChatCompletion] 开始调用 model=${model} temp=${temperature} maxTokens=${maxTokens} messages=${messages.length}条`)

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

    console.log(`[LLM:streamChatCompletion] 收到响应 status=${response.status} ok=${response.ok} 耗时=${Date.now() - startMs}ms`)

    if (!response.ok) {
      const rawText = await response.text()
      console.error(`[LLM:streamChatCompletion] API 返回错误 ${response.status}: ${rawText.slice(0, 300)}`)
      throw new Error(`Deepseek API ${response.status}: ${rawText || '(empty response body)'}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      console.error('[LLM:streamChatCompletion] Response body 不可读')
      throw new Error('Response body is not readable')
    }

    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let finalText = ''
    let usage = null
    let done = false
    let chunkCount = 0
    let firstChunkMs = 0

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
            if (chunkCount === 0) {
              firstChunkMs = Date.now() - startMs
              console.log(`[LLM:streamChatCompletion] 首个 chunk 到达 耗时=${firstChunkMs}ms`)
            }
            chunkCount++
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

    const totalMs = Date.now() - startMs
    console.log(`[LLM:streamChatCompletion] 流式结束 总chunks=${chunkCount} 文本长度=${finalText.length} prompt_tokens=${usage?.prompt_tokens ?? '?'} completion_tokens=${usage?.completion_tokens ?? '?'} 总耗时=${totalMs}ms`)

    onDone(finalText, usage)
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error(`[LLM:streamChatCompletion] 请求超时（${DEFAULT_TIMEOUT}ms）`)
    } else if (!err.message?.startsWith('Deepseek API')) {
      console.error('[LLM:streamChatCompletion] 网络异常:', err.message)
    }
    throw err
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
