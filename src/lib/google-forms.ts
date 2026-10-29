// Task 25 — Google Forms integration for event registrations.
//
// What it does when configured (GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY
// in .env, Forms API enabled on the Google Cloud project):
//   1. createEventRegistrationForm(event) → auto-creates a Google Form with the
//      standard questions (Full name, Email, Educational year, Branch, Phone
//      number) and returns { id, responderUri, mapping } where mapping keys are
//      the Forms question itemIds → our field names. The mapping is persisted on
//      the event so every later registration can be pushed into the form.
//   2. syncRegistrationToForm(...) → submits one form response per registration,
//      so organisers see every signup live in Google Forms / a linked Sheet.
//
// When NOT configured everything degrades gracefully: the in-app registration
// form still captures all fields, rows are stored in the DB, and admins can
// export a Google-Sheets-ready CSV. No registration ever fails because of
// Google — sync is strictly best-effort.
//
// Zero external dependencies: the service-account JWT (RS256) is signed with
// node:crypto, exchanged at https://oauth2.googleapis.com/token.
import { createSign } from 'node:crypto'

const FORMS_BASE = 'https://forms.googleapis.com/v1'
const SCOPE = 'https://www.googleapis.com/auth/forms.body'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export type GoogleConfig = { clientEmail: string; privateKey: string }

export function getGoogleConfig(): GoogleConfig | null {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim()
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY?.trim()
  if (!clientEmail || !privateKeyRaw) return null
  // .env files commonly store the key with literal \n sequences.
  const privateKey = privateKeyRaw.includes('\\n') ? privateKeyRaw.replace(/\\n/g, '\n') : privateKeyRaw
  if (!privateKey.includes('PRIVATE KEY')) return null
  return { clientEmail, privateKey }
}

export const GOOGLE_SETUP_HINT =
  'Google Forms is not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY ' +
  '(service account with the Forms API enabled) to .env, then retry. Registrations are still ' +
  'captured in-app and exportable as CSV.'

// ── Auth ────────────────────────────────────────────────────────────────────

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function signJwt(cfg: GoogleConfig, audience: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: cfg.clientEmail,
      scope: SCOPE,
      aud: audience,
      iat: now,
      exp: now + 3600,
    })
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = signer.sign(cfg.privateKey).toString('base64url')
  return `${header}.${claims}.${signature}`
}

let cachedToken: { token: string; exp: number } | null = null

export async function getAccessToken(cfg: GoogleConfig): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() / 1000 + 60) return cachedToken.token
  const assertion = signJwt(cfg, TOKEN_URL)
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as { access_token: string; expires_in: number }
  cachedToken = { token: json.access_token, exp: Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600) }
  return cachedToken.token
}

// ── Form creation ───────────────────────────────────────────────────────────

export type CreatedForm = {
  id: string
  responderUri: string
  mapping: Record<string, string> // itemId → our field name
}

export async function createEventRegistrationForm(cfg: GoogleConfig, eventTitle: string): Promise<CreatedForm> {
  const token = await getAccessToken(cfg)
  // Request includes info + items in one call; writeControl absent → new form.
  const payload = {
    info: {
      title: `Registration — ${eventTitle}`.slice(0, 90),
      documentTitle: `Event registration · ${eventTitle}`.slice(0, 90),
    },
    items: [
      {
        title: 'Full name',
        questionItem: { question: { required: true, textQuestion: {} } },
      },
      {
        title: 'Email',
        questionItem: { question: { required: true, textQuestion: {} } },
      },
      {
        title: 'Educational year',
        questionItem: {
          question: {
            required: true,
            choiceQuestion: {
              type: 'DROP_DOWN',
              options: [
                { value: 'First year' },
                { value: 'Second year' },
                { value: 'Third year' },
                { value: 'Fourth year' },
                { value: 'Postgraduate' },
                { value: 'Other' },
              ],
            },
          },
        },
      },
      {
        title: 'Branch',
        questionItem: {
          question: {
            required: true,
            choiceQuestion: {
              type: 'DROP_DOWN',
              options: [
                { value: 'CSE' },
                { value: 'IT' },
                { value: 'ECE' },
                { value: 'Electrical' },
                { value: 'Mechanical' },
                { value: 'Civil' },
                { value: 'MBA' },
                { value: 'BBA' },
                { value: 'Design' },
                { value: 'Law' },
                { value: 'Other' },
              ],
            },
          },
        },
      },
      {
        title: 'Phone number',
        questionItem: { question: { required: true, textQuestion: {} } },
      },
    ],
  }

  const res = await fetch(`${FORMS_BASE}/forms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Google Forms create failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const form = (await res.json()) as {
    formId: string
    responderUri: string
    items?: { itemId: string; title?: string }[]
  }

  // Build itemId → field mapping from the titles we just sent.
  const byTitle: Record<string, string> = {
    'Full name': 'name',
    Email: 'email',
    'Educational year': 'year',
    Branch: 'branch',
    'Phone number': 'phone',
  }
  const mapping: Record<string, string> = {}
  for (const item of form.items ?? []) {
    const field = item.title ? byTitle[item.title] : undefined
    if (field) mapping[item.itemId] = field
  }
  return { id: form.formId, responderUri: form.responderUri, mapping }
}

// ── Response sync ───────────────────────────────────────────────────────────

export type RegistrationAnswers = {
  name: string
  email: string
  year?: string | null
  branch?: string | null
  phone?: string | null
}

export async function submitFormResponse(
  cfg: GoogleConfig,
  formId: string,
  mapping: Record<string, string>,
  answers: RegistrationAnswers
): Promise<void> {
  const token = await getAccessToken(cfg)
  const fieldValues: Record<string, string> = {
    name: answers.name,
    email: answers.email,
    year: answers.year ?? '',
    branch: answers.branch ?? '',
    phone: answers.phone ?? '',
  }
  const body: Record<string, unknown> = {}
  for (const [itemId, field] of Object.entries(mapping)) {
    const value = fieldValues[field]
    if (value) body[itemId] = { textAnswers: { answers: [{ value }] } }
  }
  const res = await fetch(`${FORMS_BASE}/forms/${encodeURIComponent(formId)}/responses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers: body }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Forms response submit failed (${res.status}): ${text.slice(0, 300)}`)
  }
}
