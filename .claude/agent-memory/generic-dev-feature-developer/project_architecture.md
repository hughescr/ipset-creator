---
name: project-architecture
description: ipset-creator architecture — ESM CLI, ipverse submodule, JSON data reads, resilient systemd script
metadata:
  type: project
---

## Data source
`country-ip-blocks/` is a git submodule pointing at https://github.com/ipverse/country-ip-blocks.git (migrated from herrbischoff in June 2026). Layout: `country/<cc>/aggregated.json` with shape `{ countryCode, prefixes: { ipv4: [...], ipv6: [...] } }`. 240 countries; 6 (cf, er, fk, kp, ms, yt) have empty ipv6 arrays. AQ has both IPv4 and IPv6 prefixes and is intentionally in no continent table.

## CLI (index.mjs)
- Node ESM with top-level await; uses `import ... with { type: "json" }` (not `assert`) for package.json
- cidr-tools v11+ exports `mergeCidr` (not `merge`) — imported as `import { mergeCidr as merge } from 'cidr-tools'`
- Reads `country-ip-blocks/country/` via `readdir` + `readFile` (no intermediate flat files)
- Countries with empty prefix arrays for the selected family are skipped (guards against hashSize(0) = NaN)
- Continent tables: dead codes (AP, CC, CX, XD, XS, EU, SJ, XK, UM, PN, XX, EH, SH, TF) removed in June 2026 resilience refactor
- Drift detection: if a loaded country code is in no continent table (AQ excepted), a stderr notice is emitted
- readdir result is sorted before iteration for deterministic output
- Error handling: ENOENT on readdir → clear stderr message + exit 1; per-country read errors → console.error + continue; all-fail → exit 1

## Update script (systemd-scripts/update-country-data.sh)
- Renamed from build-list-from-countries.sh in June 2026
- Only git change-detection + pull; exit 0 = up-to-date, exit 1 = updated
- No flattening logic — CLI reads JSON directly

## Main systemd script (systemd-scripts/ipset-creator.sh)
- Always uses -r (swap) mode; no sentinel-based branching
- run_family() called twice: once for v4 (sentinel: north-america), once for v6 (north-america-ipv6)
- Trigger: data changed (update-country-data.sh exit 1) OR sentinel set missing (reboot detection)
- Pre-run: destroys leftover *-new debris (scope regex based)
- Swap-target ensure: parses create *-new lines; creates base set if not in kernel (handles new codes + first run)
- Post-restore reconcile: flushes+destroys kernel sets in scope not in the generator output (stale codes)
- Uses ${TMPDIR:-/tmp} for mktemp (sandbox-safe)
- Naming scope: ^([A-Z]{2}|africa|asia|europe|north-america|oceania|south-america)(-ipv6)?(-new)?$

## Submodule management
- Main `.git/config` submodule URL update is sandbox-blocked via `git submodule sync`
- Workaround: `git remote set-url origin <url>` inside the submodule worktree updates `.git/modules/<name>/config` directly

**Why:** Migrated from herrbischoff (abandoned) to ipverse (actively updated daily). Direct JSON reading eliminates the intermediate sorted-from-git-ipv*.txt files (now removed from .gitignore too).
