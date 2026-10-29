// PRD §9 — automation cron runner. Called by external cron with the x-cron-secret
// header (same contract as /api/cron/email-worker). Runs one named job or all four.
// Schedules (docs/AUTOMATIONS.md):
//   0 2 * * *      auto-archive-past-events
//   *\/15 * * * *  auto-expire-scoped-permissions
//   *\/5 * * * *   meeting-lifecycle-sweep
//   0 9 * * *      stale-application-digest
import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { runJob, JOB_NAMES, type JobName } from '@/lib/automations'

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== env.cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let requested: string | null = null
  try {
    const body = (await req.json()) as { job?: string }
    requested = body?.job ?? null
  } catch {
    requested = new URL(req.url).searchParams.get('job')
  }

  const jobs: JobName[] =
    !requested || requested === 'all'
      ? JOB_NAMES
      : (JOB_NAMES as string[]).includes(requested)
        ? [requested as JobName]
        : []

  if (jobs.length === 0) {
    return NextResponse.json({ error: 'Unknown job', jobs: [...JOB_NAMES, 'all'] }, { status: 422 })
  }

  const results = []
  for (const job of jobs) {
    results.push(await runJob(job))
  }
  return NextResponse.json({ ok: results.every((r) => r.status === 'success'), results, at: new Date().toISOString() })
}
