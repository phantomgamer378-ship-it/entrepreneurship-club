/**
 * E2E test: newsletter subscribe → broadcast (announcement public/members gate)
 * → unsubscribe → admin subscribers API. Uses delivered@resend.dev (Resend's
 * test inbox that accepts) so no bounces pollute provider stats.
 */
const BASE = 'http://localhost:3000'
const TEST_EMAIL = 'delivered@resend.dev'
let cookie = ''
let failures = 0

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.log(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : '')
  }
}

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const setCookie = res.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* html */ }
  return { status: res.status, json, text }
}

async function main() {
  console.log('— 1. subscribe (public, no auth)')
  const sub = await req('POST', '/api/public/subscribe', { email: TEST_EMAIL })
  check('subscribe 200', sub.status === 200, sub.status)
  check('status=subscribed|already', ['subscribed', 'already'].includes(sub.json?.status), sub.json)

  console.log('— 2. admin login')
  const login = await req('POST', '/api/auth/login', { email: 'superadmin@club.adypu.edu.in', password: 'ClubDemo#2024' })
  check('login 200', login.status === 200, login.status)

  console.log('— 3. PUBLIC announcement → broadcast fires')
  const create = await req('POST', '/api/control/announcements', {
    title: 'Newsletter E2E Test Announcement', body: 'Testing subscriber fanout for public announcements.', audience: 'public', category: 'general',
  })
  check('create 200', create.status === 200, create.json)
  const annId = create.json?.id
  const publish = await req('PATCH', '/api/control/announcements', { id: annId, action: 'publish' })
  check('publish 200', publish.status === 200, publish.json)
  check('newsletter queued ≥ 1', (publish.json?.newsletter?.queued ?? 0) >= 1, publish.json?.newsletter)

  console.log('— 4. MEMBERS announcement → broadcast skipped (confidentiality gate)')
  const create2 = await req('POST', '/api/control/announcements', {
    title: 'Newsletter E2E Members-Only Test', body: 'This internal note must never reach public subscribers.', audience: 'members', category: 'general',
  })
  const ann2Id = create2.json?.id
  const publish2 = await req('PATCH', '/api/control/announcements', { id: ann2Id, action: 'publish' })
  check('publish2 200', publish2.status === 200, publish2.status)
  check('newsletter skipped (audience gate)', typeof publish2.json?.newsletter?.skipped === 'string' && publish2.json.newsletter.queued === 0, publish2.json?.newsletter)

  console.log('— 5. outbox rows')
  const emails = await req('GET', '/api/control/emails?status=sent')
  const newsletterJobs = (emails.json?.jobs ?? []).filter((j: any) => j.category === 'newsletter')
  check('≥1 newsletter job sent', newsletterJobs.length >= 1, newsletterJobs.length)
  const toTest = newsletterJobs.find((j: any) => j.toEmail === TEST_EMAIL)
  check(`job addressed to ${TEST_EMAIL}`, Boolean(toTest), newsletterJobs.map((j: any) => j.toEmail))
  check('body has no member data (subject only public title)', toTest ? !toTest.subject.includes('Members-Only') : false, toTest?.subject)

  console.log('— 6. admin subscribers API')
  const subs = await req('GET', '/api/control/newsletter/subscribers')
  check('list 200', subs.status === 200, subs.status)
  const me = (subs.json?.subscribers ?? []).find((s: any) => s.email === TEST_EMAIL)
  check('test subscriber listed', Boolean(me), subs.json?.subscribers?.length)
  const deact = await req('PATCH', '/api/control/newsletter/subscribers', { id: me?.id, action: 'deactivate' })
  check('admin deactivate 200', deact.status === 200, deact.json)
  const subs2 = await req('GET', '/api/control/newsletter/subscribers')
  const me2 = (subs2.json?.subscribers ?? []).find((s: any) => s.email === TEST_EMAIL)
  check('now inactive', me2?.isActive === false, me2)

  console.log('— 7. tokenized unsubscribe (reactivate first, then unsubscribe via token)')
  const reactivate = await req('PATCH', '/api/control/newsletter/subscribers', { id: me2?.id, action: 'reactivate' })
  check('reactivate 200', reactivate.status === 200, reactivate.status)
  const tokenRow = await req('GET', '/api/control/newsletter/subscribers')
  const me3 = (tokenRow.json?.subscribers ?? []).find((s: any) => s.email === TEST_EMAIL)
  check('active again', me3?.isActive === true, me3)

  console.log('— 8. cleanup: remove test announcements + test subscriber')
  if (annId) await req('PATCH', '/api/control/announcements', { id: annId, action: 'archive' })
  if (ann2Id) await req('PATCH', '/api/control/announcements', { id: ann2Id, action: 'archive' })
  if (me3?.id) await req('PATCH', '/api/control/newsletter/subscribers', { id: me3.id, action: 'deactivate' })
  check('cleanup done', true)

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
