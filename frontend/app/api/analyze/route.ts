import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT, QUESTION_LABELS, PERSPECTIVE_HOOKS, buildUserPrompt } from '@/lib/prompt'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function extractJson(text: string): Record<string, any> {
  let cleaned = text.trim()
  if (cleaned.startsWith('```')) {
    const lines = cleaned.split('\n')
    const inner = lines.slice(1)
    if (inner[inner.length - 1]?.trim() === '```') inner.pop()
    cleaned = inner.join('\n').trim()
  }
  try {
    return JSON.parse(cleaned)
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) } catch {}
    }
    throw new Error('Cannot parse JSON')
  }
}

function makeFallback(mainQuestion: string) {
  const otherIds = Object.keys(QUESTION_LABELS).filter(k => k !== mainQuestion)
  return {
    core_judgment: '这段关系让你很累。\n\n不是因为你想太多，而是因为它一直没有真正稳定下来。',
    real_need: '你想要的不是更多联系。\n\n你想要的是，不用靠猜来判断这段关系还在不在。',
    relationship_structure: '这段关系消耗你，是因为它的状态从来不稳定。\n\n你一直在用自己的稳定，去填补它的不稳定。',
    future_trend: '如果现在的模式不变，这段关系会继续在原地循环。\n\n真正的改变需要他主动做出选择。',
    final_advice: '先停止主动填补空白，看他在你安静下来之后会不会主动出现。\n\n那个答案，比他说的任何话都真实。',
    advice_type: 'observe',
    closing_words: '你不是不知道关系有问题。\n\n你只是一直希望，这次会和以前不一样。',
    selected_question_answer: {
      title: QUESTION_LABELS[mainQuestion] ?? mainQuestion,
      content: '这个问题的答案，藏在他平时的行为里，不在他说的话里。\n\n他靠近你的时候，是因为他需要你。\n\n他消失的时候，是因为他还没准备好承担这段关系的重量。',
    },
    other_perspectives: otherIds.map(k => ({
      title: QUESTION_LABELS[k],
      content: '基于这段关系的整体状态，这个问题的答案需要时间来验证。\n\n你现在能做的，是先看清楚自己真正想要什么。',
    })),
  }
}

function buildResult(parsed: Record<string, any>, mainQuestion: string) {
  const labelToId: Record<string, string> = {}
  for (const [k, v] of Object.entries(QUESTION_LABELS)) {
    labelToId[v] = k
  }

  const sqaRaw = parsed.selected_question_answer ?? {}
  const selectedQuestionAnswer = {
    id: mainQuestion,
    title: sqaRaw.title ?? QUESTION_LABELS[mainQuestion] ?? '',
    hook: PERSPECTIVE_HOOKS[mainQuestion] ?? '',
    content: sqaRaw.content ?? '',
  }

  const otherRaw: any[] = parsed.other_perspectives ?? []
  const otherPerspectives = otherRaw.map((p: any) => {
    const title = p.title ?? ''
    const qid = labelToId[title] ?? title
    return {
      id: qid,
      title,
      hook: PERSPECTIVE_HOOKS[qid] ?? title,
      content: p.content ?? '',
    }
  })

  return {
    id: crypto.randomUUID(),
    result: {
      core_judgment: parsed.core_judgment ?? '',
      real_need: parsed.real_need ?? '',
      relationship_structure: parsed.relationship_structure ?? '',
      future_trend: parsed.future_trend ?? '',
      final_advice: parsed.final_advice ?? '',
      advice_type: parsed.advice_type ?? 'observe',
      closing_words: parsed.closing_words ?? '',
      selected_question: mainQuestion,
      selected_question_answer: selectedQuestionAnswer,
      other_perspectives: otherPerspectives,
    },
  }
}

export async function POST(request: Request) {
  const { pain_points, custom_pain_point, story, main_question } = await request.json()

  if (!story?.trim() || !main_question) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  const userPrompt = buildUserPrompt(pain_points, custom_pain_point, story, main_question)

  // 用 streaming 保持连接活跃，避免 Netlify 超时
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      // 先发一个空格保持连接
      controller.enqueue(encoder.encode(' '))

      let parsed: Record<string, any> | null = null

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const stream = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 3000,
            stream: true,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
          })

          let accumulated = ''
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              accumulated += event.delta.text
              // 每收到一些内容就发个空格保持连接
              if (accumulated.length % 200 < 10) {
                controller.enqueue(encoder.encode(' '))
              }
            }
          }

          parsed = extractJson(accumulated)
          break
        } catch {
          if (attempt === 1) {
            parsed = makeFallback(main_question)
          }
        }
      }

      const result = buildResult(parsed!, main_question)
      // 发送最终 JSON，前面加换行分隔符让前端能识别
      controller.enqueue(encoder.encode('\n' + JSON.stringify(result)))
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  })
}
