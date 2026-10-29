// PRD §8 — /control/automations data: read-only run history + schedules + the four
// named jobs. Guard: automations.read.
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { JOB_NAMES, JOB_SCHEDULES } from '@/lib/automations'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.automationsRead))) {
      return fail(403, 'Not authorized to view automations.', 'forbidden')
    }
    const [runs, lastRuns] = await Promise.all([
      db.automationRun.findMany({ orderBy: { startedAt: 'desc' }, take: 100 }),
      db.automationRun.groupBy({
        by: ['jobName'],
        where: { status: { in: ['success', 'failed'] } },
        _max: { startedAt: true },
      }),
    ])
    const lastByJob = Object.fromEntries(
      lastRuns.map((r) => [r.jobName, { lastRunAt: r._max.startedAt }])
    )
    return ok({
      jobs: JOB_NAMES.map((name) => ({ name, schedule: JOB_SCHEDULES[name], ...lastByJob[name] })),
      runs,
    })
  } catch (err) {
    return handleError(err)
  }
}
