'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { track as gtrack } from '@/lib/tracking'

interface PerspectiveAnswer {
  id: string
  title: string
  hook: string
  content: string
}

interface AnalysisResult {
  core_judgment: string
  real_need: string
  relationship_structure: string
  future_trend: string
  final_advice: string
  advice_type: 'continue' | 'observe' | 'stop'
  closing_words: string
  selected_question: string
  selected_question_answer: PerspectiveAnswer
  other_perspectives: PerspectiveAnswer[]
}

interface StoredData {
  id: string
  result: AnalysisResult
}

const ADVICE_CONFIG = {
  continue: { text: '建议继续',    cls: 'text-emerald-400/60 border-emerald-400/20' },
  observe:  { text: '建议观察',    cls: 'text-amber-400/60  border-amber-400/20'  },
  stop:     { text: '建议停止投入', cls: 'text-red-400/60    border-red-400/20'    },
}

/* ── Primitives ── */

function Reveal({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string
}) {
  return (
    <div className={`opacity-0 animate-fade-up fill-both ${className}`}
      style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}

function Body({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`space-y-5 ${className}`}>
      {text.split('\n\n').map((para, i) => (
        <p
          key={i}
          style={{
            color: '#D8D2CB',
            fontSize: '1rem',
            lineHeight: 2.05,
            fontWeight: 380,
            letterSpacing: '0.005em',
          }}
        >
          {para}
        </p>
      ))}
    </div>
  )
}

function Divider() {
  return <div className="w-full h-px bg-border-subtle" />
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        color: '#F2EEE8',
        fontSize: '1.05rem',
        fontWeight: 500,
        letterSpacing: '0.01em',
        lineHeight: 1.5,
      }}
    >
      {children}
    </h2>
  )
}

/* ── Result Page ── */

/* ── Payment Modal ── */

function PaymentModal({
  onConfirm,
  onClose,
}: {
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(10,10,10,0.88)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[20rem] space-y-7 px-7 py-9"
        style={{ background: '#222220', border: '1px solid #2e2e2e' }}
        onClick={e => e.stopPropagation()}
      >
        {/* title */}
        <div className="space-y-3">
          <p className="text-micro tracking-[0.3em]" style={{ color: '#8F8880' }}>
            继续完整关系阅读
          </p>
          <p
            className="font-serif font-light leading-[1.95] tracking-wide"
            style={{ color: '#F2EEE8', fontSize: '1rem' }}
          >
            如果这些内容刚好说中了你，<br />
            可以扫码继续支持它。
          </p>
        </div>

        {/* qrcode */}
        <div className="flex justify-center">
          <div style={{ padding: '0.75rem', background: '#fff', borderRadius: '4px' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/payment-qrcode.png"
              alt="收款二维码"
              width={132}
              height={132}
              style={{ display: 'block' }}
              onError={e => {
                const t = e.currentTarget
                t.style.display = 'none'
                const placeholder = t.nextElementSibling as HTMLElement
                if (placeholder) placeholder.style.display = 'flex'
              }}
            />
            <div
              className="flex items-center justify-center"
              style={{ display: 'none', width: 132, height: 132, color: '#aaa', fontSize: '0.7rem', background: '#f5f5f5' }}
            >
              二维码位置
            </div>
          </div>
        </div>

        {/* price — quiet */}
        <p className="text-center text-micro" style={{ color: '#8F8880' }}>
          ¥9.9
        </p>

        {/* confirm — "继续往下看", no payment language */}
        <button
          onClick={onConfirm}
          className="w-full py-[0.9rem] text-micro font-medium tracking-[0.3em] transition-colors duration-300"
          style={{ border: '1px solid #444', color: '#D8D2CB', background: 'transparent' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#D8D2CB' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#444' }}
        >
          继续往下看
        </button>

        <button
          onClick={onClose}
          className="block w-full text-center text-micro transition-colors"
          style={{ color: '#555' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#8F8880' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#555' }}
        >
          稍后再说
        </button>
      </div>
    </div>
  )
}

/* ── Paywall Section ── */

function PaywallSection({
  perspectives,
  analysisId,
  unlocked,
  showModal,
  onView,
  onContinueClick,
  onConfirmPay,
  onCloseModal,
}: {
  perspectives: PerspectiveAnswer[]
  analysisId: string
  unlocked: boolean
  showModal: boolean
  onView: () => void
  onContinueClick: () => void
  onConfirmPay: () => void
  onCloseModal: () => void
}) {
  const viewFired = useRef(false)

  useEffect(() => {
    if (!viewFired.current) { viewFired.current = true; onView() }
  }, [onView])

  if (unlocked) {
    return (
      <div className="mt-20">
        <Divider />
        <div className="mt-10 mb-6">
          <p className="text-text-muted text-micro tracking-[0.3em]">完整解读已解锁</p>
        </div>
        <div className="space-y-0">
          {perspectives.map((p, i) => {
            const isEmpty = !p.content?.trim()
            return (
              <div key={p.id} className="space-y-7 mb-16">
                <div className="space-y-1.5">
                  <SectionLabel>{p.title}</SectionLabel>
                  {p.hook && <p className="text-text-muted text-micro">{p.hook}</p>}
                </div>
                {isEmpty ? (
                  <p style={{ color: '#6b6560', fontSize: '0.875rem', lineHeight: 1.8 }}>
                    该部分生成失败，请重新分析。
                  </p>
                ) : (
                  <Body text={p.content} />
                )}
                {i < perspectives.length - 1 && <div className="pt-2"><Divider /></div>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      {showModal && (
        <PaymentModal onConfirm={onConfirmPay} onClose={onCloseModal} />
      )}

      <Reveal delay={900}>
        <Divider />

        {/* quiet pause */}
        <div className="mt-16 mb-14">
          <p
            className="font-serif font-light leading-[2.1] tracking-wide"
            style={{ color: '#D8D2CB', fontSize: '0.95rem' }}
          >
            继续完整关系阅读
          </p>
        </div>

        <Divider />

        <div className="mt-14 space-y-10">

          {/* intro — calmer, more mature */}
          <div className="space-y-5">
            <p style={{ color: '#D8D2CB', fontSize: '0.9375rem', lineHeight: 2, fontWeight: 300 }}>
              你已经看到了这段关系里的一个角度。
            </p>
            <p style={{ color: '#D8D2CB', fontSize: '0.9375rem', lineHeight: 2, fontWeight: 300 }}>
              有些问题，<br />
              不是看见一次就能放下。
            </p>
            <p style={{ color: '#D8D2CB', fontSize: '0.9375rem', lineHeight: 2, fontWeight: 300 }}>
              如果你愿意，<br />
              可以继续把剩下的部分看完。
            </p>
          </div>

          {/* perspective list */}
          <div>
            {perspectives.map((p, i) => (
              <div
                key={i}
                className="py-5 space-y-1"
                style={{ borderBottom: i < perspectives.length - 1 ? '1px solid #242424' : 'none' }}
              >
                <p style={{ color: '#D8D2CB', fontSize: '0.9375rem', lineHeight: 1.8, fontWeight: 300 }}>
                  {p.hook}
                </p>
                <p style={{ color: '#8F8880', fontSize: '0.6875rem' }}>{p.title}</p>
              </div>
            ))}
          </div>

          {/* cta — reading is the hero, price is incidental */}
          <div className="space-y-3">
            <button
              onClick={onContinueClick}
              className="group flex items-center gap-2 transition-all duration-200"
              style={{ color: '#F2EEE8', fontSize: '1rem', fontWeight: 400, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <span>继续往下看</span>
              <span style={{ transition: 'transform 0.2s' }} className="group-hover:translate-x-1">→</span>
            </button>

            <div className="flex items-center gap-2">
              <span style={{ color: '#8F8880', fontSize: '0.75rem', opacity: 0.7 }}>¥9.9</span>
              <span style={{ color: '#555', fontSize: '0.6875rem' }}>·</span>
              <span style={{ color: '#8F8880', fontSize: '0.6875rem' }}>无需重新输入</span>
            </div>
          </div>

        </div>
      </Reveal>
    </>
  )
}

export default function ResultPage() {
  const router = useRouter()
  const [data, setData]           = useState<StoredData | null>(null)
  const [unlocked, setUnlocked]   = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [feedback, setFeedback]   = useState<string | null>(null)

  useEffect(() => {
    const raw = sessionStorage.getItem('analysis_result')
    if (!raw) { router.replace('/input'); return }
    try {
      const parsed = JSON.parse(raw)
      setData(parsed)
      // 恢复支付状态
      const paidKey = `paid_${parsed.id}`
      if (sessionStorage.getItem(paidKey) === '1') {
        setUnlocked(true)
      }
      gtrack('page_view', { current_step: 'result', user_input: parsed?.result?.advice_type ?? '' })
    } catch { router.replace('/input') }
  }, [router])

  const track = (event: string, id: string) => {
    fetch(`/api/event/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    }).catch(() => {})
  }

  const handlePaywallView    = (id: string) => { track('paywall_view', id); gtrack('paywall_view', { current_step: 'result' }) }
  const handleContinueClick  = (id: string) => {
    track('payment_modal_open', id)
    track('payment_qrcode_viewed', id)
    gtrack('payment_modal_open', { current_step: 'result' })
    setShowModal(true)
  }
  const handleCloseModal     = ()            => setShowModal(false)
  const handleConfirmPay     = (id: string) => {
    track('continue_after_qrcode_clicked', id)
    setShowModal(false)
    setUnlocked(true)
    sessionStorage.setItem(`paid_${id}`, '1')
    track('paid_content_unlocked', id)
    gtrack('paid_content_unlocked', { current_step: 'result' })
  }

  const sendFeedback = async (type: string) => {
    if (!data || feedback) return
    setFeedback(type)
    gtrack('feedback', { current_step: 'result', hit_score: type })
    fetch(`/api/feedback/${data.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: type }),
    }).catch(() => {})
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <span key={i} className="w-1 h-1 rounded-full bg-accent/40 animate-blink fill-both"
              style={{ animationDelay: `${i * 300}ms` }} />
          ))}
        </div>
      </main>
    )
  }

  const { result } = data
  const advice = ADVICE_CONFIG[result.advice_type] ?? ADVICE_CONFIG.observe

  return (
    <main className="min-h-screen bg-bg">
      <div className="max-w-[30rem] mx-auto px-6 pt-14 pb-24">

        {/* eyebrow */}
        <Reveal delay={0}>
          <p className="text-text-muted text-micro tracking-[0.4em] uppercase mb-12">关系判断</p>
        </Reveal>

        {/* ══ 核心判断 ══ */}
        <Reveal delay={100} className="mb-14">
          <div className="space-y-7">
            <div className="w-6 h-px bg-accent/40" />
            <h1
              className="font-serif font-normal tracking-tight"
              style={{ color: '#F2EEE8', fontSize: '1.65rem', lineHeight: 1.6 }}
            >
              {result.core_judgment.split('\n\n').map((line, i, arr) => (
                <span key={i}>
                  {line}
                  {i < arr.length - 1 && <><br /><br /></>}
                </span>
              ))}
            </h1>
            <div className="w-6 h-px bg-accent/40" />
          </div>
        </Reveal>

        {/* ══ 你真正想要的 ══ */}
        <Reveal delay={220} className="mb-12">
          <div className="space-y-6">
            <SectionLabel>你真正想要的是什么</SectionLabel>
            <Body text={result.real_need} />
          </div>
        </Reveal>

        <Reveal delay={300}><Divider /></Reveal>

        {/* ══ 关系结构 ══ */}
        <Reveal delay={360} className="mt-12 mb-12">
          <div className="space-y-6">
            <SectionLabel>为什么这段关系会持续消耗你</SectionLabel>
            <Body text={result.relationship_structure} />
          </div>
        </Reveal>

        <Reveal delay={420}><Divider /></Reveal>

        {/* ══ 用户选择的问题 ══ */}
        <Reveal delay={480} className="mt-12 mb-12">
          <div className="space-y-6">
            <SectionLabel>{result.selected_question_answer.title}</SectionLabel>
            <Body text={result.selected_question_answer.content} />
          </div>
        </Reveal>

        <Reveal delay={540}><Divider /></Reveal>

        {/* ══ 未来走势 ══ */}
        <Reveal delay={600} className="mt-12 mb-12">
          <div className="space-y-6">
            <SectionLabel>未来走势</SectionLabel>
            <Body text={result.future_trend} />
          </div>
        </Reveal>

        <Reveal delay={660}><Divider /></Reveal>

        {/* ══ 最后建议 ══ */}
        <Reveal delay={720} className="mt-12 mb-12">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <SectionLabel>最后的建议</SectionLabel>
              <span className={`text-micro border px-2.5 py-0.5 ${advice.cls}`}>
                {advice.text}
              </span>
            </div>
            <Body text={result.final_advice} />
          </div>
        </Reveal>

        {/* ══ 她真正想对你说的话 ══ */}
        <Reveal delay={820} className="mt-20 mb-24">
          <div
            className="px-7 py-9 space-y-6"
            style={{ background: '#2A2825' }}
          >
            <p className="text-[#7a7570] text-micro tracking-[0.3em]">
              最后想告诉你的
            </p>
            <div className="max-w-[22rem] space-y-5">
              {result.closing_words.split('\n\n').map((line, i) => (
                <p
                  key={i}
                  className="font-serif font-light text-[1.05rem] leading-[2.05] tracking-wide"
                  style={{ color: '#F2EEE8' }}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>
        </Reveal>

        {/* ══ 付费墙 ══ */}
        {result.other_perspectives?.length > 0 && (
          <PaywallSection
            perspectives={result.other_perspectives}
            analysisId={data.id}
            unlocked={unlocked}
            showModal={showModal}
            onView={() => handlePaywallView(data.id)}
            onContinueClick={() => handleContinueClick(data.id)}
            onConfirmPay={() => handleConfirmPay(data.id)}
            onCloseModal={handleCloseModal}
          />
        )}

        {/* ══ 反馈 + 重新开始 ══ */}
        <Reveal delay={1000} className="mt-20 pt-10 border-t border-border-subtle space-y-8">
          {!feedback ? (
            <div className="space-y-4">
              <p className="text-text-muted text-micro">这个分析说中你了吗？</p>
              <div className="flex gap-3">
                <button onClick={() => sendFeedback('helpful')}
                  className="px-4 py-2 text-micro border border-border text-text-secondary hover:border-text-secondary transition-colors">
                  说中了
                </button>
                <button onClick={() => sendFeedback('not_helpful')}
                  className="px-4 py-2 text-micro border border-border text-text-secondary hover:border-text-secondary transition-colors">
                  没说中
                </button>
              </div>
            </div>
          ) : (
            <p className="text-text-muted text-micro">谢谢你的反馈。</p>
          )}
          <Link href="/input" onClick={() => sessionStorage.removeItem('analysis_result')}
            className="block text-text-muted text-micro hover:text-text-secondary transition-colors">
            分析另一段关系 →
          </Link>
        </Reveal>

      </div>
    </main>
  )
}
