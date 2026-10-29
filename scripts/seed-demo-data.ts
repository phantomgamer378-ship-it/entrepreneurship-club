// Section 25: seed/demo data entrypoint. The ONLY sanctioned way to create demo data.
// Wraps the prisma seed with the mandatory assertTestDatabase() guard — a seed run
// against any non-test database aborts before the first write.
import { assertTestDatabase } from '../src/lib/test-guard'

assertTestDatabase(process.env.DATABASE_URL)
console.log('[seed-demo-data] guard passed for', process.env.DATABASE_URL)

const { runSeed } = await import('../prisma/seed')
await runSeed()
if (process.exitCode) {
  console.error('[seed-demo-data] FAILED — see errors above.')
  process.exit(process.exitCode)
}
console.log('[seed-demo-data] done.')
