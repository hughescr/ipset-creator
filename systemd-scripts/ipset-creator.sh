#!/usr/bin/env bash
# ipset-creator.sh — refresh country/continent ipsets from the ipverse data repo.
#
# NAMING SCOPE ASSUMPTION: this script considers kernel sets whose names match
#   ^([A-Z]{2}|africa|asia|europe|north-america|oceania|south-america)(-ipv6)?(-new)?$
# as belonging to it.  Do NOT create unrelated ipset names that match that
# pattern (e.g. a two-letter abbreviation set for something other than a
# country), or this script may flush/destroy them during reconciliation.
#
# Design: always use -r (swap) mode.  Before restoring:
#   1. Destroy any leftover *-new debris from prior failed runs.
#   2. Ensure every swap target (base name) already exists in the kernel;
#      create it (with identical params) if not.  This handles first-ever
#      runs and new country codes appearing in the data (e.g. AQ gaining IPv6).
# After restoring:
#   3. Reconcile: flush+destroy kernel sets in scope that are no longer
#      produced by the generator (stale codes that disappeared from the data).

set -euo pipefail
export LC_ALL=C

IPSET=$(command -v ipset)
YARN=$(command -v yarn)
SCRIPTS_DIR=$("$YARN" global dir)/node_modules/ipset-creator/systemd-scripts
IPSET_CREATOR=$("$YARN" global bin)/ipset-creator
COUNTRIES_DATA_GIT_DIR=/var/opt/ipset-creator

cd "$COUNTRIES_DATA_GIT_DIR" || exit 1

# ── Change detection ─────────────────────────────────────────────────────────
# update-country-data.sh exits 0 (up-to-date) or 1 (updated).  We must NOT let
# set -e kill us on exit 1, so capture the exit code manually.
DATA_CHANGED=0
"$SCRIPTS_DIR/update-country-data.sh" || DATA_CHANGED=$?
if [ "$DATA_CHANGED" -gt 1 ]; then
    echo "ERROR: data update script failed (exit $DATA_CHANGED)" >&2
    exit 1
fi

# ── Per-family refresh ───────────────────────────────────────────────────────
# Run once for IPv4 (no suffix) and once for IPv6 (-ipv6 suffix).
# Family is determined by the generator flags; the create lines embed the
# correct "family inet" / "family inet6" so ipset restore handles them.

run_family() {
    local family_flag="$1"          # "" for v4, "-6" for v6
    local sentinel_name="$2"        # set name to check for reboot detection

    # ── Reboot / missing-set detection ───────────────────────────────────────
    local sentinel_present
    sentinel_present=$("$IPSET" list -n -q "$sentinel_name" 2>/dev/null || true)
    if [ "$DATA_CHANGED" -ne 1 ] && [ "$sentinel_present" = "$sentinel_name" ]; then
        echo "Family ${family_flag:-v4}: no data change and sets present — skipping"
        return 0
    fi
    if [ "$sentinel_present" != "$sentinel_name" ]; then
        echo "Family ${family_flag:-v4}: sentinel '$sentinel_name' missing (first run or reboot) — refreshing"
    else
        echo "Family ${family_flag:-v4}: data changed — refreshing"
    fi

    # ── Generate output to temp file ─────────────────────────────────────────
    local tmpfile expected_bases_file
    tmpfile=$(mktemp "${TMPDIR:-/tmp}/ipset-creator-XXXXXX.ipset")
    expected_bases_file=$(mktemp "${TMPDIR:-/tmp}/ipset-expected-XXXXXX.txt")
    # shellcheck disable=SC2064
    trap "rm -f '$tmpfile' '$expected_bases_file'" EXIT

    # Always use -r so we always go through the swap path
    # shellcheck disable=SC2086
    "$IPSET_CREATOR" ${family_flag:+"$family_flag"} -r > "$tmpfile"

    # Guard: abort if the generator produced nothing useful
    if ! grep -q '^create ' "$tmpfile"; then
        echo "ERROR: generator produced no 'create' lines for family ${family_flag:-v4} — aborting refresh" >&2
        rm -f "$tmpfile"
        return 1
    fi

    # ── Scope regexes ────────────────────────────────────────────────────────
    # Matches the base names (without -new) that this script owns for this family.
    # v4: ^([A-Z]{2}|africa|asia|europe|north-america|oceania|south-america)$
    # v6: same with -ipv6 suffix
    local scope_regex scope_new_regex
    if [ -z "$family_flag" ]; then
        scope_regex='^([A-Z]{2}|africa|asia|europe|north-america|oceania|south-america)$'
        scope_new_regex='^([A-Z]{2}|africa|asia|europe|north-america|oceania|south-america)-new$'
    else
        scope_regex='^([A-Z]{2}|africa|asia|europe|north-america|oceania|south-america)-ipv6$'
        scope_new_regex='^([A-Z]{2}|africa|asia|europe|north-america|oceania|south-america)-ipv6-new$'
    fi

    # ── Step 1: Destroy leftover *-new debris ─────────────────────────────────
    local debris
    debris=$("$IPSET" list -n 2>/dev/null | grep -E "$scope_new_regex" || true)
    if [ -n "$debris" ]; then
        echo "Cleaning up leftover -new sets: $debris"
        while IFS= read -r setname; do
            "$IPSET" destroy "$setname" 2>/dev/null || echo "Warning: could not destroy debris set '$setname'" >&2
        done <<< "$debris"
    fi

    # ── Step 2: Ensure swap targets (base names) exist ───────────────────────
    # Parse "create <name>-new <params...>" lines from the temp file and for each
    # base <name> not present in the kernel, create it with the same params.
    while IFS= read -r line; do
        # Extract the set name (second word) from create lines ending in -new
        local newname params basename
        newname=$(echo "$line" | awk '{print $2}')
        # Strip the trailing -new to get the base name
        basename="${newname%-new}"
        params=$(echo "$line" | cut -d' ' -f3-)

        local existing
        existing=$("$IPSET" list -n -q "$basename" 2>/dev/null || true)
        if [ "$existing" != "$basename" ]; then
            echo "Creating missing swap target: $basename"
            # shellcheck disable=SC2086
            "$IPSET" create "$basename" $params
        fi
    done < <(grep '^create .*-new ' "$tmpfile")

    # ── Step 3: Restore ───────────────────────────────────────────────────────
    if ! "$IPSET" restore -f "$tmpfile"; then
        echo "ERROR: ipset restore failed for family ${family_flag:-v4}" >&2
        rm -f "$tmpfile"
        return 1
    fi

    # ── Step 4: Reconcile disappeared codes ──────────────────────────────────
    # Build a newline-delimited list of base names the generator produced this run.
    # (expected_bases_file was already created and is covered by the EXIT trap above)
    grep '^create .*-new ' "$tmpfile" | awk '{print $2}' | sed 's/-new$//' > "$expected_bases_file"

    # Find kernel sets in scope that are no longer expected.
    local stale_sets
    stale_sets=$("$IPSET" list -n 2>/dev/null | grep -E "$scope_regex" || true)
    if [ -n "$stale_sets" ]; then
        while IFS= read -r setname; do
            if ! grep -qxF "$setname" "$expected_bases_file"; then
                echo "Reconcile: flushing stale set '$setname'"
                "$IPSET" flush "$setname"
                if "$IPSET" destroy "$setname" 2>/dev/null; then
                    echo "Reconcile: destroyed stale set '$setname'"
                else
                    echo "Reconcile: '$setname' is in use by iptables — flushed but kept (remove the iptables rule to destroy it)" >&2
                fi
            fi
        done <<< "$stale_sets"
    fi
    rm -f "$tmpfile" "$expected_bases_file"
    trap - EXIT
    return 0
}

run_family ""   "north-america"
run_family "-6" "north-america-ipv6"

echo "ipset refresh complete"
