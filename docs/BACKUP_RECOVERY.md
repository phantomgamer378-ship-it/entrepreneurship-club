# BACKUP_RECOVERY.md

## 1. What must be backed up

| Asset | Location | Method |
|---|---|---|
| Database (all tables incl. audit logs) | `db/custom.db` (SQLite) | scheduled file export (below) |
| Uploaded media | none stored in this release (URL references only) | n/a until a storage integration ships — then object-store versioning + separate export |
| Configuration | `.env.local` (secrets), docs (git) | secret store backup; never in git |
| Code & migrations | git | GitHub + optional mirror |

## 2. Backup pipeline (§19)

1. **Schedule** — nightly export at 03:30 IST.
2. **Export** — SQLite online backup (safe with WAL):
   ```bash
   sqlite3 db/custom.db ".backup 'backups/ec-$(date +%F).db'"
   ```
   (or `VACUUM INTO 'backups/ec-$(date +%F).db'`). On Postgres: `pg_dump --format=custom`.
3. **Validate** — non-empty file, integrity check:
   ```bash
   sqlite3 "backups/ec-$(date +%F).db" "PRAGMA integrity_check; SELECT count(*) FROM User;"
   ```
4. **Encrypt** — `age` or GPG with a key held only in the secret store:
   ```bash
   age -r <recipient-public-key> -o "backups/ec-$(date +%F).db.age" "backups/ec-$(date +%F).db"
   rm "backups/ec-$(date +%F).db"
   ```
5. **Store off-site** — push to restricted object storage / separate provider (bucket policy: private, versioning on, no public access).
6. **Record** — append timestamp + SHA-256 checksum to `backups/MANIFEST.md` (or object metadata).
7. **Retention** — 14 daily, 8 weekly, 6 monthly; then delete (documented policy; adjust for institutional requirements).
8. **Restore drill** — monthly (step 9–10 below) — **a backup is not "verified" until restored**.

## 3. Restore procedure

```bash
# 1. Fetch + decrypt the chosen backup
age -d -i key.txt -o restored.db "backups/ec-2026-01-01.db.age"

# 2. Restore into an ISOLATED test environment first (never in-place)
sqlite3 restored.db "PRAGMA integrity_check;"

# 3. Point a staging instance at it
DATABASE_URL=file:restored.db bun run dev

# 4. Verify (script below), then swap into production during a maintenance window
```

## 4. Restore verification checklist

- [ ] `PRAGMA integrity_check` → `ok`
- [ ] Schema matches current `prisma/schema.prisma` (`prisma db pull` diff is empty)
- [ ] Row counts sane: Users, Profiles, Events, Announcements, AuditLog vs last known snapshot
- [ ] Recent records present (latest audit event within RPO window)
- [ ] Login smoke test works against restored data
- [ ] Storage objects (future): spot-check signed URLs return 200
- [ ] Record the drill result (date, backup id, tester, issues) in the ops log

## 5. RPO / RTO

- **RPO 24h** (nightly backups) — acceptable at current club scale; move to hourly WAL archiving if message volume grows.
- **RTO 4h** for full restore; 30min for credential/session incidents (rotation only).

## 6. Retention & privacy

Do **not** retain messages, application data or personal information indefinitely without a documented reason: audit logs and soft-deleted messages follow the club's retention policy (recommended: 24 months, then purge with a logged, scripted job). Backups inherit deletion requests at the next restore-cycle boundary — document this in the privacy notice.

## 7. Honest status

The backup **pipeline is documented and scriptable** from this repo, but no scheduled backup/restore drill has been executed inside this sandbox (no persistent off-site storage is configured). Before production launch: attach storage, run the pipeline once, execute the restore drill, and record the result. Per the master requirements, we explicitly do **not** claim backups are verified.
