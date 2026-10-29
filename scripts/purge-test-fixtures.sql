-- Purge test-fixture rows (Section 25.5) — named incident class from Phase 0:
-- automated test runs once wrote fixture applicant rows into a live database.
-- Scope: known fixture email patterns + obviously-synthetic test accounts created by
-- API smoke tests. Seed/demo rows are handled by purge-seed-data.sql, NOT here.
--
-- DO NOT run this file directly against an unknown target. Always use the guarded
-- runner:  bun scripts/run-purge.ts fixtures
-- The runner enforces assertTestDatabase() (local/test allow-list) before executing.
-- Documented in docs/DEVOPS.md §data-hygiene.

DELETE FROM EventRegistration
 WHERE (userId IS NULL AND guestEmail LIKE 'job\_persists\_%' ESCAPE '\')
    OR (userId IS NULL AND guestEmail LIKE 'founder\_resend\_outage\_%' ESCAPE '\')
    OR (userId IS NULL AND guestEmail LIKE 'outage\_user\_%' ESCAPE '\')
    OR (userId IS NULL AND guestEmail LIKE 'test.user@%')
    OR (userId IS NULL AND guestEmail LIKE 'e2e-%@%')
    OR (userId IS NULL AND guestEmail LIKE 'smoke-%@%');

DELETE FROM ClubInvite
 WHERE email LIKE 'job\_persists\_%' ESCAPE '\'
    OR email LIKE 'founder\_resend\_outage\_%' ESCAPE '\'
    OR email LIKE 'outage\_user\_%' ESCAPE '\'
    OR email LIKE 'test.user@%'
    OR email LIKE 'e2e-%@%'
    OR email LIKE 'smoke-%@%';

DELETE FROM MemberApplication
 WHERE email LIKE 'job\_persists\_%' ESCAPE '\'
    OR email LIKE 'founder\_resend\_outage\_%' ESCAPE '\'
    OR email LIKE 'outage\_user\_%' ESCAPE '\'
    OR email LIKE 'test.user@%'
    OR email LIKE 'e2e-%@%'
    OR email LIKE 'smoke-%@%';

DELETE FROM User
 WHERE email LIKE 'job\_persists\_%' ESCAPE '\'
    OR email LIKE 'founder\_resend\_outage\_%' ESCAPE '\'
    OR email LIKE 'outage\_user\_%' ESCAPE '\'
    OR email LIKE 'test.user@%'
    OR email LIKE 'e2e-%@%'
    OR email LIKE 'smoke-%@%';
