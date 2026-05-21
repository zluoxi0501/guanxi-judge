import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const webhookUrl = process.env.TRACKING_WEBHOOK_URL || ''
  if (!webhookUrl) {
    return NextResponse.json({ status: 'no_webhook' })
  }

  try {
    const body = await request.text()

    const res = await fetch(webhookUrl, {
      method: 'POST',
      body,
      redirect: 'follow',
    })

    const responseText = await res.text().catch(() => '')

    return NextResponse.json({
      status: res.ok ? 'ok' : 'upstream_error',
      upstream: res.status,
    })
  } catch (e) {
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
