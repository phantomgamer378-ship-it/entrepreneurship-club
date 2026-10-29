// Quick tokenized-unsubscribe check: fetch the test subscriber's token, hit the
// public unsubscribe endpoint, verify the HTML page + isActive flips to false.
import { db } from '../src/lib/db'

async function main() {
  const sub = await db.newsletterSubscriber.findUnique({ where: { email: 'delivered@resend.dev' } })
  if (!sub) { console.log('subscriber row not found (already cleaned) — skip'); return }
  const res = await fetch(`http://localhost:3000/api/public/subscribe/unsubscribe?token=${sub.unsubscribeToken}`)
  const html = await res.text()
  console.log('status:', res.status)
  console.log('page ok:', html.includes('You are unsubscribed'))
  const after = await db.newsletterSubscriber.findUnique({ where: { email: 'delivered@resend.dev' } })
  console.log('isActive now:', after?.isActive)
  // leave the test subscriber inactive — it is a fake address
}
main().catch((e) => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
