import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  // 反馈也通过 Google Sheet 追踪
  const webhookUrl = process.env.TRACKING_WEBHOOK_URL || ''
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: 'POST',
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        event: 'feedback',
        current_step: 'result',
        user_input: id,
        hit_score: body.feedback ?? '',
        device_type: '',
        page_url: '/result',
        referrer: '',
      }),
      redirect: 'follow',
    }).catch(() => {})
  }
  return NextResponse.json({ ok: true })
}
