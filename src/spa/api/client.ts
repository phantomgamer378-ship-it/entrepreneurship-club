// Typed fetch client for the SPA. All API routes are same-origin under /api.
// Auth: httpOnly cookie when available, plus an Authorization: Bearer fallback.
// The bearer fallback is required inside cross-site iframe previews (sandbox
// embeds), where browsers refuse to store SameSite=lax cookies.
export class ApiClientError extends Error {
  status: number
  code: string
  constructor(status: number, message: string, code = 'error') {
    super(message)
    this.status = status
    this.code = code
  }
}

const TOKEN_KEY = 'ec_session_token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* storage unavailable */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable */
  }
}

async function request<T>(path: string, init?: RequestInit & { body?: unknown }): Promise<T> {
  const { body, ...rest } = init ?? {}
  const token = getToken()
  const isForm = body instanceof FormData
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(rest.headers ?? {}),
    },
    body: body !== undefined ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined,
    credentials: 'same-origin',
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401) clearToken()
    const err = data as { error?: string; code?: string } | null
    throw new ApiClientError(res.status, err?.error ?? `Request failed (${res.status})`, err?.code ?? 'error')
  }
  // Auto-capture session tokens returned by auth endpoints (login, accept-invite).
  if (data && typeof data === 'object' && 'token' in data) {
    const t = (data as { token?: unknown }).token
    if (typeof t === 'string' && t.length > 0) setToken(t)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}
