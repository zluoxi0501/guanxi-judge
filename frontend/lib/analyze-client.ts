import { QUESTION_LABELS, PERSPECTIVE_HOOKS } from '@/lib/prompt'

const API_KEY = process.env.NEXT_PUBLIC_CLAUDE_KEY || 'sk-acw-3ff61a2a-3081a664c8784745'
const BASE_URL = (process.env.NEXT_PUBLIC_CLAUDE_URL || 'https://api.with7.cn').replace(/\/$/, '')
const MODEL = 'claude-sonnet-4-6'
const FREE_MAX_TOKENS = 1000
const PAID_MAX_TOKENS = 1200
const TIMEOUT_MS = 60000  // streaming 不需要短 timeout，60s 足够

function extractJson(text: string): Record<string, any> {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n')
    const inner = lines.slice(1)
    if (inner[inner.length - 1]?.trim() === '```') inner.pop()
    cleaned = inner.join('\n').trim()
  }
  try { return JSON.parse(cleaned) } catch {}
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) { try { return JSON.parse(match[0]) } catch {} }
  throw new Error('Cannot parse JSON from: ' + cleaned.slice(0, 100))
}

function makeFallback(mainQuestion: string) {
  const otherIds = Object.keys(QUESTION_LABELS).filter(k => k !== mainQuestion)
  return {
    core_judgment: '这段关系让你很累。\n\n不是因为你想太多，而是因为它一直没有真正稳定下来。',
    real_need: '你想要的不是更多联系。\n\n你想要的是，不用靠猜来判断这段关系还在不在。',
    relationship_structure: '这段关系消耗你，是因为它的状态从来不稳定。\n\n你一直在用自己的稳定，去填补它的不稳定。',
    future_trend: '如果现在的模式不变，这段关系会继续在原地循环。\n\n真正的改变需要他主动做出选择。',
    final_advice: '先停止主动填补空白，看他在你安静下来之后会不会主动出现。',
    advice_type: 'observe',
    closing_words: '你不是不知道关系有问题。\n\n你只是一直希望，这次会和以前不一样。',
    selected_question_answer: {
      title: QUESTION_LABELS[mainQuestion] ?? mainQuestion,
      content: '这个问题的答案，藏在他平时的行为里，不在他说的话里。',
    },
    other_perspectives: otherIds.map(k => ({
      title: QUESTION_LABELS[k], content: '',
    })),
  }
}

export class AnalyzeTimeoutError extends Error {
  constructor() { super('timeout') }
}

// 用 streaming 调 API，累积全部文字后返回
async function streamingCall(
  systemPrompt: string,
  userContent: string,
  maxTokens: number,
  label: string,
  onChunk?: (text: string) => void,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  const t0 = Date.now()
  console.log(`[analyze:${label}] 开始 model=${MODEL} maxTokens=${maxTokens} promptLen=${systemPrompt.length + userContent.length}`)

  try {
    const res = await fetch(`${BASE_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        thinking: { type: 'disabled' },
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const err = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`)
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let accumulated = ''
    let buffer = ''
    let firstTokenMs: number | null = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines[lines.length - 1]

      for (const line of lines.slice(0, -1)) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (!data || data === '[DONE]') continue
        try {
          const event = JSON.parse(data)
          if (event.type === 'content_block_delta' && event.delta?.text) {
            if (firstTokenMs === null) {
              firstTokenMs = Date.now() - t0
              console.log(`[analyze:${label}] 首token ${firstTokenMs}ms`)
            }
            accumulated += event.delta.text
            onChunk?.(event.delta.text)
          }
        } catch {}
      }
    }

    const totalMs = Date.now() - t0
    console.log(`[analyze:${label}] 完成 ${totalMs}ms outputLen=${accumulated.length}`)
    return accumulated
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new AnalyzeTimeoutError()
    throw e
  } finally {
    clearTimeout(timer)
  }
}

const FREE_SYSTEM = `你是分析感情问题的专家。用中文输出严格JSON，不要markdown代码块。

只输出以下字段（每字段2-3句话，简洁）：
{
  "core_judgment": "这段关系的本质",
  "real_need": "她真正想要什么",
  "relationship_structure": "为什么这段关系消耗她",
  "future_trend": "未来大概率走向",
  "final_advice": "最后建议",
  "advice_type": "continue 或 observe 或 stop",
  "closing_words": "真实的话",
  "selected_question_answer": {
    "title": "用户选的问题标题",
    "content": "针对这个问题的回答，3-4句话"
  }
}`

const PAID_SYSTEM = `你是分析感情问题的专家。用中文输出严格JSON数组，不要markdown代码块。

每个问题输出3-4句话的分析。
格式：[{"title":"","content":""},...]`

export async function callAnalyze(
  painPoints: string[],
  customPainPoint: string | null,
  story: string,
  mainQuestion: string,
  onProgress?: (chunk: string) => void,
): Promise<{ id: string; result: any; _context: any }> {
  const selectedLabel = QUESTION_LABELS[mainQuestion] ?? mainQuestion
  const painStr = [...painPoints, ...(customPainPoint ? [customPainPoint] : [])].join('、') || '未指定'

  const userContent = `她描述最让她难受的地方：${painStr}
最近最让她难受的事：${story}
她最想知道的问题：${selectedLabel}

请按JSON格式输出。`

  let raw = ''
  try {
    raw = await streamingCall(FREE_SYSTEM, userContent, FREE_MAX_TOKENS, 'free', onProgress)
  } catch (e) {
    if (e instanceof AnalyzeTimeoutError) throw e
    console.error('[analyze:free] error:', e)
    raw = ''
  }

  let freeParsed: Record<string, any>
  try {
    freeParsed = extractJson(raw)
  } catch {
    console.warn('[analyze:free] json parse failed, using fallback')
    freeParsed = makeFallback(mainQuestion)
  }

  const otherIds = Object.keys(QUESTION_LABELS).filter(k => k !== mainQuestion)

  return {
    id: crypto.randomUUID(),
    result: {
      core_judgment: freeParsed.core_judgment ?? '',
      real_need: freeParsed.real_need ?? '',
      relationship_structure: freeParsed.relationship_structure ?? '',
      future_trend: freeParsed.future_trend ?? '',
      final_advice: freeParsed.final_advice ?? '',
      advice_type: freeParsed.advice_type ?? 'observe',
      closing_words: freeParsed.closing_words ?? '',
      selected_question: mainQuestion,
      selected_question_answer: {
        id: mainQuestion,
        title: freeParsed.selected_question_answer?.title ?? selectedLabel,
        hook: PERSPECTIVE_HOOKS[mainQuestion] ?? '',
        content: freeParsed.selected_question_answer?.content ?? '',
      },
      other_perspectives: otherIds.map(k => ({
        id: k, title: QUESTION_LABELS[k], hook: PERSPECTIVE_HOOKS[k] ?? '', content: '',
      })),
    },
    _context: { painStr, story, mainQuestion, otherIds },
  }
}

export async function callPaidContent(context: {
  painStr: string
  story: string
  mainQuestion: string
  otherIds: string[]
}): Promise<Array<{ id: string; title: string; hook: string; content: string }>> {
  const { painStr, story, otherIds } = context

  const userContent = `她描述最让她难受的地方：${painStr}
最近最让她难受的事：${story}

针对以下${otherIds.length}个问题，每题3-4句话，输出JSON数组：
${otherIds.map(k => `{"title":"${QUESTION_LABELS[k]}","content":""}`).join(',\n')}`

  try {
    const raw = await streamingCall(PAID_SYSTEM, userContent, PAID_MAX_TOKENS, 'paid')
    const arr: any[] = JSON.parse(raw.trim().startsWith('[') ? raw : raw.replace(/^[^[]*/, '').replace(/[^\]]*$/, ''))
    if (!Array.isArray(arr)) throw new Error('not array')

    const labelToId: Record<string, string> = {}
    for (const [k, v] of Object.entries(QUESTION_LABELS)) labelToId[v] = k

    return arr.map((p: any) => {
      const title = p.title ?? ''
      const qid = labelToId[title] ?? otherIds.find(id => QUESTION_LABELS[id] === title) ?? title
      return { id: qid, title, hook: PERSPECTIVE_HOOKS[qid] ?? '', content: p.content ?? '' }
    })
  } catch (e) {
    console.error('[analyze:paid] error:', e)
    return otherIds.map(k => ({
      id: k, title: QUESTION_LABELS[k], hook: PERSPECTIVE_HOOKS[k] ?? '', content: '',
    }))
  }
}
