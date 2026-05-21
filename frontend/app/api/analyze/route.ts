import { SYSTEM_PROMPT, QUESTION_LABELS, PERSPECTIVE_HOOKS, buildUserPrompt } from '@/lib/prompt'

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
    final_advice: '先停止主动填补空白，看他在你安静下来之后会不会主动出现。',
    advice_type: 'observe',
    closing_words: '你不是不知道关系有问题。\n\n你只是一直希望，这次会和以前不一样。',
    selected_question_answer: {
      title: QUESTION_LABELS[mainQuestion] ?? mainQuestion,
      content: '这个问题的答案，藏在他平时的行为里，不在他说的话里。',
    },
    other_perspectives: otherIds.map(k => ({
      title: QUESTION_LABELS[k],
      content: '基于这段关系的整体状态，这个问题需要时间来验证。',
    })),
  }
}

export const runtime = 'edge'

export async function POST(request: Request) {
  const { pain_points, custom_pain_point, story, main_question } = await request.json()

  if (!story?.trim() || !main_question) {
    return Response.json({ error: 'Missing fields' }, { status: 400 })
  }

  const userPrompt = buildUserPrompt(pain_points, custom_pain_point, story, main_question)

  const apiKey = process.env.ANTHROPIC_API_KEY ?? ''
  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'

  // 用原始 fetch + streaming 调中转站，保持连接活跃不超时
  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      let parsed: Record<string, any> | null = null

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const apiRes = await fetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-6',
              max_tokens: 3000,
              stream: true,
              system: SYSTEM_PROMPT,
              messages: [{ role: 'user', content: userPrompt }],
            }),
          })

          if (!apiRes.ok) {
            const errText = await apiRes.text()
            throw new Error(`API ${apiRes.status}: ${errText.slice(0, 200)}`)
          }

          const reader = apiRes.body!.getReader()
          const decoder = new TextDecoder()
          let accumulated = ''
          let buffer = ''

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              try {
                const event = JSON.parse(data)
                if (event.type === 'content_block_delta' && event.delta?.text) {
                  accumulated += event.delta.text
                }
              } catch {}
            }

            // 每次读到数据就发个空格 keepalive
            controller.enqueue(encoder.encode(' '))
          }

          parsed = extractJson(accumulated)
          break
        } catch (e) {
          if (attempt === 1) {
            parsed = makeFallback(main_question)
          }
        }
      }

      // 构建最终结果
      const labelToId: Record<string, string> = {}
      for (const [k, v] of Object.entries(QUESTION_LABELS)) {
        labelToId[v] = k
      }

      const sqaRaw = parsed!.selected_question_answer ?? {}
      const otherRaw: any[] = parsed!.other_perspectives ?? []

      const result = {
        id: crypto.randomUUID(),
        result: {
          core_judgment: parsed!.core_judgment ?? '',
          real_need: parsed!.real_need ?? '',
          relationship_structure: parsed!.relationship_structure ?? '',
          future_trend: parsed!.future_trend ?? '',
          final_advice: parsed!.final_advice ?? '',
          advice_type: parsed!.advice_type ?? 'observe',
          closing_words: parsed!.closing_words ?? '',
          selected_question: main_question,
          selected_question_answer: {
            id: main_question,
            title: sqaRaw.title ?? QUESTION_LABELS[main_question] ?? '',
            hook: PERSPECTIVE_HOOKS[main_question] ?? '',
            content: sqaRaw.content ?? '',
          },
          other_perspectives: otherRaw.map((p: any) => {
            const title = p.title ?? ''
            const qid = labelToId[title] ?? title
            return { id: qid, title, hook: PERSPECTIVE_HOOKS[qid] ?? title, content: p.content ?? '' }
          }),
        },
      }

      controller.enqueue(encoder.encode('\n' + JSON.stringify(result)))
      controller.close()
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
