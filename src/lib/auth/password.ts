// Password hashing with scrypt (node:crypto) — auditable, no third-party dependency.
// Format: scrypt$N$r$p$salt$hash (all base64url). Parameters sized per OWASP 2024 guidance.
import { randomBytes, scrypt, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>

const N = 16384
const r = 8
const p = 1
const KEYLEN = 64
const MAXMEM = 64 * 1024 * 1024

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password.normalize('NFKC'), salt, KEYLEN, { N, r, p, maxmem: MAXMEM })
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false
  try {
    const [scheme, nStr, rStr, pStr, saltB64, hashB64] = stored.split('$')
    if (scheme !== 'scrypt') return false
    const salt = Buffer.from(saltB64, 'base64url')
    const expected = Buffer.from(hashB64, 'base64url')
    const derived = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
      N: Number(nStr),
      r: Number(rStr),
      p: Number(pStr),
      maxmem: MAXMEM,
    })
    return timingSafeEqual(derived, expected)
  } catch {
    return false
  }
}

export function passwordIssues(password: string): string[] {
  const issues: string[] = []
  if (password.length < 10) issues.push('At least 10 characters')
  if (!/[A-Za-z]/.test(password)) issues.push('At least one letter')
  if (!/[0-9]/.test(password)) issues.push('At least one number')
  return issues
}
