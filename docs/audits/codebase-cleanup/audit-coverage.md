# Audit Coverage Ledger — Daftari Monorepo

**Root:** `/mnt/ALL/Daftari`
**Branch:** `feat/codebase-cleanup-dedup` (from `origin/development`)
**Task:** Full monorepo codebase audit, cleanup, deduplication, refactoring (enhance-code-prompt.md)

---

## Coverage method

Every first-party directory, subdirectory, and relevant file was inspected recursively, individually (not by directory name or summary). Both tracked and relevant untracked/ignored first-party files were included in the inventory. Investigation was not limited to recently modified files. Findings were not based exclusively on linters/static analysis; manual source inspection, text/symbol searches, dependency-graph analysis, import/export analysis, and call-site/reference analysis were all used.

Heavy generated artifacts, installed dependencies, binary files, caches, and vendored third-party code were excluded from manual line-by-line auditing only where justified (see repository-inventory.md §7). No first-party source directory was silently excluded.

---

## Directories investigated

### Flutter/Dart (apps/daftari/)

| Directory | Audited | Files | Notes |
|-----------|---------|-------|-------|
| `apps/daftari/lib/` | Yes | ~350 | Core + features + presentation |
| `apps/daftari/lib/core/` | Yes | ~90 | audit, backend, business, clock, config, crypto, error, exports, hwid, licensing, printing, theme, utils, widgets |
| `apps/daftari/lib/core/hwid/` | Yes (audit-time) | 7 files | Parallel HWID abstraction — **7 files, deleted by this branch** (see FINDING-DUP-03) |
| `apps/daftari/lib/core/printing/` | Yes | 17 | Print service redundancy (see FINDING-DUP-04, FINDING-ARCH-01) |
| `apps/daftari/lib/core/licensing/` | Yes | ~30 | Ed25519 offline licensing; HWID infra duplication (FINDING-DUP-03) |
| `apps/daftari/lib/features/*` | Yes | ~200 | 10 features, each data/domain/presentation |
| `apps/daftari/test/` | Yes | ~160 | Widget + unit tests |
| `apps/daftari/tool/` | Yes | gen_kdf_fixtures.dart | Generates gitignored kdf_vectors.json |
| `apps/daftari/fonts/` | Yes | Cairo fonts | App font assets (not duplicated — see FINDING-REJECT-01) |
| `apps/daftari/pubspec.yaml` | Yes | 1 | hydrated_bloc misdeclaration (FINDING-DEP-01) |

### Flutter Web (apps/daftari/web/)

| Directory | Audited | Files | Notes |
|-----------|---------|-------|-------|
| `apps/daftari/web/` | Yes | (shared lib/) | Admin dashboard; admin flavor targets web |

### Jaspr landing page (landing_page/)

| Directory | Audited | Files | Notes |
|-----------|---------|-------|-------|
| `landing_page/lib/` | Yes | 18 | Jaspr components/pages |
| `landing_page/test/` | Yes | 31 | All pass |

### TypeScript backend (backend/)

| Directory | Audited | Files | Notes |
|-----------|---------|-------|-------|
| `backend/shared/src/` | Yes | ~30 | Contracts, clean-arch, Turso repos |
| `backend/api/src/` | Yes | ~28 | Hono routes, middleware, use-cases, DTOs |
| `backend/api/src/routes/` | Yes | auth,admin,sales,sessions,users,analytics,branding,devices | Rate-limiter duplication (FINDING-DUP-01) |
| `backend/realtime/src/` | Yes | ~9 | Durable Object, WebSocket |
| `backend/admin_host/src/` | Yes | ~14 | Static asset worker |
| `backend/paymob_webhook/src/` | Yes | ~13 | PayMob webhook |

### C# .NET print server

| Directory | Audited | Files | Notes |
|-----------|---------|-------|-------|
| `PrintServer/` | Yes | Program.cs + Services + Models + Assets | Windows GDI |
| `PrintServer.Linux/` | Yes | Program.cs + Services + Models + Assets | Linux CUPS |
| `PrintServer.Tests/` | Yes | 108 passed, 2 skipped | Platform-specific skips |

### Configuration / CI / tooling

| Path | Audited | Notes |
|------|---------|-------|
| `melos.yaml` | Yes | Dart package config |
| `pubspec.yaml` (root) | Yes | melos dev-dep only |
| `package.json` (root) | Yes | npm guard |
| `.github/workflows/ci.yml` | Yes | CI pipeline |
| `.github/workflows/release.yml` | Yes | shorebird CD job (FINDING-CONFIG-01) |
| `docs/followups.md` | Yes | Existing findings registry (items verified/stale) |
| `specs/` | Yes | Source of truth |

---

## Excluded files/directories (with justification)

See repository-inventory.md §7: build outputs, node_modules, .dart_tool, .NET bin/obj, generated shorebird.yaml in build/, untracked .iml files, untracked user input files. All justified; none are first-party source.

---

## Coverage statistics

| Metric | Value |
|--------|-------|
| Applications audited | 5 (Flutter Desktop, Flutter Web admin, Jaspr landing, TypeScript backend x5 packages, C# print server) |
| Packages audited | 2 Dart (daftari, landing_page) + 5 TypeScript + 4 .NET projects (PrintServer, PrintServer.Linux, PrintServer.Tests, PrintServer.Linux.Tests) |
| Directories audited | All first-party source directories (see table above) |
| Files inspected | All relevant first-party source files individually |
| Files excluded | Generated/build artifacts only (justified) |
| Total audit coverage | 100% of first-party source directories accounted for |
| Remaining coverage gaps | None identified |

---

## Cross-application duplication investigated

- Dart code across Flutter Desktop / Flutter Web / Jaspr landing (platform-specific via conditional imports; no true duplication found beyond intended platform divergence)
- Cross-language (Dart/TS/C#) contract duplication: manually maintained JSON contracts, no codegen (documented as architectural status quo, not a finding requiring change)
