'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { track } from '@/lib/tracking'
import { callAnalyze, AnalyzeTimeoutError } from '@/lib/analyze-client'

const PAIN_POINTS = [
  '他突然冷淡',
  '他总让我猜',
  '不愿沟通',
  '情绪反复',
  '对我很好但不稳定',
  '经常失联',
  '不愿确定关系',
  '我总在等他',
  '我越来越没有安全感',
  '我开始怀疑是不是自己有问题',
]

const QUESTIONS = [
  { id: 'what_he_thinks', label: '他到底怎么想' },
  { id: 'continue_or_not', label: '要不要继续' },
  { id: 'will_he_change',  label: '他会不会改变' },
  { id: 'am_i_sensitive',  label: '是我太敏感吗' },
  { id: 'any_future',      label: '这段关系还有结果吗' },
]

const LOADING_LINES = [
  '有些问题，\n其实你已经想了很久。',
  '你不是突然开始难过的。',
  '有些关系，\n不是突然变坏的。',
  '你一直在等一个\n"这次会不一样"的可能。',
  '正在重新整理这段关系。',
]

function LoadingOverlay() {
  const [idx, setIdx]         = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIdx(i => (i + 1) % LOADING_LINES.length)
        setVisible(true)
      }, 450)
    }, 2200)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(10,10,10,0.95)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div className="text-center space-y-10 max-w-xs px-6">
        <div className="flex gap-1.5 justify-center">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-1 h-1 rounded-full bg-accent/50 animate-blink fill-both"
              style={{ animationDelay: `${i * 300}ms` }} />
          ))}
        </div>
        <p
          className="font-serif font-light text-text-secondary text-[1.05rem] leading-[2.1] tracking-wide whitespace-pre-line"
          style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.45s ease' }}
        >
          {LOADING_LINES[idx]}
        </p>
      </div>
    </div>
  )
}

export default function InputPage() {
  const router = useRouter()
  const [selectedPoints, setSelectedPoints] = useState<string[]>([])
  const [customPoint, setCustomPoint]       = useState('')
  const [showCustom, setShowCustom]         = useState(false)
  const [story, setStory]                   = useState('')
  const [question, setQuestion]             = useState('')
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState('')

  const togglePoint = (p: string) =>
    setSelectedPoints(prev =>
      prev.includes(p) ? prev.filter(x => x !== p)
        : prev.length < 3 ? [...prev, p] : prev
    )

  const storyLen  = story.trim().length
  const canSubmit = storyLen >= 10 && question.length > 0 && !loading

  const handleSubmit = async () => {
    if (!canSubmit) return

    setLoading(true)
    setError('')

    const payload = {
      pain_points:       selectedPoints,
      custom_pain_point: customPoint || null,
      story:             story.trim(),
      main_question:     question,
    }

    // 验收日志
    console.log('[submit] 开始', {
      storyLen: payload.story.length,
      painPoints: payload.pain_points,
      question: payload.main_question,
      apiUrl: (process.env.NEXT_PUBLIC_CLAUDE_URL || 'https://api.with7.cn') + '/v1/messages',
      startTime: new Date().toISOString(),
    })

    track('submit_analysis', {
      current_step: 'input',
      user_input: story.trim().slice(0, 200),
      selected_feeling: selectedPoints.join(', '),
      hit_score: question,
    })

    try {
      const data = await callAnalyze(
        payload.pain_points,
        payload.custom_pain_point,
        payload.story,
        payload.main_question,
      )
      console.log('[submit] 成功', { endTime: new Date().toISOString() })
      sessionStorage.setItem('analysis_result', JSON.stringify(data))
      router.push('/result')
    } catch (e) {
      const msg = e instanceof AnalyzeTimeoutError
        ? '分析超时，请重试'
        : '分析失败，请重试'
      console.error('[submit] 失败', { error: String(e), endTime: new Date().toISOString() })
      setError(msg)
      setLoading(false)
      return
    }
  }

  useEffect(() => {
    track('page_view', { current_step: 'input' })
  }, [])

  return (
    <main className="min-h-screen bg-bg py-16 px-6" style={{ position: 'relative' }}>
      {/* loading 覆盖层 — 不卸载页面，状态保留 */}
      {loading && <LoadingOverlay />}

      <div className="max-w-[28rem] mx-auto space-y-14">

        {/* header */}
        <div className="space-y-3">
          <p className="text-text-muted text-micro tracking-[0.4em] uppercase">关系判断</p>
          <h2
            className="font-serif font-normal"
            style={{ color: '#F2EEE8', fontSize: '1.5rem', lineHeight: 1.5 }}
          >
            告诉我发生了什么
          </h2>
        </div>

        {/* ── 模块 1 ── */}
        <section className="space-y-5">
          <div className="space-y-1">
            <h3 style={{ color: '#F2EEE8', fontSize: '0.95rem', fontWeight: 500 }}>
              哪些地方最让你难受？</h3>
            <p style={{ color: '#8F8880', fontSize: '0.75rem' }}>可选，最多 3 项</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {PAIN_POINTS.map(p => {
              const sel = selectedPoints.includes(p)
              const dis = !sel && selectedPoints.length >= 3
              return (
                <button key={p} onClick={() => togglePoint(p)} disabled={dis}
                  className={`px-3.5 py-2 text-[0.8125rem] rounded-full border transition-all duration-200 ${
                    sel ? 'border-accent/50 text-accent bg-accent-soft'
                    : dis ? 'border-border-subtle text-text-muted opacity-30 cursor-not-allowed'
                    : 'border-border text-text-dim hover:border-text-secondary'
                  }`}>
                  {p}
                </button>
              )
            })}
            <button onClick={() => setShowCustom(!showCustom)}
              className={`px-3.5 py-2 text-[0.8125rem] rounded-full border transition-all duration-200 ${
                showCustom ? 'border-accent/50 text-accent bg-accent-soft'
                : 'border-border text-text-dim hover:border-text-secondary'
              }`}>
              其他
            </button>
          </div>
          {showCustom && (
            <input type="text" value={customPoint} onChange={e => setCustomPoint(e.target.value)}
              placeholder="说说是什么…" maxLength={30}
              className="w-full bg-surface border border-border rounded-md text-text text-[0.9375rem] px-4 py-3 placeholder:text-text-muted focus:outline-none focus:border-text-secondary transition-colors" />
          )}
        </section>

        {/* ── 模块 2 ── */}
        <section className="space-y-4">
          <div className="space-y-1.5">
            <h3 style={{ color: '#F2EEE8', fontSize: '0.95rem', fontWeight: 500 }}>
              最近一次最让你难受的事情
            </h3>
            <p style={{ color: '#8F8880', fontSize: '0.8125rem', lineHeight: 1.85, fontWeight: 350 }}>
              慢慢说，不用急。
              <br />
              你可以从「那天发生了什么」开始。
            </p>
          </div>
          <div className="relative">
            <textarea value={story} onChange={e => setStory(e.target.value)} rows={7} maxLength={500}
              placeholder="那天发生了什么…"
              style={{ background: '#1f1d1b', borderRadius: '6px' }}
              className="w-full border border-border-subtle text-text px-5 py-5 text-[0.9375rem] placeholder:text-text-muted focus:outline-none focus:border-text-muted transition-colors leading-[1.95] font-light" />
            <span className={`absolute bottom-3 right-4 text-micro ${storyLen < 10 ? 'text-text-muted' : 'text-text-secondary'}`}>
              {storyLen}
            </span>
          </div>
          {storyLen > 0 && storyLen < 10 && (
            <p style={{ color: '#8F8880', fontSize: '0.75rem' }}>再多说一点，分析会更准确</p>
          )}
        </section>

        {/* ── 模块 3 ── */}
        <section className="space-y-4">
          <h3 style={{ color: '#F2EEE8', fontSize: '0.95rem', fontWeight: 500 }}>
            你现在最想知道什么？
          </h3>
          <div className="space-y-2">
            {QUESTIONS.map(q => (
              <button key={q.id} onClick={() => setQuestion(q.id)}
                className={`w-full text-left px-4 py-3.5 text-[0.9375rem] border rounded-md transition-all duration-200 ${
                  question === q.id
                    ? 'border-accent/50 text-accent bg-accent-soft'
                    : 'border-border text-text-dim hover:border-text-secondary'
                }`}>
                {q.label}
              </button>
            ))}
          </div>
        </section>

        {/* ── 提交 ── */}
        <div className="space-y-3 pb-20">
          {error && (
            <p style={{ color: '#f87171', fontSize: '0.8125rem', textAlign: 'center' }}>{error}</p>
          )}
          <button
            onClick={handleSubmit}
            style={{
              width: '100%',
              minHeight: '52px',
              padding: '0.9rem 0',
              fontSize: '0.6875rem',
              fontWeight: 500,
              letterSpacing: '0.3em',
              fontFamily: 'inherit',
              border: 'none',
              borderRadius: 0,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              pointerEvents: canSubmit ? 'auto' : 'none',
              userSelect: 'none',
              WebkitTapHighlightColor: 'transparent',
              transition: 'background-color 0.3s, color 0.3s, opacity 0.3s',
              // 明显的 enabled 颜色，避免误判为禁用
              backgroundColor: canSubmit ? '#F2EEE8' : '#2a2826',
              color: canSubmit ? '#1a1816' : '#5a5754',
              zIndex: 10,
              position: 'relative',
            }}
          >
            开始整理
          </button>
          {!canSubmit && (
            <p style={{ color: '#5a5754', fontSize: '0.6875rem', textAlign: 'center' }}>
              {storyLen < 10 ? '请先描述发生了什么' : '请选择你最想知道什么'}
            </p>
          )}
        </div>

      </div>
    </main>
  )
}
