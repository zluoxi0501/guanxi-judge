function getDeviceType(): string {
  if (typeof window === 'undefined') return 'unknown';
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

function getBasePayload() {
  if (typeof window === 'undefined') return {};
  return {
    timestamp: new Date().toISOString(),
    device_type: getDeviceType(),
    page_url: window.location.pathname,
    referrer: document.referrer || '',
  };
}

export function track(event: string, data: Record<string, string> = {}) {
  const payload = {
    ...getBasePayload(),
    event,
    ...data,
  };

  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // 静默失败
  }
}
