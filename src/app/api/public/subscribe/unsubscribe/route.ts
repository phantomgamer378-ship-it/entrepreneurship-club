// Tokenized unsubscribe — one click, immediate effect, no login required.
// Returns a small standalone HTML page (works even without the SPA). Responses
// are deliberately generic: they never echo the email address or reveal whether
// a token is valid, unknown, or already used.
import { db } from '@/lib/db'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

function page(title: string, detail: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#111827}@media (prefers-color-scheme:dark){body{background:#0b0b0d;color:#f4f4f5}.card{border-color:#26262a !important}.muted{color:#9d9da3 !important}}.card{max-width:420px;margin:16px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:36px;text-align:center}.badge{width:52px;height:52px;border-radius:50%;background:#111827;color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 16px}.muted{color:#6b7280;font-size:14px;line-height:1.6}</style></head><body><div class="card"><div class="badge">✉</div><h1 style="font-size:20px;margin:0 0 10px;">${title}</h1><p class="muted">${detail}</p></div></body></html>`
}

async function handle(token: string): Promise<Response> {
  if (!token || token.length < 10 || token.length > 128 || !/^[a-f0-9]+$/i.test(token)) {
    return new Response(page('Link not valid', 'This unsubscribe link is invalid. If you keep receiving emails, contact the club and we will remove you manually.'), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  const subscriber = await db.newsletterSubscriber.findUnique({ where: { unsubscribeToken: token } })
  if (!subscriber) {
    return new Response(page('Link not valid', 'This unsubscribe link is invalid. If you keep receiving emails, contact the club and we will remove you manually.'), {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  if (subscriber.isActive) {
    await db.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: { isActive: false, unsubscribedAt: new Date() },
    })
    await writeAudit({
      event: 'newsletter.unsubscribed',
      actorEmail: subscriber.email,
      targetType: 'newsletter_subscriber',
      targetId: subscriber.id,
      metadata: { via: 'token_link' },
    })
  }
  return new Response(
    page('You are unsubscribed', 'You will no longer receive newsletter emails from the Entrepreneurship Club. You can re-subscribe any time from the club website footer.'),
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(req: Request) {
  try {
    return handle(new URL(req.url).searchParams.get('token') ?? '')
  } catch (err) {
    return handleErrorHtml(err)
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    return handle(String(body.token ?? ''))
  } catch (err) {
    return handleErrorHtml(err)
  }
}

function handleErrorHtml(err: unknown): Response {
  console.error('[newsletter] unsubscribe failed:', err)
  return new Response(page('Something went wrong', 'We could not process this request right now. Please try again in a moment.'), {
    status: 500,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
