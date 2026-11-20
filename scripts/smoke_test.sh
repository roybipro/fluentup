#!/usr/bin/env bash
# Smoke-test a running FluentUp API end to end.
#
#   scripts/smoke_test.sh https://your-api.example.com/api/v1
#
# Creates a throwaway account, exercises auth, AI auth, offline sync idempotency and XP,
# then deletes the account. Exits non-zero on the first failed check. Needs curl and python3.
set -euo pipefail

API_URL="${1:?usage: smoke_test.sh <API_URL ending in /api/v1>}"
API_URL="${API_URL%/}"
EMAIL="smoke-$(date +%s)-$RANDOM@example.com"
PASSWORD="Smoke-$(date +%s)-Pass!"
BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT

pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; cat "$BODY" >&2 || true; echo >&2; exit 1; }

# call METHOD PATH [JSON] [TOKEN] -> prints HTTP status, body saved to $BODY
call() {
  local method="$1" path="$2" data="${3:-}" token="${4:-}"
  local args=(-sS -o "$BODY" -w '%{http_code}' -X "$method" "$API_URL$path" -H 'Content-Type: application/json')
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  [[ -n "$data" ]] && args+=(--data "$data")
  curl "${args[@]}"
}

# json EXPR -> evaluates EXPR against the last response body, bound to d
json() { python3 -c "import json,sys; d=json.load(open(sys.argv[2])); print(eval(sys.argv[1], {}, {'d': d}))" "$1" "$BODY"; }

echo "Smoke testing $API_URL"

[[ "$(call GET /health)" == 200 ]] && pass "GET /health" || fail "GET /health"

[[ "$(call POST /auth/register "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"display_name\":\"Smoke\"}")" == 201 ]] \
  && pass "register" || fail "register"
TOKEN="$(json "d['access_token']")"

[[ "$(call POST /auth/login "{\"email\":\"$EMAIL\",\"password\":\"wrong-password-123\"}")" == 401 ]] \
  && pass "wrong password -> 401" || fail "wrong password -> 401"
[[ "$(call POST /auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")" == 200 ]] \
  && pass "correct password -> 200" || fail "correct password -> 200"

TUTOR='{"scenarioId":"s","scenarioTitle":"Smoke","userMessage":"Hello there.","explanationLanguage":"en"}'
[[ "$(call POST /ai/tutor "$TUTOR")" == 401 ]] && pass "AI without token -> 401" || fail "AI without token -> 401"
[[ "$(call POST /ai/tutor "$TUTOR" not-a-real-token)" == 401 ]] && pass "AI with bad token -> 401" || fail "AI with bad token -> 401"

SUB="smoke-sub-$(date +%s)"
BATCH="{\"mutations\":[{\"id\":\"m-$SUB\",\"type\":\"lesson_quiz_completed\",\"createdAt\":\"2026-01-01T00:00:00Z\",\"retryCount\":0,\
\"payload\":{\"lessonId\":\"lesson-beg-1\",\"clientSubmissionId\":\"$SUB\",\"scorePercent\":100,\"correctCount\":5,\"totalQuestions\":5,\"xpEarned\":999}}]}"
[[ "$(call POST /sync/batch "$BATCH" "$TOKEN")" == 200 && "$(json "d['results'][0]['status']")" == ok ]] \
  && pass "sync batch persists" || fail "sync batch persists"
[[ "$(call POST /sync/batch "$BATCH" "$TOKEN")" == 200 && "$(json "d['results'][0]['status']")" == duplicate ]] \
  && pass "sync batch is idempotent" || fail "sync batch is idempotent"

[[ "$(call GET /profile/me "" "$TOKEN")" == 200 && "$(json "d['total_xp']")" == 25 ]] \
  && pass "server-side XP (25, client claimed 999)" || fail "server-side XP"

[[ "$(call DELETE /auth/account '{"reason":"smoke test cleanup"}' "$TOKEN")" == 200 ]] \
  && pass "delete smoke account" || fail "delete smoke account"
[[ "$(call GET /profile/me "" "$TOKEN")" == 401 ]] && pass "deleted account token -> 401" || fail "deleted account token -> 401"

echo "All smoke checks passed."
