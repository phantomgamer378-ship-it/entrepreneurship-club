// Single-use opaque tokens (invitations, password reset).
// Tokens are stored hashed (SHA-256); the raw token appears only in the emailed link.
import { createHash, randomBytes } from 'crypto'

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
export const RESET_TTL_MS = 60 * 60 * 1000 // 1 hour
