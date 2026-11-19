# Repository Inventory — Daftari Monorepo

**Root:** `/mnt/ALL/Daftari` (master base checkout, `.git` is a directory)
**Branch:** `development` (work performed on `feat/codebase-cleanup-dedup`)
**Remote:** `https://github.com/OmarAdel10/Daftari.git`
**Plane project:** `DAFTARI`
**Stack:** Polyglot monorepo (Dart/Flutter, Jaspr, TypeScript, C# .NET 8)

---

## 1. Flutter Desktop/Mobile application — `apps/daftari/`

| Attribute | Value |
|-----------|-------|
| Directory | `apps/daftari/` |
| Component/package name | Daftari POS (Flutter Desktop/Mobile) |
| Purpose | Desktop point-of-sale application (Windows/Linux); Flutter Web admin dashboard shares `lib/` |
| Programming language | Dart / Flutter stable |
| Relevant files | ~513 Dart files (lib + test) |
| Package manager | pub (via Melos 6, package mode) |
| Dependencies | flutter, flutter_bloc, hive, hive_encrypt, http, equatable, either_dart, ed25519, intl, uuid, flutter_localizations, etc. (`hydrated_bloc ^11.0.0` was declared as a regular dependency but is test-only — moved to `dev_dependencies` by this branch, see FINDING-DEP-01) |
| Entry points | `lib/main.dart`, `lib/main_admin.dart`, `lib/app.dart`, `lib/app_admin.dart` |
| Audit status | Complete (read-only inspection finished) |

**Key components:**
- `lib/core/` — audit, backend, business, clock, config, crypto, error, exports, hwid, licensing, printing, theme, utils, widgets
- `lib/features/{admin_dashboard,auth,checkout,expenses,inventory,onboarding,receipts,sales,settings,shortcuts}` — each with data/domain/presentation (bloc/services/views/widgets)
- `lib/presentation/app_shell.dart`
- Hive encrypted boxes (16), flutter_bloc plain Bloc (no HydratedBloc instantiated in `lib/`)
- LocalizationService O(1) map, PriceHelper piastres integer math, Either/failure hierarchy
- PrintServer sidecar HTTP (:5150 lifecycle; print services default :5000/:5001 — see FINDING-ARCH-01)
- Ed25519 offline licensing, GlobalShortcutGate/FocusController keyboard system
- `tool/gen_kdf_fixtures.dart` (generates gitignored `kdf_vectors.json`)

**Test status:** `melos run test` PASS — all daftari flutter tests pass.

---

## 2. Flutter Web administration dashboard — `apps/daftari/web/`

| Attribute | Value |
|-----------|-------|
| Directory | `apps/daftari/web/` |
| Component/package name | Daftari Admin (Flutter Web) |
| Purpose | Web administration dashboard (WASM build) |
| Programming language | Dart / Flutter Web |
| Relevant files | Included in daftari ~513 Dart files |
| Package manager | pub (via Melos 6) |
| Dependencies | Same as `apps/daftari` (shared `lib/`) |
| Entry point | `lib/main_admin.dart` / `lib/app_admin.dart` |
| Audit status | Complete (read-only inspection finished) |

Shares `lib/` with desktop; admin flavor (`AppFlavor.admin`) targets web. Platform-specific code via conditional imports.

---

## 3. Jaspr landing page — `landing_page/`

| Attribute | Value |
|-----------|-------|
| Directory | `landing_page/` |
| Component/package name | Daftari landing page |
| Purpose | Public marketing landing page |
| Programming language | Dart / Jaspr |
| Relevant files | 18 Dart files |
| Package manager | pub (via Melos 6) |
| Dependencies | jaspr (Jaspr framework) |
| Entry point | Jaspr build entry |
| Audit status | Complete (read-only inspection finished) |

**Analyze:** 138 pre-existing infos (deprecated Jaspr `text` member in home_page/pricing_page, dangling_library_doc_comments in tokens.dart, depend_on_referenced_packages in routing_web.dart imports `web` not a dep). Pre-existing infos, not failures.

**Test status:** `melos run test` PASS — all 31 landing dart tests pass (I18n, pricing, routing, assets, BillingInterval/PricingPlan enums).

---

## 4. TypeScript backend — `backend/{shared,api,realtime,admin_host,paymob_webhook}/`

Each package has its own `package.json`/`node_modules`; root `package.json` is an npm guard.

| Package | Directory | Purpose | Language | Relevant files | Tests | Status |
|---------|-----------|---------|----------|----------------|-------|--------|
| shared | `backend/shared/` | Shared contracts: types, base64, password_kdf, session_jwt, paymob, license, jwt, analytics, turso, rate_limit + clean-arch domain/application/infrastructure + Turso repositories | TypeScript | 30 files | 270 tests | PASS |
| api | `backend/api/` | Hono API: routes (auth, admin, sales, sessions, users, analytics, branding, devices) + middleware/auth + application use-cases/dtos/validation + infrastructure | TypeScript | 28 files | 480 tests | PASS |
| realtime | `backend/realtime/` | Durable Object TenantNotifier + WebSocket + index/runtime | TypeScript | 9 files | 95 tests | PASS |
| admin_host | `backend/admin_host/` | Static asset worker (Cloudflare) | TypeScript | 14 files | 170 tests | PASS |
| paymob_webhook | `backend/paymob_webhook/` | PayMob webhook handler | TypeScript | 13 files | 80 tests | PASS |

**Framework:** Hono. **Wire format:** snake_case on wire / camelCase internals. **Database:** Turso (libSQL).

**Test status:** `npm test` + `npm run typecheck` PASS for all 5 packages. Vite configLoader warnings are pre-existing info only.

---

## 5. C# .NET 8 print server — `PrintServer/`, `PrintServer.Linux/`, `PrintServer.Tests/`

| Attribute | Value |
|-----------|-------|
| Directories | `PrintServer/`, `PrintServer.Linux/`, `PrintServer.Tests/` |
| Component names | PrintServer (Windows), PrintServer.Linux (CUPS), PrintServer.Tests |
| Purpose | PrintServer sidecar (HTTP API) for local printing |
| Programming language | C# / .NET 8 |
| Relevant files | Program.cs x2, Services (PrinterService/CupsPrinterService/ImageExportService/InvoiceService/SalesExportService/SvgValidator/ParentProcessWatcher), Models (ReceiptRequest/BarcodeRequest/SalesExportRequest/SvgValidationRequest/TicketRequest), Assets (Noto Arabic fonts) |
| Package manager | NuGet (.csproj) |
| Entry points | `PrintServer/Program.cs`, `PrintServer.Linux/Program.cs` |
| Tests | 108 passed, 2 skipped (platform-specific, pre-existing) |
| Audit status | Complete (read-only inspection finished) |

**Platform divergence (intentional):** `PrinterService` (Win GDI) vs `CupsPrinterService` (Linux CUPS). `Program.cs` files near-identical (same 9 endpoints, rate limiter 30/s, ParentProcessWatcher); `ParseParentPid` is an exact Type-1 copy (see FINDING-DUP-02).

**Build status:** `dotnet build PrintServer.Linux -c Release --no-restore` PASS (0 errors, 4 pre-existing warnings: SKTextBlobBuilder obsolete CS0618 x1, CS8604 possible null x3). `dotnet test PrintServer.Tests -c Release` PASS.

---

## 6. Configuration / CI / tooling (repository root)

| Path | Purpose | Language | Audit status |
|------|---------|----------|--------------|
| `melos.yaml` | Melos package config (Dart packages only) | YAML | Audited |
| `pubspec.yaml` (root) | melos dev-dependency only (NOT a pub workspace) | YAML | Audited |
| `package.json` (root) | npm guard (fails `npm install`) | JSON | Audited |
| `.github/workflows/ci.yml` | CI: fast-verify, backend-tests, flutter-matrix, printserver-build, packaging, security-scan, wrangler-dry-run, ci-summary | YAML | Audited (see FINDING-CONFIG-02) |
| `.github/workflows/cd-*.yml`, `release.yml`, `deploy-cloud.yml` | CD (master only; shorebird release job) | YAML | Audited (see FINDING-CONFIG-01) |
| `docs/followups.md` | Existing findings registry (35+ numbered items) | Markdown | Audited (some items stale) |
| `specs/` | PRD.md, ARCHITECTURE.md, DESIGN.md, USER_FLOW.md, DEVELOPMENT_ENVIRONMENT.md, PERFORMANCE_GUIDELINES.md | Markdown | Source of truth |

---

## 7. Excluded from manual line-by-line audit (justified)

| Path | Justification |
|------|---------------|
| `apps/daftari/build/` | Flutter build output (generated, gitignored, not tracked) |
| `landing_page/build/` | Jaspr build output (generated, gitignored) |
| `backend/*/node_modules/` | Installed third-party dependencies (not first-party source) |
| `.dart_tool/` (all checkouts) | Dart tool cache (generated per checkout) |
| `PrintServer/bin/`, `PrintServer/obj/` | .NET build outputs |
| `shorebird.yaml` inside `build/flutter_assets/` | Generated Flutter asset, not source |
| `daftari.iml`, `melos_daftari.iml`, `landing_page/melos_daftari_landing.iml` | IntelliJ project files; NOT tracked by git (`git ls-files *.iml` = empty); local-only clutter |
| `enhance-code-prompt.md`, `untitled.excalidraw` | Untracked user files (this task's input); not part of the repo |

No first-party source directory was silently excluded.

---

## 8. Dependency relationship summary

```
apps/daftari (Dart/Flutter)  -->  backend/api (TypeScript Hono)     [HTTP REST, snake_case wire]
apps/daftari                 -->  PrintServer sidecar (.NET 8)      [HTTP :5150 lifecycle + :5000/:5001 print API]
apps/daftari/web             -->  backend/admin_host (Cloudflare static asset worker)
landing_page (Jaspr)         -->  (standalone, static)
backend/api                  -->  backend/shared (contracts, Turso repositories)
backend/realtime             -->  backend/shared (Durable Object, WebSocket)
backend/paymob_webhook       -->  backend/shared (contracts)
CI                           -->  all packages (format, analyze, test, build)
```

---

## 9. Architectural patterns

- Flutter: `flutter_bloc` plain Bloc (data/domain/presentation per feature), Either/failure hierarchy, Hive encrypted boxes, LocalizationService, PriceHelper (piastres integer math)
- Backend: Clean architecture (domain/application/infrastructure), Hono, Turso (libSQL) repositories, Durable Objects for realtime
- C#: Console app sidecar, GDI (Windows) / CUPS (Linux) printer abstraction, ParentProcessWatcher, rate limiter 30/s
- Cross-language contracts: manually maintained (no codegen); JSON over HTTP
