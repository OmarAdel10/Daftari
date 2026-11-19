# Independent Review — Daftari Codebase Cleanup

**Branch:** `feat/codebase-cleanup-dedup`
**Base:** `origin/development` (base commit `db8fb5a`)
**Plane project:** `DAFTARI`
**Reviewed HEAD at dispatch:** per round — see the tables below (round 3 QA: `53726f9`; round 4 QA: `1ed1f7b`; round 5 coverage: `1ed1f7b`; final dispatch: the artifact-commit HEAD)

---

## Reviewer 1 — Code quality and architecture (`qa-post-implementation`)

**Scope:** Remaining duplication, dead code, unnecessary complexity, quality of new abstractions, package boundaries, dependency changes, architectural regressions, maintainability.

| Round | Session | Status | Findings (Critical/High/Medium/Low) | Score | Addressed? |
|-------|---------|--------|-------------------------------------|-------|------------|
| 1 | `ses_e1eafa263ffeppZaLzxz6gtEH1` | Provider error HTTP 429 | — | — | n/a |
| 2 | `ses_e1e908117fferMvc44LjiprU3Q` | Provider error HTTP 429 | — | — | n/a |
| 3 | `ses_e1e6fdf52ffeNVFaKVbCbpiHjW` | Provider error HTTP 429 | — | — | n/a |
| 3 (serial, no fan-out) | `ses_e1e1ec11affe0bDohEg9voDNB3` | **Reported — STATUS BLOCKED** | 0 Critical · 0 High code defects · 4 blockers · 7 spec-drift items · 1 gate-soundness blocker | — | All fixable findings addressed in the round-2 wave; the remaining blockers are handoff steps (push, PR, CI, fresh gate), not code defects |
| 4 | `ses_e1b9126a5ffeBHPasu5nlaQMIf` | **Reported — STATUS BLOCKED** (reviewed HEAD `1ed1f7b`) | 3 High (SEC-1, AUD-1, AUD-2) · 12 Medium (SEC-1-TEST, SPEC-1…SPEC-5, AUD-3…AUD-7, plus the two Low notes below) · 4 Low (CODE-L1, SEC-L1, AUD-8, AUD-9/AUD-10) · 4 mandatory review sections NOT RUN (provider 429) | 93 (pre-fix) | Every actionable finding is addressed below; the pre-existing Worker-limiter defect (SEC-1) is tracked as DAFTARI-191 rather than fixed here |
| 5 | `ses_e184bfa2fffed6No6l8QDIcXLW` | **Reported — STATUS BLOCKED** (reviewed HEAD `d095d82`, upstream `a0b195d`) | 0 Critical · 0 High · 6 Medium · 3 Low · 4 mandatory sub-sections NOT RUN | 67 (pre-fix) | All 9 findings are documentation/spec/comment level and were **applied in the user-authorized wave 4** (`702e26e`, `48523fe`, `a361643`, artifact commit) |

**Report (round 3):** the reviewer judged the cleanup itself **technically sound** — the 7 deleted HWID files had zero importers; the extracted `PrintService` contract, `print_server_config.dart`, `createIpRateLimiter` and `ParentPidParser` are behaviour-preserving; `hydrated_bloc` is genuinely test-only; the CI shell-block deduplication did not change ordering. **No Critical or High code defect was found inline.** The four blockers were:

| Blocker | Class | Resolution |
|---------|-------|------------|
| **V-1** — the recorded FULL gate reported `EXIT_MELOS_TEST=0` while its own log said `26:34 +1618 -3: Some tests failed.` | High — gate verdict unsound | **Root cause found:** `melos.yaml` `scripts.test` runs `flutter test` and `dart test` in ONE shell block, so the block exit status is the LAST command's and the failing Flutter test was masked by the passing landing-page test. The 3 failures were `app_product_model_test.dart`, `app_receipt_model_test.dart` and `sales_bloc_test.dart`, all 30 s `setUpAll` timeouts. **Proven environmental:** all 12 stale Hive lock files were in `apps/daftari/test/_hive_test_app_shell_tables/`, and the 3 files pass in 4 s once the locks are deleted. The branch touches neither Hive models nor the sales bloc. The gate was rewritten to run every package step separately with its own exit code; the masking defect is tracked as **DAFTARI-189** / `docs/followups.md` #83 |
| **V-2** — the gate evidence predated HEAD (`2c074ce` was committed after the log was written) | High — stale evidence | A fresh full gate is run on the committed HEAD before handoff |
| **V-3** — branch not pushed, no PR, zero CI runs | Blocker — handoff | Resolved by the push + PR handoff |
| **V-4** — dirty working tree | Medium | The audit artifacts are committed explicitly (never `git add -A`) after a secret scan |

Additional findings from the same report and their disposition:

| Finding | Class | Resolution |
|---------|-------|------------|
| `ip-rate-limiter.ts` `hardCap` is a stop-eviction threshold, not a bound — every allowed request past `softCap` performed a full O(n) scan and unexpired entries were never removed (CWE-400) | Medium (code + security) | **Fixed** in `e9b4436`: `hardCap` replaced by a real `maxEntries` bound that evicts oldest-seen IPs, the per-call eviction scan is capped, `size()` exposed as a test seam, and 8 unit tests added |
| `print_service_desktop.dart` `getLocalPrinters()` re-wrapped its own `PrintException`, losing `statusCode` | Medium (code) | **Fixed** in `111a0fe`: `on PrintException { rethrow; }` inserted in desktop, Windows and Linux together; 8 new behaviour tests; the bug was proven first (the test fails with `statusCode with value <null>` when the `rethrow` is removed) |
| `print_service_desktop.dart` `getLocalPrinters()` had no behaviour test | Medium (coverage) | **Fixed** in `111a0fe`: `apps/daftari/test/core/printing/print_service_desktop_test.dart` (8 tests) |
| `createIpRateLimiter` had no direct unit test; eviction branch uncovered and the map was closure-private | Medium (coverage) | **Fixed** in `e9b4436`: `backend/api/src/application/services/__tests__/ip-rate-limiter.test.ts` (8 tests) |
| `/sales/sync` fallback limiter denial path untested (only the injectable path was covered) | Medium (coverage) | **Fixed** in `e9b4436`: a 31st-request → 429 integration test added to `backend/api/test/api.test.ts` |
| 7 spec-drift items remained in the very files this branch edited (removed `shorebirdAppId`, deleted `RefreshLocalPrinters` and the stale "38 event classes" count, the non-existent `landing` flavour, the stub's `UnsupportedError` contract, the `:5000`/`:5150` port split, the stale `core/backend/hwid/` tree entry, `hydrated_bloc` placement) | Medium/Low | **Fixed** in `313bd72`: 15 corrections across `specs/ARCHITECTURE.md`, `PRD.md`, `DESIGN.md`, `USER_FLOW.md`, `DEVELOPMENT_ENVIRONMENT.md` |
| `.github/actions/cleanup-hive-locks/action.yml` failed the job when the directory was missing, and ran AFTER the tests so it could not prevent the failures it exists to prevent | Low | **Fixed** in `ef98e7f`: the action now exits 0 when the directory is absent, and the `fast-verify` cleanup step moved **before** `melos run test` |
| `PrintServiceStub` silently succeeds where the class previously threw `UnsupportedError` | Low | Accepted: the factory path never returned the throwing class (proven at `db8fb5a`), so no behaviour changed. The silent-failure trap is tracked as **DAFTARI-188** |
| The dead `print_service.dart` barrel no longer exports the `PrintService` contract | Low | Deferred — already tracked as **DAFTARI-182** |
| The factory still returns the no-op stub | Info | Pre-existing; **DAFTARI-188** |
| `ParentPidParser` byte-faithful, negative PIDs returned verbatim but ignored by `if (parentPid > 0)`, no shell interpolation ⇒ no command injection; the CI action's `rm -f "$lock"` is quoted and restricted to `test/_hive_test*` under a repo-relative workflow-controlled input ⇒ no path escape | Info / positive | No action |

**Note on the 429 failures:** the provider rate-limits concurrent subagent sessions. Rounds 1–2 dispatched two reviewers in parallel and the QA reviewer additionally fans out sub-subagents; the resulting contention produced `HTTP 429 "Too Many Requests"` before either reviewer could produce a report. Three further parent sessions (`ses_e1e35e543ffegruWYwfYFcNTxG`, `ses_e1e4c6266ffemfQLlxP3aOC0mD`, `ses_e1e3bd9afffeIgyD1CfPEv8zs0`, `ses_e1e317d28ffejdNyzQcat9w75W`, `ses_e1e2e2ae0ffeLQJPhFTHN48Pb6`, `ses_e1e28d350ffecBAbR9blKVWisj`) also failed with HTTP 429 — including solo dispatches with fan-out disabled — before the provider quota recovered. No reviewer session is reused: every dispatch uses a fresh, context-free session as the skill requires.

**Report (round 4) — STATUS BLOCKED, Risk Level High.** The reviewer reviewed HEAD `1ed1f7b` and accepted 19 findings (3 High, 12 Medium, 4 Low). Its four mandatory review sections (`full_code_reviewer`, `security_auditor`, `broad_spec_compliance`, `full_test_coverage`) could **not run** — the provider returned HTTP 429 / content-safety errors — and it also reported that CI run `43886527057` had the `flutter-matrix` and packaging jobs **SKIPPED**, that the working tree was dirty, and that no PR existed. Each accepted finding was re-verified against the source at the base commit `db8fb5a` before a disposition was chosen:

| Finding | Class | Reviewer claim | Verified verdict | Disposition |
|---------|-------|----------------|------------------|-------------|
| **SEC-1** | High | The Worker rebuilds the rate-limiter state on every request, so the 31st request is not rate-limited | **True, and PRE-EXISTING.** Base `db8fb5a:backend/api/src/index.ts` already created the app inside `Worker.fetch`, and base `sessions.ts` already created its hits map inside `registerSessions` (the base comment already said the state is bound to the app instance). `git diff origin/development...HEAD -- backend/api/src/index.ts backend/api/src/app.ts` is **empty** — neither file is a changed unit of this branch | **Out of scope — tracked, not fixed.** Enabling a limit that was never effective is a behaviour change beyond a cleanup. Tracked as **DAFTARI-191** / `docs/followups.md` #85 |
| **SEC-1-TEST** | Medium | No Worker-lifecycle test; eviction identity not proven | **Partly true.** The eviction-identity half is now proven by the new limiter test (`2b6e0a2`): the oldest IP is evicted at the bound and is re-admitted with a fresh budget. The Worker-level half cannot be tested before SEC-1 is fixed — the test would fail on purpose | **Partly closed; the rest tracked** as **DAFTARI-192** / #86 with the test plan (31st request → 429) |
| **CODE-L1** | Low | The sessions limiter's `maxEntries` drifted 5 000 → 10 000, and `softCap` can be configured without `maxEntries` | **Half false.** The base `hardCap` (5 000) was never a cap — it was a *stop-eviction threshold* inside the sweep loop, so the base map could grow without bound; 10 000 is the base's eviction trigger threshold and is now a genuine bound. The second half (an unbounded limiter is constructible) is true | **Fixed** in `d5fa35e`: `maxEntries` is now a **required** option with a compile-time contract test, so an unbounded limiter cannot be constructed. The 5 000 → 10 000 "drift" claim is rejected with the base-code evidence above |
| **SEC-L1** | Low | `CF-Connecting-IP` is trusted without an explicit trust boundary | **True** — `sessions.ts:108-113` and `sales.ts:91` read the header directly | **Deferred** — trusted-header policy is a deployment decision. Tracked as **DAFTARI-193** / #87 |
| **SPEC-1 … SPEC-5** | Medium ×5 | The HWID sections of `ARCHITECTURE.md`, `PERFORMANCE_GUIDELINES.md` and `USER_FLOW.md` contradict the implementation (missing `linux_hwid_provider.dart`, `WindowsHwidProvider` listed as the only provider, sync signatures instead of `Future<…>`, obsolete WMI/`wmic`/dmidecode algorithms, a dead `SessionSyncService` caller) | **All five confirmed** against `apps/daftari/lib/core/licensing/` and the runtime gating in `shift_bloc.dart` / `checkout_bloc.dart` | **Fixed** in `73e3db8` (+ the earlier re-sync `313bd72`): the provider tree, the platform selection, the async signatures, the real Windows/Linux algorithms, the `CS-XXXX-XXXX` format and the dead-caller status are now stated accurately |
| **AUD-1 / AUD-2** | High ×2 | The artifacts claim "READY TO MERGE" and blanket behaviour preservation | **Confirmed.** The artifacts did claim a blanket verdict and did not enumerate the two deliberate behavioural deltas | **Fixed in this wave** — `final-report.md` now states the evidence-backed status, enumerates every delta (bounded limiter map, `:5150` base-URL constants, dead-tree deletion, dependency move, unchanged stub semantics) and names the pre-existing Worker-limiter defect as **not** a branch delta |
| **AUD-3 / AUD-4** | Medium ×2 | `verification-results.md` must report each gate independently as PASSED / FAILED / SKIPPED / NOT RUN, and must not claim an aggregate green over skipped or not-run gates | **Confirmed** | **Fixed in this wave** — the verification artifact now carries a per-gate status table that marks the CI `flutter-matrix` and packaging jobs **SKIPPED** and the four mandatory review sections of round 4 **NOT RUN** |
| **AUD-5** | Medium | `independent-review.md` must record the exact reviewed commit per CodeRabbit round plus the review-round dispositions | **Confirmed** | **Fixed in this wave** — every CodeRabbit round below now names the commit it reviewed, and the round-4/round-5 dispositions are recorded here |
| **AUD-6** | Medium | `findings.md` metrics must be recomputed from `git diff --stat`, and three lines carried trailing whitespace | **Confirmed** (3 whitespace errors at `findings.md:106,141,159`) | **Fixed** in `8fe3802` (whitespace) and in this wave (metrics + the DUP-03 / DUP-02 reconciliation below) |
| **AUD-7** | Medium | `implementation-progress.md` counts and status are stale | **Confirmed** | **Fixed in this wave** — status, commit table and follow-up table updated to the final commit set |
| **AUD-8** | Medium | An "unsupported 100 % C# coverage" claim | **False premise — rejected.** The only `100%` strings under `docs/audits/` are "100 % of first-party source **directories** accounted for" (`audit-coverage.md:95`, `final-report.md:29`, `independent-review.md:91`). No C# code-coverage percentage is published anywhere | **Rejected with evidence; wording tightened** to "source-directory accounting" so it cannot be misread as code coverage |
| **AUD-9** | Low | The findings ledger mixes several defects per entry and carries trailing whitespace | **Confirmed** for the whitespace; the per-entry format is already one defect per entry with severity, file:line, evidence and verification state | **Fixed** — trailing whitespace removed (`8fe3802`); the ledger format is now explicit in the header |
| **AUD-10** | Low | HWID claims contradict each other across artifacts | **Confirmed** — the DUP-03 entry still claimed the dead `core/hwid` tree was used by the printing layer, and DUP-02 still said "7 new xunit tests" (the parser has 8) | **Fixed in this wave** — both entries corrected against the source |
| **Mandatory sections not run** | High | `full_code_reviewer`, `security_auditor`, `broad_spec_compliance`, `full_test_coverage` did not run (provider 429) | **Confirmed** | **Not substitutable** — a fresh, context-free QA + coverage pair is dispatched on the final HEAD after this wave; the earlier 429 sessions are recorded as NOT RUN, never as passed |

---

**Report (final dispatch) — STATUS BLOCKED, Risk Level High.** The reviewer ran the `qa-post-implementation` skill against the branch diff on HEAD `d095d82` (upstream `a0b195d`) and accepted **9 findings — 0 Critical, 0 High, 6 Medium, 3 Low** (gate score `100 − 25×C − 10×H − 5×M − L` = **67**, pre-fix). No runtime defect was claimed. Its four mandatory independent sub-sections (`full_code_reviewer`, `security_auditor`, `broad_spec_compliance`, `full_test_coverage`) could **not run** because the dispatch instruction forbids sub-agent fan-out in this session (the provider 429s concurrent sessions) — a process blocker, not a code finding, escalated at the human checkpoint together with the coverage gate. Its CI evidence: run **`44015350358`** at `a0b195d` = green, **3 002 tests passed / 0 failed / 2 skipped** (Flutter 1 645, landing 28, backend api 492 / shared 270 / realtime 95 / admin_host 170 / paymob_webhook 80, PrintServer Windows 116 + 2 skipped, Linux 106), app analyze clean, app format "511 files (0 changed)", landing format "17 files (0 changed)", Trivy scan + worker dry-run successful, `git diff --check` exit 0, and no new TODO/FIXME, debug prints or secret patterns in the diff.

| # | Finding | Class | Location | Reviewer fix | Disposition |
|---|---------|-------|----------|--------------|-------------|
| AUD-01 | Batch-3 note still says sessions keeps soft 10 000 / hard 5 000 and sales is uncapped; Batch-8 note says 7 xunit tests | Medium | `implementation-progress.md:26,31` | state the current limiter config (both routes: softCap 10 000, maxEntries 10 000) and the 8 `[Fact]`s in `ParentPidParserTests.cs` | Confirmed — drift introduced by this branch. **Applied in wave 4** (user-authorized): the Batch-3 note now states the current limiter config (both routes softCap 10 000 / maxEntries 10 000) and the Batch-8 note says 8 `[Fact]`s |
| AUD-02 | Evidence table reports landing 31, API 489 and a stale branch state | Medium | `verification-results.md:68,109,116` | landing 28, API 492; keep historical rows only when dated; pin the reviewed SHA | Confirmed — **applied in wave 4** (user-authorized) |
| AUD-03 | Reviewed HEAD / commit count / scope totals pinned to an older SHA; "3 C# projects" while naming four | Medium | `final-report.md:6,13,39,41` | pin the final SHA, say 4 C# projects, regenerate totals from `git diff --stat` | Confirmed — **applied in wave 4** (user-authorized) |
| AUD-04 | HWID tree recorded as 6 files although 7 were deleted; .NET project count 3 although four exist | Medium | `audit-coverage.md:25,91` | "7 files, deleted by this branch"; 4 .NET projects | Confirmed — **applied in wave 4** (user-authorized) |
| AUD-05 | Landing baseline says 31 (CI measures 28); inventory lists `hydrated_bloc` as a regular dependency although it is test-only now | Medium | `baseline-validation.md:15`, `repository-inventory.md:21` | correct the landing baseline to 28; mark the dependency row test-only / a pre-change snapshot | Confirmed — **applied in wave 4** (user-authorized) |
| SPEC-01 | Cloud flavour described as "Desktop + web" while `FlavorConfig` permits only windows/linux | Medium | `specs/PRD.md:614` | "cloud: Desktop only, cloud sync via Turso … platforms: windows/linux" | Confirmed (ARCHITECTURE was already corrected in `26321f4`) — **applied in wave 4** (user-authorized) |
| SPEC-02 | Architecture implies the factory dispatches per platform and the stub throws `UnsupportedError` | Low | `specs/ARCHITECTURE.md:1706-1716` | document the current no-op behaviour, reference DAFTARI-188, do not imply conditional dispatch | Confirmed — deferrable, **applied in wave 4** (user-authorized) |
| SPEC-03 | "HWID provider queried at most once" — `LicenseEngine.getDeviceId()` retries after a null provider result | Low | `specs/PERFORMANCE_GUIDELINES.md:202,233` | "caches the first non-null result; retries after a null provider result" | Confirmed — deferrable, **applied in wave 4** (user-authorized) |
| CODE-01 | The Dart config file is called the sidecar network config's "single source of truth" while both .NET hosts and packaging keep their own `5150` literals | Low | `apps/daftari/lib/core/printing/print_server_config.dart:3-7` | narrow to "single source of truth for Dart print clients" | Confirmed — deferrable, **applied in wave 4** (user-authorized) |

The security section raised **no** new findings: no auth, payment, PII or crypto surface changed and no secret assignments were found; residual risks were listed as Info only — DAFTARI-191 (Worker limiter state per request), DAFTARI-193 (`CF-Connecting-IP` trust boundary), DAFTARI-188 (inert factory print path) and DAFTARI-185 (Linux PNG flake).

**Gate consequence:** the final QA dispatch reports 0 Critical and 0 High. Its 6 Medium documentation/spec findings + 3 Low findings were all applied in the **user-authorized wave 4** (the user chose "Wave 4: QA fixes + G4/G6 tests"); its four mandatory independent sub-sections did not run because of the no-dispatch constraint, so the wave-4 dispatch re-enables fan-out. The wave-4 authorization is logged in `verification-results.md`.

---

## Reviewer 2 — Correctness and regression prevention (`general` / test-coverage-analysis)

**Scope:** Functional regressions, incorrect code removal, changed business behavior, security regressions, data integrity, API/IPC compatibility, resource lifecycle, concurrency, test adequacy.

| Round | Session | Status | Coverage gaps (untested units, file:line) | Addressed? |
|-------|---------|--------|-------------------------------------------|------------|
| 1 | `ses_e1eafa263ffdVV64eWBIrwrAxH` | Provider error HTTP 429 | — | n/a |
| 2 | `ses_e1e903c12ffeICSpdrufGGhYEt` | Provider error HTTP 429 | — | n/a |
| 3 | `ses_e1e555946ffepVmupkKToOlgaR` | Provider error HTTP 429 | — | n/a |
| 3 (serial, no fan-out) | `ses_e1e1ae786ffeGu8xsMHo999aAf` | **Reported — VERDICT FAIL** | 3 Medium gaps (G1, G2, G3 below) | **All three addressed** in `e9b4436` / `111a0fe` |
| 4 | `ses_e1b9090e2ffeTflDiHEy0McwGG` | No report returned (provider error) — superseded by round 5 | — | n/a |
| 5 | `ses_e1b400d92ffdJtqEie50Kw8Wh4` | **Reported — VERDICT FAIL** (reviewed HEAD `1ed1f7b`) | 3 Medium (M1 `LinuxPrintService.getLocalPrinters`, M2 `WindowsPrintService.getLocalPrinters`, M3 limiter fail-open semantics) + 4 Low | **All 3 Medium closed** in `68d0696` / `2b6e0a2`; 1 of the 4 Low gaps closed by the same limiter test, the other 3 tracked as DAFTARI-194…196; two weak-test notes tracked as DAFTARI-197 / DAFTARI-198 |
| 6 | `ses_e184bfa2effe9NnBubMDczfV0a` | **Reported — VERDICT FAIL** (reviewed HEAD `a0b195d`) | 6 Low (G1…G6 below), 0 Critical/High/Medium, score 94 | G4 + G6 **closed in wave 4** (`702e26e` / `48523fe`); G1–G3 + G5 deferred by explicit user decision (DAFTARI-194…197, DAFTARI-199) |
| 7 | `ses_e14908877ffeHMViRS6U0GBkZe` | **Reported — VERDICT FAIL** (reviewed HEAD `8eb73fd`) | 4 Low, 0 Critical/High/Medium, score 96 (strict zero-gap gate FAIL) | The same 4 gaps: the Windows netstat PID parser (`print_server_manager.dart:348-362`), the Linux `ss` PID parser (`print_server_manager_linux.dart:370-387`), the Linux spawn `ASPNETCORE_URLS` seam (`print_server_manager_linux.dart:230-239`) and the Hive-lock cleanup action fixture test (`.github/actions/cleanup-hive-locks/action.yml:15-28`). All stay deferred by explicit user decision as DAFTARI-194…197 / DAFTARI-199 |
| 8 | `ses_e0b71bf4bffefOT2wUqTRg4Fnk` | **Reported — VERDICT FAIL** (reviewed HEAD `14767fd`) | 0 Critical/High/Medium; 7 Low branch-owned gaps, score 93 under the strict formula | Added: per-assembly `ParentPidParser` test for `PrintServer.Linux.Tests` (G6), limiter cap pinning (G7), exact window boundary (G8), `ParentPidParser` edge cases (G9), client disposal in `print_server_config_test.dart` (G10), linux/windows test dedup (G11). Verified pre-existing at base and out of the changed-unit scope: the Worker rebuilding the limiter per request (`backend/api/src/index.ts`, DAFTARI-191/192), the netstat/`ss` parser seams (DAFTARI-194/195) and the Linux spawn env seam (DAFTARI-196/197). All branch-owned Lows deferred by explicit user decision, tracked as DAFTARI-201 / follow-up #95 |

**Report (round 3):** the reviewer ran the full analysis on the branch diff and returned **FAIL — the zero-gap gate was not met**. Its measured evidence: Flutter printing tests 6 passed; API route tests 191 passed; Parent PID parser tests 8 passed; the new TypeScript helper at 66.66 % statements / 50 % branches / 78.57 % lines with `ip-rate-limiter.ts:47-49` uncovered; `print_service_desktop.dart` at 2/79 lines with the new `getLocalPrinters()` at 0 %.

| Gap | Class | Unit | Resolution |
|-----|-------|------|------------|
| **G1** | Medium | `PrintServiceDesktop.getLocalPrinters` (`print_service_desktop.dart:104`) — no behaviour test (success, HTTP failure, transport failure, timeout, malformed JSON, URL, headers all unverified). The reviewer also spotted that the `PrintException` thrown at `:117` was re-wrapped by the catch-all at `:128`, losing `statusCode` | **Fixed** in `111a0fe`: `on PrintException { rethrow; }` + `apps/daftari/test/core/printing/print_service_desktop_test.dart` with 8 tests (happy 200, empty list, URL + headers, custom base URL, 503 → `PrintException` with `statusCode == 503`, `ClientException` → `originalError` preserved, `TimeoutException` → `originalError` preserved, malformed JSON → `PrintException`) |
| **G2** | Medium | `createIpRateLimiter` (`ip-rate-limiter.ts:28`) — no direct unit test, no `__tests__` directory, missing expiry / exact-retry / denied-does-not-extend / eviction coverage; eviction was unobservable because the `Map` was closure-private | **Fixed** in `e9b4436`: `size()` added as a test seam and `backend/api/src/application/services/__tests__/ip-rate-limiter.test.ts` added with 8 tests (allow below max; deny at the limit with exact `retryAfterMs`; per-IP isolation; release once the window elapsed; a denied request does not extend the window; expired-IP eviction above the soft cap; the tracked-IP count stays within the hard bound; `size()` reports the count) |
| **G3** | Medium | `/sales/sync` fallback limiter (`sales.ts:92-96`) — only the *injectable* path was tested (`api.test.ts:1058-1091`); the fallback denial path was untested, although the `/sessions/start` fallback had that exact test at `api.test.ts:810-832` | **Fixed** in `e9b4436`: a matching integration test added beside the sales route tests — the first 30 same-IP syncs succeed and the use case is called 30 times, the 31st returns 429 `RATE_LIMITED` with `retry_after_ms > 0` and the use case is **not** called, and a different `CF-Connecting-IP` is unaffected |

Low-priority test-quality notes the reviewer raised, and their disposition:

| Note | Disposition |
|------|-------------|
| L1 — `PrintServiceFactory.create` identity is not asserted (the test title says "returns new" but only the type is checked) | Accepted as a Low note; the factory behaviour is unchanged by this branch and is already tracked as DAFTARI-188 |
| L2 — the Linux manager test uses a nonexistent candidate then conditionally skips its assertions, so `ASPNETCORE_URLS` is never actually verified | Accepted as a Low note; the value is unchanged from the base commit |
| L3 — the CI composite action has no fixture smoke check | Partly addressed in `ef98e7f` (the action now exits 0 on a missing directory); a dedicated actionlint/fixture job remains open as a Low note |

**Report (round 5) — VERDICT FAIL.** The reviewer re-ran the changed-unit coverage analysis on HEAD `1ed1f7b` and returned FAIL: the zero-gap rule was not met. Its three Medium gaps and four Low gaps, with the disposition of each:

| Gap | Class | Unit | Disposition |
|-----|-------|------|-------------|
| **M1** | Medium | `LinuxPrintService.getLocalPrinters` (`print_service_linux.dart:22`) — the changed `on PrintException { rethrow; }` branch (line 40) had no behaviour test | **Closed in `68d0696`** — `apps/daftari/test/core/printing/print_service_linux_test.dart` (8 tests: happy 200, empty list, URL + `Accept` header, custom base URL, 503 → `PrintException` with `statusCode == 503` and endpoint `/api/printing/local-printers`, `ClientException` → `originalError` preserved, `TimeoutException` → `originalError` preserved, malformed JSON → `PrintException`). Mutation proof: removing the `rethrow` makes the 503 test fail with `statusCode with value <null>` |
| **M2** | Medium | `WindowsPrintService.getLocalPrinters` (`print_service_windows.dart:22`) — same missing branch test | **Closed in `68d0696`** — `apps/daftari/test/core/printing/print_service_windows_test.dart` (the same 8 tests), with the same mutation proof |
| **M3** | Medium | `createIpRateLimiter` fail-open semantics (`ip-rate-limiter.ts:65`) — the old test asserted only that the map stayed small, never that an **evicted active** IP is re-admitted with a fresh budget | **Closed in `2b6e0a2`** — a new test drives the hard bound, asserts the oldest IP is evicted, then proves the evicted IP is re-admitted (`allowed: true`) and subsequently denied with the exact `retryAfterMs` of its new hit. Mutation proof: removing the `maxEntries` eviction block fails the test |
| **L1** | Low | The bounded eviction scan (`MAX_EVICTION_SCAN_PER_CALL`, `ip-rate-limiter.ts:13`/`:54`) was unverified | **Closed in `2b6e0a2`** — a new test seeds 1 500 expired IPs, proves one call cannot shed them all (bounded work) and that repeated calls finish the eviction. Mutation proof: removing the scan cap fails the test |
| **L2** | Low | `_pidsListeningOnPrintServerPort` (`print_server_manager.dart:348`) is untested — the existing tests inject PIDs and bypass the netstat/`ss` parsing | **Deferred** — tracked as **DAFTARI-194** / `docs/followups.md` #88 |
| **L3** | Low | `_pidsListeningOnPrintServerPort` (`print_server_manager_linux.dart:370`) — same gap on the Linux manager | **Deferred** — tracked as **DAFTARI-195** / #89 |
| **L4** | Low | The `_spawn` environment wiring (`ASPNETCORE_URLS`, `print_server_manager_linux.dart:208`/`:237`) is not observed by any test seam | **Deferred** — tracked as **DAFTARI-196** / #90 |
| **N1** | Low note | The Linux manager environment test (`test/linux/print_server_manager_linux_test.dart:30-79`) builds its own expected environment and skips its assertions, so it cannot fail | **Deferred** — tracked as **DAFTARI-197** / #91 |
| **N2** | Low note | `print_service_test.dart:16-19` claims "returns new PrintServiceStub" but never compares two `create()` results; the limiter tests used loose `size <= 3` assertions | **Closed in wave 4** — the limiter assertions are exact (`2b6e0a2`) and the factory identity is now asserted (`702e26e`); **DAFTARI-198** / #92 is resolved |

The reviewer also confirmed the existing tests it inspected as sound: `ParentPidParserTests.cs` (8 facts), `print_server_config_test.dart`, `print_service_test.dart`'s stub-semantics test, and the session fallback limiter test.

**Report (round 6) — VERDICT FAIL under the strict zero-gap policy (0 Critical/High/Medium, 6 Low, score 94).** The reviewer re-ran the changed-unit coverage analysis on HEAD `a0b195d` (55 files changed; 17 changed production sources, 15 of them mapped to tests, 2 deletion-only) and returned FAIL: the zero-gap rule is still not met, although **no Critical, High or Medium gap remains** and the severity score is 94 (> 90). Its evidence: C# targeted 8 passed, 0 failed; Flutter targeted changed printing/manager tests 50 passed, 0 failed; vitest limiter + API route tests 203 passed, 0 failed; limiter coverage 100 % statements/lines/functions and 94.44 % branches; targeted changed-line coverage — desktop service 18/18, factory 1/1, Linux/Windows/stub/Web services 1/1 each, Windows manager 2/6 (parser path uncovered), Linux manager 1/7 (environment and parser paths uncovered).

| Gap | Class | Unit | Disposition |
|-----|-------|------|-------------|
| **G1** | Low | `_pidsListeningOnPrintServerPort` (`print_server_manager.dart:348-361`) — the netstat parser is untested because the existing tests inject `pidsOnPort` | **Deferred** — already tracked as **DAFTARI-194** / `docs/followups.md` #88 |
| **G2** | Low | `_pidsListeningOnPrintServerPort` (`print_server_manager_linux.dart:370-386`) — the `ss` parser is untested for the same reason | **Deferred** — already tracked as **DAFTARI-195** / #89 |
| **G3** | Low | The spawned `ASPNETCORE_URLS` is never observed (`print_server_manager_linux.dart:229-239`), and the existing environment test (`test/linux/print_server_manager_linux_test.dart:30-79`) cannot fail | **Deferred** — already tracked as **DAFTARI-196** / #90 and **DAFTARI-197** / #91 |
| **G4** | Low | `PrintServiceFactory.create` identity is not asserted (`print_service_factory.dart:20-22`, `print_service_test.dart:16-19`) | **Closed in wave 4** — the test now compares two `create()` results and asserts they are distinct instances (`702e26e`; mutation proof: caching the instance fails the test). **DAFTARI-198** / #92 is resolved |
| **G5** | Low | The CI composite action (`.github/actions/cleanup-hive-locks/action.yml:15-28`) has no fixture test proving lock removal, selective deletion, missing-directory behaviour or custom directory handling | **Deferred — newly tracked** as **DAFTARI-199** / #93 |
| **G6** | Low | The soft-cap eviction path (`ip-rate-limiter.ts:55-63`) is exercised only with fully expired IPs, so active-entry survival and the retained rate-limit budget after a soft-cap sweep are unproven (a mutation that deletes active entries would still pass) | **Closed in wave 4** — a new test mixes an active IP with expired IPs under the soft cap and proves the active entry survives and keeps the budget it already spent (`48523fe`; mutation proof: deleting active entries fails the test). **DAFTARI-200** / #94 is resolved |

The reviewer listed one informational item that it did not count: the `ipHits[0] ?? now` branch (`ip-rate-limiter.ts:46`) is uncovered and is reachable only with `maxPerWindow == 0`, i.e. defensive behaviour for an invalid option.

**Gate consequence:** G4 and G6 were closed in wave 4 (`702e26e`, `48523fe`); **4 Low changed-unit gaps remain** (G1–G3 and G5), all deferred by the user's explicit decision and tracked as DAFTARI-194…197 and DAFTARI-199. Critical/High/Medium are all zero and the score is 94 (> 90), but the strict zero-gap clause is still not met — the residual gaps are documented, tracked and deferred by the user, not silently ignored.

---

## Reviewer 3 — Audit completeness

**Scope:** Every first-party directory covered? Exclusions justified? Findings adequately investigated? Cross-component duplication investigated? Automated findings correctly interpreted? Missed opportunities? Validation claims supported by evidence?

**Status: COMPLETED** during the read-only audit phase (before any source edit), documented in `audit-coverage.md` and `findings.md`.

| Check | Result |
|-------|--------|
| First-party source directories audited | 100% accounted for (Flutter app + shared `lib/`, Flutter Web admin, Jaspr landing, 5 TypeScript backend packages, 4 .NET projects (PrintServer, PrintServer.Linux, PrintServer.Tests, PrintServer.Linux.Tests), CI/CD, specs, docs) |
| Exclusions | Build outputs, `node_modules/`, `.dart_tool/`, .NET `bin`/`obj/`, generated `shorebird.yaml` in `build/`, untracked `.iml` files, untracked user input files — all justified in `repository-inventory.md` §7 |
| Findings investigated | 10 confirmed + 1 raised during implementation = 11 tracked; 10 resolved, 1 rejected with evidence, 0 open, 0 deferred |
| Cross-component duplication | Dart cross-app (no true duplication), cross-language contracts (status quo, no codegen), Dart internal (print services, HWID), TS internal (rate limiters), C# internal (ParseParentPid) |
| Validation claims | Every claim backed by a command exit code recorded in `verification-results.md` |
| Missed opportunities | The implementation phase surfaced **3 additional real defects** that the audit had not recorded, all now tracked: PrintServer client endpoint/SVG payload mismatch (DAFTARI-187), the Turso in-memory client test timeout (DAFTARI-186), and the factory-never-wires-real-implementations no-op printing path (DAFTARI-188) |

---

## CodeRabbit local review (mandatory additional gate)

CLI `0.9.5`, authenticated (`coderabbit doctor` → 9 passed). Every round was run from the repository root with `--base origin/development`; the reviewed commit is named per round below (AUD-5).

### Round 1 — 7 findings (3 `minor`, 4 `major`)

Every finding was independently verified against the source before disposition. CodeRabbit's severity vocabulary (`minor`/`major`) is re-mapped to the gate's Critical/High/Medium/Low after verification.

| # | CodeRabbit severity | Location | Claim | Verified verdict | Gate class | Action |
|---|--------------------|----------|-------|------------------|-----------|--------|
| 1 | minor | `print_service_stub.dart` | Doc comment and behavior disagree; "the previous implementation threw `UnsupportedError`" | **False premise.** The *factory* previously returned `StubPrintService` (a silent no-op declared in `print_service_factory.dart`). The throwing `PrintServiceStub` was dead code never returned by the factory and only exported by the dead barrel. The new doc comment accurately describes the no-op. | Informational — rejected | None |
| 2 | major | `PrintServer/Program.cs` | Does `ParentPidParser.Parse` preserve the removed behaviour? Is `PrintServer.Common` referenced? | **False premise.** The implementation exists at `PrintServer.Common/ParentPidParser.cs` with a verbatim body and is linked into both projects via `<Compile Include="..\PrintServer.Common\ParentPidParser.cs" Link="ParentPidParser.cs" />`. Both Release builds succeed and `dotnet format --verify-no-changes` passes. CodeRabbit could not resolve the linked file. | Informational — rejected | Added a negative-value test to close the open behavioural question (commit `2668f4a`) |
| 3 | major | `print_service_desktop.dart` | Client endpoints (`/api/printing/print-receipt`, `print-barcode`, `print-ticket`, body `svg_base64`) do not match the server routes (`/api/printing/receipt`, `barcode`, `ticket`, body `data`) | **True, but pre-existing and out of scope.** `git diff origin/development...HEAD -- apps/daftari/lib/core/printing/print_service_desktop.dart` shows the branch touched only the import swap, the base-URL constant, `@override`, and the added `getLocalPrinters()`. The wrong paths pre-date the branch, and all three platform services are dead code. | Out of scope — pre-existing | Tracked as **DAFTARI-187** / `docs/followups.md` #80 |
| 4 | major | `print_service_factory.dart` | The factory returns a silent no-op stub; "the old code threw `UnsupportedError`" | **False premise**, same as #1. The old `_createService()` returned the no-op `StubPrintService`. | Informational — rejected | None |
| 5 | minor | `print_service_desktop.dart` `getLocalPrinters()` | Does not wrap failures in `PrintException`; no timeout | **True — this was new code added by this branch.** | **Medium (blocking)** | **Fixed** (commit `a371de1`): now matches `LinuxPrintService`/`WindowsPrintService` — 10 s timeout, `PrintException` on non-200 / `ClientException` / catch-all |
| 6 | major | `backend/api/src/routes/sales.ts` | The fallback limiter map grows without bound; configure `softCap`/`hardCap` | **True that the map is unbounded; pre-existing** (the original inline limiter had no eviction either, contrary to CodeRabbit's claim). The line *is* part of this branch's diff. | **Medium (blocking)** | **Fixed** (commit `31560ba`): added `softCap: 10_000`, `hardCap: 5_000`, mirroring `/sessions/start`. Functionally identical rate-limit semantics; eviction only removes IPs whose timestamps are all expired |
| 7 | major | `backend/api/src/application/services/ip-rate-limiter.ts` | (1) no eviction when `softCap` unset; (2) filtered timestamps are not written back on denial | (1) Same as #6 → **fixed**. (2) **Rejected**: the original `sessions.ts` and `sales.ts` limiters also did not write back on denial; the helper faithfully preserves that behaviour, and changing it would be an unnecessary behaviour change. | Mixed — part 1 fixed, part 2 informational | Part 1 fixed via `31560ba`; JSDoc on `softCap` now warns that omitting it leaves the map unbounded |

### Round 2 — 1 finding (`major`), after the fix commits

| # | CodeRabbit severity | Location | Claim | Verified verdict | Gate class | Action |
|---|--------------------|----------|-------|------------------|-----------|--------|
| 8 | major | `print_service_factory.dart` / `print_service_stub.dart` | "Can a real print or export caller receive `PrintServiceStub` and treat normal completion as success? Both operations previously reported that they were unsupported." | **False premise, proven at the base commit** with `git show db8fb5a:…`: the base `_createService()` returned the no-op `StubPrintService`, whose print/export methods completed successfully and returned `''`. The throwing class was a different, dead class. The only observable delta on the factory path is `baseUrl` (`http://localhost:5001` → `http://127.0.0.1:5150`), and no consumer reads `PrintService.baseUrl`. | Informational — rejected | None. The *underlying* product defect (the factory never wires a real platform implementation) is pre-existing and is now tracked as **DAFTARI-188** / `docs/followups.md` #82 |

### Round 3 — 3 findings (1 `major`, 2 `minor`), on the artifact wave

`coderabbit review --agent --base origin/development` run on `a0b195d`; 55 files reviewed; the CLI reported `review_completed`.

| # | CodeRabbit severity | Location | Claim | Verified verdict | Gate class | Action |
|---|--------------------|----------|-------|------------------|-----------|--------|
| 9 | major | `apps/daftari/lib/core/printing/print_service_stub.dart` | Callers may obtain `PrintService` through `print_service.dart` / `print_service_stub.dart`; removing the local declaration removes that exported name | **False premise.** `print_service.dart` has **zero importers** — it is the dead barrel already tracked as **DAFTARI-182** / follow-up #77. Every consumer imports `print_service_interface.dart` directly (`sales_pdf_exporter.dart:5`, `print_service_windows.dart:8`, `print_service_web.dart:11`, `print_service_factory.dart:6`, `print_service_desktop.dart:8`, `print_service_linux.dart:8`, plus the 6 printing test files); `print_service_stub.dart` is imported by `print_service_factory.dart`, `test/core/printing/print_server_config_test.dart` and `test/core/printing/print_service_test.dart`. `flutter analyze` reports no issues and the full Dart suite compiles every test file, so no caller breaks. | Informational — rejected | None |
| 10 | minor | `docs/followups.md:106` | The WebPrintService follow-up lists receipt routes that do not exist on the sidecar | **True** — the entry named `/api/printing/print-receipt`, while `PrintServer/Program.cs` maps `/api/printing/receipt` (:70), `barcode` (:202), `ticket` (:217), `health` (:61) and `local-printers` (:64); `PrintServer.Linux/Program.cs` mirrors them at :93/:249/:277 | Low | **Fixed** in `d095d82` — the entry now lists the real routes |
| 11 | minor | `specs/ARCHITECTURE.md:66` | The Build Flavors summary listed web as a cloud target | **True** — `flavor_config.dart:76` local → `['windows','linux']`, `:89` cloud → `['windows','linux']`, `:102` admin → `['web']`. The line is inside the branch diff (`313bd72` changed "Four flavors" → "Three flavors" on that exact line and left the pre-existing platform inaccuracy) | Low | **Fixed** in `26321f4` — the line now reads `cloud (desktop only, Turso sync)` |

### Round 5 — 1 finding (`minor`), on the wave-4 artifact commit

`coderabbit review --agent --base origin/development` run on `8eb73fd`; the CLI reported `review_completed` with 1 finding.

| # | CodeRabbit severity | Location | Claim | Verified verdict | Gate class | Action |
|---|--------------------|----------|-------|------------------|-----------|--------|
| 12 | minor | `specs/USER_FLOW.md:1818` | The device-session section reads as active app behaviour: the diagram presents registration as an app-startup flow and the following bullets present heartbeat and cleanup as active, while the new note says no live Flutter code starts a device session | **True.** `SessionSyncService` (`apps/daftari/lib/core/backend/workers/session_sync_service.dart:21`) has zero importers (grep over the whole repo finds only its own class declaration), so the flow in section 20c is unwired. The note added by this branch and the surrounding diagram/bullets contradicted each other. | Low | **Fixed** in `72851e3` — section 20c is labelled "planned, not wired", the diagram carries a "no live Flutter caller executes these steps today" banner, and the heartbeat / cleanup / active-sessions bullets are marked as planned |

### Round 6 — 0 findings, on the final artifact HEAD

`coderabbit review --agent --base origin/development` run on `c07ceaf`; the CLI reported `review_completed` with **0 findings** across the full branch diff (all 55 changed files reviewed). Score **100** — 0 Critical, 0 High, 0 Medium, 0 Low. Nothing to verify, disposition or fix; this is the clean CodeRabbit gate for the PR stage.

### CodeRabbit gate result

| Round | Reviewed commit | Critical | High | Medium | Low | Score (`100 − 25C − 10H − 5M − L`) | Gate |
|-------|-----------------|----------|------|--------|-----|-----------------------------------|------|
| 1 | `50cc0c7` (end of Batch 8, pre-fix) | 0 | 0 | 2 | 0 | 90 (pre-fix) | FAIL — 2 Medium blockers |
| 1 (post-fix) | `4782788` (after the round-1 fix wave) | 0 | 0 | 0 | 0 | 100 | PASS |
| 2 | `4782788` | 0 | 0 | 0 | 0 | 100 | PASS |
| 3 | `a0b195d` (after the artifact wave) | 0 | 0 | 0 | 0 | 100 | PASS — 2 Low fixed, 1 `major` rejected on a false premise |
| 4 | `4d7fc43` (before wave 4) | 0 | 0 | 0 | 1 | 99 | PASS after fixing the Low in the wave-4 artifact commit (the residual-risk summary now also lists the pending final-QA findings) |
| 5 | `8eb73fd` (wave-4 artifact commit) | 0 | 0 | 0 | 1 | 99 | PASS after fixing the Low in `72851e3` |
| 6 | `c07ceaf` (final artifact HEAD) | 0 | 0 | 0 | 0 | 100 | PASS — clean review, no findings |

Zero confirmed Critical/High/Medium remain on the current HEAD. CodeRabbit findings were **not** passed to the independent reviewers.

---

## Fix round (round 1 → round 2)

| Commit | Stack | Change | FAST gate evidence |
|--------|-------|--------|--------------------|
| `31560ba` | backend/api | Cap the `/sales/sync` fallback limiter map (`softCap` 10 000 / `hardCap` 5 000) + JSDoc warning on `softCap` | `npm run typecheck` exit 0; `npm test` → 28 files / 480 tests passed, exit 0 |
| `a371de1` | apps/daftari | `PrintServiceDesktop.getLocalPrinters()` wraps failures in `PrintException` and applies a 10 s timeout, matching the Windows/Linux services | `dart format --set-exit-if-changed lib test` → 507 files, 0 changed; `flutter analyze` → "No issues found!"; `flutter test test/core/printing/` → 48 passed |
| `2668f4a` | PrintServer.Tests | 8th xunit test `Parse_NegativeValue_IsParsedAndIgnoredByCallers` | `dotnet build PrintServer/PrintServer.csproj -c Release --no-restore` → 0 warnings / 0 errors; `dotnet test PrintServer.Tests` → 116 passed / 2 skipped |
| `4782788` | docs | `docs/followups.md` entries #80 and #81 | n/a (documentation) |

---

## Fix round (round 2 → round 3)

Driven by the two round-3 reviewer reports. Every fix was developed test-first (red → green); the red state was observed before the implementation changed.

| Commit | Stack | Change | TDD evidence | FAST gate evidence |
|--------|-------|--------|--------------|--------------------|
| `e9b4436` | backend/api | Replaced `hardCap` (a stop-eviction threshold) with a real `maxEntries` bound; capped the per-call eviction scan; exposed `size()` as a test seam; added 8 limiter unit tests + the `/sales/sync` fallback-denial integration test | RED: `npx vitest run src/application/services/__tests__/ip-rate-limiter.test.ts` → 3 failed / 5 passed (`TypeError: limiter.size is not a function` ×2, no `maxEntries` support). GREEN: 8 passed; `api.test.ts -t "in-memory IP window"` → 2 passed | `npm run typecheck` exit 0; `npm test` → 29 files / **489** tests passed, exit 0 |
| `111a0fe` | apps/daftari | `on PrintException { rethrow; }` in the desktop, Windows and Linux `getLocalPrinters()` so the HTTP status code survives; added `print_service_desktop_test.dart` | RED: with the `rethrow` temporarily removed, `flutter test test/core/printing/print_service_desktop_test.dart` → `00:00 +4 -1`, `which has statusCode with value <null>`. GREEN: `flutter test test/core/printing/` → **56** passed | `dart format --set-exit-if-changed lib test` → 508 files, 0 changed; `flutter analyze` → "No issues found!"; `flutter test test/core/printing/` → 56 passed |
| `ef98e7f` | CI | The composite action exits 0 when the target directory is missing; the `fast-verify` cleanup step moved **before** `melos run test` so it can actually prevent stale-lock failures | n/a (CI configuration) | `python3 yaml.safe_load` on `ci.yml` and `action.yml` → both parse, exit 0 |
| `313bd72` | specs | 15 spec-drift corrections across 5 spec files | n/a (documentation) | n/a (documentation) |
| `53726f9` | docs | `docs/followups.md` #83 for DAFTARI-189 (the `melos.yaml` exit-code masking that made V-1 unsound) | n/a (documentation) | n/a (documentation) |

### Fix round (round 3 — the third and final fix wave)

Driven by the round-4 QA report (STATUS BLOCKED) and the round-5 coverage report (VERDICT FAIL). Under the skill's cap this is fix round **3 of 3**; anything still open after this wave is a human checkpoint, not a fourth round.

| Commit | Stack | Change | TDD evidence | FAST gate evidence |
|--------|-------|--------|--------------|--------------------|
| `68d0696` | apps/daftari | `print_service_linux_test.dart` + `print_service_windows_test.dart` (8 tests each) — closes coverage gaps M1 and M2 | RED (mutation): with `on PrintException { rethrow; }` removed from both services, the 503 tests fail with `statusCode with value <null>` (`MUTATION_TEST_EXIT=1`). GREEN: 16 tests passed | `dart format --set-exit-if-changed lib test` → 510 files, 0 changed; `flutter analyze` → "No issues found!"; targeted `flutter test` → 16 passed |
| `2b6e0a2` | backend/api | Strengthened `ip-rate-limiter.test.ts`: exact soft-cap/hard-bound sizes, a new fail-open eviction test (M3), a new bounded-eviction-scan test (Low L1) | RED (mutation): removing the `maxEntries` eviction block → 2 failures (`MUTATION_MAX_ENTRIES_EXIT=1`); removing the scan cap → 1 failure (`MUTATION_SCAN_CAP_EXIT=1`). GREEN: 10 tests passed | `npm run typecheck` exit 0; `npm test` → 29 files / **491** passed |
| `d5fa35e` | backend/api | `maxEntries` is now a **required** limiter option (a limiter without a bound can no longer be constructed) + a compile-time contract test — closes the second half of CODE-L1 | RED: `npm run typecheck` → 6 × TS2345 "Property 'maxEntries' is missing" (`TYPE_CHECK_RED_EXIT=2`). MUTATION: making the option optional again → TS2344 + 2 × TS18048 (`TYPE_CHECK_MUTATION_EXIT=2`). GREEN: typecheck 0, 11 limiter tests passed | `npm run typecheck` exit 0; `npm test` → 29 files / **492** passed |
| `73e3db8` | specs | SPEC-1…SPEC-5: the HWID sections of `ARCHITECTURE.md`, `PERFORMANCE_GUIDELINES.md` and `USER_FLOW.md` now match the licensing implementation (provider tree, platform selection, `Future<…>` signatures, the real Windows/Linux algorithms, the dead `SessionSyncService` caller) | n/a (documentation) | `git diff --check` on the three spec files → exit 0 |
| `a4ab4d3` | docs | `docs/followups.md` #85–#92 + the 8 Plane items DAFTARI-191…198 for the out-of-scope findings (SEC-1, SEC-1-TEST, SEC-L1 and the test-quality gaps) | n/a (documentation) | n/a (documentation) |
| `8fe3802` | docs | `findings.md`: removed the 3 trailing-whitespace errors the QA reviewer flagged | n/a (documentation) | `git diff --check` → exit 0 |
| `130b4d4` | docs | AUD-1…AUD-10: the five audit artifacts rewritten for truthfulness (per-gate status, enumerated deltas, recomputed metrics, reconciled HWID claims, exact reviewed commits) | n/a (documentation) | n/a (documentation) |
| `a0b195d` | docs | Every "artifact commit" placeholder pinned to `130b4d4`; scope totals (55 files = 19 added / 7 deleted / 29 modified; +2 854 / −979 as of `a0b195d`) and the commit counts recorded per HEAD | n/a (documentation) | `git diff --check` → exit 0; `dart format --set-exit-if-changed lib test` → 510 files, 0 changed; `flutter analyze` → "No issues found!" |
| `26321f4` | specs | CodeRabbit round-3 Low: `specs/ARCHITECTURE.md:66` cloud flavor platforms corrected to `cloud (desktop only, Turso sync)` (verified against `flavor_config.dart:76` / `:89` / `:102`) | n/a (documentation) | `dart format --set-exit-if-changed lib test` → 510 files, 0 changed; `flutter analyze` → "No issues found!" |
| `d095d82` | docs | CodeRabbit round-3 Low: follow-up #76 now lists the real sidecar routes (`/api/printing/health`, `/api/printing/local-printers`, `/api/printing/receipt|barcode|ticket`) instead of the non-existent `/api/printing/print-receipt` | n/a (documentation) | `dart format --set-exit-if-changed lib test` → 510 files, 0 changed; `flutter analyze` → "No issues found!" |
| this commit | docs | CodeRabbit round-3 dispositions recorded in the round-3 finding table and the CodeRabbit gate table; final metrics re-measured | n/a (documentation) | `git diff --check` → exit 0 |

---

### Fix round (round 4 — user-authorized wave)

The three scripted fix rounds were spent, so the user was asked for a decision and chose **"Wave 4: QA fixes + G4/G6 tests"** — apply all 9 final-QA findings (6 Medium + 3 Low documentation/spec/comment level) and close the G4 + G6 coverage gaps with new tests, deferring G1–G3 and G5 as tracked follow-ups. The user also chose **"Allow fan-out"**, so the next QA dispatch may run its 4 mandatory sub-sections.

| Commit | Stack | Change | TDD evidence | FAST gate evidence |
|--------|-------|--------|--------------|--------------------|
| `702e26e` | apps/daftari | `print_service_test.dart` now compares two `PrintServiceFactory.create()` results and asserts they are distinct instances (closes G4 / DAFTARI-198) | MUTATION: with `create()` returning the cached singleton the test fails (`Expected: not same instance as <Instance of 'PrintServiceStub'>`); source restored | `dart format --set-exit-if-changed lib test` → 510 files, 0 changed; `flutter analyze` → "No issues found!"; `flutter test test/core/printing/print_service_test.dart` → 4 passed |
| `48523fe` | backend/api | New limiter test mixes an active IP with expired IPs under the soft cap and proves the active entry survives and keeps the budget it already spent (closes G6 / DAFTARI-200) | MUTATION: with the soft-cap sweep deleting active entries the test fails (`expected +0 to be 3`); source restored | `npm run typecheck` → exit 0; `npm test` → 29 files / **493** passed, exit 0 |
| `a361643` | specs + apps/daftari | SPEC-01 (PRD cloud flavour), SPEC-02 (ARCHITECTURE factory/stub behaviour), SPEC-03 (PERFORMANCE_GUIDELINES HWID caching), CODE-01 (`print_server_config.dart` comment narrowed to the Dart clients) | n/a (documentation) | `git diff --check` → exit 0 |
| artifact commit (`8eb73fd`) | docs | AUD-01…AUD-05 audit corrections, the CodeRabbit round-4 Low fix, the wave-4 authorization record, and the follow-up closures for #92 / #94 | n/a (documentation) | `git diff --check` → exit 0; `dart format --set-exit-if-changed lib test` → 510 files, 0 changed; `flutter analyze` → "No issues found!" |
| `72851e3` | specs | CodeRabbit round-5 Low fix: the device-session flow in `specs/USER_FLOW.md` is labelled planned and not wired, with its heartbeat / cleanup / active-sessions bullets marked as planned | n/a (documentation) | `git diff --check` → exit 0; `dart format --set-exit-if-changed lib test` → 510 files, 0 changed; `flutter analyze` → "No issues found!" |
| artifact commit | docs | CodeRabbit round-5 record + wave-4 coverage round-7 record | n/a (documentation) | `git diff --check` → exit 0 |

## Review discipline

- Reviewers are fresh, context-free, read-only subagents (no sessionID continuity); each dispatch passes only repo path, branch, base ref, a one-line task description, and the read-only constraint.
- Reviewers never edit code; the parent implements every fix.
- Fix rounds capped at 3; after round 3 → human checkpoint. The round-3 wave documented above is the third and final fix wave in this phase: anything still open when it ends is a human checkpoint, not a fourth round.
- CodeRabbit local review is a mandatory additional gate and is re-run after every fix round.
- CodeRabbit findings are NOT passed to independent reviewers.
- Every disposition above was decided by reading the source at the base commit (`db8fb5a`) and the branch diff — not by trusting either the automated severity or the tool's premise.
- **The provider was the limiting factor, not the work.** For most of the session every reviewer dispatch returned `HTTP 429 "Too Many Requests"`, including solo dispatches with fan-out disabled. Rather than substitute a self-review (which the operating contract forbids), the parent retried with fresh sessions until the quota recovered, harvested the orphan child reviewers' findings in the meantime, and escalated the blocker to the user with explicit options. The required reviewers eventually reported: the QA reviewer returned **STATUS BLOCKED** (round 4) and the coverage reviewer returned **VERDICT FAIL** (round 5). Every actionable finding from both reports is fixed in the round-3 wave or tracked in `docs/followups.md` #85–#92; the round-4 report's four mandatory review sections (full code review, security audit, broad spec compliance, full test coverage) were **NOT RUN** inside that session because the provider rejected the fan-out, so they are re-dispatched on the final HEAD as fresh sessions — wave 4 (user-authorized) closed #92 / DAFTARI-198 and #94 / DAFTARI-200 in-branch and enabled fan-out for that re-dispatch.
- **Review-session history.** Sessions that reported a verdict are never reused: round 3 QA `ses_e1e1ec11affe0bDohEg9voDNB3`, round 3 coverage `ses_e1e1ae786ffeGu8xsMHo999aAf`, round 4 QA `ses_e1b9126a5ffeBHPasu5nlaQMIf`, round 5 coverage `ses_e1b400d92ffdJtqEie50Kw8Wh4`. Sessions that failed with HTTP 429 or produced no report are recorded as failures, never as passes: `ses_e1eafa263ffeppZaLzxz6gtEH1`, `ses_e1e908117fferMvc44LjiprU3Q`, `ses_e1e6fdf52ffeNVFaKVbCbpiHjW`, `ses_e1b9090e2ffeTflDiHEy0McwGG` (round-4 coverage dispatch — no report returned), `ses_e1b400d92ffdWBPVi1UrG1RPp2`, `ses_e1b37cf8bffeOY1NFoBqxzX2ei`, `ses_e1b1e7c97ffen00iaB0SW39DIu` (QA dispatches on the final HEAD that returned HTTP 429).

---

## Final dispatch — QA round 9 (2026-11-19)

Fresh context-free `qa-post-implementation` dispatch, session `ses_e0b621d99ffenZlyo56YnzPmkl`, reviewed `origin/development...20ca657` (same tree as the final `c42b92c` fix wave).

**Verdict: BLOCKED**, Risk Medium — no code defect. Two branch-owned Medium documentation-accuracy findings plus four Lows, gate score `100 − 5×2 − 1×4 = 86` (must exceed 90 with zero Medium). Fan-out was disabled because of repeated provider HTTP 429, so the four mandatory review sections ran as **fallback integrator self-review with downgraded confidence**; independent-reviewer authority is not claimed for that run — a logged process deviation, not a hidden pass.

| # | Severity | Finding | Disposition |
|---|----------|---------|-------------|
| 3-1 | Medium | `ip-rate-limiter.ts:5-7` docblock claimed one window per isolate in production | Fixed in `c42b92c` — now states state is bound to the app instance, fresh per `createApp`, and the Worker builds one per request (DAFTARI-191) |
| 3-2 | Medium | `final-report.md:82` said the base soft/hard caps were "preserved exactly" | Fixed in `c42b92c` — both routes bound the map with the required `maxEntries: 10 000`; the base 5 000 was a stop-eviction threshold, effectively unbounded |
| 3-3 | Low | `final-report.md:24,78` said 27 `hydrated_bloc` test imports | Fixed in `c42b92c` — 31 test files, 0 `lib/` imports |
| 3-4 | Low | `.github/labeler.yml:209` stale `lib/core/hwid/**` glob for a deleted tree | Fixed in `c42b92c` — entry removed, YAML re-validated |
| 3-5 | Low | `flavor_config.dart:6` described `cloud` as desktop + web while `supportedPlatforms` is windows+linux | Fixed — comment now says desktop only |
| 3-6 | Low | `print_server_config_test.dart` built four services with real `http.Client`s and never disposed them | Fixed — `addTearDown` disposes every service |
| 3-7 | Low | `ip-rate-limiter.ts:64-66` said "oldest-seen IPs" though re-inserting a key keeps first-seen order | Fixed — now "oldest-first-seen IPs" |

Evidence from that run: Flutter **1 645/1 645** passed, `dart format` 0 changed, `flutter analyze` clean, backend/api **493** passed with a clean `tsc --noEmit`, limiter unit file 12 passed, `PrintServer.Tests` **116 pass / 2 skipped**, `PrintServer.Linux.Tests` **105 pass / 1 fail** — the pre-existing `DAFTARI-185` PNG-collision flake, reproduced 2/2 including a 9/10 filtered run. CI at `20ca657` was green (run `44566874191`; flutter-matrix and the two packaging jobs skipped by design). No PR existed at dispatch time.

After the seven fixes the QA gate arithmetic is **100** (0 Critical, 0 High, 0 Medium, 0 Low). The deferred rows are all pre-existing and tracked: DAFTARI-191 / 192 (limiter rebuilt per request), DAFTARI-185 (clock-injectable PNG filename), DAFTARI-189 (`melos.yaml` exit-code masking), DAFTARI-193 (`CF-Connecting-IP` trust boundary), DAFTARI-182 (dead `print_service.dart` barrel).
