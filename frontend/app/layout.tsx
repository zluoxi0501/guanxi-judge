import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '关系判断',
  description: '不是安慰，是有人认真帮你把问题看透。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-bg text-text font-sans min-h-screen">
        {children}
      </body>
    </html>
  )
}
