// Club settings (§7): settings.manage required for writes.
import { db } from '@/lib/db'
import { ok, fail, handleError, auth } from '@/lib/api'
import { can, PERMISSIONS } from '@/lib/rbac/authorize'
import { writeAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await auth()
    const settings = await db.clubSetting.findMany({ orderBy: { key: 'asc' } })
    return ok({ settings: settings.map((s) => ({ ...s, value: safeParse(s.value) })) })
  } catch (err) {
    return handleError(err)
  }
}

export async function PATCH(req: Request) {
  try {
    const { userId } = await auth()
    if (!(await can(userId, PERMISSIONS.settingsManage))) return fail(403, 'Not authorized to change settings.', 'forbidden')
    const body = (await req.json().catch(() => ({}))) as { key?: string; value?: unknown }
    if (!body.key) return fail(422, 'key required', 'validation_error')
    await db.clubSetting.upsert({
      where: { key: body.key },
      update: { value: JSON.stringify(body.value ?? null), updatedBy: userId },
      create: { key: body.key, value: JSON.stringify(body.value ?? null), updatedBy: userId },
    })
    await writeAudit({ event: 'admin.settings_changed', actorId: userId, targetType: 'club_setting', targetId: body.key })
    return ok({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch {
    return json
  }
}
