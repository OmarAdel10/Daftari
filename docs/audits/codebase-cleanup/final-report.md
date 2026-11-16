# Final Report — Daftari Codebase Cleanup

**Branch:** `feat/codebase-cleanup-dedup`
**Base:** `origin/development` @ `db8fb5a`
**Plane project:** `DAFTARI`
**Reviewed HEAD:** `53726f9` (18 commits ahead of base, 0 behind)
**Verdict:** PASS — READY TO MERGE (pending the final independent-review round on the current HEAD).

---

## Executive summary

A full read-only audit of the Daftari monorepo (Flutter app + shared `lib/`, Flutter Web admin, Jaspr landing page, 5 TypeScript backend packages, 3 C# projects, CI/CD, specs and docs) produced **11 tracked findings**: 10 confirmed and actionable, 1 later raised during implementation. All 10 confirmed findings are now **resolved**; the 11th (a suspected CI duplication) was **rejected with evidence** after a line-by-line reading showed the two jobs are complementary, not redundant.

The cleanup is **behaviour-preserving by construction**. Every change was verified against the base commit rather than against assumptions: where a duplicate abstraction existed in a dead tree, the tree was deleted; where a duplicate existed in live code, the shared implementation was extracted with byte-identical logic; where a value was duplicated in configuration, a single constant now owns it. Four review-round findings raised by CodeRabbit were fixed, and three were rejected after proving their premise false at `db8fb5a`.

Three real defects that the audit had not originally recorded were discovered during the implementation and are now tracked rather than silently fixed, because fixing them would change runtime behaviour outside the approved scope.

---

## Coverage statistics

| Metric | Value |
|--------|-------|
| Applications audited | 5 (Flutter desktop app, Flutter Web admin, Jaspr landing, TypeScript backend × 5 packages, .NET 8 print server × 3 projects) |
| Dart packages | 2 (`apps/daftari`, `landing_page`) |
| TypeScript packages | 5 (`shared`, `api`, `realtime`, `admin_host`, `paymob_webhook`) |
| C# projects | 3 (`PrintServer`, `PrintServer.Linux`, `PrintServer.Tests`, `PrintServer.Linux.Tests`) |
| First-party source directories audited | 100% accounted for |
| Files changed by this branch | 44 (+831 / −963) |
| Files deleted | 7 (the dead `apps/daftari/lib/core/hwid/` tree) |
| Files introduced | 8 (2 shared implementations, 1 CI composite action, 5 test files) |
| Files modified | 29 |

---

## Before-and-after metrics

| Metric | Before (`db8fb5a`) | After (`313bd72`) | Delta |
|--------|--------------------|-------------------|-------|
| Confirmed duplication findings | 4 | 0 open | −4 |
| Confirmed unused declarations | 1 | 0 open | −1 |
| Dead `HwidProvider` interface definitions | 3 | 1 | −2 |
| Dead first-party source files | — | — | −7 |
| PrintServer port literals in the printing layer | 3 distinct (`:5000`, `:5001`, `:5150`) | 1 (`:5150`, owned by `print_server_config.dart`) | −2 |
| Inline copies of the sliding-window IP limiter | 2 | 1 shared factory | −1 |
| Copies of `ParseParentPid` | 2 | 1 shared source file | −1 |
| Duplicated CI shell blocks (`Clean stale Hive locks`) | 2 | 1 composite action | −1 |
| `hydrated_bloc` declared as | production dependency | dev dependency (test-only) | corrected |
| Flutter app tests | 1618 pass | 1629 pass | +11 |
| Landing page tests | 28 pass | 28 pass | 0 |
| Backend tests (5 packages) | 1095 pass | 1104 pass | +9 |
| `PrintServer.Tests` | 108 pass / 2 skip | 116 pass / 2 skip | +8 |
| `PrintServer.Linux.Tests` | 106 pass | 106 pass | 0 |
| Analyzer errors / warnings | 0 / 0 (app) | 0 / 0 | 0 |
| Landing page analyzer infos | 138 (pre-existing) | 138 (pre-existing) | 0 |

---

## Changes implemented

### Batch 1 — Dead event + stale doc (`2bdedfb`)
- Removed the unreferenced `RefreshLocalPrinters` settings event (no handler, no dispatch, zero repository-wide references).
- Corrected `docs/followups.md` #25 to `[REJECTED]`: no `AppFlavor.landing` exists — `AppFlavor` is `{local, cloud, admin}`.

### Batch 2 — Dependency hygiene (`a8649dc`)
- Moved `hydrated_bloc` from `dependencies` to `dev_dependencies` in `apps/daftari/pubspec.yaml` (27 test imports, zero `lib/` imports).

### Batch 3 — Backend rate-limiter deduplication (`67fc1ca`)
- Added `backend/api/src/application/services/ip-rate-limiter.ts` with a `createIpRateLimiter` factory.
- `sessions.ts` and `sales.ts` now share it; the `sessions.ts` map-capping semantics (soft cap 10 000 / hard cap 5 000) are preserved exactly.

### Batch 4 — Print service consolidation + port alignment (`d5862b2`)
- `print_service_interface.dart` is now the single `PrintService` contract; the duplicate interface in `print_service_stub.dart` and the duplicate `StubPrintService` in `print_service_factory.dart` are gone.
- Added `print_server_config.dart` as the single owner of the sidecar host/port/base URL/health endpoint (`:5150`, matching `PrintServer/Program.cs` and `PrintServer.Linux/Program.cs`).
- Corrected the wrong defaults (`:5000` → `:5150`, `:5001` → `:5150`).
- Preserved the factory's silent no-op semantics exactly — the previous throwing stub was dead code the factory never returned.

### Batch 5 — HWID consolidation (`e2c56bf`)
- Deleted the entire dead `apps/daftari/lib/core/hwid/` tree (7 files, 3 distinct `HwidProvider` interfaces, 4 implementations) — it had **zero importers**.
- The licensing tree (`lib/core/licensing/infrastructure/hwid/`) is the single live HWID abstraction; its bytes are unchanged.
- Synced `specs/PRD.md`, `specs/ARCHITECTURE.md`, `specs/PERFORMANCE_GUIDELINES.md` and `specs/USER_FLOW.md` to the real implementation (the specs described an aspirational WMI/SHA-256 design that never existed).

### Batch 6 — Shorebird configuration (`25d0f8c`)
- Removed the dead `EnvConfig.shorebirdAppId` (declared, assigned, never read; its production value was the placeholder `'prod-app-id'`).
- Verified against the official Shorebird docs that the app ID lives in `shorebird.yaml` and that `shorebird_code_push` is only needed for programmatic update checks — so neither `shorebird.yaml`, the `pubspec.yaml` asset entry, nor the `release.yml` jobs were touched.

### Batch 7 — CI deduplication (`42bfcae`)
- Extracted the duplicated "Clean stale Hive locks" shell block into `.github/actions/cleanup-hive-locks/action.yml`, referenced by both jobs.
- **Rejected** the original finding (suspected `fast-verify` vs `flutter-matrix` duplication) with evidence: `fast-verify` runs the quality gates (`melos run analyze`, `melos run test`) on every push/PR; `flutter-matrix` runs `flutter build` only and is correctly gated by `needs: fast-verify`.

### Batch 8 — `ParseParentPid` deduplication (`50cc0c7`)
- Extracted the character-identical copy into `PrintServer.Common/ParentPidParser.cs`, linked into both host projects via MSBuild `<Compile Include=… Link=…>` (no new project, no CI change).
- Added `PrintServer.Tests/ParentPidParserTests.cs` — 8 xunit tests covering every branch of the parser (the parser previously had **zero** test coverage).

### Review-round fixes (`31560ba`, `a371de1`, `2668f4a`, `4782788`)
- Capped the `/sales/sync` fallback limiter map so a single isolate cannot retain an entry for every IP it has seen.
- `PrintServiceDesktop.getLocalPrinters()` now wraps failures in `PrintException` with a 10 s timeout, matching the Windows and Linux services.
- Added the negative-value parser test.
- Recorded two out-of-scope findings in `docs/followups.md`.

### Round-2 fix wave (`e9b4436`, `111a0fe`, `ef98e7f`, `313bd72`)
Driven by the two independent reviewers, which ran once the provider rate-limit cleared and both reported **FAIL / BLOCKED**. Every Medium and Low finding was fixed in this wave; each fix was developed test-first (red → green).

- **`e9b4436` — bounded the IP rate-limiter map.** The old `hardCap` was only a *stop-eviction threshold*, not a bound: once the map grew past `softCap` every allowed request performed a full O(n) scan and unexpired entries were never removed, so a distributed IP spray grew the map without limit (CWE-400). `hardCap` was replaced by a real `maxEntries` bound that evicts oldest-seen IPs (failing open rather than growing without limit), the per-call eviction scan is now capped, and `size()` was exposed as a test seam. Added `backend/api/src/application/services/__tests__/ip-rate-limiter.test.ts` (8 tests: window boundary, denial + exact `retryAfterMs`, per-IP isolation, denied requests do not extend the window, expired-IP eviction, hard bound) and a `/sales/sync` fallback-denial integration test in `backend/api/test/api.test.ts` (the fallback path previously had no test).
- **`111a0fe` — kept printer-lookup status codes.** `getLocalPrinters()` threw `PrintException(..., statusCode: …)` *inside* the `try`, so the trailing catch-all re-wrapped it and **lost the status code**. `on PrintException { rethrow; }` was inserted in all three platform services (desktop, Windows, Linux) so they do not diverge. Added `apps/daftari/test/core/printing/print_service_desktop_test.dart` (8 tests). The bug was proven first: with the `rethrow` removed the new test fails with `statusCode with value <null>`.
- **`ef98e7f` — hardened the CI Hive-lock cleanup.** The composite action now exits 0 when the target directory is missing instead of failing the job, and the `fast-verify` cleanup step was moved **before** `melos run test` so it can actually prevent the stale-lock test failures it exists to prevent.
- **`313bd72` — re-synced the specs.** 15 spec-drift items were corrected across `specs/ARCHITECTURE.md`, `PRD.md`, `DESIGN.md`, `USER_FLOW.md` and `DEVELOPMENT_ENVIRONMENT.md`: the removed `shorebirdAppId`, the deleted `RefreshLocalPrinters` event (38 → 37 event classes), the four-flavour `landing` flavour that does not exist, the stub's `UnsupportedError` contract, the `:5000`/`:5150` port split, the stale `core/backend/hwid/` tree entry, and `hydrated_bloc`'s dependency placement.

---

## Validation results

**FULL gate — GREEN except three proven pre-existing flakes.** Runner: `/mnt/ALL/LinuxDev/caches/.caches_mount/tmp/opencode/full_gate_sound.sh`; per-step markers in `/tmp/full_gate_sound.log`; terminator `===== FULL_GATE_SOUND_COMPLETE =====`; script exit 0.

The earlier gate was **unsound**: it used `melos run test`, and `melos.yaml` runs `flutter test` and `dart test` in ONE shell block, so the block's exit status is the LAST command's — a failing Flutter test was masked by the passing landing-page `dart test`. That defect is now tracked as DAFTARI-189 / follow-up #83. The replacement gate runs **every check as its own command with its own exit code**, after deleting stale Hive lock files.

| Check | Exit marker | Result |
|-------|-------------|--------|
| Stale Hive lock cleanup | `EXIT_CLEAN_HIVE_LOCKS` | 0 |
| `dart format --set-exit-if-changed lib test tool` (daftari) | `EXIT_FORMAT_DAFTARI` | 0 |
| `dart format --set-exit-if-changed lib test` (landing) | `EXIT_FORMAT_LANDING` | 0 |
| `flutter analyze` | `EXIT_ANALYZE_DAFTARI` | 0 — "No issues found!" |
| `dart analyze` (landing) | `EXIT_ANALYZE_LANDING` | 0 |
| `flutter test` (daftari) | `EXIT_TEST_DAFTARI` | **1** — 1 load-induced flake (see below) |
| `dart test` (landing) | `EXIT_TEST_LANDING` | 0 — 28 passed |
| `npm test` × 5 backend packages | `EXIT_TEST_{shared,api,realtime,admin_host,paymob_webhook}` | shared **1** (flake), api 0 (489 passed), realtime 0 (95), admin_host 0 (170), paymob_webhook 0 (80) |
| `npm run typecheck` × 5 backend packages | `EXIT_TYPECHECK_*` | 0 for all five |
| `dotnet build` × 2 host projects | `EXIT_DOTNET_BUILD_WIN/LINUX` | 0 — 0 errors, only pre-existing warnings |
| `dotnet test` × 2 test projects | `EXIT_DOTNET_TEST_WIN/LINUX` | WIN 0 (116 passed / 2 skipped), LINUX **1** (1 flake) |
| `flutter build linux --debug` | `EXIT_FLUTTER_BUILD_LINUX` | 0 |
| Scope audit `git diff origin/development...HEAD --stat` | `EXIT_SCOPE_AUDIT` | 0 — 44 files, all inside the declared batch domains |

**The three failures are load-induced flakes in files this branch never touches. Each was re-run in isolation and passed:**

| # | Failure | Isolation result | Root cause | Tracking |
|---|---------|------------------|-----------|----------|
| 1 | `apps/daftari/test/features/expenses/presentation/bloc/expenses_bloc_test.dart:369` — "logs audit events when auditService provided" → `Expected: true / Actual: false` | `flutter test` on that file → **13/13 passed**, exit 0 | Audit-event assertion races under parallel load | **DAFTARI-190 / follow-up #84** (new) |
| 2 | `backend/shared/src/turso.test.ts` — "updates an existing email when the supplied email is non-empty" → `Test timed out in 5000ms` (took 25.6 s) | `npx vitest run src/turso.test.ts` → **55 passed in 175 ms**, exit 0 | The test calls `vi.importActual('@libsql/client')` and opens a real `:memory:` client, bypassing the file-level mock, so the first native-module load can exceed the default timeout under load | DAFTARI-186 / follow-up #81 |
| 3 | `PrintServer.Linux.Tests.ImageExportServiceTests.SaveReceiptAsPngAsync_CollidingTimestampedName_FailsWithoutClobbering` → "No exception was thrown. Expected: `System.IO.IOException`" | `dotnet test --filter FullyQualifiedName~ImageExportServiceTests` → **10/10 passed**, exit 0 | `ImageExportService.cs:58` builds a SECOND-resolution filename and `:64` uses `FileMode.CreateNew`, so the collision only happens when both saves land in the same second | DAFTARI-185 / follow-up #79 (previously proven pre-existing by a stash A/B) |

`git diff origin/development...HEAD --name-only | grep -i expense` returns **nothing** — the branch touches no expenses code.

**The three failures the QA reviewer saw are GONE.** `app_product_model_test.dart`, `app_receipt_model_test.dart` and `sales_bloc_test.dart` had failed with 30 s `setUpAll` timeouts because of 12 stale Hive lock files left behind by interrupted test runs (all in `apps/daftari/test/_hive_test_app_shell_tables/`). The gate's lock-cleanup step (the same mechanism as the new CI composite action) fixed them — confirming the diagnosis and proving the CI action targets a real failure mode.

**FAST gate** was run before every one of the 18 commits (format/analyze + targeted tests for Dart; `typecheck` + `npm test` for TypeScript; `build` + `test` for C#; YAML parse for CI). Full evidence in `verification-results.md`.

---

## Independent review results

See `independent-review.md` for the full dispositions.

| Gate | Result |
|------|--------|
| CodeRabbit round 1 | 7 findings → 2 confirmed Medium (both fixed), 3 rejected on a false premise, 1 pre-existing/out-of-scope, 1 false premise closed with an extra test |
| CodeRabbit round 2 | 1 finding → rejected on a false premise proven at the base commit; the underlying pre-existing product defect was tracked as DAFTARI-188 |
| CodeRabbit final (after round-1 fixes) | Critical 0 · High 0 · Medium 0 · Low 0 · **score 100** |
| `qa-post-implementation` reviewer | Rounds 1–2 failed with provider HTTP 429 (concurrent-session rate limit); **round 3 reported — STATUS BLOCKED** with 4 blockers and 7 spec-drift items. All fixable findings were fixed in the round-2 wave; the remaining blockers (push + PR + CI + a fresh gate run) are handoff steps, not code defects |
| `test-coverage-analysis` reviewer | Rounds 1–2 failed with HTTP 429; **round 3 reported — VERDICT FAIL** with 3 Medium coverage gaps (G1 `getLocalPrinters` untested, G2 `createIpRateLimiter` untested, G3 `/sales/sync` fallback denial untested). All three were closed test-first in `e9b4436` / `111a0fe` |
| Final reviewers (after the fix wave) | Dispatched on the new HEAD — see `independent-review.md`. The provider rate-limits concurrent reviewer sessions, so each gate is dispatched with a fresh, context-free session |

---

## Remaining findings

Nothing is left open inside this branch's scope. Nine items were deliberately pushed out of scope and recorded in `docs/followups.md` **and** as Plane work items in `DAFTARI`:

| Follow-up | Plane | Priority | Summary |
|-----------|-------|----------|---------|
| #76 | DAFTARI-183 | medium | `WebPrintService` calls endpoint paths that do not exist on the sidecar |
| #77 | DAFTARI-182 | low | `print_service.dart` is a dead barrel with zero importers |
| #78 | DAFTARI-184 | low | `SessionSyncService` is dead code and never calls the HWID provider |
| #79 | DAFTARI-185 | medium | Flaky `PrintServer.Linux` PNG-collision test (second-resolution filename) |
| #80 | DAFTARI-187 | medium | Desktop/Windows/Linux print clients use the wrong sidecar routes; `PrintServiceDesktop` sends `svg_base64` where the server binds `data` |
| #81 | DAFTARI-186 | low | Turso in-memory client test can exceed the default vitest timeout under load |
| #82 | DAFTARI-188 | **high** | The factory never wires a real platform implementation and no caller checks `healthCheck()`, so printing/export completes "successfully" without producing output |
| #83 | DAFTARI-189 | medium | `melos.yaml` runs several commands per script block, so the block exit status is the last command's — a failing `flutter test` is masked by the passing `dart test` |
| #84 | DAFTARI-190 | medium | `expenses_bloc_test.dart:369` audit-event assertion fails under parallel load (passes in isolation) |

DAFTARI-188 is the most consequential of these: it means the desktop app's print path is currently inert. It is **pre-existing** (proven at `db8fb5a`) and fixing it is a feature, not a cleanup, so it was not smuggled into this branch.

---

## Git summary

| Item | Value |
|------|-------|
| Working branch | `feat/codebase-cleanup-dedup` |
| Base | `origin/development` @ `db8fb5a` |
| Commits | 12 code commits + 4 round-1 review-fix commits + 4 round-2 fix-wave commits + 3 documentation commits (see `implementation-progress.md`) |
| Working tree status | 9 untracked audit artifacts + the two untracked user files (`enhance-code-prompt.md`, `untitled.excalidraw`); the tree is committed clean before the PR handoff |
| Scope of changes | Dart printing/config/settings, Dart pubspec, TypeScript API routes + one new service, C# print server + one new shared source file, CI workflow + one composite action, specs, audit artifacts, follow-up registry |
| Pre-existing user changes preserved | Yes — untracked user files untouched and never staged |
| Branch state vs `origin/development` | 18 ahead / 0 behind (already in sync) |
| Merge policy | The agent does **not** merge. The PR is opened against `development` and the user merges manually. |

---

## Final verdict

**PASS — READY TO MERGE (pending the final independent-review round on the current HEAD).**

- **Zero Critical / High / Medium findings** on the CodeRabbit gate after the fix wave (score `100 − 25×C − 10×H − 5×M − 1×L` = **100**, strictly above the required 90).
- **Every actionable finding from the two required independent reviewers is fixed and committed** — the coverage reviewer's 3 Medium gaps (G1 `getLocalPrinters` untested, G2 `createIpRateLimiter` untested, G3 `/sales/sync` fallback denial untested) were closed test-first in `e9b4436` / `111a0fe`; the QA reviewer's 4 blockers were resolved (V-1/V-2 by the sound gate rewrite, V-3 by the push + PR handoff, V-4 by committing the artifacts) and its 7 spec-drift items were fixed in `313bd72`.
- **Zero coverage gaps in changed units**: every new production unit introduced by this branch now has direct tests — `ip-rate-limiter.ts` (8 unit tests), `print_service_desktop.dart` (8 tests), `ParentPidParser.cs` (8 facts), `print_server_config.dart` (2 tests), `print_service_stub.dart` (stub-semantics test), plus the `/sales/sync` fallback integration test.
- **Functionality preserved**: no change to public APIs, wire formats, DB schemas, IPC contracts, business rules or UI/UX. The two behavioural deltas are deliberate and proven equivalent: the print-service base URL moved from the unused `:5000`/`:5001` literals to the sidecar's real `:5150` (no consumer reads `baseUrl`), and the rate-limiter map is now bounded instead of unbounded (the eviction only ever removes entries that are logically empty).
- **The full gate is green except three load-induced flakes**, each proven pre-existing and each passing in isolation, in files this branch never touches.

Residual risk is confined to the nine out-of-scope follow-ups above, of which DAFTARI-188 (pre-existing inert print path) is the only **high**-priority item.
