// Guarded purge runner (Section 25.5). The only sanctioned way to execute
// scripts/purge-test-fixtures.sql and scripts/purge-seed-data.sql.
//
// Usage:
//   bun scripts/run-purge.ts fixtures   # purge test-fixture rows (incident class 1)
//   bun scripts/run-purge.ts seed       # purge seed/demo rows (incident class 2)
//   bun scripts/run-purge.ts dry        # report what WOULD be purged, delete nothing
//
// The assertTestDatabase() guard aborts before any write when the resolved
// DATABASE_URL is not a recognized local/test database.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { assertTestDatabase } from '../src/lib/test-guard'

const mode = process.argv[2] ?? 'dry'
assertTestDatabase(process.env.DATABASE_URL)

const db = new PrismaClient()
const FIXTURE_EMAIL_LIKE = [
  'job[_]persists[_]%',
  'founder[_]resend[_]outage[_]%',
  'outage[_]user[_]%',
  'test.user@%',
  'e2e-%@%',
  'smoke-%@%',
]

async function countFixtures(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const table of ['MemberApplication', 'ClubInvite']) {
    let total = 0
    for (const pattern of FIXTURE_EMAIL_LIKE) {
      const rows = await db.$queryRawUnsafe<{ c: number }[]>(
        `SELECT COUNT(*) c FROM "${table}" WHERE email LIKE ?`,
        pattern
      )
      total += Number(rows[0]?.c ?? 0)
    }
    counts[table] = total
  }
  return counts
}

async function main() {
  const target = mode
  console.log(`[purge] DATABASE_URL=${process.env.DATABASE_URL} (guard passed)`)
  if (target === 'dry') {
    console.log('[purge] dry run — fixtures currently matching:', await countFixtures())
    const seed = {
      profiles: await db.profile.count({ where: { isSeedData: true } }),
      events: await db.clubEvent.count({ where: { isSeedData: true } }),
      announcements: await db.announcement.count({ where: { isSeedData: true } }),
    }
    console.log('[purge] dry run — seed-tagged rows:', seed)
    return
  }

  const file = target === 'fixtures' ? 'purge-test-fixtures.sql' : target === 'seed' ? 'purge-seed-data.sql' : null
  if (!file) {
    console.error('Usage: bun scripts/run-purge.ts <fixtures|seed|dry>')
    process.exit(2)
  }
  const sql = readFileSync(join(import.meta.dir, file), 'utf8')
  const statements = sql
    .split(';')
    .map((chunk) =>
      chunk
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim()
    )
    .filter((s) => s.length > 0)
  for (const stmt of statements) {
    await db.$executeRawUnsafe(stmt)
  }
  console.log(`[purge] executed ${file}: ${statements.length} statements. Done.`)
}

main()
  .catch((err) => {
    console.error('[purge] FAILED:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
