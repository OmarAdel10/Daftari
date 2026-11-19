# Baseline Validation — Daftari Monorepo

**Root:** `/mnt/ALL/Daftari`
**Branch:** `development` (baseline established before branching to `feat/codebase-cleanup-dedup`)
**Date:** Sun Nov 15 2026

---

## Checks executed and results

| Check | Command | Result | Details |
|-------|---------|--------|---------|
| Formatting | `melos run format` | **PASS** | 0 files changed (daftari 513 files, landing 18 files) |
| Static analysis | `melos run analyze` | **PASS** (exit 0) | daftari app clean; landing page has 138 pre-existing infos (deprecated Jaspr `text` member in home_page/pricing_page; dangling_library_doc_comments in tokens.dart; depend_on_referenced_packages in routing_web.dart imports `web` not a dep) — infos only, not failures |
| Unit/widget tests (Dart) | `melos run test` | **PASS** | daftari flutter tests all pass; landing dart tests all 28 pass (I18n, pricing, routing, assets, BillingInterval/PricingPlan enums) — re-measured on this branch: `dart test` → `00:00 +28: All tests passed!` (the earlier note recorded 31) |
| Backend tests + typecheck | `npm test` + `npm run typecheck` (x5 packages) | **PASS** | shared (30 files/270 tests), api (28 files/480 tests), realtime (9 files/95 tests), admin_host (14 files/170 tests), paymob_webhook (13 files/80 tests). Vite configLoader warnings are pre-existing info only. |
| C# build | `dotnet build PrintServer.Linux -c Release --no-restore` | **PASS** | 0 errors, 4 pre-existing warnings (SKTextBlobBuilder obsolete CS0618 x1, CS8604 possible null x3) |
| C# tests | `dotnet test PrintServer.Tests -c Release` | **PASS** | Failed:0, Passed:108, Skipped:2 (platform-specific skips, pre-existing), duration 15s |

---

## Pre-existing failures (from docs/followups.md)

The following were recorded in `docs/followups.md` before this session:

| Item | Status at baseline | Notes |
|------|-------------------|-------|
| Format drift on development | Not reproduced | `melos run format` reports 0 files changed |
| 3 failing product_form tests | Not reproduced | `melos run test` reports all daftari tests pass |
| Flaky barcode_scanner_gate test | Not reproduced | `melos run test` reports all tests pass |
| Unused `_exportProducts` | Not reproduced | Baseline test suite passes |

These items appear resolved or stale since the baseline now passes fully. They will be re-verified if any touched code relates to them.

---

## Existing warnings (pre-existing, not introduced)

| Source | Warning | Count | Action |
|--------|---------|-------|--------|
| Landing page analyze | deprecated Jaspr `text` member | ~home_page, pricing_page | Pre-existing info; out of scope for this cleanup |
| Landing page analyze | dangling_library_doc_comments | tokens.dart | Pre-existing info |
| Landing page analyze | depend_on_referenced_packages | routing_web.dart | Pre-existing info |
| C# build | SKTextBlobBuilder obsolete CS0618 | 1 | Pre-existing |
| C# build | CS8604 possible null reference | 3 | Pre-existing |

No new warnings introduced. All warnings are pre-existing and unrelated to the cleanup scope.

---

## Missing/unavailable validation capabilities

| Capability | Status | Notes |
|------------|--------|-------|
| Full CI pipeline (GitHub Actions) | Not run locally | ci.yml runs on push/PR; can be triggered via GitHub but not executed locally in full |
| `flutter build apk --debug` | Not executed | Android SDK not available in this Linux environment; Flutter Desktop/Linux build is the applicable target |
| Web build | Not executed | Applicable only to Flutter Web admin; not part of this cleanup's changed surface |
| CodeRabbit PR review | Available locally | `coderabbit review --agent --base origin/development` available (CLI 0.9.5, authenticated) |

---

## Baseline conclusion

All applicable existing checks pass on `development`. The repository is in a clean, green baseline state before cleanup work begins. No pre-existing failures block the implementation plan.
