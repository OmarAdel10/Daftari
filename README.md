# Daftari

Premium Stationery POS System for Egyptian shops. Ultra-responsive, offline-first Flutter desktop/mobile/web app with a Jaspr landing page, TypeScript backend (Hono/Cloudflare Workers), and C# Print Server.

---

## Architecture Overview

```
daftari/
├── apps/
│   └── daftari/           # Flutter app (desktop, mobile, web)
│       ├── lib/           # Application code
│       ├── test/          # Unit & widget tests
│       ├── web/           # Flutter web entrypoints
│       └── pubspec.yaml
├── landing_page/          # Jaspr static site (marketing)
│   ├── lib/               # Components, pages, styles
│   └── pubspec.yaml
├── backend/               # TypeScript services (Hono + Cloudflare Workers)
│   ├── api/               # REST API
│   ├── realtime/          # DO hub (WebSockets)
│   ├── admin_host/        # Admin dashboard hosting
│   ├── paymob_webhook/    # Payment webhooks
│   └── shared/            # Shared libs (Turso/libSQL, cache, repos)
├── PrintServer/           # C# .NET 8 Windows print service
├── PrintServer.Linux/     # C# .NET 8 Linux print service
├── PrintServer.Tests/     # C# Windows print server tests
├── PrintServer.Linux.Tests/ # C# Linux print server tests
├── packaging/             # Linux AppImage/RPM, Windows installers
├── specs/                 # PRD, ARCHITECTURE, DESIGN, USER_FLOW, DEVELOPMENT_ENVIRONMENT, PERFORMANCE_GUIDELINES
├── .github/               # CI/CD workflows (GitHub Actions)
├── docs/                  # Follow-ups, plans, support docs
├── melos.yaml             # Melos workspace (Dart/Flutter packages only)
├── package.json           # Root npm guard (DO NOT install here)
├── .npmrc                 # npm config (prefer-offline, no install-links)
└── AGENTS.md              # Agent operating contract
```

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Dart SDK | `3.13.x` (stable) | Flutter, melos, landing_page |
| Flutter | `3.47.x` (stable) | Flutter app builds |
| Melos | `6.3.3` | Dart workspace orchestration |
| .NET SDK | `8.0.x` | PrintServer (Windows + Linux) |
| Node.js | `22.x` | TypeScript backend packages |
| Linux deps | `libcups2-dev`, `libgtk-3-dev`, `libsecret-1-dev`, `clang`, `cmake`, `ninja-build`, `rpm`, `libfuse2`, `libappstream-glib-dev` | Linux desktop builds + packaging |

---

## Quick Start

### 1. Clone & Setup

```bash
git clone https://github.com/OmarAdel10/Daftari.git
cd Daftari
```

### 2. Dart/Flutter Packages (Melos)

```bash
# Install melos (if not present)
dart pub global activate melos 6.3.3
export PATH="$PATH":"$HOME/.pub-cache/bin"

# Bootstrap all Dart packages (apps/daftari + landing_page)
melos bootstrap
```

### 3. TypeScript Backend (per package)

```bash
# Each backend package has its own package.json
cd backend/shared && npm ci
cd ../api && npm ci
cd ../realtime && npm ci
cd ../admin_host && npm ci
cd ../paymob_webhook && npm ci
```

### 4. C# Print Server

```bash
# Windows
cd PrintServer && dotnet build -c Release

# Linux
cd PrintServer.Linux && dotnet build -c Release -r linux-x64
```

---

## Common Commands

### Melos (Dart/Flutter workspace)

```bash
# Format check (both packages)
melos run format

# Analyze (both packages)
melos run analyze

# Run tests (both packages)
melos run test

# Build Flutter Linux debug (Linux host only)
melos run build

# Per-package variants
melos run flutter:analyze   # apps/daftari only
melos run dart:test         # landing_page only
```

### Flutter App (apps/daftari)

```bash
cd apps/daftari

# Development
flutter run -d linux --dart-define=FLAVOR=local --dart-define=ENV=development

# Build desktop
flutter build linux --debug
flutter build windows --release   # requires Windows host

# Build web
flutter build web --release \
  --dart-define=FLAVOR=local \
  --dart-define=ENV=production

# Admin dashboard (web)
flutter build web --wasm --release \
  -t lib/main_admin.dart \
  --dart-define=FLAVOR=admin \
  --dart-define=ENV=production
```

### Landing Page (Jaspr)

```bash
cd landing_page
dart pub get
dart pub global activate jaspr_cli 0.23.4
jaspr build          # static site to build/
jaspr serve          # dev server
dart test            # component tests
```

### TypeScript Backend

```bash
cd backend/<package>   # api, realtime, admin_host, paymob_webhook, shared
npm run dev            # wrangler dev
npm test               # vitest
npm run typecheck      # tsc --noEmit
```

### C# Print Server

```bash
# Windows
cd PrintServer
dotnet build -c Release
dotnet test -c Release

# Linux
cd PrintServer.Linux
dotnet build -c Release -r linux-x64
dotnet test -c Release --blame-hang-timeout 2m
```

---

## CI/CD

### CI (`.github/workflows/ci.yml`)
Runs on **every push/PR**:
- **fast-verify**: melos analyze + test (format, analyze, test for both Dart packages)
- **backend-tests**: npm test + typecheck (5 packages, parallel)
- **flutter-matrix**: 15 build combos (local/cloud × win/linux × 3 envs + admin web) — builds only
- **printserver-build**: .NET build (Windows + Linux)
- **packaging-verify-linux**: AppImage + RPM + .NET tests (main branches + PRs into them)
- **packaging-verify-windows**: .NET tests
- **security-scan**: Trivy filesystem scan

### CD (`.github/workflows/cd-*.yml`, `release.yml`)
- **cd-development**: dev deploys (push to `development`)
- **cd-staging**: staging deploys (push to `staging`)
- **cd-production**: prod deploys (tag `v*`)
- **release.yml**: Desktop installers (AppImage, RPM, Windows) on `master` push + `v*` tags

### Branch Strategy
- `development` → integration branch (PRs merged here)
- `master` → stable releases (tagged `v*`, only branch with production CD)
- Feature branches: `feature/{name}`, `fix/{name}`, `refactor/{name}`, `perf/{name}`, `chore/{name}`, `docs/{name}`

---

## Key Configuration Files

| File | Purpose |
|------|---------|
| `melos.yaml` | Dart workspace (packages: apps/daftari, landing_page) |
| `apps/daftari/pubspec.yaml` | Flutter app deps |
| `landing_page/pubspec.yaml` | Jaspr landing page deps |
| `backend/*/package.json` | TypeScript backend deps |
| `PrintServer*/*.csproj` | C# Print Server projects |
| `.github/workflows/ci.yml` | CI pipeline |
| `specs/PRD.md` | Product Requirements |
| `specs/ARCHITECTURE.md` | System Architecture |
| `specs/DESIGN.md` | Design System |
| `specs/USER_FLOW.md` | User Flows |
| `specs/DEVELOPMENT_ENVIRONMENT.md` | Dev Environment Setup |
| `specs/PERFORMANCE_GUIDELINES.md` | Performance Targets |
| `AGENTS.md` | Agent operating contract (branch rules, CI gates, melos commands) |

---

## Development Notes

- **Melos manages Dart/Flutter only** — TypeScript (backend/*) and C# (PrintServer*) are orchestrated by CI + AGENTS.md commands
- **No Dart pub workspace** — `hive_generator ^2.0.1` needs `source_gen ^1.0.0`/`analyzer <7`/`build ^2`; `jaspr_builder` needs `source_gen ^4.0.0`/`analyzer ^12`/`build ^4` → incompatible resolutions. Melos 6 package mode used.
- **Flutter desktop is host-specific** — Windows builds need Windows+MSVC; Linux builds need Linux+GTK
- **Root `package.json` is a guard** — fails if `npm install` run at repo root. Use `cd backend/<pkg> && npm ci`
- **Never commit**: `build/`, `.dart_tool/`, `node_modules/`, `*.lock` (except root `pubspec.lock` + per-package locks), `.DS_Store`

---

## License

Proprietary — Internal use only.
