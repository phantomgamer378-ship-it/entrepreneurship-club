// Shared API route helpers: uniform JSON errors, auth resolution, zod body validation.
import { NextResponse } from 'next/server'
import { ZodError, ZodType } from 'zod'
import { requireAuth } from '@/lib/auth/session'
import { AuthorizationError } from '@/lib/rbac/authorize'
import { getClientIp } from '@/lib/ratelimit'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, message: string, code = 'error') {
    super(message)
    this.status = status
    this.code = code
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function fail(status: number, message: string, code = 'error') {
  return NextResponse.json({ error: message, code }, { status })
}

export function handleError(err: unknown) {
  if (err instanceof AuthorizationError) return fail(err.status, err.message)
  if (err instanceof ApiError) return fail(err.status, err.message, err.code)
  if (err instanceof ZodError) {
    const first = err.issues[0]
    return fail(422, first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input', 'validation_error')
  }
  console.error('[api] unhandled error:', err)
  return fail(500, 'Internal server error', 'internal_error')
}

/** Resolve the authenticated + active user, or throw 401. */
export async function auth() {
  const ctx = await requireAuth()
  if (!ctx) throw new AuthorizationError('Authentication required', 401)
  return ctx
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON', 'bad_json')
  }
  return schema.parse(raw)
}

export function ipOf(req: Request) {
  return getClientIp(req)
}

export function hashIp(ip: string): string {
  // Non-reversible hash for duplicate-abuse analysis; avoids storing raw IPs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require('crypto') as typeof import('crypto')
  return createHash('sha256').update(ip).digest('hex').slice(0, 24)
}
