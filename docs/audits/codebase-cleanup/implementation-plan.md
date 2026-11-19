# Implementation Plan — Daftari Monorepo Codebase Cleanup

**Root:** `/mnt/ALL/Daftari`
**Branch:** `feat/codebase-cleanup-dedup` (from `origin/development`)
**Plane project:** `DAFTARI`
**Batches ordered:** low → high risk; each independently verifiable; FAST gate + targeted tests before every commit.

---

## Execution rules (per AGENTS.md §3-§10 & implement-review-ship)

- Branch from `origin/development` (done: `feat/codebase-cleanup-dedup`).
- Every commit via `emoji-commit` skill; stage by explicit path only (no `git add -A`/`.`).
- FAST gate before EVERY commit: `dart format --set-exit-if-changed lib test`, `flutter analyze` exit 0, no `print`/`debugPrint` outside tests, no secrets.
- TDD: add/update tests alongside behavior changes.
- No `git merge`/`gh pr merge` into `development`/`master` — open PR, user merges manually.
- `implement-review-ship` loop at phase completion: CodeRabbit local review + 2 fresh context-free reviewers (`qa-post-implementation` + `general`/`test-coverage-analysis`) → zero Critical/High/Medium, score >90, zero coverage gaps.
- Out-of-scope findings → `docs/followups.md` + Plane work item, never fixed in this branch.

---

## Batch 1 — Verified unused declarations + stale doc (low risk)

**Objective:** Remove confirmed dead code and correct stale documentation.
**Findings:** FINDING-DEAD-01 (`RefreshLocalPrinters` event), FINDING-DOC-01 (stale `docs/followups.md #25`).
**Files affected:**
- `apps/daftari/lib/features/settings/presentation/bloc/settings_event.dart` (remove lines 107-108)
- `docs/followups.md` (correct #25 entry)
**Dependencies:** None.
**Expected changes:** `RefreshLocalPrinters` class deleted; `#25` entry marked REJECTED/DOCUMENTED (no `landing` flavor exists).
**Risk level:** Low.
**Required tests:** `melos run test` (settings feature), `flutter analyze`.
**Acceptance criteria:** Event class gone; no references remain; analyze clean; tests pass; doc corrected.
**Rollback:** Re-add event class (git revert of the single file).

## Batch 2 — Dependency cleanup: hydrated_bloc (low risk)

**Objective:** Move test-only `hydrated_bloc` to dev_dependencies.
**Findings:** FINDING-DEP-01.
**Files affected:**
- `apps/daftari/pubspec.yaml` (move `hydrated_bloc ^11.0.0` from `dependencies` to `dev_dependencies`)
**Dependencies:** None (Batch 1 independent).
**Expected changes:** `hydrated_bloc` relocated in pubspec.yaml; `flutter pub get` run (updates pubspec.lock).
**Risk level:** Low.
**Required tests:** `flutter pub get`, `melos run format` + `analyze` + `test`.
**Acceptance criteria:** `hydrated_bloc` only matched in dev_dependencies + test files; analyze/test pass; format clean.
**Rollback:** Revert pubspec.yaml + pubspec.lock.

## Batch 3 — Backend rate-limiter dedup (medium risk)

**Objective:** Extract shared sliding-window rate-limiter from `sessions.ts` and `sales.ts`.
**Findings:** FINDING-DUP-01.
**Files affected:**
- `backend/api/src/routes/sessions.ts` (replace inline limiter with shared util import)
- `backend/api/src/routes/sales.ts` (replace inline limiter with shared util import)
- `backend/shared/src/rate_limit.ts` (new or extend existing rate_limit module with shared `ipRateLimit` sliding window)
**Dependencies:** Batch 1-2 independent.
**Expected changes:** Single `ipRateLimit` implementation shared by both routes; per-route constants preserved (30/min, 60s window); `sales.ts` "mirrors /sessions/start" comment removed.
**Risk level:** Medium (behavior touched, but identical algorithm; route tests exist).
**Required tests:** `backend/api npm test` + `npm run typecheck` (sessions + sales route tests).
**Acceptance criteria:** One rate-limiter source; both routes behave identically (30/min); analyze/typecheck clean; tests pass.
**Rollback:** Re-instate inline limiters (git revert).

## Batch 4 — Print service interface/stub/factory + port alignment (medium risk)

**Objective:** Consolidate print-service contract; align PrintServer port.
**Findings:** FINDING-DUP-04, FINDING-ARCH-01.
**Files affected:**
- `apps/daftari/lib/core/printing/print_service_stub.dart` (remove local `abstract class PrintService` redeclaration; implement real interface)
- `apps/daftari/lib/core/printing/print_service_factory.dart` (consolidate `StubPrintService` vs `PrintServiceStub`; audit `_createService()`)
- `apps/daftari/lib/core/printing/print_service_desktop.dart` (port constant)
- `apps/daftari/lib/core/printing/print_service_web.dart` (port constant)
- `apps/daftari/lib/core/printing/print_server_manager.dart` (port constant)
- `PrintServer/Program.cs` (inspect listener port — read-only for port decision)
**Dependencies:** Consumer audit of `PrintServiceFactory.instance` before changing factory return type.
**Expected changes:** Single print-service interface; stubs implement the real interface; aligned port constant(s).
**Risk level:** Medium (factory may be used in production; port change affects runtime printing).
**Required tests:** Consumer audit first; `melos run test` (printing-related), `flutter analyze`; verify .NET sidecar port matches chosen Dart default.
**Acceptance criteria:** Single PrintService contract; factory returns sensible default; one port constant source; tests pass; analyze clean.
**Rollback:** Revert printing files.

## Batch 5 — HWID abstraction consolidation (medium-high risk, requires authorization)

**Objective:** Consolidate two parallel HWID abstractions into single source of truth.
**Findings:** FINDING-DUP-03.
**Files affected:**
- `apps/daftari/lib/core/hwid/` (interface + platform impls)
- `apps/daftari/lib/core/licensing/infrastructure/hwid/` (interface + platform impls)
- `apps/daftari/lib/core/licensing/engine/license_engine.dart:31-33` (`_defaultHwidProvider`)
**Dependencies:** Full consumer audit of both HWID trees before any change.
**Expected changes:** Single HWID ownership boundary; licensing and printing share or clearly delegate HWID acquisition.
**Risk level:** Medium-high — touches Ed25519 offline licensing (security-sensitive). Must not change license validation or device-identity behavior.
**Required authorization:** YES — security-sensitive domain.
**Required tests:** `melos run test` (licensing + settings + printing), `flutter analyze`; verify license validation unchanged.
**Acceptance criteria:** Single HWID source of truth (or clean delegation); license validation behavior identical; tests pass; analyze clean.
**Rollback:** Revert all HWID files.

## Batch 6 — Shorebird config resolution (medium risk, may require authorization)

**Objective:** Resolve inconsistent shorebird wiring.
**Findings:** FINDING-CONFIG-01.
**Files affected:**
- `apps/daftari/lib/core/config/env_config.dart` (remove unused `shorebirdAppId` field, OR wire it)
- `apps/daftari/pubspec.yaml:127` (shorebird.yaml asset — keep or remove)
- `.github/workflows/release.yml` (shorebird CLI jobs — verify they don't read Dart `shorebirdAppId`)
**Dependencies:** Verify CI release.yml doesn't depend on Dart `shorebirdAppId` value.
**Expected changes:** Either complete shorebird integration (add `shorebird_code_push` dep, wire `shorebirdAppId`) or remove dead `shorebirdAppId` config.
**Risk level:** Medium — CI release uses shorebird for Windows patch/release; don't break CD.
**Required authorization:** YES if removing config referenced by CI.
**Required tests:** `melos run analyze` + `test`; verify CI release.yml unaffected.
**Acceptance criteria:** Consistent shorebird state; no dead config; CI release jobs still valid.
**Rollback:** Revert env_config.dart / pubspec.yaml.

## Batch 7 — CI duplication investigation (low risk)

**Objective:** Confirm/fix fast-verify vs flutter-matrix format/analyze/test duplication.
**Findings:** FINDING-CONFIG-02.
**Files affected:**
- `.github/workflows/ci.yml`
**Dependencies:** None.
**Expected changes:** CI YAML consolidation (if duplication confirmed).
**Risk level:** Low (CI config only).
**Required tests:** CI-equivalent YAML review (cannot run full CI locally).
**Acceptance criteria:** format/analyze/test run once per relevant trigger; CI YAML valid.
**Rollback:** Revert ci.yml.

## Batch 8 — ParseParentPid dedup (low risk, deferrable)

**Objective:** Extract or document `ParseParentPid` copy.
**Findings:** FINDING-DUP-02.
**Files affected:** `PrintServer/Program.cs`, `PrintServer.Linux/Program.cs` (or shared helper).
**Dependencies:** None.
**Expected changes:** Shared `ParseParentPid` helper OR documented justification to retain.
**Risk level:** Low.
**Required tests:** `dotnet build` + `dotnet test`.
**Acceptance criteria:** Single source (or documented intent); build/test pass.
**Rollback:** Revert.

---

## Batch ordering & risk summary

| Batch | Risk | Authorization needed? | Source changes? |
|-------|------|----------------------|-----------------|
| 1 | Low | No | Yes (settings event + docs) |
| 2 | Low | No | Yes (pubspec.yaml) |
| 3 | Medium | No | Yes (TS routes + shared util) |
| 4 | Medium | No | Yes (printing files) |
| 5 | Medium-high | **YES** (licensing domain) | Yes (HWID files) |
| 6 | Medium | **Maybe** (CI-relevant config) | Yes (env_config, pubspec, ci) |
| 7 | Low | No | Yes (ci.yml only) |
| 8 | Low | No | Yes (C# Program.cs) or document |

**Changes requiring additional authorization:** Batch 5 (licensing/security), Batch 6 (if removing CI-relevant shorebird config).

**Low-risk cleanup separated from higher-risk refactoring:** Batches 1,2,7,8 = low-risk cleanup; Batches 3,4 = medium-risk dedup; Batches 5,6 = higher-risk (authorization-gated).
