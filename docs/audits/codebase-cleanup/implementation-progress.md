# Implementation Progress — Daftari Codebase Cleanup

**Branch:** `feat/codebase-cleanup-dedup`
**Base:** `origin/development` @ `db8fb5a`
**Plane project:** `DAFTARI`
**Started:** Sun Nov 15 2026
**Status:** All 8 implementation batches complete, plus two review-fix waves (4 round-1 commits + 5 round-2 commits). Sound full gate GREEN except 3 proven pre-existing flakes. Pending the final independent-review round + PR handoff.

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

- **Batch 3** — New shared helper `backend/api/src/application/services/ip-rate-limiter.ts` (`createIpRateLimiter`). `sessions.ts` keeps its map-capping (soft cap 10 000 / hard cap 5 000); `sales.ts` keeps the uncapped variant. Both routes still expose the same 30/min/IP behaviour and the same injectable-limiter override.
- **Batch 4** — `print_service_interface.dart` is now the single `PrintService` contract. New `print_server_config.dart` holds the canonical sidecar host/port (5150, verified against `PrintServer/Program.cs` and `PrintServer.Linux/Program.cs` `UseUrls`). The factory stub keeps its previous **silent no-op** semantics (it previously threw `UnsupportedError`, which would have been a regression for `receipt_print_helper.dart`). Ports `5000`/`5001` corrected to `5150`.
- **Batch 5** — The entire `apps/daftari/lib/core/hwid/` tree (7 files, 3 duplicate `HwidProvider` interfaces) was dead code with zero importers; it was deleted rather than merged. The live licensing tree (`lib/core/licensing/infrastructure/hwid/`) is untouched. Specs (`PRD.md`, `ARCHITECTURE.md`, `PERFORMANCE_GUIDELINES.md`, `USER_FLOW.md`) re-synced to the real implementation.
- **Batch 6** — Official Shorebird docs confirm the app ID lives in `shorebird.yaml` (not Dart code) and that `shorebird_code_push` is only needed for programmatic/immediate update checks (auto-update is enabled here). `apps/daftari/shorebird.yaml`, the `pubspec.yaml` asset entry, and all `release.yml` shorebird jobs are retained unchanged.
- **Batch 7** — The original "fast-verify vs flutter-matrix duplication" finding was **rejected with evidence** (they are complementary: quality gates vs cross-platform compile proof). The real duplication — an identical 12-line Hive-lock cleanup step in both jobs — was extracted into `.github/actions/cleanup-hive-locks/action.yml`.
- **Batch 8** — `ParseParentPid` was an exact Type-1 copy in both `Program.cs` files with zero test coverage. Extracted to `PrintServer.Common/ParentPidParser.cs` (MSBuild shared-source `Compile Include`, no new project ⇒ no CI job changes) and covered by 7 new xunit tests in `PrintServer.Tests`.

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
| verification-results.md | docs/audits/codebase-cleanup/verification-results.md | Complete |
| independent-review.md | docs/audits/codebase-cleanup/independent-review.md | Complete — CodeRabbit rounds 1–2 + both independent reviewer reports with full dispositions |
| final-report.md | docs/audits/codebase-cleanup/final-report.md | Complete — verdict PASS, pending the final reviewer round |

## Out-of-scope findings raised (docs/followups.md + Plane)

| # | Plane | Summary |
|---|-------|---------|
| 76 | DAFTARI-183 | `WebPrintService` calls endpoint paths that do not exist on the sidecar (`/health`, `/api/printers`, `/api/print/*` vs the real `/api/printing/*` routes) |
| 77 | DAFTARI-182 | `apps/daftari/lib/core/printing/print_service.dart` is a dead barrel export (zero importers, no-op conditional export) |
| 78 | DAFTARI-184 | `lib/core/backend/workers/session_sync_service.dart` is dead code (zero importers) |
| 79 | DAFTARI-185 | `PrintServer.Linux.Tests` PNG-collision test is timing-flaky (second-resolution filename) |

## Notes

- Baseline: all checks pass on `development` (see baseline-validation.md).
- Branch `feat/codebase-cleanup-dedup` created from `origin/development`, tracking set up.
- CodeRabbit CLI 0.9.5 available and authenticated (`coderabbit doctor` = 9 passed).
- `.gitignore` previously whitelisted only `docs/followups.md` under `docs/*`; `!docs/audits/` was added so these artifacts ship with the PR.
- Per-commit FAST gate evidence: see verification-results.md.
- The agent never merges. The user merges the PR into `development` manually.
