// Task 15 follow-up: Email Center cleanup + fixture-address neutralization.
//
// Problem: (a) the Email Center showed historical rows for seed/E2E fixture
// recipients ("random college students") — all of which were rendered by the
// CONSOLE dev provider (printed to the server log, never actually emailed) —
// and (b) fixture users/applications carried externally-addressable emails
// (advisor@adypu.edu.in, member@gmail.com, *@student.adypu.edu.in) that would
// receive REAL mail via Resend the moment the outbox processes them.
//
// This script:
//   1. Moves fixture identities to safe addresses (club.adypu.edu.in demo
//      namespace for documented logins, RFC 2606 example.com for pure fixtures).
//   2. Deletes outbox history that never left the building (console provider)
//      plus the deliberate smoke-test rows, so the Email Center shows only truth.
//   3. Deletes the queued reviewer_notification jobs aimed at demo reviewers
//      (zero value, external-address risk). The real applicant's queued jobs
//      (receipt/decision/invite) are KEPT — they are flushed for real afterwards.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  // 1. Fixture identity email updates.
  const renames: Array<[string, string]> = [
    ['advisor@adypu.edu.in', 'advisor@club.adypu.edu.in'], // documented demo login
    ['member@gmail.com', 'member.demo@example.com'], // E2E artifact user
  ]
  for (const [from, to] of renames) {
    const u = await db.user.updateMany({ where: { email: from }, data: { email: to } })
    console.log(`user  ${from} -> ${to} (${u.count})`)
  }
  const appRenames: Array<[string, string]> = [
    ['neha.joshi@student.adypu.edu.in', 'neha.joshi@example.com'],
    ['arjun.mehta@student.adypu.edu.in', 'arjun.mehta@example.com'],
  ]
  for (const [from, to] of appRenames) {
    const a = await db.memberApplication.updateMany({ where: { email: from }, data: { email: to } })
    console.log(`application  ${from} -> ${to} (${a.count})`)
  }

  // 2. Outbox rows that were never really emailed (console dev provider) + smoke tests.
  const delConsole = await db.emailOutbox.deleteMany({ where: { providerMessageId: { startsWith: 'console-' } } })
  const delSmoke = await db.emailOutbox.deleteMany({ where: { category: 'welcome', status: 'sent' } })
  console.log(`deleted outbox rows: console-provider=${delConsole.count}, smoke-test=${delSmoke.count}`)

  // 3. Queued reviewer notifications aimed at demo reviewers.
  const delRev = await db.emailOutbox.deleteMany({ where: { status: 'queued', category: 'reviewer_notification' } })
  console.log(`deleted queued demo reviewer notifications: ${delRev.count}`)

  const remaining = await db.emailOutbox.findMany({
    select: { toEmail: true, subject: true, status: true, category: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`\nremaining outbox rows (${remaining.length}):`)
  for (const r of remaining) console.log(`  [${r.status}] ${r.category} -> ${r.toEmail} | ${r.subject.slice(0, 45)}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
