#!/usr/bin/env bash
# Update the country-ip-blocks data repo and report whether the data changed.
# Exit codes: 0 = up-to-date, 1 = updated (pulled new commits), 2 = error.
set -uo pipefail

if ! git -C country-ip-blocks remote update 2>&1; then
    echo "ERROR: 'git remote update' failed for country-ip-blocks — repo missing or network error" >&2
    exit 2
fi

LOCAL=$(git -C country-ip-blocks rev-parse '@{0}' 2>/dev/null || true)
REMOTE=$(git -C country-ip-blocks rev-parse '@{u}' 2>/dev/null || true)

if [ -z "$LOCAL" ] || [ -z "$REMOTE" ]; then
    echo "ERROR: could not determine local/remote HEAD for country-ip-blocks (LOCAL='$LOCAL' REMOTE='$REMOTE')" >&2
    exit 2
fi

if [ "$LOCAL" = "$REMOTE" ]; then
    echo "Up-to-date"
    exit 0
else
    echo "Diverged"
    git -C country-ip-blocks pull --all -p
    exit 1
fi
