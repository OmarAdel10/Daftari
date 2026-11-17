# Final Report — Daftari Codebase Cleanup

**Branch:** `feat/codebase-cleanup-dedup`
**Base:** `origin/development` @ `db8fb5a`
**Plane project:** `DAFTARI`
**Reviewed HEAD:** `a0b195d` + `26321f4` + `d095d82` + this artifact commit (30 commits ahead of base, 0 behind) — the sound full gate was run on `8fe3802` (25 ahead)
**Verdict:** CONDITIONAL PASS — every branch-owned gate step is green (one known pre-existing timing flake failed once on the final gate's first attempt and passed on its immediate retry), and every finding raised by the review rounds to date is either fixed in-branch or tracked as an explicit out-of-scope follow-up. CodeRabbit round 3 is now green (score 100 on `a0b195d`; 2 Low findings fixed, 1 `major` rejected on a false premise), so merge-readiness now depends on the fresh QA + coverage dispatches on the current HEAD, green PR checks, and the user's manual merge — this report does not assert READY TO MERGE ahead of those.

---

## Executive summary

A full read-only audit of the Daftari monorepo (Flutter app + shared `lib/`, Flutter Web admin, Jaspr landing page, 5 TypeScript backend packages, 3 C# projects, CI/CD, specs and docs) produced **11 tracked findings**: 10 confirmed and actionable, 1 later raised during implementation. All 10 confirmed findings are now **resolved**; the 11th (a suspected CI duplication) was **rejected with evidence** after a line-by-line reading showed the two jobs are complementary, not redundant.

The cleanup is **deliberately narrow, and it is not a blanket "no behaviour changed" claim**. Every change was verified against the base commit `db8fb5a` rather than against assumptions: where a duplicate abstraction existed in a dead tree, the tree was deleted; where a duplicate existed in live code, the shared implementation was extracted with byte-identical logic; where a value was duplicated in configuration, a single constant now owns it.

**The deliberate and unintentional deltas are enumerated, not asserted away:**

| # | Delta | Nature | Reachability |
|---|-------|--------|---------------|
| 1 | The per-IP rate-limiter map is now **hard-bounded** (`maxEntries`, oldest-seen eviction, fail-open) and the per-call eviction scan is capped; `maxEntries` is a **required** option | Behaviour change — intentional, security hardening of an unbounded map (CWE-400) | The limiter maps are created per `createApp()`; see delta 6 — the bound only takes effect wherever a limiter instance outlives one request |
| 2 | Print-service base-URL literals `:5000` / `:5001` → the sidecar's real `:5150` | Value change | No consumer reads `PrintService.baseUrl`; the platform services are not wired by the factory (delta 5) |
| 3 | The dead `apps/daftari/lib/core/hwid/` tree was deleted | Removal of unreachable code (0 importers) | None — proven at the base commit |
| 4 | `hydrated_bloc` moved to `dev_dependencies` | Packaging change | None — 27 test imports, 0 `lib/` imports |
| 5 | `PrintServiceFactory` semantics unchanged (the no-op stub was already what the factory returned) | No change | The factory still returns the no-op stub — a pre-existing product defect, tracked as DAFTARI-188 |
| 6 | The Worker still rebuilds the app (and therefore the limiter state) **per request** | **Pre-existing — not a branch delta** | Verified at base `db8fb5a:backend/api/src/index.ts`; `backend/api/src/index.ts` and `backend/api/src/app.ts` are **not** changed units of this branch — tracked as DAFTARI-191 / #85 |

Seven further real defects that the audit had not originally recorded were discovered during implementation and the review rounds. They are now tracked rather than silently fixed, because fixing them would change runtime behaviour outside the approved scope: DAFTARI-183, -184, -185, -186, -187, -188 and the rate-limiter lifecycle defect DAFTARI-191.

---

## Coverage statistics

| Metric | Value |
|--------|-------|
| Applications audited | 5 (Flutter desktop app, Flutter Web admin, Jaspr landing, TypeScript backend × 5 packages, .NET 8 print server × 3 projects) |
| Dart packages | 2 (`apps/daftari`, `landing_page`) |
| TypeScript packages | 5 (`shared`, `api`, `realtime`, `admin_host`, `paymob_webhook`) |
| C# projects | 3 (`PrintServer`, `PrintServer.Linux`, `PrintServer.Tests`, `PrintServer.Linux.Tests`) |
| First-party source directories audited | 100% accounted for |
| Files changed by this branch | 55 (19 added, 7 deleted, 29 modified; +2 854 / −979 as of `a0b195d`) |
| Files deleted | 7 (the dead `apps/daftari/lib/core/hwid/` tree) |
| Files introduced | 19 — 2 shared implementations (`print_server_config.dart`, `ip-rate-limiter.ts`), 1 shared C# source file (`PrintServer.Common/ParentPidParser.cs`), 1 CI composite action, 6 test files, 9 audit artifacts |
| Files modified | 29 |

---

## Before-and-after metrics

| Metric | Before (`db8fb5a`) | After (`130b4d4` + this SHA-pinning commit) | Delta |
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
| Flutter app tests | 1618 pass | 1645 pass | +27 |
| Landing page tests | 28 pass | 28 pass | 0 |
| Backend tests (5 packages) | 1095 pass | 1107 pass | +12 |
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

### Round-3 fix wave (`68d0696`, `2b6e0a2`, `d5fa35e`, `73e3db8`, `a4ab4d3`, `8fe3802`, `130b4d4` + this SHA-pinning commit)
Driven by the round-4 QA report (**STATUS BLOCKED**, Risk High) and the round-5 coverage report (**VERDICT FAIL**). This is **fix round 3 of 3** — the cap set by `implement-review-ship`; anything still open at its end is a human checkpoint, not a fourth round.

- **`68d0696` — covered the Linux and Windows platform clients.** `LinuxPrintService.getLocalPrinters` and `WindowsPrintService.getLocalPrinters` had the same `on PrintException { rethrow; }` branch added in `111a0fe` but no behaviour test. Two new test files (8 + 8 tests) now cover the happy path, the empty list, the endpoint + `Accept` header, a custom base URL, HTTP 503 → `PrintException` with `statusCode == 503`, `ClientException` and `TimeoutException` → `originalError` preserved, and malformed JSON. **Proven first:** with the `rethrow` removed, both 503 tests fail with `statusCode with value <null>` (`MUTATION_TEST_EXIT=1`).
- **`2b6e0a2` — proved the limiter's eviction semantics.** The soft-cap and hard-bound assertions were tightened from `<=` to exact counts, a hard-bound fail-open test now proves that an evicted-but-active IP is re-admitted with a fresh budget, and a new test seeds 1 500 expired IPs to prove the per-call eviction scan is bounded and that repeated calls finish the eviction. **Proven first:** removing the `maxEntries` eviction block (`MUTATION_MAX_ENTRIES_EXIT=1`) and the scan cap (`MUTATION_SCAN_CAP_EXIT=1`) each break the new tests.
- **`d5fa35e` — made the limiter bound mandatory.** `maxEntries` is now a **required** option (`IpRateLimiterOptions.maxEntries: number`); a limiter can no longer be constructed without a bound. **Proven first:** `npm run typecheck` failed with 6 × TS2345 before the test constructions were updated (`TYPE_CHECK_RED_EXIT=2`) and with TS2344 + 2 × TS18048 when the option was reverted to optional (`TYPE_CHECK_MUTATION_EXIT=2`). Both production call sites already passed `maxEntries: 10_000`, so no route changed.
- **`73e3db8` — corrected the HWID facts in the specs** (QA findings SPEC-1…SPEC-5): the live HWID tree, the Linux-vs-Windows provider selection, the async `getDeviceId()` / `verifyLicense()` contracts, the obsolete WMI / `dmidecode` / `lsblk` algorithms, and the dead `SessionSyncService` citation.
- **`a4ab4d3` — recorded 8 out-of-scope findings** in `docs/followups.md` #85–#92 and as Plane items DAFTARI-191…198, including the high-priority DAFTARI-191 (the Worker rebuilds limiter state per request — proven pre-existing at base `db8fb5a`, and `backend/api/src/index.ts` is not a changed unit of this branch).
- **`8fe3802` — removed the trailing whitespace** the QA reviewer flagged at `findings.md:106,141,159`; `git diff --check` is now clean branch-wide.
- **`130b4d4` — rewrote the audit artifacts** for truthfulness (AUD-1…AUD-10): no blanket "READY TO MERGE" or "no behaviour changed" claim, the deliberate deltas enumerated above, every gate reported per step (PASSED / FAILED→GREEN ON RETRY / SKIPPED / NOT RUN), and the review-round findings recorded with their dispositions.

---

## Validation results

**FULL gate — reported per step, never aggregated.** Runner: `/mnt/ALL/LinuxDev/caches/.caches_mount/tmp/opencode/full_gate_sound.sh`; per-step markers in `/tmp/full_gate_sound.log`; terminator `===== FULL_GATE_SOUND_COMPLETE =====`; script exit 0. Run on HEAD `8fe3802`: **20 of 21 steps PASSED**; the `PrintServer.Linux.Tests` step **FAILED on its first attempt** (the known pre-existing PNG-collision timing flake) and **passed on the immediate retry** (106/106, plus a 10/10 isolated run of the flaky test class).

The earlier gate was **unsound**: it used `melos run test`, and `melos.yaml` runs `flutter test` and `dart test` in ONE shell block, so the block's exit status is the LAST command's — a failing Flutter test was masked by the passing landing-page `dart test`. That defect is now tracked as DAFTARI-189 / follow-up #83. The replacement gate runs **every check as its own command with its own exit code**, after deleting stale Hive lock files.

| Check | Exit marker | Status | Result |
|-------|-------------|--------|--------|
| Stale Hive lock cleanup | `EXIT_CLEAN_HIVE_LOCKS` | **PASSED** | 0 — locks removed before any test step |
| `dart format --set-exit-if-changed lib test tool` (daftari) | `EXIT_FORMAT_DAFTARI` | **PASSED** | 0 |
| `dart format --set-exit-if-changed lib test` (landing) | `EXIT_FORMAT_LANDING` | **PASSED** | 0 |
| `flutter analyze` | `EXIT_ANALYZE_DAFTARI` | **PASSED** | 0 — "No issues found!" |
| `dart analyze` (landing) | `EXIT_ANALYZE_LANDING` | **PASSED** | 0 |
| `flutter test` (daftari) | `EXIT_TEST_DAFTARI` | **PASSED** | 0 — `11:03 +1645: All tests passed!` |
| `dart test` (landing) | `EXIT_TEST_LANDING` | **PASSED** | 0 — 28 passed |
| `npm test` × 5 backend packages | `EXIT_TEST_{shared,api,realtime,admin_host,paymob_webhook}` | **PASSED** | 0 for all five — shared 270, api 492, realtime 95, admin_host 170, paymob_webhook 80 |
| `npm run typecheck` × 5 backend packages | `EXIT_TYPECHECK_*` | **PASSED** | 0 for all five |
| `dotnet build` × 2 host projects | `EXIT_DOTNET_BUILD_WIN/LINUX` | **PASSED** | 0 for both — 0 errors, only pre-existing warnings |
| `dotnet test` (Windows host) | `EXIT_DOTNET_TEST_WIN` | **PASSED** | 0 — 116 passed / 2 skipped |
| `dotnet test` (Linux host) | `EXIT_DOTNET_TEST_LINUX` | **FAILED → GREEN ON RETRY** | 1 on the first attempt (PNG-collision flake, DAFTARI-185 / #79); isolation 10/10; retry 106/106 |
| `flutter build linux --debug` | `EXIT_FLUTTER_BUILD_LINUX` | **PASSED** | 0 |
| Scope audit `git diff origin/development...HEAD --stat` | `EXIT_SCOPE_AUDIT` | **PASSED** | 0 — 55 files (19 added, 7 deleted, 29 modified; +2 853 / −979 as of `130b4d4`), all inside the declared batch domains |
| Branch sync | — | **PASSED** | 25 ahead / 0 behind at the gate run (`8fe3802`); 27 ahead / 0 behind after `130b4d4` + this SHA-pinning commit (base `db8fb5a`) |

**Three failures surfaced during sound-gate runs. Each is a race in a file this branch never touches, and each was re-run in isolation and passed. On the final run (`8fe3802`) only flake 3 reproduced — on its first attempt — and the immediate retry of that step was green:**

| # | Failure | Isolation result | Status on the final run | Root cause | Tracking |
|---|---------|------------------|-------------------------|-----------|----------|
| 1 | `apps/daftari/test/features/expenses/presentation/bloc/expenses_bloc_test.dart:369` — "logs audit events when auditService provided" → `Expected: true / Actual: false` | `flutter test` on that file → **13/13 passed**, exit 0 | **DID NOT REPRODUCE** — `EXIT_TEST_DAFTARI=0`, `11:03 +1645` | Audit-event assertion races under parallel load | **DAFTARI-190 / follow-up #84** |
| 2 | `backend/shared/src/turso.test.ts` — "updates an existing email when the supplied email is non-empty" → `Test timed out in 5000ms` (took 25.6 s) | `npx vitest run src/turso.test.ts` → **55 passed in 175 ms**, exit 0 | **DID NOT REPRODUCE** — `EXIT_TEST_shared=0`, 270 passed | The test calls `vi.importActual('@libsql/client')` and opens a real `:memory:` client, bypassing the file-level mock, so the first native-module load can exceed the default timeout under load | DAFTARI-186 / follow-up #81 |
| 3 | `PrintServer.Linux.Tests.ImageExportServiceTests.SaveReceiptAsPngAsync_CollidingTimestampedName_FailsWithoutClobbering` → "No exception was thrown. Expected: `System.IO.IOException`" | `dotnet test --filter FullyQualifiedName~ImageExportServiceTests` → **10/10 passed**, exit 0; full-project retry → **106/106 passed** | **REPRODUCED on the first attempt** (`EXIT_DOTNET_TEST_LINUX=1`), **GREEN on retry** | `ImageExportService.cs:58` builds a SECOND-resolution filename and `:64` uses `FileMode.CreateNew`, so the collision only happens when both saves land in the same second | DAFTARI-185 / follow-up #79 (proven pre-existing by a stash A/B) |

`git diff origin/development...HEAD --name-only | grep -i expense` returns **nothing** — the branch touches no expenses code.

**The three failures the QA reviewer saw are GONE.** `app_product_model_test.dart`, `app_receipt_model_test.dart` and `sales_bloc_test.dart` had failed with 30 s `setUpAll` timeouts because of 12 stale Hive lock files left behind by interrupted test runs (all in `apps/daftari/test/_hive_test_app_shell_tables/`). The gate's lock-cleanup step (the same mechanism as the new CI composite action) fixed them — confirming the diagnosis and proving the CI action targets a real failure mode.

**FAST gate** was run before every one of the 26 commits (format/analyze + targeted tests for Dart; `typecheck` + `npm test` for TypeScript; `build` + `test` for C#; YAML parse for CI; `git diff --check` for docs). Full evidence in `verification-results.md`.

**CI:** run `43886527057` on the pushed branch → overall **success** (5m22s). Per the QA round-4 reviewer's job-level read, the `flutter-matrix` and packaging jobs were **SKIPPED** in that run; the per-job list could not be re-read in this wave (the GitHub API was unreachable), so it is recorded as the reviewer's observation rather than independently re-verified evidence. The pull-request workflow runs again once the PR is opened.

**Mandatory review sections NOT RUN in the round-4 QA dispatch** (provider HTTP 429 / content-safety errors): full code reviewer, security auditor, broad spec compliance, full test coverage. They are re-dispatched on the final HEAD before handoff.

---

## Independent review results

See `independent-review.md` for the full dispositions.

| Gate | Result |
|------|--------|
| CodeRabbit round 1 | 7 findings → 2 confirmed Medium (both fixed), 3 rejected on a false premise, 1 pre-existing/out-of-scope, 1 false premise closed with an extra test |
| CodeRabbit round 2 | 1 finding → rejected on a false premise proven at the base commit; the underlying pre-existing product defect was tracked as DAFTARI-188 |
| CodeRabbit final (after round-1 fixes) | Critical 0 · High 0 · Medium 0 · Low 0 · **score 100** |
| CodeRabbit round 3 (on the artifact wave, `a0b195d`) | 3 findings → 1 `major` rejected on a false premise (the dead `print_service.dart` barrel has zero importers), 2 `minor` fixed (`26321f4` cloud-flavor spec line, `d095d82` follow-up #76 routes) · Critical 0 · High 0 · Medium 0 · Low 0 · **score 100** |
| `qa-post-implementation` reviewer | Rounds 1–2 failed with provider HTTP 429 (concurrent-session rate limit); **round 3 reported — STATUS BLOCKED** with 4 blockers and 7 spec-drift items (all actionable items fixed in the round-2 wave); **round 4 reported — STATUS BLOCKED**, Risk High, 3 High / 12 Medium / 4 Low findings, with 4 mandatory review sections NOT RUN. Dispositions: SEC-1 (pre-existing Worker limiter lifecycle) → DAFTARI-191 / #85; SEC-1-TEST → partly closed in `2b6e0a2`, Worker half → DAFTARI-192 / #86; CODE-L1 → fixed in `d5fa35e`; SEC-L1 → DAFTARI-193 / #87; SPEC-1…SPEC-5 → fixed in `73e3db8`; AUD-1…AUD-10 → fixed in this artifact wave |
| `test-coverage-analysis` reviewer | Rounds 1–2 failed with HTTP 429; **round 3 reported — VERDICT FAIL** with 3 Medium coverage gaps (G1 `getLocalPrinters` untested, G2 `createIpRateLimiter` untested, G3 `/sales/sync` fallback denial untested), all closed test-first in `e9b4436` / `111a0fe`; **round 5 reported — VERDICT FAIL** with 3 Medium gaps (M1 Linux `getLocalPrinters`, M2 Windows `getLocalPrinters`, M3 limiter fail-open semantics) — all closed in `68d0696` / `2b6e0a2` — plus 4 Low gaps (the bounded-scan gap closed in `2b6e0a2`; the rest tracked as DAFTARI-194…198) |
| Final reviewers (after fix round 3) | CodeRabbit round 3 **PASSED** on `a0b195d` (score 100; 2 Low fixed, 1 `major` rejected on a false premise). The fresh QA + coverage pair was dispatched on `a0b195d` with context-free sessions (`ses_e184bfa2fffed6No6l8QDIcXLW`, `ses_e184bfa2effe9NnBubMDczfV0a`); the provider rate-limits concurrent reviewer sessions, so each gate is dispatched separately. The results are recorded in `independent-review.md` |

---

## Remaining findings

Nothing is left open inside this branch's scope. Seventeen items were deliberately pushed out of scope and recorded in `docs/followups.md` **and** as Plane work items in `DAFTARI` (9 from the audit and implementation rounds, 8 from the review rounds):

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
| #85 | DAFTARI-191 | **high** | The Worker rebuilds the app (and therefore the per-IP limiter state) on every request, so the 31st request in a window is not rate-limited. **Pre-existing** — the base `db8fb5a` `backend/api/src/index.ts` already did this, and that file is not a changed unit of this branch. Fix: hoist the limiter/app state to module scope |
| #86 | DAFTARI-192 | medium | No Worker-level rate-limiter lifecycle test (request 31 must return 429). Blocked on #85 — the test would fail until the state is hoisted |
| #87 | DAFTARI-193 | low | `CF-Connecting-IP` is trusted without an explicit trust boundary (`routes/sessions.ts:108-113`, `routes/sales.ts:91`) |
| #88 | DAFTARI-194 | low | `_pidsListeningOnPrintServerPort` (`print_server_manager.dart:348`) has no test — the netstat/ss parsing is unverified |
| #89 | DAFTARI-195 | low | `_pidsListeningOnPrintServerPort` (`print_server_manager_linux.dart:370`) has no test |
| #90 | DAFTARI-196 | low | The `_spawn` environment wiring (`ASPNETCORE_URLS`, `print_server_manager_linux.dart:208/237`) is not observed by any test seam |
| #91 | DAFTARI-197 | low | The Linux manager environment test (`test/linux/print_server_manager_linux_test.dart:30-79`) builds its expected value from the production helper and skips its assertions, so it cannot fail |
| #92 | DAFTARI-198 | low | `test/core/printing/print_service_test.dart:16-19` claims "returns new PrintServiceStub" but never compares two `create()` results |

DAFTARI-188 is the most consequential of these: it means the desktop app's print path is currently inert. It is **pre-existing** (proven at `db8fb5a`) and fixing it is a feature, not a cleanup, so it was not smuggled into this branch. DAFTARI-191 is the highest-priority *new* item from the review rounds: the rate limiter this branch hardened only limits anything if its state survives a request — and today it does not.

---

## Git summary

| Item | Value |
|------|-------|
| Working branch | `feat/codebase-cleanup-dedup` |
| Base | `origin/development` @ `db8fb5a` |
| Commits | 30 — 8 batch commits + 11 round-1/round-2 review-fix and documentation commits + 7 round-3 fix-wave and artifact commits + 1 SHA-pinning commit + 2 CodeRabbit-round-3 Low fixes + this artifact commit (see `implementation-progress.md` for the full list) |
| Working tree status | the 9 audit artifacts are committed explicitly (never `git add -A`); the two untracked user files (`enhance-code-prompt.md`, `untitled.excalidraw`) stay untracked and untouched |
| Scope of changes | Dart printing/config/settings, Dart pubspec, TypeScript API routes + one new service, C# print server + one new shared source file, CI workflow + one composite action, specs, audit artifacts, follow-up registry |
| Pre-existing user changes preserved | Yes — untracked user files untouched and never staged |
| Branch state vs `origin/development` | 30 ahead / 0 behind after `d095d82` + this artifact commit (already in sync) |
| Merge policy | The agent does **not** merge. The PR is opened against `development` and the user merges manually. |

---

## Final verdict

**CONDITIONAL PASS — the branch's own gates are green per step; merge-readiness still depends on the final independent-review round on the current HEAD, green PR checks, and the user's manual merge.**

- **Zero Critical / High / Medium findings** on the CodeRabbit gate: rounds 1–2 after the round-1 fixes and round 3 on `a0b195d` (score `100 − 25×C − 10×H − 5×M − 1×L` = **100**, strictly above the required 90). Round 3 produced 3 findings — 2 Low fixed (`26321f4` spec cloud-flavor correction, `d095d82` follow-up #76 route correction) and 1 `major` rejected on a false premise (the dead `print_service.dart` barrel has zero importers; every consumer imports `print_service_interface.dart` directly).
- **Every actionable finding raised by the independent reviewers to date is either fixed in-branch or explicitly tracked as an out-of-scope follow-up**: the round-3 coverage gaps (G1 `getLocalPrinters`, G2 `createIpRateLimiter`, G3 `/sales/sync` fallback denial) were closed test-first in `e9b4436` / `111a0fe`; the round-4 QA findings (SPEC-1…SPEC-5) were fixed in `73e3db8`; the round-5 coverage gaps (M1/M2 platform `getLocalPrinters`, M3 limiter fail-open) were closed in `68d0696` / `2b6e0a2`; the audit-accuracy findings (AUD-1…AUD-10) were fixed in this artifact wave; and the out-of-scope findings (SEC-1, SEC-1-TEST, SEC-L1 and the test-quality gaps) are tracked in `docs/followups.md` #85–#92 and Plane DAFTARI-191…198.
- **Coverage of the changed units**: every new production unit introduced by this branch has direct tests — `ip-rate-limiter.ts` (11 unit tests, including the fail-open and bounded-scan semantics), `print_service_desktop.dart` (8), `print_service_linux.dart` (8), `print_service_windows.dart` (8), `ParentPidParser.cs` (8 facts), `print_server_config.dart` (2), the stub semantics, plus the `/sales/sync` fallback integration test. The remaining known gaps are enumerated as Low follow-ups rather than silently omitted.
- **The deltas are enumerated, not asserted away** (see the table in the executive summary): the rate-limiter map is now hard-bounded and its per-call scan capped (delta 1); the print-service base URL moved to the sidecar's real `:5150` (delta 2, no consumer reads `baseUrl`); the dead HWID tree was deleted (delta 3, 0 importers); `hydrated_bloc` became a dev dependency (delta 4); the factory's no-op stub semantics are unchanged (delta 5); and the per-request Worker limiter state is **pre-existing**, not a branch delta (delta 6 — tracked as DAFTARI-191).
- **The full gate is green per step**, with one exception reported honestly: the `PrintServer.Linux.Tests` step failed on its first attempt on the proven pre-existing `DAFTARI-185` timing flake and passed on the immediate retry (106/106, plus a 10/10 isolated run). Two earlier load-induced flakes (expenses bloc, Turso timeout) did not reproduce. The CI run `43886527057` on the pushed branch was green overall, with the `flutter-matrix` and packaging jobs reported as SKIPPED by the QA reviewer; the four mandatory review sections that the round-4 dispatch could not run are re-dispatched on the final HEAD.

Residual risk is confined to the seventeen out-of-scope follow-ups above. Two are **high** priority: DAFTARI-188 (the pre-existing inert print path) and DAFTARI-191 (the Worker rebuilds limiter state per request, so the rate limiting hardened here only takes effect where a limiter instance outlives one request).
