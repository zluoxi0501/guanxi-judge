'use client'

import { useEffect, useState } from 'react'

const QUESTION_LABELS: Record<string, string> = {
  what_he_thinks:  '他到底怎么想',
  continue_or_not: '要不要继续',
  will_he_change:  '他会不会改变',
  am_i_sensitive:  '是我太敏感吗',
  any_future:      '这段关系还有结果吗',
}

interface Counts {
  payment_modal_open: number
  payment_qrcode_viewed: number
  continue_after_qrcode_clicked: number
  paid_content_unlocked: number
}

interface SessionEvent {
  event: string
  time: string
}

interface Session {
  id: string
  created_at: string
  selected_question: string
  advice_type: string
  events: SessionEvent[]
}

interface AnalyticsData {
  counts: Counts
  sessions: Session[]
}

function pct(num: number, den: number) {
  if (!den) return '—'
  return (num / den * 100).toFixed(1) + '%'
}

function fmt(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AnalyticsPage() {
  const [data, setData]           = useState<AnalyticsData | null>(null)
  const [manualPaid, setManualPaid] = useState(0)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002'
    fetch(`${apiBase}/api/analytics`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setError('无法加载数据'); setLoading(false) })
  }, [])

  if (loading) return (
    <main className="min-h-screen bg-bg flex items-center justify-center">
      <p className="text-text-muted text-micro">加载中…</p>
    </main>
  )

  if (error || !data) return (
    <main className="min-h-screen bg-bg flex items-center justify-center">
      <p className="text-text-muted text-micro">{error || '无数据'}</p>
    </main>
  )

  const { counts, sessions } = data
  const qrViewed = counts.payment_qrcode_viewed

  return (
    <main className="min-h-screen bg-bg px-6 py-12">
      <div className="max-w-3xl mx-auto space-y-12">

        {/* header */}
        <div className="space-y-1">
          <p className="text-text-muted text-micro tracking-[0.4em] uppercase">关系判断</p>
          <h1 style={{ color: '#F2EEE8', fontSize: '1.25rem', fontWeight: 500 }}>数据概览</h1>
        </div>

        {/* counts */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: '弹层展示', value: counts.payment_modal_open },
            { label: '二维码展示', value: qrViewed },
            { label: '点击继续', value: counts.continue_after_qrcode_clicked },
            { label: '内容解锁', value: counts.paid_content_unlocked },
          ].map(item => (
            <div key={item.label}
              className="px-4 py-5 space-y-2"
              style={{ background: '#1f1f1f', border: '1px solid #2c2c2c' }}
            >
              <p style={{ color: '#8F8880', fontSize: '0.75rem' }}>{item.label}</p>
              <p style={{ color: '#F2EEE8', fontSize: '1.75rem', fontWeight: 300, lineHeight: 1 }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {/* manual paid + rates */}
        <div className="space-y-5" style={{ borderTop: '1px solid #2c2c2c', paddingTop: '1.5rem' }}>
          <div className="flex items-center gap-4">
            <label style={{ color: '#D8D2CB', fontSize: '0.9rem' }}>
              实际微信付款人数
            </label>
            <input
              type="number"
              min={0}
              value={manualPaid}
              onChange={e => setManualPaid(Number(e.target.value))}
              className="w-20 text-center focus:outline-none"
              style={{
                background: '#1f1f1f',
                border: '1px solid #2c2c2c',
                color: '#F2EEE8',
                fontSize: '1rem',
                padding: '0.4rem 0.5rem',
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: '真实付款率', value: pct(manualPaid, qrViewed), note: 'manual_paid / qrcode_viewed' },
              { label: '继续阅读率', value: pct(counts.continue_after_qrcode_clicked, qrViewed), note: 'continue_clicked / qrcode_viewed' },
              { label: '解锁率', value: pct(counts.paid_content_unlocked, qrViewed), note: 'unlocked / qrcode_viewed' },
            ].map(item => (
              <div key={item.label}
                className="px-4 py-4 space-y-1"
                style={{ background: '#1f1f1f', border: '1px solid #2c2c2c' }}
              >
                <p style={{ color: '#8F8880', fontSize: '0.75rem' }}>{item.label}</p>
                <p style={{ color: '#F2EEE8', fontSize: '1.5rem', fontWeight: 300, lineHeight: 1 }}>
                  {item.value}
                </p>
                <p style={{ color: '#555', fontSize: '0.65rem' }}>{item.note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* session log */}
        <div className="space-y-4" style={{ borderTop: '1px solid #2c2c2c', paddingTop: '1.5rem' }}>
          <h2 style={{ color: '#D8D2CB', fontSize: '0.95rem', fontWeight: 500 }}>
            用户行为流水（最近 100 条）
          </h2>

          {sessions.length === 0 ? (
            <p style={{ color: '#555', fontSize: '0.8rem' }}>暂无数据</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left" style={{ borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2c2c2c' }}>
                    {['时间', '首选问题', '建议', '行为事件'].map(h => (
                      <th key={h} className="pb-2 pr-6" style={{ color: '#8F8880', fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #1e1e1e' }}>
                      <td className="py-3 pr-6" style={{ color: '#8F8880', whiteSpace: 'nowrap' }}>
                        {fmt(s.created_at)}
                      </td>
                      <td className="py-3 pr-6" style={{ color: '#D8D2CB' }}>
                        {QUESTION_LABELS[s.selected_question] || s.selected_question || '—'}
                      </td>
                      <td className="py-3 pr-6" style={{ color: '#D8D2CB' }}>
                        {s.advice_type || '—'}
                      </td>
                      <td className="py-3" style={{ color: '#8F8880' }}>
                        {s.events.length === 0
                          ? '—'
                          : s.events.map(e => e.event.replace(/_/g, ' ')).join(' → ')
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </main>
  )
}
