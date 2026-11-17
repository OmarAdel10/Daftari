# Implementation Progress — Daftari Codebase Cleanup

**Branch:** `feat/codebase-cleanup-dedup`
**Base:** `origin/development` @ `db8fb5a`
**Plane project:** `DAFTARI`
**Started:** Sun Nov 15 2026
**Status:** All 8 implementation batches complete, plus three review-fix waves (4 round-1 + 5 round-2 + 6 round-3 commits) and the user-authorized wave 4 (3 commits). Sound full gate **green per step** — the final wave-4 run (Run B, HEAD `a361643`) passed **all 21 of 21 steps on the first attempt**; the earlier Run A on `8fe3802` reported one exception honestly: `PrintServer.Linux.Tests` failed on its first attempt on the proven pre-existing `DAFTARI-185` timing flake and passed on the immediate retry (106/106, plus a 10/10 isolated run). CodeRabbit rounds 1–4 are recorded (PASS; round 3 score 100 on `a0b195d`, round 4 score 99 on `4d7fc43`). The final reviewer pair reported: the QA reviewer returned **STATUS BLOCKED** (0 Critical/High, 6 Medium + 3 Low documentation/spec findings; its 4 mandatory sub-sections NOT RUN because of the no-dispatch constraint) and the coverage reviewer returned **VERDICT FAIL** on the strict zero-gap clause (0 Critical/High/Medium, 6 Low, score 94). The user authorized wave 4 (all 9 documentation/spec/comment findings + coverage gaps G4 and G6 closed in-branch; G1–G3 and G5 deferred as tracked follow-ups) and reviewer fan-out, so a fresh reviewer pair runs on the final HEAD before the PR is opened.

---

## Batch status

| Batch | Objective | Status | Completed | Commit(s) |
|-------|-----------|--------|-----------|-----------|
| 1 | Remove `RefreshLocalPrinters` event; correct stale docs/followups.md #25 | Complete | 2026-11-15 | `2bdedfb` |
| 2 | Move `hydrated_bloc` to dev_dependencies | Complete | 2026-11-15 | `a8649dc` |
| 3 | Extract shared sliding-window rate-limiter (sessions.ts + sales.ts) | Complete | 2026-11-15 | `67fc1ca` |
| 4 | Consolidate print-service interface/stub/factory; align PrintServer port | Complete | 2026-11-15 | `d5862b2` |
| 5 | Remove dead HWID provider tree + sync specs to the licensing tree | Complete | 2026-11-16 | `e2c56bf` |
| 6 | Drop dead Shorebird app ID from `env_config.dart` | Complete | 2026-11-16 | `25d0f8c` |
| 7 | Extract duplicated CI Hive-lock cleanup step into a composite action | Complete | 2026-11-16 | `42bfcae` |
| 8 | Share the `--parent-pid` parser across both PrintServer hosts | Complete | 2026-11-16 | `50cc0c7` |

### Batch outcome notes

- **Batch 3** — New shared helper `backend/api/src/application/services/ip-rate-limiter.ts` (`createIpRateLimiter`). Both routes now pass the same map bounds — `softCap: 10_000` and `maxEntries: 10_000` (`maxEntries` is a hard bound added later by this branch; the base code had no cap at all). Both routes still expose the same 30/min/IP behaviour and the same injectable-limiter override.
- **Batch 4** — `print_service_interface.dart` is now the single `PrintService` contract. New `print_server_config.dart` holds the canonical sidecar host/port (5150, verified against `PrintServer/Program.cs` and `PrintServer.Linux/Program.cs` `UseUrls`). The factory stub keeps its previous **silent no-op** semantics (it previously threw `UnsupportedError`, which would have been a regression for `receipt_print_helper.dart`). Ports `5000`/`5001` corrected to `5150`.
- **Batch 5** — The entire `apps/daftari/lib/core/hwid/` tree (7 files, 3 duplicate `HwidProvider` interfaces) was dead code with zero importers; it was deleted rather than merged. The live licensing tree (`lib/core/licensing/infrastructure/hwid/`) is untouched. Specs (`PRD.md`, `ARCHITECTURE.md`, `PERFORMANCE_GUIDELINES.md`, `USER_FLOW.md`) re-synced to the real implementation.
- **Batch 6** — Official Shorebird docs confirm the app ID lives in `shorebird.yaml` (not Dart code) and that `shorebird_code_push` is only needed for programmatic/immediate update checks (auto-update is enabled here). `apps/daftari/shorebird.yaml`, the `pubspec.yaml` asset entry, and all `release.yml` shorebird jobs are retained unchanged.
- **Batch 7** — The original "fast-verify vs flutter-matrix duplication" finding was **rejected with evidence** (they are complementary: quality gates vs cross-platform compile proof). The real duplication — an identical 12-line Hive-lock cleanup step in both jobs — was extracted into `.github/actions/cleanup-hive-locks/action.yml`.
- **Batch 8** — `ParseParentPid` was an exact Type-1 copy in both `Program.cs` files with zero test coverage. Extracted to `PrintServer.Common/ParentPidParser.cs` (MSBuild shared-source `Compile Include`, no new project ⇒ no CI job changes) and covered by 8 new xunit tests in `PrintServer.Tests`.

## Commit log (this branch)

| # | SHA | Message | Batch |
|---|-----|---------|-------|
| 1 | `2bdedfb` | ♻️ refactor(settings): remove RefreshLocalPrinters | 1 |
| 2 | `a8649dc` | 🔧 chore(deps): hydrated_bloc to dev_dependencies | 2 |
| 3 | `67fc1ca` | ♻️ refactor(api): extract shared IP rate-limiter | 3 |
| 4 | `d5862b2` | ♻️ refactor(printing): consolidate PrintService contract and port config | 4 |
| 5 | `e2c56bf` | ♻️ refactor(licensing): remove dead HWID tree | 5 |
| 6 | `25d0f8c` | 🔧 chore(config): drop dead Shorebird app ID | 6 |
| 7 | `42bfcae` | ♻️ refactor(ci): extract duplicated Hive lock cleanup step | 7 |
| 8 | `50cc0c7` | ♻️ refactor(printserver): share parent-pid parser | 8 |
| 9 | `31560ba` | ♻️ refactor(api): cap sales sync rate-limiter map | R1 |
| 10 | `a371de1` | 🐛 fix(printing): wrap desktop printer lookup failures | R1 |
| 11 | `2668f4a` | ✅ test(printserver): cover negative parent pid parsing | R1 |
| 12 | `4782788` | 📝 docs(followups): record review follow-ups | R1 |
| 13 | `2c074ce` | 🔧 chore(repo): track docs/audits in git | R1 |
| 14 | `e9b4436` | ♻️ refactor(api): bound the IP rate-limiter map | R2 |
| 15 | `111a0fe` | 🐛 fix(printing): keep printer lookup status codes | R2 |
| 16 | `ef98e7f` | 🚀 ci: clean stale Hive locks before the test step | R2 |
| 17 | `313bd72` | 📝 docs(specs): re-sync cleanup changes with the code | R2 |
| 18 | `53726f9` | 📝 docs(followups): record melos exit-code masking | R2 |
| 19 | `1ed1f7b` | 📝 docs(audit): add cleanup audit artifacts | docs |
| 20 | `68d0696` | ✅ test(printing): cover platform printer fetch | R3 |
| 21 | `2b6e0a2` | ✅ test(api): prove limiter eviction semantics | R3 |
| 22 | `d5fa35e` | 🔧 fix(api): require limiter entry bound | R3 |
| 23 | `73e3db8` | 📝 docs(specs): correct HWID binding facts | R3 |
| 24 | `a4ab4d3` | 📝 docs(followups): record audit review gaps | R3 |
| 25 | `8fe3802` | 📝 docs(audit): strip findings trailing whitespace | R3 |
| 26 | `130b4d4` | 📝 docs(audit): reconcile audit artifacts with the evidence | docs |
| 27 | `a0b195d` | 📝 docs(audit): pin the artifact commit SHA | docs |
| 28 | `26321f4` | 📝 docs(specs): correct cloud flavor platforms | R3 |
| 29 | `d095d82` | 📝 docs(followups): correct the WebPrintService route list | R3 |
| 30 | `bb4a5ca` | 📝 docs(audit): record CodeRabbit round 3 and final metrics | docs |
| 31 | `4d7fc43` | 📝 docs(audit): record coverage round 6 dispositions | docs |
| 32 | `702e26e` | ✅ test(printing): assert factory returns new stub (G4) | W4 |
| 33 | `48523fe` | ✅ test(api): cover limiter soft cap eviction (G6) | W4 |
| 34 | `a361643` | 📝 docs(specs): correct flavor and factory facts (SPEC-01/02/03 + CODE-01) | W4 |
| 35 | this commit | 📝 docs(audit): record wave-4 fixes and gate proof | W4 |

Base commit: `db8fb5a` (📦 chore(ci): remove duplicated verify jobs (#110)).

## Artifacts status

| Artifact | Path | Status |
|----------|------|--------|
| repository-inventory.md | docs/audits/codebase-cleanup/repository-inventory.md | Complete |
| audit-coverage.md | docs/audits/codebase-cleanup/audit-coverage.md | Complete |
| baseline-validation.md | docs/audits/codebase-cleanup/baseline-validation.md | Complete |
| findings.md | docs/audits/codebase-cleanup/findings.md | Complete — all findings resolved or rejected with evidence |
| implementation-plan.md | docs/audits/codebase-cleanup/implementation-plan.md | Complete |
| implementation-progress.md | docs/audits/codebase-cleanup/implementation-progress.md | Complete (this file) |
| verification-results.md | docs/audits/codebase-cleanup/verification-results.md | Complete — FAST row per commit, a per-step gate ledger (PASSED / FAILED → GREEN ON RETRY / SKIPPED / NOT RUN), review-loop rows 1–7, both sound full-gate runs (Run A 20/21 with the `DAFTARI-185` flake → retry; Run B 21/21) |
| independent-review.md | docs/audits/codebase-cleanup/independent-review.md | Complete — CodeRabbit rounds 1–4, the round-3/4 QA reports and the round-3/5/6 coverage reports with per-finding dispositions, plus the fix-round-3 and fix-round-4 (wave-4) tables |
| final-report.md | docs/audits/codebase-cleanup/final-report.md | Complete — conditional-PASS verdict, deltas enumerated, per-step gate table, no blanket claims |

## Out-of-scope findings raised (docs/followups.md + Plane)

| # | Plane | Summary |
|---|-------|---------|
| 76 | DAFTARI-183 | `WebPrintService` calls endpoint paths that do not exist on the sidecar (`/health`, `/api/printers`, `/api/print/*` vs the real `/api/printing/*` routes) |
| 77 | DAFTARI-182 | `apps/daftari/lib/core/printing/print_service.dart` is a dead barrel export (zero importers, no-op conditional export) |
| 78 | DAFTARI-184 | `lib/core/backend/workers/session_sync_service.dart` is dead code (zero importers) |
| 79 | DAFTARI-185 | `PrintServer.Linux.Tests` PNG-collision test is timing-flaky (second-resolution filename) |
| 80 | DAFTARI-187 | The platform print clients call sidecar routes that do not exist (`/api/printing/print-receipt` vs `/api/printing/receipt`); `PrintServiceDesktop` also sends `svg_base64` where the server binds `data` |
| 81 | DAFTARI-186 | The Turso in-memory client test can exceed the default vitest timeout under load |
| 82 | DAFTARI-188 | The factory never wires a real platform implementation and no caller checks `healthCheck()` — printing/export completes "successfully" without output (pre-existing) |
| 83 | DAFTARI-189 | `melos.yaml` runs several commands per script block, so the block exit status is the last command's — a failing `flutter test` is masked |
| 84 | DAFTARI-190 | `expenses_bloc_test.dart:369` audit-event assertion fails under parallel load (passes in isolation) |
| 85 | DAFTARI-191 | **High** — the Worker rebuilds the app (and the limiter state) per request, so the 31st request in a window is not rate-limited. Pre-existing at base `db8fb5a`; `backend/api/src/index.ts` is not a changed unit of this branch |
| 86 | DAFTARI-192 | No Worker-level rate-limiter lifecycle test (request 31 must return 429) — blocked on #85 |
| 87 | DAFTARI-193 | `CF-Connecting-IP` is trusted without an explicit trust boundary |
| 88 | DAFTARI-194 | `_pidsListeningOnPrintServerPort` (`print_server_manager.dart:348`) has no test |
| 89 | DAFTARI-195 | `_pidsListeningOnPrintServerPort` (`print_server_manager_linux.dart:370`) has no test |
| 90 | DAFTARI-196 | The `_spawn` `ASPNETCORE_URLS` environment wiring has no test seam |
| 91 | DAFTARI-197 | The Linux manager environment test cannot fail (expected value built from the production helper, assertions skipped) |
| 92 | DAFTARI-198 | **RESOLVED in wave 4** — `print_service_test.dart:16-19` now compares two `create()` results and asserts they are distinct instances (`702e26e`) |
| 93 | DAFTARI-199 | The Hive-lock cleanup composite action has no fixture test (lock removal, selective deletion, missing-dir, custom dir) |
| 94 | DAFTARI-200 | **RESOLVED in wave 4** — `ip-rate-limiter.ts` soft-cap eviction is now tested with a mixed active/expired set: the active entry survives and keeps its spent budget (`48523fe`) |

## Notes

- Baseline: all checks pass on `development` (see baseline-validation.md).
- Branch `feat/codebase-cleanup-dedup` created from `origin/development`, tracking set up.
- CodeRabbit CLI 0.9.5 available and authenticated (`coderabbit doctor` = 9 passed).
- `.gitignore` previously whitelisted only `docs/followups.md` under `docs/*`; `!docs/audits/` was added so these artifacts ship with the PR.
- Per-commit FAST gate evidence: see verification-results.md.
- The agent never merges. The user merges the PR into `development` manually.
