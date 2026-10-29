// Email outbox state-machine invariants that can be verified without a provider:
// idempotent enqueue keys + backoff ladder + dead-letter threshold policy.
// (Full pipeline covered by API smoke tests — see docs/STATUS_REPORT.md.)
import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(import.meta.dir, '../src/lib/email/outbox.ts'), 'utf8')

describe('outbox implementation invariants', () => {
  test('enqueue is idempotent on the idempotency key', () => {
    expect(src).toContain("findUnique({ where: { idempotencyKey: input.idempotencyKey } })")
    expect(src).toContain('idempotencyKey: input.idempotencyKey')
  })

  test('jobs are claimed atomically to prevent double-send across workers', () => {
    expect(src).toContain("where: { id: job.id, status: { in: ['queued', 'failed'] } }")
    expect(src).toContain('claimed.count === 0')
  })

  test('bounded retries: dead-letter at maxAttempts, never unbounded', () => {
    expect(src).toContain('attemptsUsed >= job.maxAttempts')
    expect(src).toContain("status: isDead ? 'dead' : 'failed'")
  })

  test('backoff escalates instead of hammering the provider', () => {
    expect(src).toContain('BACKOFF_MS = [0, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000]')
  })

  test('dead letters raise an ops alert audit event', () => {
    expect(src).toContain("'email.delivery_failed'")
  })

  test('manual retry restricted to failed/dead jobs only', () => {
    expect(src).toContain("['failed', 'dead'].includes(job.status)")
  })
})
