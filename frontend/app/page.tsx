'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { track } from '@/lib/tracking'

export default function Home() {
  useEffect(() => {
    track('page_view', { current_step: 'home' })
  }, [])

  return (
    <main className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-[28rem] space-y-12">

        <p className="text-text-muted text-micro tracking-[0.4em] uppercase opacity-0 animate-fade-in fill-both d-0">
          关系判断
        </p>

        <div className="space-y-7 opacity-0 animate-fade-up fill-both d-100">
          <h1
            className="font-serif font-normal tracking-tight"
            style={{ color: '#F2EEE8', fontSize: '1.75rem', lineHeight: 1.5 }}
          >
            帮助你重新整理<br />
            一段关系里的困惑。
          </h1>

          <div className="w-7 h-px bg-accent/40" />

          <div className="space-y-5">
            <p style={{ color: '#D8D2CB', fontSize: '1rem', lineHeight: 1.95, fontWeight: 350 }}>
              不是安慰，<br />
              也不是替你下结论。
            </p>
            <p style={{ color: '#D8D2CB', fontSize: '1rem', lineHeight: 1.95, fontWeight: 350 }}>
              只是把那些你一直说不清的难受，<br />
              一点点整理出来。
            </p>
          </div>
        </div>

        <div className="space-y-3 opacity-0 animate-fade-up fill-both d-300">
          <div className="flex gap-3">
            <span className="text-text-muted text-micro pt-[3px] w-4 shrink-0">01</span>
            <p style={{ color: '#D8D2CB', fontSize: '0.95rem', lineHeight: 1.85, fontWeight: 350 }}>
              先看见你为什么难受
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-text-muted text-micro pt-[3px] w-4 shrink-0">02</span>
            <p style={{ color: '#D8D2CB', fontSize: '0.95rem', lineHeight: 1.85, fontWeight: 350 }}>
              再看见你真正想要什么
            </p>
          </div>
          <div className="flex gap-3">
            <span className="text-text-muted text-micro pt-[3px] w-4 shrink-0">03</span>
            <p style={{ color: '#D8D2CB', fontSize: '0.95rem', lineHeight: 1.85, fontWeight: 350 }}>
              判断这段关系是否值得继续投入
            </p>
          </div>
        </div>

        <div className="space-y-3 opacity-0 animate-fade-up fill-both d-500">
          <Link
            href="/input"
            onClick={() => track('start_input', { current_step: 'home' })}
            className="block w-full py-[1.05rem] bg-text text-bg text-micro font-medium tracking-[0.3em] text-center transition-colors duration-300 hover:bg-accent"
          >
            开始整理这段关系
          </Link>
          <p className="text-text-muted text-micro leading-relaxed">
            你说的内容只用于分析，不会被展示给任何人。
          </p>
        </div>

      </div>
    </main>
  )
}
