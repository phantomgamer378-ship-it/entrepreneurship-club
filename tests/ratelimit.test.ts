// Sliding-window rate limiter — brute-force/anti-spam protection semantics.
import { describe, test, expect, beforeEach } from 'bun:test'
import { checkAndConsumeWithNow, resetLimiter } from '../src/lib/ratelimit'

const NOW = 1_700_000_000_000

describe('rate limiter', () => {
  beforeEach(() => resetLimiter())

  test('allows up to the limit within the window, then blocks', () => {
    let allowed = 0
    for (let i = 0; i < 5; i++) {
      if (checkAndConsumeWithNow('k1', 3, 60_000, NOW + i * 100)) allowed++
    }
    expect(allowed).toBe(3) // limit enforced exactly
  })

  test('window slides: old hits expire and allow again', () => {
    expect(checkAndConsumeWithNow('k2', 2, 10_000, NOW)).toBe(true)
    expect(checkAndConsumeWithNow('k2', 2, 10_000, NOW + 1000)).toBe(true)
    expect(checkAndConsumeWithNow('k2', 2, 10_000, NOW + 2000)).toBe(false)
    // after the window passes, capacity is restored
    expect(checkAndConsumeWithNow('k2', 2, 10_000, NOW + 11_000)).toBe(true)
  })

  test('keys are isolated (per-IP / per-email buckets)', () => {
    for (let i = 0; i < 3; i++) checkAndConsumeWithNow('ip:1.2.3.4', 3, 60_000, NOW)
    expect(checkAndConsumeWithNow('ip:1.2.3.4', 3, 60_000, NOW)).toBe(false)
    expect(checkAndConsumeWithNow('ip:5.6.7.8', 3, 60_000, NOW)).toBe(true)
  })

  test('8-per-10-minutes login policy behaves as specified', () => {
    let accepted = 0
    for (let i = 0; i < 12; i++) {
      if (checkAndConsumeWithNow('login:email:victim@x', 8, 10 * 60_000, NOW + i * 5000)) accepted++
    }
    expect(accepted).toBe(8)
  })
})
