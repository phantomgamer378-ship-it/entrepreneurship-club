// Task 25 E2E: banner upload → event create → google-form grace (unconfigured)
// → publish → guest registration with year/branch/phone → attendance JSON+CSV.
const BASE = 'http://localhost:3000'
let cookie = ''
let failures = 0

function check(name, cond, detail) {
  if (cond) console.log(`  ok ${name}`)
  else { failures++; console.log(`  FAIL ${name}`, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : '') }
}

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const sc = res.headers.get('set-cookie')
  if (sc) cookie = sc.split(';')[0]
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* binary/csv */ }
  return { status: res.status, json, text }
}

// Minimal valid 1x1 PNG (real magic bytes so the sniff passes).
function tinyPng() {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  return Buffer.from(b64, 'base64')
}

async function main() {
  console.log('— 1. admin login')
  const login = await req('POST', '/api/auth/login', { email: 'superadmin@club.adypu.edu.in', password: 'ClubDemo#2024' })
  check('login 200', login.status === 200, login.status)

  console.log('— 2. banner upload (multipart)')
  const fd = new FormData()
  fd.append('file', new Blob([tinyPng()], { type: 'image/png' }), 'banner.png')
  const up = await fetch(BASE + '/api/control/uploads', { method: 'POST', headers: { cookie }, body: fd })
  const upJson = await up.json().catch(() => ({}))
  check('upload 200', up.status === 200, { status: up.status, upJson })
  check('url is /api/media/banners/…', typeof upJson.url === 'string' && upJson.url.startsWith('/api/media/banners/'), upJson)
  if (upJson.url) {
    const img = await fetch(BASE + upJson.url)
    check('banner served 200 + png', img.status === 200 && img.headers.get('content-type') === 'image/png', { s: img.status, ct: img.headers.get('content-type') })
  }

  console.log('— 3. reject bad upload (text file posing as png)')
  const fd2 = new FormData()
  fd2.append('file', new Blob([Buffer.from('definitely not an image')], { type: 'image/png' }), 'fake.png')
  const bad = await fetch(BASE + '/api/control/uploads', { method: 'POST', headers: { cookie }, body: fd2 })
  check('magic-byte reject 422', bad.status === 422, bad.status)

  console.log('— 4. create event with posterUrl')
  const create = await req('POST', '/api/control/events', {
    title: 'Task 25 E2E Event', summary: 'Banner + registration form E2E', description: 'E2E verification event.',
    venue: 'Lab 4', startsAt: new Date(Date.now() + 14 * 864e5).toISOString(), capacity: 50,
    posterUrl: upJson.url,
  })
  check('create 200', create.status === 200, create.json)
  const eventId = create.json?.event?.id
  const slug = create.json?.event?.slug
  check('event id/slug', Boolean(eventId && slug), create.json)

  console.log('— 5. google form action (unconfigured → graceful 501)')
  const gf = await req('PATCH', '/api/control/events', { id: eventId, action: 'create_google_form' })
  check('501 google_not_configured', gf.status === 501 && gf.json?.code === 'google_not_configured', { status: gf.status, code: gf.json?.code })

  console.log('— 6. publish')
  const pub = await req('PATCH', '/api/control/events', { id: eventId, action: 'publish' })
  check('publish 200', pub.status === 200, pub.json)

  console.log('— 7. public detail includes posterUrl')
  const det = await req('GET', `/api/public/events/${slug}`)
  check('detail 200', det.status === 200, det.status)
  check('posterUrl matches upload', det.json?.posterUrl === upJson.url, det.json?.posterUrl)

  console.log('— 8. guest registration with year/branch/phone')
  const reg = await req('POST', `/api/public/events/${slug}/register`, {
    guestName: 'E2E Visitor', guestEmail: 'e2e.visitor@example.com',
    year: 'Second year', branch: 'CSE', phone: '+91 98765 43210',
  })
  check('register 200', reg.status === 200, reg.json)
  check('googleSync skipped (no form)', reg.json?.googleSync === 'skipped', reg.json)

  console.log('— 9. invalid phone rejected')
  const badReg = await req('POST', `/api/public/events/${slug}/register`, {
    guestName: 'Bad Phone', guestEmail: 'bad.phone@example.com', year: 'First year', branch: 'IT', phone: 'call me maybe',
  })
  check('phone validation 422', badReg.status === 422, { status: badReg.status, body: badReg.json })

  console.log('— 10. attendance JSON + CSV')
  const att = await req('GET', `/api/control/events/${eventId}/attendance`)
  const r0 = att.json?.registrations?.[0]
  check('attendance has year/branch/phone', r0?.year === 'Second year' && r0?.branch === 'CSE' && r0?.phone === '+91 98765 43210', r0)
  const csv = await fetch(BASE + `/api/control/events/${eventId}/attendance?format=csv`, { headers: { cookie } })
  const csvText = await csv.text()
  check('csv 200 + header', csv.status === 200 && csvText.includes('Educational year') && csvText.includes('Second year'), { status: csv.status, head: csvText.slice(0, 200) })

  console.log('— 11. cleanup test rows')
  await req('PATCH', '/api/control/events', { id: eventId, action: 'archive' })
  console.log(`RESULT: ${failures === 0 ? 'ALL PASSED' : failures + ' FAILURES'}`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
