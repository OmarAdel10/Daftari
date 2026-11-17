# Verification Results — Daftari Codebase Cleanup

**Branch:** `feat/codebase-cleanup-dedup`
**Base:** `origin/development` @ `db8fb5a`
**Reviewed HEAD:** `72851e3` + this artifact commit (37 commits ahead of base, 0 behind) — the sound full gate was run on `8fe3802` (25 ahead) and re-run on the wave-4 HEAD `a361643` (see the FULL gate section)
**Plane project:** `DAFTARI`
**Verification discipline:** evidence-before-claims — every row below is a fresh command output captured during this session.

---

## FAST gate (per-commit, mandatory before EVERY commit)

| Batch | Commit | Format | Analyze / Typecheck | Targeted tests | Result |
|-------|--------|--------|---------------------|----------------|--------|
| 1 | `2bdedfb` | `dart format --set-exit-if-changed lib test` → 512 files, 0 changed (exit 0) | `flutter analyze` → "No issues found!" (exit 0) | `flutter test test/features/settings/` → 182 passed | PASS |
| 2 | `a8649dc` | 512 files, 0 changed (exit 0) | `flutter analyze` → "No issues found!" (exit 0) | `flutter test` → **1618 passed** ("All tests passed!") | PASS |
| 3 | `67fc1ca` | n/a (TypeScript) | `npm run typecheck` (backend/api) → exit 0 | `npm test` (backend/api) → **480 passed**, 28 files | PASS |
| 4 | `d5862b2` | 514 files, 0 changed on re-run (exit 0; first run auto-formatted `print_server_manager.dart`) | `flutter analyze` → "No issues found!" (exit 0) | `flutter test test/core/printing/ test/linux/print_server_manager_linux_test.dart` → **57 passed** | PASS |
| 5 | `e2c56bf` | 507 files, 0 changed (exit 0) | `flutter analyze` → "No issues found!" (exit 0) | `flutter test test/core/licensing/` → **35 passed** | PASS |
| 6 | `25d0f8c` | 507 files, 0 changed (exit 0) | `flutter analyze` → "No issues found!" (exit 0) | `flutter test test/core/config/` → **6 passed** | PASS |
| 7 | `42bfcae` | n/a (YAML) | `python3 yaml.safe_load` parsed `ci.yml` + `action.yml` OK; action shell executed → exit 0 (removed 14 stale Hive locks) | grep `_hive_test` under `.github` → exactly 1 match (the new action) | PASS |
| 8 | `50cc0c7` | `dotnet format --verify-no-changes` → exit 0 for **both** PrintServer projects (the shared file is in both compile items) | `dotnet build -c Release` → 0 errors for both projects (4 pre-existing warnings each) | `dotnet test PrintServer.Tests` → **115 passed, 2 skipped, 0 failed** (baseline 108 + 7 new parser tests) | PASS |
| R1-1 | `31560ba` (sales limiter map caps) | n/a (TypeScript) | `npm run typecheck` (backend/api) → exit 0 | `npm test` (backend/api) → **480 passed**, 28 files | PASS |
| R1-2 | `a371de1` (desktop `getLocalPrinters` → `PrintException` + 10 s timeout) | 507 files, 0 changed (exit 0) | `flutter analyze` → "No issues found!" (exit 0) | `flutter test test/core/printing/` → **48 passed** | PASS |
| R1-3 | `2668f4a` (negative parent-pid test) | n/a (C#) | `dotnet build PrintServer/PrintServer.csproj -c Release --no-restore` → 0 errors, 0 warnings | `dotnet test PrintServer.Tests` → **116 passed, 2 skipped, 0 failed** | PASS |
| R1-4 | `4782788` (follow-up registry entries) | n/a (docs) | n/a | n/a | PASS |
| R1-5 | `2c074ce` (`.gitignore` un-ignores `docs/audits/`) | n/a (config) | `git check-ignore -v docs/audits/codebase-cleanup/findings.md` → exit 1 (not ignored) | n/a | PASS |
| R2-1 | `e9b4436` (bounded IP rate-limiter map + tests) | n/a (TypeScript) | `npm run typecheck` (backend/api) → exit 0 | `npm test` (backend/api) → **489 passed**, 29 files (was 480 → +8 limiter unit tests, +1 sales fallback integration test) | PASS |
| R2-2 | `111a0fe` (`on PrintException { rethrow; }` × 3 services + desktop tests) | 508 files, 0 changed on re-run (exit 0; the first run auto-formatted the new test file) | `flutter analyze` → "No issues found!" (exit 0) | `flutter test test/core/printing/` → **56 passed** (was 48 → +8 desktop tests) | PASS |
| R2-3 | `ef98e7f` (Hive-lock cleanup guard + ordering) | n/a (YAML) | `python3 yaml.safe_load` parsed `ci.yml` (9 jobs) + `action.yml` OK | action shell executed → exit 0 | PASS |
| R2-4 | `313bd72` (spec re-sync, 15 drift items) | n/a (docs) | n/a | n/a | PASS |
| R2-5 | `53726f9` (follow-up #83 / DAFTARI-189) | n/a (docs) | n/a | n/a | PASS |
| R3-1 | `68d0696` (Linux + Windows `getLocalPrinters` tests) | 510 files, 0 changed (exit 0) | `flutter analyze` → "No issues found!" (exit 0) | `flutter test test/core/printing/print_service_linux_test.dart test/core/printing/print_service_windows_test.dart` → **16 passed** | PASS |
| R3-2 | `2b6e0a2` (limiter eviction-semantics tests) | n/a (TypeScript) | `npm run typecheck` (backend/api) → exit 0 | `npm test` (backend/api) → **491 passed**, 29 files | PASS |
| R3-3 | `d5fa35e` (required `maxEntries` limiter bound) | n/a (TypeScript) | `npm run typecheck` → exit 0 (RED proof: exit 2 with 6 × TS2345 before the test constructions were updated) | `npm test` (backend/api) → **492 passed**, 29 files | PASS |
| R3-4 | `73e3db8` (SPEC-1…SPEC-5 HWID spec re-sync) | n/a (docs) | `git diff --check` → exit 0 | n/a | PASS |
| R3-5 | `a4ab4d3` (follow-ups #85–#92 + 8 Plane items) | n/a (docs) | `git diff --check` → exit 0 | n/a | PASS |
| R3-6 | `8fe3802` (findings.md trailing whitespace) | n/a (docs) | `git diff --check` → exit 0 (branch-wide) | n/a | PASS |
| R3-7 | `130b4d4` (AUD-1…AUD-10 rewrite) | n/a (docs) | `git diff --check` → exit 0 | n/a | PASS |

| R3-8 | `a0b195d` (artifact SHA pin + scope totals) | n/a (docs) | `git diff --check` → exit 0 | n/a | PASS |
| R3-9 | `26321f4` (spec cloud-flavor correction) | 510 files, 0 changed (exit 0) | `flutter analyze` → "No issues found!" (exit 0) | n/a (documentation) | PASS |
| R3-10 | `d095d82` (follow-up #76 route correction) | 510 files, 0 changed (exit 0) | `flutter analyze` → "No issues found!" (exit 0) | n/a (documentation) | PASS |
| R3-11 | this artifact commit (CodeRabbit round-3 dispositions + final metrics) | n/a (docs) | `git diff --check` → exit 0 | n/a | PASS |
| R4-1 | `702e26e` (factory-identity test, closes G4) | 510 files, 0 changed (exit 0) | `flutter analyze` → "No issues found!" (exit 0) | `flutter test test/core/printing/print_service_test.dart` → **4 passed** (mutation: caching the stub instance fails the test) | PASS |
| R4-2 | `48523fe` (limiter soft-cap eviction test, closes G6) | n/a (TypeScript) | `npm run typecheck` (backend/api) → exit 0 | `npm test` (backend/api) → **493 passed**, 29 files (mutation: deleting active entries fails the test) | PASS |
| R4-3 | `a361643` (SPEC-01/02/03 + CODE-01 spec and comment fixes) | 510 files, 0 changed (exit 0) | `flutter analyze` → "No issues found!" (exit 0) | n/a (documentation) | PASS |
| R4-4 | this artifact commit (AUD-01…AUD-05 audit corrections + CodeRabbit round-4 Low fix + wave-4 record) | n/a (docs) | `git diff --check` → exit 0 | n/a | PASS |
| R5-1 | `72851e3` (CodeRabbit round-5 Low fix: the device-session flow in `specs/USER_FLOW.md` is now marked as planned and not wired) | 510 files, 0 changed (exit 0) | `flutter analyze` → "No issues found!" (exit 0) | n/a (documentation) | PASS |
| R5-2 | this artifact commit (CodeRabbit round-5 record + wave-4 coverage round-7 record) | n/a (docs) | `git diff --check` → exit 0 | n/a | PASS |

### Staged-diff scans (every commit)

`git diff --staged` reviewed before each commit; scope checked against the batch's declared domain.

| Batch | Files in commit | Scope | `print`/`debugPrint` added | Secrets |
|-------|-----------------|-------|--------------------------|---------|
| 1 | 2 | settings bloc + docs/followups.md | none | none |
| 2 | 2 | pubspec.yaml + pubspec.lock | none | none |
| 3 | 3 | backend/api rate-limiter helper + 2 routes | none | none |
| 4 | 12 | apps/daftari printing layer + printing tests + docs/followups.md | none | none |
| 5 | 12 | 7 deleted dead HWID files + 4 spec files + docs/followups.md | none | none |
| 6 | 1 | apps/daftari/lib/core/config/env_config.dart | none | none (the `_firebaseWebApiKey` line visible in diff CONTEXT is pre-existing public-by-design config, not added) |
| 7 | 2 | new composite action + ci.yml | none | none |
| 8 | 7 | shared parser + 2 Program.cs + 2 csproj + tests + docs/followups.md | none | none |

---

## Regression evidence collected during implementation

| Check | Baseline (`development`) | After cleanup | Delta |
|-------|-------------------------|---------------|-------|
| `flutter test` (apps/daftari) | 1618 passed (after Batch 2's dep move) | **1645 passed** ("All tests passed!", `EXIT_TEST_DAFTARI=0`, `11:03 +1645`) | +27 (3 print-config, 8 desktop-service, 16 platform printing) |
| `flutter test` (landing_page) | 28 passed (re-measured: `dart test` → `00:00 +28: All tests passed!`) | unchanged (untouched by this branch) | 0 |
| `npm test` (backend/api) | 480 passed (28 files) | **493 passed** (29 files, `EXIT_TEST_api=0`) | +13 (11 limiter unit tests, 1 `/sales/sync` fallback integration test, 1 wave-4 limiter soft-cap active/expired mix test) |
| `npm test` (backend/shared) | 270 passed | unchanged (untouched) | 0 |
| `npm test` (backend/realtime) | 95 passed | unchanged (untouched) | 0 |
| `npm test` (backend/admin_host) | 170 passed | unchanged (untouched) | 0 |
| `npm test` (backend/paymob_webhook) | 80 passed | unchanged (untouched) | 0 |
| `dotnet test` (PrintServer.Tests) | 108 passed, 2 skipped | **116 passed, 2 skipped, 0 failed** (`EXIT_DOTNET_TEST_WIN=0`) | +8 (new `ParentPidParserTests`) |
| `dotnet test` (PrintServer.Linux.Tests) | 108 passed, 2 skipped | 106 passed — the PNG-collision test failed once on the final gate's first attempt (known pre-existing timing flake, see below) and passed on retry (`EXIT_DOTNET_TEST_LINUX=1` → retry 106/106) | flaky test, not a regression |
| `dotnet build` (both PrintServer projects) | 0 errors, 4 pre-existing warnings each | 0 errors, 4 pre-existing warnings each | 0 |

### Pre-existing flake — proven, not introduced

`PrintServer.Linux.Tests.ImageExportServiceTests.SaveReceiptAsPngAsync_CollidingTimestampedName_FailsWithoutClobbering` failed once with "Expected: typeof(System.IO.IOException)".

Root cause: `PrintServer.Linux/Services/ImageExportService.cs:58` builds the filename as `receipt_{DateTime.Now:yyyyMMdd_HHmmss}.png` — **second** resolution — and line 64 opens it with `FileMode.CreateNew`. The test assumes both saves land in the same second, so it fails whenever the clock ticks over a second boundary between them.

Proof it is pre-existing: the Batch 8 changes to `PrintServer.Linux/Program.cs` + `PrintServer.Linux/Program.cs.csproj` were stashed (base code restored), rebuilt, and the test was run 3× → **run 1 FAILED**, runs 2 and 3 passed. The changes were restored (`git stash pop`), rebuilt, and the test was run 3× → all 3 passed.

Tracked as `docs/followups.md` #79 / Plane **DAFTARI-185** (medium, Backlog, label `test`). Not fixed in this branch — out of scope.

---

## FULL gate (pre-PR handoff)

### Sound gate — the authoritative run

**Full-gate runner:** `/mnt/ALL/LinuxDev/caches/.caches_mount/tmp/opencode/full_gate_sound.sh` (writes per-step `EXIT_<label>=<code>` markers to `/tmp/full_gate_sound.log`; ends with `===== FULL_GATE_SOUND_COMPLETE =====`). **Script exit `FULL_GATE_SOUND_EXIT=0`.**

**Two sound-gate runs are recorded.** **Run A** (HEAD `8fe3802`, 25 ahead) — every step PASSED except `PrintServer.Linux.Tests`, which failed on the first attempt on the known pre-existing PNG-collision timing flake and passed on the immediate retry (106/106). **Run B** (the final wave-4 HEAD `a361643`, 34 ahead) — **all 21 steps PASSED on the first attempt**, including `PrintServer.Linux.Tests` (106/106, no flake). Per-step statuses are reported individually below: no aggregate "green" claim is made over a step that failed.

The earlier gate was **unsound**: it used `melos run test`, and `melos.yaml` runs `flutter test` and `dart test` in ONE shell block, so the block's exit status is the LAST command's — a failing Flutter test was masked by the passing landing-page `dart test`. That repo defect is tracked as `DAFTARI-189` / `docs/followups.md` #83. The replacement gate runs **every check as its own command with its own exit code**, after deleting stale Hive lock files.

| Check | Command | Exit marker | Status | Result |
|-------|---------|-------------|--------|--------|
| Stale Hive lock cleanup | `find apps/daftari/test -name '*.lock' -type f -delete` | `EXIT_CLEAN_HIVE_LOCKS` | **PASS** | 0 — locks removed before any test step |
| Dart format (daftari) | `dart format --set-exit-if-changed lib test tool` | `EXIT_FORMAT_DAFTARI` | **PASS** | 0 |
| Dart format (landing) | `dart format --set-exit-if-changed lib test` | `EXIT_FORMAT_LANDING` | **PASS** | 0 |
| Static analysis (daftari) | `flutter analyze` | `EXIT_ANALYZE_DAFTARI` | **PASS** | 0 — "No issues found!" |
| Static analysis (landing) | `dart analyze` | `EXIT_ANALYZE_LANDING` | **PASS** | 0 |
| Dart tests (daftari) | `flutter test` | `EXIT_TEST_DAFTARI` | **PASSED** | 0 — `11:03 +1645: All tests passed!` (1629 baseline + 16 new platform printing tests) |
| Dart tests (landing) | `dart test` | `EXIT_TEST_LANDING` | **PASS** | 0 — `00:00 +28: All tests passed!` |
| Backend tests (5 packages) | `npm test` | `EXIT_TEST_{shared,api,realtime,admin_host,paymob_webhook}` | **PASS** | 0 for all five — shared 270, api 492, realtime 95, admin_host 170, paymob_webhook 80 |
| Backend typecheck (5 packages) | `npm run typecheck` | `EXIT_TYPECHECK_*` | **PASS** | 0 for all five |
| C# build (both hosts) | `dotnet build -c Release --no-restore` | `EXIT_DOTNET_BUILD_WIN/LINUX` | **PASS** | 0 for both — 0 errors, only pre-existing warnings |
| C# tests (Windows host) | `dotnet test -c Release --no-restore` | `EXIT_DOTNET_TEST_WIN` | **PASSED** | 0 — 116 passed / 2 skipped |
| C# tests (Linux host) | `dotnet test -c Release --no-restore` | `EXIT_DOTNET_TEST_LINUX` | **FAILED → GREEN ON RETRY** | 1 on the first attempt (`ImageExportServiceTests.SaveReceiptAsPngAsync_CollidingTimestampedName_FailsWithoutClobbering` — known pre-existing timing flake, DAFTARI-185 / #79); isolation re-run `--filter FullyQualifiedName~ImageExportServiceTests` → 10/10 passed; full-project retry → 106/106 passed |
| Build compile proof | `flutter build linux --debug` | `EXIT_FLUTTER_BUILD_LINUX` | **PASS** | 0 |
| Scope audit | `git diff origin/development...HEAD --stat` | `EXIT_SCOPE_AUDIT` | **PASSED** | 0 — 55 files changed (19 added, 7 deleted, 29 modified), every file inside a declared batch domain (Run B ran on `a361643`: totals +2 966 / −986 at that SHA) |
| Branch sync | `git rev-list --left-right --count HEAD...origin/development` | — | **PASSED** | 25 ahead / 0 behind at the gate run (`8fe3802`); 34 ahead / 0 behind after `a361643` + this artifact commit — `origin/development` is still at base `db8fb5a`, so no merge was required |

### Run B — final wave-4 gate (authoritative handoff run)

HEAD `a361643` (34 commits ahead of base), same runner, same per-step exit-code discipline. Log: `/tmp/full_gate_sound.log`; runner exit `FULL_GATE_SOUND_EXIT=0`; terminator `===== FULL_GATE_SOUND_COMPLETE =====` present.

| Check | Exit marker | Status | Result |
|-------|-------------|--------|--------|
| Stale Hive lock cleanup | `EXIT_CLEAN_HIVE_LOCKS` | **PASSED** | 0 — "remaining locks: 0" |
| Dart format (daftari) | `EXIT_FORMAT_DAFTARI` | **PASSED** | 0 |
| Dart format (landing) | `EXIT_FORMAT_LANDING` | **PASSED** | 0 |
| Static analysis (daftari) | `EXIT_ANALYZE_DAFTARI` | **PASSED** | 0 — "No issues found!" |
| Static analysis (landing) | `EXIT_ANALYZE_LANDING` | **PASSED** | 0 |
| Dart tests (daftari) | `EXIT_TEST_DAFTARI` | **PASSED** | 0 — `05:17 +1645: All tests passed!` (the wave-4 G4 change adds an assertion to an existing test, so the test count is unchanged) |
| Dart tests (landing) | `EXIT_TEST_LANDING` | **PASSED** | 0 — `00:00 +28: All tests passed!` |
| Backend tests (5 packages) | `EXIT_TEST_{shared,api,realtime,admin_host,paymob_webhook}` | **PASSED** | 0 for all five — shared 270 (30 files), api **493** (29 files), realtime 95, admin_host 170, paymob_webhook 80 |
| Backend typecheck (5 packages) | `EXIT_TYPECHECK_*` | **PASSED** | 0 for all five |
| C# build (both hosts) | `EXIT_DOTNET_BUILD_WIN/LINUX` | **PASSED** | 0 for both — 0 errors, only pre-existing warnings |
| C# tests (Windows host) | `EXIT_DOTNET_TEST_WIN` | **PASSED** | 0 — 116 passed / 2 skipped |
| C# tests (Linux host) | `EXIT_DOTNET_TEST_LINUX` | **PASSED** | 0 — 106 passed / 0 skipped, **no flake on this run** |
| Build compile proof | `EXIT_FLUTTER_BUILD_LINUX` | **PASSED** | 0 |
| Scope audit | `EXIT_SCOPE_AUDIT` | **PASSED** | 0 — scope re-measured on the final HEAD (see the totals in `final-report.md`) |

**Run B verdict (per-step, no aggregation):** all **21 of 21** steps PASSED on the first attempt on the final wave-4 HEAD. No step was SKIPPED and no step was NOT RUN. None of the three tracked flakes (expenses bloc assertion, Turso in-memory timeout, Linux PNG-collision) reproduced on this run.

**Verdict (per-step, no aggregation) — Run A:** every gate step PASSED on HEAD `8fe3802` except `PrintServer.Linux.Tests`, which FAILED on the first attempt on the proven pre-existing `DAFTARI-185` timing flake and PASSED on the immediate retry (106/106, plus a 10/10 isolated run of the flaky test class). No step was SKIPPED and no step was NOT RUN in that run either.

### Flake status per run — reported per step, never aggregated

Three failures surfaced during sound-gate runs. Each is a race in a file this branch does not touch, and each was re-run in isolation and passed. On Run A (`8fe3802`) only flake 3 reproduced — on its first attempt — and the immediate retry of that step was green. **On Run B (the final wave-4 HEAD) none of the three reproduced** — every step passed on the first attempt. The underlying races are real, so all three stay tracked.

| # | Failure | Isolation result | Status on the `8fe3802` run | Root cause | Tracking |
|---|---------|------------------|------------------------------|-----------|----------|
| 1 | `apps/daftari/test/features/expenses/presentation/bloc/expenses_bloc_test.dart:369` — "logs audit events when auditService provided" → `Expected: true / Actual: false` | `flutter test test/features/expenses/presentation/bloc/expenses_bloc_test.dart` → **13/13 passed**, exit 0 | **DID NOT REPRODUCE** — `EXIT_TEST_DAFTARI=0`, `11:03 +1645: All tests passed!` | Audit-event assertion races under parallel load | `DAFTARI-190` / `docs/followups.md` #84 |
| 2 | `backend/shared/src/turso.test.ts` — "updates an existing email when the supplied email is non-empty" → `Test timed out in 5000ms` (took 25.6 s; suite collect 62.14 s, prepare 47.26 s) | `npx vitest run src/turso.test.ts` → **55 passed in 175 ms**, exit 0 | **DID NOT REPRODUCE** — `EXIT_TEST_shared=0`, 30 files / 270 passed | The test calls `vi.importActual('@libsql/client')` and opens a real `:memory:` client, bypassing the file-level mock, so the first native-module load can exceed the default timeout under load | `DAFTARI-186` / #81 |
| 3 | `PrintServer.Linux.Tests.ImageExportServiceTests.SaveReceiptAsPngAsync_CollidingTimestampedName_FailsWithoutClobbering` → "No exception was thrown. Expected: `System.IO.IOException`" | `dotnet test --filter FullyQualifiedName~ImageExportServiceTests` → **10/10 passed**, exit 0 (`ISOLATION_EXIT=0`); full-project retry → **106/106 passed** (`RETRY_FULL_LINUX_TESTS_EXIT=0`) | **REPRODUCED on the first attempt** (`EXIT_DOTNET_TEST_LINUX=1`), **GREEN on retry** | `ImageExportService.cs:58` builds a SECOND-resolution filename and `:64` uses `FileMode.CreateNew`, so the collision only happens when both saves land in the same second | `DAFTARI-185` / #79 (proven pre-existing by a stash A/B) |

`git diff origin/development...HEAD --name-only | grep -i expense` returns **nothing** — the branch touches no expenses code.

### The three failures the QA reviewer saw are GONE

`app_product_model_test.dart`, `app_receipt_model_test.dart` and `sales_bloc_test.dart` had failed with 30 s `setUpAll` timeouts because of 12 stale Hive lock files left behind by interrupted test runs (all in `apps/daftari/test/_hive_test_app_shell_tables/`). The gate's lock-cleanup step — the same mechanism as the new CI composite action — fixed them. That confirms the reviewer's V-1 diagnosis and proves the CI action targets a real failure mode.

### Superseded: the earlier melos-based gate

The earlier runner (`/mnt/ALL/LinuxDev/caches/.caches_mount/tmp/opencode/full_gate.sh`, markers in `/tmp/full_gate_batch.log`) reported `EXIT_MELOS_TEST=0` while its own log said `26:34 +1618 -3: Some tests failed.` — the masking mechanism described above. Its round-1 note (the `backend/shared` Turso timeout, 25.6 s vs the 5 s default, passing in isolation in 291 ms) still stands and is folded into the table above as flake #2.

### CI evidence on the pushed branch

The branch was pushed to `origin/feat/codebase-cleanup-dedup` and the GitHub Actions pipeline ran on it:

| Run | Trigger | Result | Duration |
|-----|---------|--------|----------|
| `Staging Validation & Test Suite` (`43886527057`) | push to `feat/codebase-cleanup-dedup` | **success** | 5m22s |

Per-job conclusion detail: the QA round-4 reviewer reported that within this run the `flutter-matrix` and packaging jobs were **SKIPPED** while the overall run was green. That per-job list could **not** be re-read in this wave — `gh run view 43886527057 --json jobs` failed with "error connecting to api.github.com" — so it is recorded here as the reviewer's observation, not as independently re-verified evidence.

This closes the QA reviewer's V-3 blocker ("branch absent from remote, no PR, zero workflow runs"). The pull-request workflow is triggered by opening the PR into `development`.

### Gate status ledger — every gate reported independently

Status vocabulary: **PASSED** (executed, exit 0) · **FAILED → GREEN ON RETRY** (executed, failed on the first attempt, passed on the immediate retry) · **SKIPPED** (workflow/job did not run) · **NOT RUN** (mandatory section that was not executed).

| Gate | Scope | Status | Evidence |
|------|-------|--------|----------|
| Local sound full gate | Flutter + landing + 5 backend packages + 2 C# hosts + Linux build + scope audit | **RUN B (final wave-4 HEAD `a361643`): PASSED on 21 of 21 steps**; **RUN A (`8fe3802`): PASSED** on 20 of 21 steps, **FAILED → GREEN ON RETRY** on `PrintServer.Linux.Tests` | per-step `EXIT_*` markers in `/tmp/full_gate_sound.log`, script exit 0, terminator present (this file, FULL gate section) |
| CI pipeline (run `43886527057`) | GitHub Actions on the pushed branch | **SUCCESS** (overall); `flutter-matrix` + packaging jobs **SKIPPED** per the QA reviewer's per-job read | `gh run list` output captured earlier; per-job list not re-verified (GitHub API unreachable) |
| Mandatory review section — full code reviewer | Branch diff | **NOT RUN** in the round-4 dispatch (the no-dispatch constraint); re-dispatched with fan-out **enabled** on the wave-4 HEAD | QA final-dispatch report; wave-4 dispatch |
| Mandatory review section — security auditor | Branch diff | **NOT RUN** in the round-4 dispatch (the no-dispatch constraint); re-dispatched with fan-out **enabled** on the wave-4 HEAD | QA final-dispatch report; wave-4 dispatch |
| Mandatory review section — broad spec compliance | Branch diff | **NOT RUN** in the round-4 dispatch (the no-dispatch constraint); re-dispatched with fan-out **enabled** on the wave-4 HEAD | QA final-dispatch report; wave-4 dispatch |
| Mandatory review section — full test coverage | Branch diff | **NOT RUN** in the round-4 dispatch (the no-dispatch constraint); re-dispatched with fan-out **enabled** on the wave-4 HEAD | QA final-dispatch report; wave-4 dispatch |
| CodeRabbit local review | Branch diff vs `origin/development` | **PASSED** on rounds 1–5; round 4 ran on `4d7fc43` (1 Low fixed in the wave-4 artifact commit, score 99); round 5 ran on `8eb73fd` — 0 Critical/High/Medium, 1 Low (the device-session flow in `specs/USER_FLOW.md` read as active behaviour) fixed in `72851e3`, score 99 | `independent-review.md`, CodeRabbit gate table |
| Independent QA reviewer | Branch diff | **REPORTED — STATUS BLOCKED** (final dispatch, HEAD `d095d82`): 0 Critical/High, 6 Medium + 3 Low documentation/spec findings — **all 9 applied in the user-authorized wave 4**; its 4 mandatory sub-sections NOT RUN (no-dispatch constraint) → re-dispatched with fan-out enabled | `independent-review.md` |
| Independent coverage reviewer | Changed units | **REPORTED — VERDICT FAIL** (round 5, 3 Medium gaps — all closed in `68d0696` / `2b6e0a2`); round 6 on `a0b195d` **VERDICT FAIL** under the strict zero-gap policy: 0 Critical/High/Medium, 6 Low, score 94 — **G4 + G6 closed in wave 4** (`702e26e`, `48523fe`); round 7 on `8eb73fd` **VERDICT FAIL** under the same strict policy: 0 Critical/High/Medium, **4 Low, score 96** — the Windows netstat parser, the Linux `ss` parser, the Linux spawn `ASPNETCORE_URLS` seam and the Hive-lock cleanup action fixture test. The same 4 gaps stay **deferred by explicit user decision** as DAFTARI-194…197 / DAFTARI-199. The strict zero-gap clause is still not met, by explicit user decision | `independent-review.md` |

---

## implement-review-ship review loop

| Round | CodeRabbit | QA reviewer | Coverage reviewer | Score | Gate pass? |
|-------|-----------|-------------|-------------------|-------|------------|
| 1 (pre-fix) | 7 findings → 2 confirmed Medium (Dart `getLocalPrinters` error wrapping; TS sales limiter unbounded map), 4 rejected after source verification, 1 out-of-scope pre-existing | 429 (provider) — `ses_e1eafa263ffeppZaLzxz6gtEH1` | 429 (provider) — `ses_e1eafa263ffdVV64eWBIrwrAxH` | 90 | **FAIL** (score must be > 90) |
| 1 (post-fix) | 0 Critical / 0 High / 0 Medium / 0 Low | 429 — `ses_e1e908117fferMvc44LjiprU3Q` | 429 — `ses_e1e903c12ffeICSpdrufGGhYEt` | 100 | PASS on the CodeRabbit gate |
| 2 | 1 finding (major) → rejected after verification against base `db8fb5a`; 0 C/H/M/L | 429 — `ses_e1e6fdf52ffeNVFaKVbCbpiHjW` | 429 — `ses_e1e555946ffepVmupkKToOlgaR` | 100 | PASS on the CodeRabbit gate |
| 3 | not re-run (no source changes since round 2) | 429 — `ses_e1e4c6266ffemfQLlxP3aOC0mD` | 429 (solo, no fan-out) — `ses_e1e3bd9afffeIgyD1CfPEv8zs0`, `ses_e1e317d28ffejdNyzQcat9w75W`, `ses_e1e2e2ae0ffeLQJPhFTHN48Pb6` | 100 | **BLOCKED** — provider 429 on every independent-reviewer dispatch |
| 4 | not re-run (no source changes since round 2) | **Reported — STATUS BLOCKED** (`ses_e1e1ec11affe0bDohEg9voDNB3`): 0 Critical / 0 High code defects; 4 blockers (V-1 unsound gate, V-2 stale evidence, V-3 not pushed / no PR / no CI, V-4 dirty tree) + 7 spec-drift items | **Reported — VERDICT FAIL** (`ses_e1e1ae786ffeGu8xsMHo999aAf`): 3 Medium gaps — G1 `getLocalPrinters` untested, G2 `createIpRateLimiter` untested, G3 `/sales/sync` fallback denial untested | 100 | **FAIL** on the two independent gates — fix round required |
| 5 (post-fix wave, HEAD `1ed1f7b`) | 0 C/H/M/L — unchanged since round 2 | **Reported — STATUS BLOCKED** (`ses_e1b9126a5ffeBHPasu5nlaQMIf`): 3 High (SEC-1, AUD-1, AUD-2) · 12 Medium · 4 Low · 4 mandatory review sections NOT RUN | **Reported — VERDICT FAIL** (`ses_e1b400d92ffdJtqEie50Kw8Wh4`): M1 Linux `getLocalPrinters` untested, M2 Windows `getLocalPrinters` untested, M3 limiter fail-open semantics unproven | 93 pre-fix | **FAIL** — fix round 3 required |
| 6 (fix round 3, HEAD `130b4d4` + `a0b195d` + `26321f4` + `d095d82` + this artifact commit) | round 3 **PASSED** on `a0b195d` (score 100; 2 Low fixed, 1 `major` rejected on a false premise) | **REPORTED — STATUS BLOCKED** (`ses_e184bfa2fffed6No6l8QDIcXLW`, reviewed HEAD `d095d82`): 0 Critical/High, 6 Medium + 3 Low documentation/spec findings; 4 mandatory sub-sections NOT RUN | **REPORTED — VERDICT FAIL** (`ses_e184bfa2effe9NnBubMDczfV0a`, HEAD `a0b195d`): 0 Critical/High/Medium, 6 Low (G1…G6), score 94 — 4 gaps already tracked as DAFTARI-194…198, G5 + G6 newly tracked as DAFTARI-199 / DAFTARI-200 | 67 (QA) / 94 (coverage) | **FAIL** — the QA gate has 6 open Medium findings and the coverage zero-gap clause is not met; the three fix rounds are spent, so wave 4 and the PR opening are a human checkpoint |
| 7 (wave 4 — user-authorized) | round 4 **PASSED** on `4d7fc43` (0 Critical/High/Medium, 1 Low fixed in the wave-4 artifact commit, score 99); round 5 **PASSED** on `8eb73fd` (0 Critical/High/Medium, 1 Low fixed in `72851e3`, score 99) | all 9 findings applied (`702e26e`, `48523fe`, `a361643`, artifact commit); re-dispatch on the wave-4 HEAD with fan-out **enabled** per the user's authorization | G4 + G6 closed (`702e26e`, `48523fe`); round 7 on `8eb73fd` reported the same **4 Low gaps** (Windows netstat parser, Linux `ss` parser, Linux spawn env seam, Hive-lock action fixture test) — deferred by explicit user decision (DAFTARI-194…197, DAFTARI-199) | 99 (CodeRabbit) / 96 (coverage round 7, 4 deferred Low) | **CONDITIONAL** — the user's authorization covers the 4 deferred Low gaps; the remaining gates are the wave-4 re-dispatch, CodeRabbit PR review, green PR checks and the user's manual merge |
| 8 (final wave-4 dispatch, HEAD `72851e3` + this artifact commit) | round 5 **PASSED** on `8eb73fd` — 0 Critical/High/Medium, 1 Low fixed in `72851e3`, score 99 | fresh context-free dispatch with fan-out **enabled** on the final artifact HEAD | fresh context-free dispatch on the final artifact HEAD | 99 (CodeRabbit) / 96 (coverage) | **CONDITIONAL** — the independent reports land in the PR body; the coverage zero-gap clause stays waived by explicit user decision |

**Round 1 fix commits (applied after the Medium findings):** `31560ba` (sales limiter map caps), `a371de1` (desktop `getLocalPrinters` → `PrintException` + 10 s timeout), `2668f4a` (negative parent-pid test), `4782788` (follow-up registry entries).

**Round 2 fix wave (applied after the round-4 reviewer reports):** `e9b4436` (bounded IP rate-limiter map — `maxEntries` replaces the non-binding `hardCap`, capped per-call eviction scan, `size()` test seam + 8 unit tests + the `/sales/sync` fallback-denial integration test), `111a0fe` (`on PrintException { rethrow; }` in all three platform services so `statusCode` survives + 8 desktop service tests), `ef98e7f` (Hive-lock cleanup action exits 0 when the directory is missing + the fast-verify cleanup step moved BEFORE `melos run test`), `313bd72` (spec re-sync, 15 drift items), `53726f9` (follow-up #83).

**TDD evidence for the round-2 wave:** the `PrintException` double-wrap was proven first — with the `on PrintException { rethrow; }` removed, `flutter test test/core/printing/print_service_desktop_test.dart` failed with `which has statusCode with value <null>`; the limiter test failed with `TypeError: limiter.size is not a function` and a missing-`maxEntries` failure before the implementation existed.

**Round 3 fix wave (applied after the round-4 QA BLOCKED report and the round-5 coverage FAIL):** `68d0696` (Linux + Windows `getLocalPrinters` behaviour tests, 8 + 8), `2b6e0a2` (limiter eviction-semantics tests: exact soft-cap/hard-bound counts, hard-bound fail-open re-admission, bounded per-call eviction scan), `d5fa35e` (`maxEntries` made a required limiter option), `73e3db8` (SPEC-1…SPEC-5 HWID spec re-sync), `a4ab4d3` (follow-ups #85–#92 + 8 Plane work items), `8fe3802` (findings.md trailing whitespace), plus `130b4d4` (AUD-1…AUD-10 rewrite), `a0b195d` (artifact-commit SHA pinning + measured scope totals), `26321f4` (spec cloud-flavor correction), `d095d82` (follow-up #76 route correction), plus this artifact commit. **This is fix round 3 of 3 — the cap from `implement-review-ship`; anything still open at its end is a human checkpoint, not a fourth round.**

**TDD evidence for the round-3 wave:** the platform `PrintException` re-wrap was proven first — with the `on PrintException { rethrow; }` removed from both platform services, the new 503 tests failed with `which has statusCode with value <null>` (`MUTATION_TEST_EXIT=1`); the limiter tests were proven by removing the `maxEntries` eviction block (`MUTATION_MAX_ENTRIES_EXIT=1`) and the per-call scan cap (`MUTATION_SCAN_CAP_EXIT=1`); the required-`maxEntries` change was proven by `npm run typecheck` failing with 6 × TS2345 before the test constructions were updated (`TYPE_CHECK_RED_EXIT=2`) and with TS2344 + 2 × TS18048 when the option was reverted to optional (`TYPE_CHECK_MUTATION_EXIT=2`).

**Wave 4 — user-authorized remediation (fix round 4):** the three scripted fix rounds were spent, so the user was asked for a decision and chose **"Wave 4: QA fixes + G4/G6 tests"** — apply all 9 final-QA findings (6 Medium + 3 Low documentation/spec/comment level) and close the G4 + G6 coverage gaps with new tests, deferring G1–G3 and G5 as tracked follow-ups. The user also chose **"Allow fan-out"**, so the next QA dispatch may run its 4 mandatory sub-sections (code reviewer, security auditor, spec compliance, test coverage) instead of the no-dispatch constraint that blocked them in the round-4 dispatch.

| Commit | Stack | Change | TDD evidence | FAST gate evidence |
|--------|-------|--------|--------------|--------------------|
| `702e26e` | apps/daftari | `print_service_test.dart` compares two `PrintServiceFactory.create()` results and asserts they are distinct instances (closes G4 / DAFTARI-198) | MUTATION: with `create()` returning the cached singleton the test fails (`Expected: not same instance as <Instance of 'PrintServiceStub'>`); source restored byte-identical | `dart format --set-exit-if-changed lib test` → 510 files, 0 changed; `flutter analyze` → "No issues found!"; `flutter test test/core/printing/print_service_test.dart` → **4 passed** |
| `48523fe` | backend/api | New limiter test mixes an active IP with expired IPs under the soft cap and proves the active entry survives and keeps the budget it already spent (closes G6 / DAFTARI-200) | MUTATION: with the soft-cap sweep deleting active entries the test fails (`expected +0 to be 3`); source restored byte-identical | `npm run typecheck` → exit 0; `npm test` → 29 files / **493** passed, exit 0 |
| `a361643` | specs + apps/daftari | SPEC-01 (PRD cloud flavour), SPEC-02 (ARCHITECTURE factory/stub behaviour), SPEC-03 (PERFORMANCE_GUIDELINES HWID caching), CODE-01 (`print_server_config.dart` comment narrowed to the Dart print clients) | n/a (documentation) | `dart format --set-exit-if-changed lib test` → 510 files, 0 changed; `flutter analyze` → "No issues found!"; `git diff --check` → exit 0 |
| artifact commit (`8eb73fd`) | docs | AUD-01…AUD-05 audit corrections, the CodeRabbit round-4 Low fix, the wave-4 authorization record, and the follow-up closures for #92 / #94 | n/a (documentation) | `git diff --check` → exit 0; `dart format --set-exit-if-changed lib test` → 510 files, 0 changed; `flutter analyze` → "No issues found!" |
| `72851e3` | specs | CodeRabbit round-5 Low fix: the device-session flow in `specs/USER_FLOW.md` is labelled planned and not wired, and its heartbeat / cleanup / active-sessions bullets are marked as planned | n/a (documentation) | `git diff --check` → exit 0; `dart format --set-exit-if-changed lib test` → 510 files, 0 changed; `flutter analyze` → "No issues found!" |
| artifact commit | docs | CodeRabbit round-5 record + wave-4 coverage round-7 record | n/a (documentation) | `git diff --check` → exit 0 |

**Authorization log (Gate 1 evidence):** wave 4 + fan-out were explicitly authorized by the user in the current session ("Wave 4: QA fixes + G4/G6 tests (Recommended)" and "Allow fan-out (Recommended)"). This is the only skipped-gate authorization on the branch; it covers the 4 deferred Low coverage gaps (G1–G3, G5) and the fan-out needed for the QA reviewer's 4 mandatory sub-sections. No other gate was skipped.

**Independent-reviewer blocker:** the provider rate-limits concurrent subagent sessions. Every `qa-post-implementation` and `general` parent session across the first 5 dispatch rounds failed with HTTP 429 — including solo dispatches with fan-out explicitly disabled. The orphan child reviewers spawned by those parents (code review, security audit, spec compliance, test-coverage mapping) remain live and are performing the required checks; their findings are harvested in `independent-review.md`. Per the operating contract this blocker was escalated to the user rather than replaced with a self-review; the user answered "Pause and retry later", and the two required reviewers eventually reported.

Gate rule: zero Critical/High/Medium findings, score `100 − 25×C − 10×H − 5×M − 1×L` strictly > 90, and zero coverage gaps in changed units.

---

## Baseline comparison (summary)

| Metric | Baseline (development) | After cleanup |
|--------|------------------------|---------------|
| Analyzer errors/warnings (apps/daftari) | 0 / 0 | 0 / 0 |
| Analyzer infos (landing_page) | 138 pre-existing | 138 pre-existing (untouched) |
| Dart tests passing | 1618 + 28 | **1645** + 28 (+27: 3 print-config, 8 desktop-service, 16 platform printing) |
| Backend tests passing | 1095 | **1108** (+13: 11 rate-limiter unit tests + 1 `/sales/sync` fallback integration test + 1 wave-4 limiter soft-cap active/expired mix test) |
| C# tests passing | 108 (+2 skipped) | **116** (+2 skipped) in `PrintServer.Tests` (+8 parser facts); `PrintServer.Linux.Tests` 106 — on the Run A gate the PNG-collision test failed once on the first attempt (known pre-existing flake `DAFTARI-185`) and passed on the immediate retry; on the final Run B gate it passed on the first attempt |
| Confirmed audit findings open | 10 | **0** (1 rejected with evidence) |
| Review-round findings raised outside the audit scope | — | **8 tracked, not fixed here** (`docs/followups.md` #85–#92 / Plane DAFTARI-191…198) — including DAFTARI-191 (high): the Worker rebuilds limiter state per request, proven pre-existing at base `db8fb5a`. Wave 4 closed 2 of them in-branch (#92 / DAFTARI-198 and #94 / DAFTARI-200) |

---

## Post-merge (Gate 2)

| Check | Status | Result |
|-------|--------|--------|
| Re-verify on merged development | Not started (awaiting user merge) | — |
| Specs match merged reality | Re-synced twice — Batch 5 (`e2c56bf`) and the round-2 wave (`313bd72`, 15 drift items) — re-check after merge | — |
| Branch retained intact | Will be retained (never deleted) | — |
| Worktree cleaned | Not applicable (master base checkout, no worktree used) | — |
| Plane item → Done | Pending user merge | — |
