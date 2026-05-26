import { SYSTEM_PROMPT, QUESTION_LABELS, PERSPECTIVE_HOOKS, buildUserPrompt } from '@/lib/prompt'

const API_KEY = process.env.NEXT_PUBLIC_CLAUDE_KEY || 'sk-acw-3ff61a2a-3081a664c8784745'
const BASE_URL = (process.env.NEXT_PUBLIC_CLAUDE_URL || 'https://api.with7.cn').replace(/\/$/, '')
const MODEL = 'claude-sonnet-4-6'
// 第一步只生成免费部分（更少 tokens）
const FREE_MAX_TOKENS = 1200
// 第二步生成付费部分
const PAID_MAX_TOKENS = 1500
const TIMEOUT_MS = 35000

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
  throw new Error('Cannot parse JSON')
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
    other_perspectives: Object.keys(QUESTION_LABELS)
      .filter(k => k !== mainQuestion)
      .map(k => ({ title: QUESTION_LABELS[k], content: '' })),
  }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export class AnalyzeTimeoutError extends Error {
  constructor() { super('timeout') }
}

// 精简版 prompt — 只生成免费内容（不要 other_perspectives）
const FREE_SYSTEM = `你是分析感情问题的专家。用中文输出严格JSON，不要markdown代码块。

只输出以下字段：
{
  "core_judgment": "一到两句话，说清这段关系的本质",
  "real_need": "她真正想要的是什么，2-3段",
  "relationship_structure": "为什么这段关系消耗她，2-3段",
  "future_trend": "未来大概率怎样，1-2段",
  "final_advice": "最后建议，1-2段",
  "advice_type": "continue 或 observe 或 stop",
  "closing_words": "2-3段真实的话",
  "selected_question_answer": {
    "title": "用户选的问题标题",
    "content": "针对这个问题的深度回答，3-5段"
  }
}`

// 付费内容 prompt — 只生成 other_perspectives
const PAID_SYSTEM = `你是分析感情问题的专家。用中文输出严格JSON数组，不要markdown代码块。

输出格式：
[
  { "title": "问题标题", "content": "3-5段深度分析" },
  ...
]`

async function callApi(systemPrompt: string, userContent: string, maxTokens: number) {
  const res = await fetchWithTimeout(
    `${BASE_URL}/v1/messages`,
    {
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
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    },
    TIMEOUT_MS,
  )
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${err.slice(0, 100)}`)
  }
  const data = await res.json()
  const textBlock = data.content?.find((b: any) => b.type === 'text')
  return textBlock?.text ?? ''
}

export async function callAnalyze(
  painPoints: string[],
  customPainPoint: string | null,
  story: string,
  mainQuestion: string,
): Promise<{ id: string; result: any; _context: any }> {
  const selectedLabel = QUESTION_LABELS[mainQuestion] ?? mainQuestion
  const painStr = [...painPoints, ...(customPainPoint ? [customPainPoint] : [])].join('、') || '未指定'

  const userContent = `她描述最让她难受的地方：${painStr}
最近最让她难受的事：${story}
她最想知道的问题：${selectedLabel}

请严格按JSON格式输出。`

  let freeParsed: Record<string, any> | null = null

  // 第一步：获取免费内容（目标 10-15 秒）
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callApi(FREE_SYSTEM, userContent, FREE_MAX_TOKENS)
      freeParsed = extractJson(raw)
      break
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.message === 'timeout') {
        throw new AnalyzeTimeoutError()
      }
      if (attempt === 1) freeParsed = makeFallback(mainQuestion)
    }
  }
  if (!freeParsed) freeParsed = makeFallback(mainQuestion)

  // other_perspectives 暂时为空，付费解锁后再懒加载
  const otherIds = Object.keys(QUESTION_LABELS).filter(k => k !== mainQuestion)
  const emptyPerspectives = otherIds.map(k => ({
    id: k,
    title: QUESTION_LABELS[k],
    hook: PERSPECTIVE_HOOKS[k] ?? '',
    content: '',
  }))

  const sqaRaw = freeParsed.selected_question_answer ?? {}

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
        title: sqaRaw.title ?? selectedLabel,
        hook: PERSPECTIVE_HOOKS[mainQuestion] ?? '',
        content: sqaRaw.content ?? '',
      },
      other_perspectives: emptyPerspectives,
    },
    // 保存原始 context 供付费后二次请求
    _context: { painStr, story, mainQuestion, otherIds },
  }
}

// 付费解锁后调用，获取 other_perspectives
export async function callPaidContent(context: {
  painStr: string
  story: string
  mainQuestion: string
  otherIds: string[]
}): Promise<Array<{ id: string; title: string; hook: string; content: string }>> {
  const { painStr, story, otherIds } = context
  const otherTitles = otherIds.map(k => QUESTION_LABELS[k]).join('、')

  const userContent = `她描述最让她难受的地方：${painStr}
最近最让她难受的事：${story}

请针对以下4个问题分别给出深度分析（每题3-4段），输出JSON数组：
[
${otherIds.map(k => `  { "title": "${QUESTION_LABELS[k]}", "content": "..." }`).join(',\n')}
]`

  try {
    const raw = await callApi(PAID_SYSTEM, userContent, PAID_MAX_TOKENS)
    const arr: any[] = JSON.parse(raw)
    if (!Array.isArray(arr)) throw new Error('not array')

    const labelToId: Record<string, string> = {}
    for (const [k, v] of Object.entries(QUESTION_LABELS)) labelToId[v] = k

    return arr.map((p: any) => {
      const title = p.title ?? ''
      const qid = labelToId[title] ?? otherIds.find(id => QUESTION_LABELS[id] === title) ?? title
      return {
        id: qid,
        title,
        hook: PERSPECTIVE_HOOKS[qid] ?? '',
        content: p.content ?? '',
      }
    })
  } catch {
    return otherIds.map(k => ({
      id: k,
      title: QUESTION_LABELS[k],
      hook: PERSPECTIVE_HOOKS[k] ?? '',
      content: '',
    }))
  }
}
