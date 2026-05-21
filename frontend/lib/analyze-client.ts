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

export async function callAnalyze(
  painPoints: string[],
  customPainPoint: string | null,
  story: string,
  mainQuestion: string,
): Promise<{ id: string; result: any }> {
  const userPrompt = buildUserPrompt(painPoints, customPainPoint, story, mainQuestion)

  const apiKey = process.env.NEXT_PUBLIC_CLAUDE_KEY ?? ''
  const baseUrl = process.env.NEXT_PUBLIC_CLAUDE_URL ?? 'https://api.with7.cn'

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
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })

      if (!apiRes.ok) throw new Error(`API ${apiRes.status}`)

      const data = await apiRes.json()
      const textBlock = data.content?.find((b: any) => b.type === 'text')
      const rawOutput = textBlock?.text ?? ''
      parsed = extractJson(rawOutput)
      break
    } catch {
      if (attempt === 1) {
        parsed = makeFallback(mainQuestion)
      }
    }
  }

  if (!parsed) parsed = makeFallback(mainQuestion)

  const labelToId: Record<string, string> = {}
  for (const [k, v] of Object.entries(QUESTION_LABELS)) {
    labelToId[v] = k
  }

  const sqaRaw = parsed.selected_question_answer ?? {}
  const otherRaw: any[] = parsed.other_perspectives ?? []

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
      selected_question_answer: {
        id: mainQuestion,
        title: sqaRaw.title ?? QUESTION_LABELS[mainQuestion] ?? '',
        hook: PERSPECTIVE_HOOKS[mainQuestion] ?? '',
        content: sqaRaw.content ?? '',
      },
      other_perspectives: otherRaw.map((p: any) => {
        const title = p.title ?? ''
        const qid = labelToId[title] ?? title
        return { id: qid, title, hook: PERSPECTIVE_HOOKS[qid] ?? title, content: p.content ?? '' }
      }),
    },
  }
}
