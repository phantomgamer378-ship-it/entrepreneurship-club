-- Purge seed/demo rows (Section 25.5) — second named incident class: a seed/demo
-- script once wrote stock-photo member profiles into a live database.
-- Scope: only rows explicitly tagged is_seed_data = true. Real user content is never
-- touched. With the Section 25.2 schema, seed rows can also simply be filtered out of
-- public query paths; this script removes them physically (dev reset workflows).
--
-- DO NOT run this file directly against an unknown target. Always use the guarded
-- runner:  bun scripts/run-purge.ts seed
-- The runner enforces assertTestDatabase() (local/test allow-list) before executing.
-- Documented in docs/DEVOPS.md §data-hygiene.

DELETE FROM Profile WHERE isSeedData = 1;
DELETE FROM ClubEvent WHERE isSeedData = 1;
DELETE FROM Announcement WHERE isSeedData = 1;
-- Seed-linked accounts (users whose only purpose was carrying the seed profile).
DELETE FROM User
 WHERE id IN (
   SELECT u.id FROM User u
   LEFT JOIN Profile p ON p.userId = u.id
   LEFT JOIN MemberApplication ma ON ma.applicantUserId = u.id
   LEFT JOIN EventRegistration er ON er.userId = u.id
   LEFT JOIN ConversationMember cm ON cm.userId = u.id
   LEFT JOIN Message m ON m.senderId = u.id
  WHERE p.id IS NULL AND ma.id IS NULL AND er.id IS NULL AND cm.id IS NULL AND m.id IS NULL
    AND u.email NOT IN ('superadmin@club.adypu.edu.in')
    AND u.createdAt <= (SELECT MAX(createdAt) FROM User WHERE email = 'superadmin@club.adypu.edu.in')
 );
