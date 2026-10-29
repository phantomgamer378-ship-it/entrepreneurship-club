#!/bin/bash
# Task 11 demo wiring: give the existing public member a photo + LinkedIn/GitHub
# via the REAL admin PATCH path (verifies the new fields end-to-end).
set -e
BASE=http://localhost:3000

TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"superadmin@club.adypu.edu.in","password":"ClubDemo#2024"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
echo "admin token: ${TOKEN:0:12}…"

TARGET=$(curl -s "$BASE/api/control/members?q=member@gmail.com" -H "Authorization: Bearer $TOKEN" | \
  python3 -c 'import sys,json;u=json.load(sys.stdin)["users"][0];print(u["id"])')
echo "target user: $TARGET"

curl -s -X PATCH "$BASE/api/control/members" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{
  \"targetId\":\"$TARGET\",\"action\":\"update\",
  \"avatarUrl\":\"/avatars/member-1.png\",
  \"linkedinUrl\":\"https://www.linkedin.com/in/demo-member\",
  \"githubUrl\":\"https://github.com/demo-member\"
}"
echo ""

echo "--- public team now returns:"
curl -s "$BASE/api/public/team" | python3 -m json.tool | grep -E '"username"|"avatarUrl"|"linkedinUrl"|"githubUrl"|"displayName"'

echo "--- avatar asset served:"
curl -s -o /dev/null -w "GET /avatars/member-1.png -> %{http_code}\n" "$BASE/avatars/member-1.png"
