#!/usr/bin/env bash
set -euo pipefail

OUTPUT_FILE="${1:-data/version.json}"
mkdir -p "$(dirname "$OUTPUT_FILE")"

PR_NUMBER="${PR_NUMBER:-}"

if [[ -z "$PR_NUMBER" && -n "${GITHUB_EVENT_PATH:-}" && -f "${GITHUB_EVENT_PATH}" ]]; then
  PR_NUMBER="$(python3 - <<'PY'
import json, os
path = os.environ.get('GITHUB_EVENT_PATH')
if not path:
    print('')
    raise SystemExit
with open(path, 'r', encoding='utf-8') as f:
    event = json.load(f)
pr = event.get('pull_request') or {}
num = pr.get('number')
print(str(num) if isinstance(num, int) else '')
PY
)"
fi

if [[ -z "$PR_NUMBER" && -n "${GITHUB_REF_NAME:-}" && "${GITHUB_REF_NAME}" =~ ^[0-9]+/merge$ ]]; then
  PR_NUMBER="${GITHUB_REF_NAME%%/*}"
fi

if [[ -z "$PR_NUMBER" ]]; then
  COMMIT_MSG="$(git log -1 --pretty=%B 2>/dev/null || true)"
  if [[ "$COMMIT_MSG" =~ [Pp][Rr][[:space:]]*#([0-9]+) ]]; then
    PR_NUMBER="${BASH_REMATCH[1]}"
  elif [[ "$COMMIT_MSG" =~ [Mm]erge[[:space:]]pull[[:space:]]request[[:space:]]#([0-9]+) ]]; then
    PR_NUMBER="${BASH_REMATCH[1]}"
  elif [[ "$COMMIT_MSG" =~ \(#([0-9]+)\) ]]; then
    PR_NUMBER="${BASH_REMATCH[1]}"
  fi
fi

SOURCE="pr"
NUMBER=""
if [[ -n "$PR_NUMBER" && "$PR_NUMBER" =~ ^[0-9]+$ ]]; then
  NUMBER="$PR_NUMBER"
else
  SOURCE="build"
  if [[ -n "${GITHUB_RUN_NUMBER:-}" && "${GITHUB_RUN_NUMBER}" =~ ^[0-9]+$ ]]; then
    NUMBER="$GITHUB_RUN_NUMBER"
  else
    NUMBER="$(git rev-list --count HEAD 2>/dev/null || echo 1)"
  fi
fi

MAJOR=$(( NUMBER / 1000 + 1 ))
MINOR=$(( (NUMBER % 1000) / 100 ))
PATCH=$(( NUMBER % 100 ))
VERSION="${MAJOR}.${MINOR}.${PATCH}"

cat > "$OUTPUT_FILE" <<JSON
{
  "version": "$VERSION"
}
JSON

echo "Generated version $VERSION from $SOURCE number $NUMBER -> $OUTPUT_FILE"
