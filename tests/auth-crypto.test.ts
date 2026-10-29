// Auth crypto & token semantics — scrypt hashing, password policy, opaque tokens.
import { describe, test, expect } from 'bun:test'
import { hashPassword, verifyPassword, passwordIssues } from '../src/lib/auth/password'
import { generateToken, hashToken } from '../src/lib/auth/tokens'

describe('password hashing (scrypt)', () => {
  test('roundtrip: correct password verifies', async () => {
    const hash = await hashPassword('ClubDemo#2024')
    expect(hash.startsWith('scrypt$16384$8$1$')).toBe(true)
    expect(await verifyPassword('ClubDemo#2024', hash)).toBe(true)
  })
  test('wrong password fails (and never throws)', async () => {
    const hash = await hashPassword('correct-horse-battery-1')
    expect(await verifyPassword('wrong-password-1', hash)).toBe(false)
    expect(await verifyPassword('', hash)).toBe(false)
  })
  test('null/missing/garbled stored hash → fail closed', async () => {
    expect(await verifyPassword('anything', null)).toBe(false)
    expect(await verifyPassword('anything', undefined)).toBe(false)
    expect(await verifyPassword('anything', 'not-a-real-hash')).toBe(false)
  })
  test('salts are unique per hash', async () => {
    const a = await hashPassword('same-password-1')
    const b = await hashPassword('same-password-1')
    expect(a).not.toBe(b)
  })
})

describe('password policy (matches validation UX)', () => {
  test('enforces length, letter and number rules', () => {
    expect(passwordIssues('short1')).toContain('At least 10 characters')
    expect(passwordIssues('nonumbershere')).toContain('At least one number')
    expect(passwordIssues('1234567890')).toContain('At least one letter')
    expect(passwordIssues('GoodPass123')).toEqual([])
  })
})

describe('opaque tokens (invites / resets)', () => {
  test('tokens are URL-safe and high-entropy', () => {
    const t = generateToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(t.length).toBeGreaterThanOrEqual(40)
  })
  test('stored form is a deterministic hash — raw token never stored', () => {
    const t = generateToken()
    expect(hashToken(t)).toBe(hashToken(t))
    expect(hashToken(t)).not.toBe(t)
    expect(hashToken(t)).toMatch(/^[a-f0-9]{64}$/)
  })
  test('different tokens hash differently (collision sanity)', () => {
    const set = new Set(Array.from({ length: 50 }, () => hashToken(generateToken())))
    expect(set.size).toBe(50)
  })
})
