// Section 25.1 — environment guard (master build prompt, carried forward per the
// Super Admin Control Suite PRD §1.6). Every test entrypoint and every seed/demo/purge
// script MUST call assertTestDatabase() before its first write. The guard throws and
// aborts the run when the resolved database URL is not an explicitly recognized
// local/test database.
//
// Adapted for this stack: databases are SQLite file URLs (DATABASE_URL=file:...) or
// in-memory instances. A URL qualifies only if it is:
//   - an in-memory database (file::memory: / :memory:), or
//   - a SQLite file that lives inside the project directory (local, disposable), or
//   - a Supabase/Postgres URL whose project ref is on SUPABASE_TEST_PROJECT_REF
//     (used after the documented migration to the managed stack).
// Any other URL — in particular a remote/hosted database — aborts the run.

const DEFAULT_TEST_PROJECT_REF = process.env.SUPABASE_TEST_PROJECT_REF

function projectRoot(): string {
  // Repo root = directory containing package.json; scripts may run from anywhere.
  // Keep it simple and dependency-free: resolve from cwd, fall back to source path.
  return process.cwd().replace(/\/scripts$/, '')
}

export function isTestDatabaseUrl(rawUrl: string | undefined | null): boolean {
  if (!rawUrl) return false
  const url = rawUrl.trim()

  // In-memory SQLite.
  if (url === ':memory:' || url.includes(':memory:')) return true

  // Local SQLite file inside the project directory.
  const fileMatch = /^file:(?!\/\/)(.+)$/.exec(url) // file:<path> (not file:// URLs)
  if (fileMatch) {
    const path = fileMatch[1]
    if (path.startsWith('/') && path.startsWith(`${projectRoot()}/`)) return true
    if (!path.startsWith('/')) return true // relative path → by definition inside the project checkout
    return false
  }

  // Postgres/Supabase (future managed stack): only the designated test project.
  const ref = DEFAULT_TEST_PROJECT_REF
  if (ref && url.includes(ref)) return true

  return false
}

/** Throws when the target is not a recognized test database. Call before the first write. */
export function assertTestDatabase(url: string | undefined | null = process.env.DATABASE_URL): void {
  if (isTestDatabaseUrl(url)) return
  throw new Error(
    `Refusing to run against ${url ?? '<unset DATABASE_URL>'} — not a recognized test database. ` +
      `Tests, seeds and purge scripts may only target local disposable databases ` +
      `(project-local SQLite files, :memory:, or SUPABASE_TEST_PROJECT_REF).`
  )
}
