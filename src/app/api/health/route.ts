import { db } from '@/lib/db'
import { ok } from '@/lib/api'
import { isEmailConfigured, isDailyConfigured } from '@/lib/env'

export async function GET() {
  let database = 'ok'
  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    database = 'error'
  }
  return ok({
    status: database === 'ok' ? 'ok' : 'degraded',
    database,
    integrations: {
      email: isEmailConfigured() ? 'resend' : 'console-dev-mode',
      video: isDailyConfigured() ? 'daily' : 'jitsi-embed',
    },
    time: new Date().toISOString(),
  })
}
