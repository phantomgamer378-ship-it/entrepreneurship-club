// Resend recipient-restriction probe (Task 13 "try").
// With the unverified test sender (onboarding@resend.dev), Resend rejects recipients
// that are not the account owner's own email. The rejection message itself discloses
// the owner's email — we extract it here so a real delivery can follow.
// Run: bun scripts/resend-probe.ts
const KEY = process.env.RESEND_API_KEY!
const FROM = process.env.EMAIL_FROM_ADDRESS ?? 'Entrepreneurship Club <onboarding@resend.dev>'
// Deliberately pick an address that is almost certainly NOT the Resend account owner:
const PROBE_TO = process.env.PROBE_TO ?? 'probe@club.adypu.edu.in'

async function main() {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `resend-probe-${Date.now()}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: [PROBE_TO],
      subject: 'Resend restriction probe',
      html: '<p>probe</p>',
      text: 'probe',
    }),
  })
  const body = await res.text()
  console.log('HTTP', res.status)
  console.log('BODY:', body)

  // Extract the account owner's email if the restriction message contains one.
  const match = body.match(/[\w.+-]+@[\w-]+\.[\w.]+/g)
  if (res.status === 403 && match) {
    const candidates = [...new Set(match)].filter((m) => !m.includes('resend.dev') && !m.includes('resend.com'))
    if (candidates.length) console.log('ACCOUNT_OWNER_EMAIL_CANDIDATES:', JSON.stringify(candidates))
  }
}
main()
