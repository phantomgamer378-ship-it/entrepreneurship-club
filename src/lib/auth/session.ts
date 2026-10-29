// Session management — signed JWT (HS256) in an httpOnly cookie.
// This is the sandbox equivalent of Supabase Auth sessions; the provider boundary is
// documented in docs/DECISIONS.md. Server routes MUST re-check permissions per request
// (never trust the token's role snapshot for authorization decisions).
import { SignJWT, jwtVerify } from 'jose'
import { cookies, headers } from 'next/headers'
import { env } from '@/lib/env'

const COOKIE_NAME = 'ec_session'
const secretKey = new TextEncoder().encode(env.sessionSecret)

export type SessionPayload = { sub: string; email: string }

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${env.sessionTtlSeconds}s`)
    .sign(secretKey)
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey)
    if (!payload.sub) return null
    return { sub: payload.sub, email: String(payload.email ?? '') }
  } catch {
    return null
  }
}

export async function setSessionCookie(token: string) {
  const store = await cookies()
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    path: '/',
    maxAge: env.sessionTtlSeconds,
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 })
}

/** Returns the authenticated user id, or null. */
export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (token) {
    const payload = await verifySessionToken(token)
    if (payload?.sub) return payload.sub
  }
  // Fallback: Authorization: Bearer token. The sandbox preview embeds this app in a
  // cross-site iframe where browsers refuse SameSite=lax cookies; in that context the
  // SPA authenticates with the bearer token returned by the login endpoint instead.
  const h = await headers()
  const bearer = h.get('authorization')
  if (bearer?.startsWith('Bearer ')) {
    const payload = await verifySessionToken(bearer.slice(7).trim())
    if (payload?.sub) return payload.sub
  }
  return null
}

export type AuthContext = {
  userId: string
  email: string
  isActive: boolean
  suspendedAt: Date | null
}

/**
 * Resolves the current authenticated, active user (server-side).
 * Suspended users are rejected here — a single choke point for every route.
 */
export async function requireAuth(): Promise<AuthContext | null> {
  const userId = await getSessionUserId()
  if (!userId) return null
  const { db } = await import('@/lib/db')
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, isActive: true, suspendedAt: true },
  })
  if (!user || !user.isActive || user.suspendedAt) return null
  return { userId: user.id, email: user.email, isActive: user.isActive, suspendedAt: user.suspendedAt }
}
