#!/usr/bin/env python3
"""Phase 0 read-only inspection of db/custom.db for docs/GAP_REPORT.md (Section 25 checks)."""
import sqlite3, re, json

DB = "/home/z/my-project/db/custom.db"
con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)  # read-only guarantee
con.row_factory = sqlite3.Row
cur = con.cursor()

def rows(q, args=()):
    return [dict(r) for r in cur.execute(q, args).fetchall()]

print("== tables ==")
tables = [r["name"] for r in rows("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
print(", ".join(tables))

print("\n== row counts (key tables) ==")
for t in ["User", "Profile", "MemberApplication", "ClubEvent", "Announcement",
          "EventRegistration", "EmailOutbox", "Conversation", "Message", "VideoRoom", "AuditLog"]:
    if t in tables:
        n = cur.execute(f'SELECT COUNT(*) c FROM "{t}"').fetchone()["c"]
        print(f"{t}: {n}")

print("\n== Incident 1: test-fixture applicant rows ==")
pats = ["job_persists_%", "founder_resend_outage_%", "outage_user_%"]
for p in pats:
    if "MemberApplication" in tables:
        n = cur.execute('SELECT COUNT(*) c FROM "MemberApplication" WHERE email LIKE ?', (p,)).fetchone()["c"]
        print(f"  MemberApplication email LIKE '{p}': {n}")
if "MemberApplication" in tables:
    print("  -- all application emails --")
    for r in rows('SELECT email, status, createdAt FROM "MemberApplication" ORDER BY createdAt'):
        print(f"  {r['email']} | {r['status']} | {r['createdAt']}")

print("\n== Incident 2: external-URL media fields ==")
if "Profile" in tables:
    n = cur.execute("SELECT COUNT(*) c FROM Profile WHERE avatarUrl LIKE 'http%'").fetchone()["c"]
    print(f"  Profile.avatarUrl LIKE 'http%': {n}")
    for r in rows("SELECT id, avatarUrl FROM Profile WHERE avatarUrl LIKE 'http%' LIMIT 10"):
        print(f"    {r['id']}: {r['avatarUrl']}")
if "ClubEvent" in tables:
    n = cur.execute("SELECT COUNT(*) c FROM ClubEvent WHERE posterUrl LIKE 'http%'").fetchone()["c"]
    print(f"  ClubEvent.posterUrl LIKE 'http%': {n}")
    for r in rows("SELECT slug, posterUrl FROM ClubEvent WHERE posterUrl LIKE 'http%' LIMIT 10"):
        print(f"    {r['slug']}: {r['posterUrl']}")

print("\n== is_seed_data / guard presence in schema ==")
cols = rows("SELECT name FROM pragma_table_info('Profile')")
print("  Profile columns:", ", ".join(c["name"] for c in cols))

print("\n== demo user emails (what an admin sees) ==")
if "User" in tables:
    for r in rows('SELECT email, isActive FROM "User" ORDER BY createdAt LIMIT 20'):
        print(f"  {r['email']} | active={r['isActive']}")

con.close()
