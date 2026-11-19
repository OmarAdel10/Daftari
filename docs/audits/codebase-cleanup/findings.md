# Findings Register — Daftari Monorepo Codebase Audit

**Root:** `/mnt/ALL/Daftari`
**Branch:** `feat/codebase-cleanup-dedup`
**Categories:** DUP (duplication), DEAD (dead/unused), SIMP (complexity), ARCH (architecture), DEP (dependency), CONTRACT (cross-component inconsistency), CONFIG (configuration), TEST (test quality), DOC (documentation)
**Priorities:** P0 critical, P1 high, P2 meaningful, P3 minor, P4 cosmetic
**Confidence:** Confirmed / High / Requires investigation / Intentional & justified

---

## Summary by category

| Category | Count | Priorities |
|----------|-------|------------|
| DUP | 4 | P2 x3, P3 x1 |
| DEAD | 1 | P2 x1 |
| DEP | 1 | P2 x1 |
| ARCH | 1 | P2 x1 |
| CONFIG | 2 | P3 x2 |
| DOC | 1 | P3 x1 |
| **Total confirmed** | **10** | |
| CONFIG (raised during implementation) | 1 | P3 x1 — FINDING-CONFIG-03 |
| **Total tracked** | **11** | |

## Resolution status

| Finding | Outcome | Batch | Commit |
|---------|---------|-------|--------|
| FINDING-DEAD-01 | RESOLVED — dead event removed | 1 | `2bdedfb` |
| FINDING-DOC-01 | RESOLVED — stale followups entry corrected to `[REJECTED]` | 1 | `2bdedfb` |
| FINDING-DEP-01 | RESOLVED — moved to `dev_dependencies` | 2 | `a8649dc` |
| FINDING-DUP-01 | RESOLVED — shared `createIpRateLimiter` helper | 3 | `67fc1ca` |
| FINDING-DUP-04 | RESOLVED — single `PrintService` contract + single stub | 4 | `d5862b2` |
| FINDING-ARCH-01 | RESOLVED — one canonical sidecar port (5150) | 4 | `d5862b2` |
| FINDING-DUP-03 | RESOLVED — dead HWID tree deleted, specs re-synced | 5 | `e2c56bf` |
| FINDING-CONFIG-01 | RESOLVED — dead `shorebirdAppId` removed | 6 | `25d0f8c` |
| FINDING-CONFIG-02 | REJECTED — no duplication exists (complementary jobs) | — | — |
| FINDING-CONFIG-03 | RESOLVED — shared composite action | 7 | `42bfcae` |
| FINDING-DUP-02 | RESOLVED — shared parser + 8 new tests | 8 | `50cc0c7` |

**Totals:** 10 resolved, 1 rejected with evidence, 0 open, 0 deferred.

**Review-round findings (outside the audit scope):** the QA and coverage review rounds raised 8 further findings that are out of this branch's scope. They are tracked in `docs/followups.md` #85–#92 and as Plane items DAFTARI-191 … DAFTARI-198; none is fixed here. Wave 4 later closed one of them in-branch (#92 / DAFTARI-198 — the `PrintServiceFactory.create()` identity assertion, `702e26e`), so 7 of these remain open as tracked follow-ups.

## Confirmed findings

### FINDING-DEP-01 — hydrated_bloc misdeclared as regular dependency (DEP, P2, Confirmed)

**Component:** `apps/daftari/pubspec.yaml`
**File/lines:** `apps/daftari/pubspec.yaml:42`
**Current implementation:** `hydrated_bloc ^11.0.0` declared under `dependencies` (regular/production dependency).
**Evidence:** `grep` for `hydrated_bloc` across `apps/daftari/lib/` returns **zero matches**. All 34 matches are in `pubspec.yaml`, `pubspec.lock`, and **27 test files only** (test/ directory). No `lib/` source imports or instantiates `hydrated_bloc`. ARCHITECTURE.md §2 confirms no HydratedBloc instantiated anywhere in `lib/`.
**Problem:** A test-only dependency is declared as a production dependency, bloating the production dependency graph and potentially shipping test code to production builds.
**Affected consumers:** `apps/daftari` production build; any downstream consumer of the daftari package.
**Proposed change:** Move `hydrated_bloc` from `dependencies` to `dev_dependencies` in `apps/daftari/pubspec.yaml`, then `flutter pub get`.
**Expected improvement:** Cleaner production dependency graph; no test-only package shipped with production builds.
**Regression risk:** Low — zero production code references it; tests continue to use it from dev_dependencies.
**Required validation:** `flutter pub get`, `melos run format` + `analyze` + `test`.
**Recommendation:** RESOLVED in Batch 2 — `hydrated_bloc` moved to `dev_dependencies` (`a8649dc`).

### FINDING-DEAD-01 — RefreshLocalPrinters event with no handler/dispatch (DEAD, P2, Confirmed)

**Component:** `apps/daftari/lib/features/settings/presentation/bloc/settings_event.dart`
**File/lines:** `settings_event.dart:107-108`
**Current implementation:** `final class RefreshLocalPrinters extends SettingsEvent { const RefreshLocalPrinters(); }` declared but never handled in the settings bloc and never dispatched from any UI or service.
**Evidence:** `grep` for `RefreshLocalPrinters` across `apps/daftari/lib/` returns only the declaration (lines 107-108). No handler in `settings_bloc.dart`, no dispatch site.
**Problem:** Dead event class — unreferenced declaration adds noise and maintenance burden.
**Affected consumers:** None (unreferenced).
**Proposed change:** Remove the `RefreshLocalPrinters` event class declaration.
**Expected improvement:** Remove dead code; smaller event union.
**Regression risk:** Low — nothing references it.
**Required validation:** `melos run test` (settings feature), `flutter analyze`.
**Recommendation:** RESOLVED in Batch 1 — event class removed (`2bdedfb`).

### FINDING-DUP-01 — Duplicate inline sliding-window rate limiter (DUP, P2, Confirmed)

**Component:** `backend/api/src/routes/sessions.ts`, `backend/api/src/routes/sales.ts`
**File/lines:** `sessions.ts:65-86` vs `sales.ts:64-76`
**Current implementation:** Two near-identical inline per-IP sliding-window rate-limiter implementations:
- `sessions.ts`: `SESSION_START_WINDOW_MS=60_000`, `SESSION_START_MAX_PER_WINDOW=30`, `startHits` map, `ipRateLimit` closure with filter-expired + soft/hard cap eviction.
- `sales.ts`: `SALES_SYNC_WINDOW_MS=60_000`, `SALES_SYNC_MAX_PER_WINDOW=30`, `salesSyncHits` map, `ipRateLimit` closure with filter-expired (no eviction cap). `sales.ts` comment: "Rate-limit per client IP (mirrors /sessions/start, review High #1)."
**Evidence:** Side-by-side inspection confirms near-identical control flow (30/min window, `Map<string,number[]>`, filter by `now - t < WINDOW_MS`, push now, retryAfterMs calculation). Both use `deps.rateLimit` fallback when available, else inline.
**Problem:** Type-2 near-identical duplication (same algorithm, different constant names and map names). Two independently maintained copies that can diverge. The comment in `sales.ts` explicitly acknowledges the mirroring.
**Affected consumers:** `/sessions/start` route, `/sales/sync` route, callers of these endpoints.
**Proposed change:** Extract the shared sliding-window rate-limiter into `backend/shared/src/` (existing `rate_limit` module) or a shared util, and import it in both `sessions.ts` and `sales.ts`. Preserve per-route constant names where they differ (window/max) but share the core `ipRateLimit` logic.
**Expected improvement:** Single source of truth for rate-limiting logic; consistent behavior; easier to modify.
**Regression risk:** Low — behavior preserved; both routes keep same 30/min limits. Tests exist for both routes.
**Required validation:** `backend/api npm test` + `npm run typecheck`.
**Recommendation:** RESOLVED in Batch 3 — shared `createIpRateLimiter` helper added (`67fc1ca`).

### FINDING-DUP-02 — ParseParentPid exact copy across PrintServer entry points (DUP, P3, Confirmed)

**Component:** `PrintServer/Program.cs`, `PrintServer.Linux/Program.cs`
**File/lines:** `PrintServer/Program.cs:228-241` vs `PrintServer.Linux/Program.cs:292-305`
**Current implementation:** `static int ParseParentPid(string[] args)` is an exact Type-1 character-for-character copy in both entry-point files.
**Evidence:** Side-by-side inspection confirms identical method body. Both call sites: `var parentPid = ParseParentPid(args);` (`Program.cs:43` Windows, `Program.cs:62` Linux).
**Problem:** Exact duplication of a parsing utility. However, the rest of the two Program.cs files intentionally diverge (Windows GDI vs Linux CUPS printing, different parent-process watchers) — justified by architectural boundary (Windows vs Linux).
**Affected consumers:** PrintServer (Windows) and PrintServer.Linux startup.
**Proposed change:** Extract `ParseParentPid` into a shared static helper accessible to both projects, OR retain as-is with documentation that the duplication is intentional and low-value to refactor given the surrounding platform divergence.
**Expected improvement:** Eliminate exact Type-1 copy (if extracted) or document justification (if retained).
**Regression risk:** Low either way.
**Required validation:** `dotnet build` + `dotnet test`.
**Recommendation:** RESOLVED in Batch 8 — the copy was extracted into `PrintServer.Common/ParentPidParser.cs` (MSBuild shared-source `Compile Include`, no new project ⇒ no CI job changes), both hosts now call `ParentPidParser.Parse(args)`, and 8 new xunit tests in `PrintServer.Tests` cover the previously untested parser (`50cc0c7`; the 8th, negative-value case, landed in `2668f4a`).

### FINDING-DUP-03 — Two parallel HWID abstractions (DUP/ARCH, P2, High confidence)

**Component:** `apps/daftari/lib/core/hwid/`, `apps/daftari/lib/core/licensing/infrastructure/hwid/`, `apps/daftari/lib/core/licensing/engine/license_engine.dart`
**File/lines:**
- `lib/core/hwid/hwid_provider_interface.dart` (abstract interface class HwidProvider) + platform impls (`hwid_provider_desktop.dart`, `_linux.dart`, `_stub.dart`, `_web.dart`, `_windows.dart`)
- `lib/core/licensing/infrastructure/hwid/hwid_provider.dart` (abstract class HwidProvider) + `linux_hwid_provider.dart`, `windows_hwid_provider.dart`
- `lib/core/licensing/engine/license_engine.dart:31-33` (`_defaultHwidProvider()` returns `LinuxHwidProvider()` / `WindowsHwidProvider()`)
**Current implementation:** Two separate HWID provider abstractions with the same name (`HwidProvider`) and overlapping platform implementation names (LinuxHwidProvider, WindowsHwidProvider exist in both trees). The `core/hwid` tree had **zero importers** — it was not used by the printing layer; `licensing/infrastructure/hwid` is the only live HWID abstraction and is used by `license_engine.dart` (Ed25519 offline licensing).
**Evidence:** A repository-wide grep for `core/hwid` imports returns **no matches**; the only references to the dead tree are its own declarations. `licensing/infrastructure/hwid/HwidProvider` + `LinuxHwidProvider`/`WindowsHwidProvider` are imported by `license_engine.dart`. Three distinct `HwidProvider` interfaces existed (the canonical async licensing interface `Future<String?> getHardwareId()`, a duplicate sync abstract class in `core/hwid/hwid_provider_stub.dart`, and `core/hwid/hwid_provider_interface.dart`).
**Problem:** Duplicate source of truth for hardware ID acquisition existed in the tree, with a standing risk of inconsistent HWID values if the dead tree were ever wired up. Because the duplicate tree had zero importers, the risk was latent rather than live.
**Affected consumers:** None for the dead `core/hwid` tree; the licensing engine (`licensing/infrastructure/hwid` + `license_engine.dart`) is the only live consumer.
**Proposed change:** Consolidate into a single HWID abstraction with clear ownership. Options: (a) make `core/hwid` the single source and have licensing depend on it, or (b) keep both but delegate. Requires consumer audit before change.
**Expected improvement:** Single source of truth for HWID; consistent device identification across licensing and printing.
**Regression risk:** Medium — touches licensing domain (Ed25519 offline licensing, security-sensitive). Must not change business behavior or license validation.
**Required validation:** `melos run test` (licensing + settings + printing), `flutter analyze`.
**Recommendation:** RESOLVED in Batch 5 — further investigation during implementation showed the ENTIRE `apps/daftari/lib/core/hwid/` tree was dead code with zero importers, and that THREE distinct `HwidProvider` interfaces existed (not two): the canonical async licensing interface (`Future<String?> getHardwareId()`), a duplicate sync abstract class in `core/hwid/hwid_provider_stub.dart`, and the `core/hwid` interface itself. The dead 7-file tree was deleted; the live licensing tree was left byte-identical so license validation behaviour is unchanged. Specs were re-synced to the real implementation (`e2c56bf`).

### FINDING-DUP-04 — Print service interface/stub/factory redundancy (DUP/SIMP, P2, High confidence)

**Component:** `apps/daftari/lib/core/printing/`
**File/lines:** `print_service_interface.dart`, `print_service_stub.dart`, `print_service_factory.dart`, `print_service_desktop.dart`, `print_service_web.dart`
**Current implementation:**
- `print_service_interface.dart` defines `abstract interface class PrintService` (10 methods + PrintException).
- `print_service_stub.dart` re-declares its **own** local `abstract class PrintService` (duplicating the interface) plus `PrintServiceStub` implementation.
- `print_service_factory.dart` defines yet another `StubPrintService implements PrintService` (importing the real interface) and `_createService()` which **always returns a stub** (comment: "actual impl in conditional imports").
- `print_service_desktop.dart` / `print_service_web.dart` implement the real `PrintService` interface via conditional exports in `print_service.dart`.
**Evidence:** Direct file inspection confirms three separate abstractions/implementations of the same print-service contract; factory non-functional for real printing (always stub).
**Problem:** Triple-redundant print-service contract (interface + stub-local-abstract-class + factory stub). Factory does not return real platform implementations despite conditional imports existing.
**Affected consumers:** Any code using `PrintServiceFactory.instance` or `PrintServiceFactory.create()` (would get a non-functional stub).
**Proposed change:** Remove the local `abstract class PrintService` redeclaration in `print_service_stub.dart` (make `PrintServiceStub` implement the real interface). Consolidate `StubPrintService` vs `PrintServiceStub`. Audit consumers of `PrintServiceFactory` before deciding whether to wire real platform implementations into the factory.
**Expected improvement:** Single print-service contract; factory returns real implementation (or clearly documented stub-for-testing).
**Regression risk:** Medium — `PrintServiceFactory.instance` may be used in production; changing what it returns affects runtime printing. Consumer audit required first.
**Required validation:** Consumer audit + `melos run test` (printing), `flutter analyze`.
**Recommendation:** RESOLVED in Batch 4 — `print_service_interface.dart` is now the single contract; the duplicate abstract class and the duplicate `StubPrintService` were removed. The factory stub keeps its previous silent no-op semantics (the pre-existing `PrintServiceStub` threw `UnsupportedError`, which would have been a regression for `receipt_print_helper.dart`) (`d5862b2`).

### FINDING-ARCH-01 — Print port inconsistency (ARCH, P2, High confidence)

**Component:** `apps/daftari/lib/core/printing/print_service_desktop.dart`, `print_service_web.dart`, `print_server_manager.dart`
**File/lines:**
- `print_service_desktop.dart`: `static const String _defaultBaseUrl = 'http://127.0.0.1:5000';`
- `print_service_web.dart`: `WebPrintService({this.baseUrl = 'http://localhost:5001'});`
- `print_server_manager.dart`: `static const String _healthEndpoint = 'http://127.0.0.1:5150/api/printing/health';`
**Current implementation:** Three different default ports for the PrintServer sidecar: `:5000` (desktop print service), `:5001` (web print service), `:5150` (PrintServerManager health endpoint/lifecycle).
**Evidence:** Direct string-literal inspection of the three files.
**Problem:** Inconsistent port configuration for the same sidecar. Risk that print services connect to the wrong port while lifecycle management uses another.
**Affected consumers:** Desktop printing, web printing, PrintServerManager lifecycle.
**Proposed change:** Investigate which port the actual PrintServer sidecar listens on (.NET Program.cs), then align all Dart defaults to the correct single port. Define a shared port constant if appropriate.
**Expected improvement:** Single source of truth for PrintServer port; reliable printing + lifecycle.
**Regression risk:** Medium — changing default print port affects runtime printing if wrong port chosen. Must verify .NET sidecar port first.
**Required validation:** Inspect `PrintServer/Program.cs` listener port; `melos run test` (printing); manual/integration verification of print flow.
**Recommendation:** RESOLVED in Batch 4 — the sidecar port was verified against `PrintServer/Program.cs` and `PrintServer.Linux/Program.cs` (`UseUrls("http://127.0.0.1:5150")`) and a single `print_server_config.dart` constant set now drives every Dart reference. The stale `5000`/`5001` defaults were corrected to `5150` (`d5862b2`).

### FINDING-CONFIG-01 — Shorebird partial/wired inconsistently (CONFIG, P3, High confidence)

**Component:** `apps/daftari/lib/core/config/env_config.dart`, `apps/daftari/pubspec.yaml`, `.github/workflows/release.yml`
**File/lines:** `env_config.dart:53,73,98,112,126,146,159`; `pubspec.yaml:127`; `release.yml`
**Current implementation:**
- `env_config.dart` declares `shorebirdAppId` (static late field + constructor param) but it is **unused anywhere else in `lib/`** (`grep shorebirdAppId` outside `env_config.dart` = empty).
- `pubspec.yaml:127` lists `shorebird.yaml` as an asset, but `shorebird_code_push` package is **not a dependency**.
- CI `release.yml` uses `shorebirdtech/setup-shorebird` and runs `shorebird patch` / `shorebird release` for Windows.
**Evidence:** `grep shorebird` in `lib/` returns only `env_config.dart` declarations/assignments (all `''` or `'prod-app-id'`, never read). `pubspec.yaml` has no `shorebird_code_push` dep.
**Problem:** Inconsistent state — shorebird referenced in CI and config but not wired as a runtime dependency or used in code. `shorebirdAppId` is dead configuration.
**Affected consumers:** CI release pipeline (shorebird jobs), `env_config.dart` consumers (none read shorebirdAppId).
**Proposed change:** Decide shorebird intent: (a) add `shorebird_code_push` dependency and wire `shorebirdAppId` usage at runtime, or (b) remove unused `shorebirdAppId` field and `shorebird.yaml` asset if shorebird is not used at runtime (keeping CI release.yml as-is since shorebird CLI operates at build time, not runtime).
**Expected improvement:** Consistent shorebird wiring; remove dead config or complete the integration.
**Regression risk:** Low if removing unused field (nothing reads it); CI `release.yml` uses shorebird CLI at build time independently of Dart source.
**Required validation:** `melos run analyze` + `test`; verify CI release.yml unaffected.
**Recommendation:** RESOLVED in Batch 6 — official Shorebird docs confirm the app ID belongs in `shorebird.yaml` (not Dart code) and that `shorebird_code_push` is only required for programmatic/immediate update checks (auto-update is enabled here, so its absence is correct). Only the dead `shorebirdAppId` Dart field was removed; `apps/daftari/shorebird.yaml`, the `pubspec.yaml` asset entry, and all `release.yml` shorebird jobs are retained unchanged (`25d0f8c`).

### FINDING-CONFIG-02 — CI duplication between fast-verify and flutter-matrix (CONFIG, P3, REJECTED — no duplication exists)

**Component:** `.github/workflows/ci.yml`
**File/lines:** `ci.yml:34` (fast-verify job), `ci.yml:194` (flutter-matrix job), `ci.yml:196` (`needs: fast-verify`)
**Status:** REJECTED during Batch 7 — the suspected duplication does not exist. The jobs are complementary, not redundant.
**Evidence (verified by full read of both jobs):**
- `fast-verify` (no `if:` → runs on EVERY push/PR) runs: checkout → setup Flutter → activate melos 6.3.3 → `melos bootstrap` → `melos run analyze` → `melos run test` → build landing page (jaspr) → clean stale Hive locks. These are the **quality gates** (format check + analyze + tests).
- `flutter-matrix` (`needs: fast-verify`; `if:` limited to workflow_dispatch / pushes to development|staging|master / PRs targeting those bases) runs: checkout → Linux desktop prereqs → setup Flutter → `flutter pub get` → regenerate/verify Windows plugin registrants → **`flutter build`** across 15 platform/flavor/env combos (web --wasm for admin, desktop builds otherwise) → clean stale Hive locks. It runs **builds only — no analyze, no test**.
- The comment at `ci.yml:~375` ("Folded from the deleted structural-test.yml; fast-verify's format/analyze/test") records that a previously separate structural-test job was intentionally consolidated into `fast-verify`; `flutter-matrix` was never a second quality-gate job.
**Problem:** None. The original hypothesis (format/analyze/test running twice) was not borne out. `needs: fast-verify` correctly gates the compile matrix behind the quality gates.
**Action taken (Batch 7):** A separate, genuinely duplicated Type-1 block WAS found and fixed — the "Clean stale Hive locks" shell snippet appeared twice verbatim (`fast-verify` lines 76-87 and `flutter-matrix` lines 305-316, identical bodies, only the step *name* differed). It was extracted into the reusable composite action `.github/actions/cleanup-hive-locks/action.yml`, referenced by both jobs. Repo-wide grep for `_hive_test` now matches exactly one file.
**Affected consumers:** CI pipeline only.
**Regression risk:** Low — CI config only; the extracted action runs byte-identical shell logic.
**Required validation:** YAML inspection (cannot run full CI locally) + repo-wide grep proving a single source.
**Recommendation:** Finding rejected; the real duplication was fixed as described.

### FINDING-CONFIG-03 — Duplicated "Clean stale Hive locks" CI step (CONFIG, P3, Confirmed → FIXED in Batch 7)

**Component:** `.github/workflows/ci.yml`
**File/lines:** `ci.yml:76-87` (fast-verify) and `ci.yml:305-316` (flutter-matrix) — both removed.
**Current implementation:** The same 8-line bash block (`for dir in test/_hive_test*; do ... rm -f "$lock"; ...`) was pasted into both jobs; only the step name differed ("Clean stale Hive locks (FUSE safety)" vs "Clean stale Hive locks").
**Problem:** Type-1 duplication of a maintenance-sensitive shell script; a future fix to one copy could miss the other.
**Proposed change:** Extract to a composite action `.github/actions/cleanup-hive-locks/action.yml` with a `directory` input (default `apps/daftari`) and reference it from both jobs.
**Expected improvement:** Single source of truth for the cleanup logic.
**Regression risk:** Low — shell body unchanged; the `directory` input is passed through an env var (`HIVE_TEST_ROOT`) rather than interpolated directly into the script, avoiding shell injection.
**Required validation:** YAML inspection; repo-wide grep for `_hive_test` → 1 file.
**Recommendation:** Approved and implemented (Batch 7) — extracted into the composite action `.github/actions/cleanup-hive-locks/action.yml`, referenced by both jobs (`42bfcae`).

### FINDING-DOC-01 — Stale docs/followups.md #25 (dead 'landing' flavor) (DOC, P3, Confirmed)

**Component:** `docs/followups.md#25`, `apps/daftari/lib/core/config/flavor_config.dart`
**File/lines:** `docs/followups.md#25`; `flavor_config.dart` (entire file)
**Current documentation:** followups.md #25 claims a `'landing'` flavor is dead config because "Jaspr is real landing page; nothing uses AppFlavor.landing."
**Evidence:** `flavor_config.dart` defines `enum AppFlavor { local, cloud, admin }` — **no `landing` flavor exists and never did**. `_createFromEnv` handles `'local'`, `'cloud'`, `'admin'`, and throws on unknown. Nothing references `AppFlavor.landing`.
**Problem:** Stale/inaccurate finding in the findings registry. The `'landing'` flavor does not exist, so there is nothing to remove.
**Affected consumers:** `docs/followups.md` readers.
**Proposed change:** Correct/remove the stale `#25` entry in `docs/followups.md` (mark as DOCUMENTED/REJECTED with explanation that no `landing` flavor exists).
**Expected improvement:** Accurate findings registry.
**Regression risk:** None (documentation only).
**Required validation:** None (docs only).
**Recommendation:** RESOLVED in Batch 1 — `docs/followups.md` #25 marked `[REJECTED]` with the reason (no `AppFlavor.landing` exists) (`2bdedfb`).

### Rejected findings (investigated, not actionable)

| ID | Finding | Reason rejected |
|----|---------|-----------------|
| FINDING-REJECT-01 | Font duplication (PrintServer/Assets Noto vs apps/daftari/fonts Cairo) | Different fonts (Noto Arabic vs Cairo), different runtimes (C# vs Flutter), intentional — not duplication |
| FINDING-REJECT-02 | .iml files + build/ dirs as repo clutter | Not tracked by git (`git ls-files *.iml` = empty, `build/` gitignored); local-only, not a repo finding |
| FINDING-CONFIG-02 | CI duplication between `fast-verify` and `flutter-matrix` | **Rejected during implementation (Batch 7)** — see the finding section above for the job-by-job evidence |
| kdf_vectors.json (apps/daftari root) | gitignored GENERATED fixture (tool/gen_kdf_fixtures.dart); committed copy at backend/shared/fixtures/ consumed by tests | Not dead — consumed by `password_hasher_test.dart` + `password_kdf.ts` |
| shorebird.yaml in build/ | Generated Flutter asset | Build output, not source |

---

## Implementation plan references

All findings map to implementation batches in `implementation-plan.md`. Low/Info deferrable findings (e.g., FINDING-DUP-02 ParseParentPid) are tracked there with rationale.
