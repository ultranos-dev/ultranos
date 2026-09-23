# Audit Remediation — Sequencing Schedule (Epics 56–63)

**Branch:** all stories implement on `audit-sep-23-improvements` (merge each story's worktree branch back here after review passes).
**Companion docs:** `audit-remediation-overview-2026-09-23.md` (traceability + decisions), `docs/system-audit-2026-09-23.md` (evidence).
**Created:** 2026-09-23.

## How this schedule was built

Stories are grouped into **5 parallel lanes** with mostly-disjoint file footprints, sequenced inside each lane so no two concurrent agents edit the same hot files (hub `lab.ts`, `medication.ts`, `admin.ts`, `sync.ts`, pharmacy `fulfillment-store.ts`/`phi-cleanup.ts` are the collision magnets). Cross-lane sync points are called out explicitly. One lane = one agent (or a series of agents) working sequentially; lanes run in parallel.

## Global rules for every implementing agent

1. **Worktree isolation is mandatory** — every file-mutating agent runs in its own git worktree (CLAUDE.md rule). Never `git stash`/`reset`/`checkout --` in a shared tree.
2. **No autonomous commits** — the user controls all git operations. Leave changes in the worktree and report.
3. **Re-verify before coding** — audit findings marked [A] are leads; confirm every cited file:line against current source first (files move as earlier waves merge).
4. **Zero-Regression gate** — every story ends with `pnpm typecheck` + the full affected test suites actually run and passing. Report real results.
5. **Rebase before starting** — pull latest `audit-sep-23-improvements` into your worktree; earlier waves will have changed your target files.
6. **DB changes** via Supabase MCP tools only.
7. **Update `sprint-status.yaml`** story status (ready-for-dev → in-progress → review) as you go.

## Wave 0 — Preconditions (user + trivial ops, before or alongside Wave 1)

| Item | Blocks | Owner |
|---|---|---|
| Decision #1: photo on lab list tier (recommend: detail-only) | 58.1 (Wave 2) | User |
| Decision #3: consent exemption matrix (result delivery, dispense meds) | 58.4 (Wave 4) | User (agent drafts matrix in 58.4 Task 1) |
| Decision #5: MPI BLOCK mode (enforce vs staged warn) | 60.3 (Wave 5) | User |
| Decision #6: offline cold-start unlock (recommend: dual-wrap w/ device PIN) | 61.2 (Wave 3) | User |
| Decision #7: RBAC granularity matrix (SUPERADMIN vs ORG_ADMIN) | 62.2 (Wave 5) | User (agent drafts in 62.2 Task 3) |
| Decision #8: peer-network / ai-provenance hub routers (build vs flag-off) | 59.1 Task 3.4 (Wave 1 — other tasks proceed) | User |
| Ops quick-win: `pnpm --filter @ultranos/ui-kit build` (stale dist is serving pre-ModalHeader code TODAY) | nothing — do immediately | Any agent / user |

MFA decision is already resolved (org toggle, default OFF — see overview Resolved Decisions).

## The 5 Lanes

| Lane | Theme | Primary footprint | Story order |
|---|---|---|---|
| **A** | Hub security & admin | hub `init.ts`, `jwt.ts`, `admin.ts`, `patient.ts`, rbac; admin-portal auth | 56.1 → 56.2 → 56.3 → 56.4 → 62.2 |
| **B** | Pharmacy medication safety | pharmacy-lite app; hub `allergy.ts`, `medication.ts` | 57.1 → 57.3 → 57.4 → 57.2 → 62.1 |
| **C** | Lab surface & privacy | hub `lab.ts`, `photo-urls.ts`; lab-lite `trpc.ts`, `db.ts` | 59.1 → 58.1 → 58.2 → 58.4 → 58.3 |
| **D** | Sync engine & offline | `packages/sync-engine`, hub `sync.ts`, opd sync layer | 60.2 → 59.4 → 60.1 → 60.3 |
| **E** | OPD wiring, audit, crypto | opd `SyncProvider`/`trpc.ts`; `packages/audit-logger`, `packages/crypto` | 59.3 → 61.1 → 61.2 |

**Note on Lane B order:** 57.2 (server interaction gate) runs FOURTH, not second — it is hub-`medication.ts`-heavy and deferring it lets Lane D's 60.1 pharmacy HLC sweep start sooner (after 57.4) without `medication.ts` contention. 57.3/57.4 have no dependency on 57.2.

## Wave-by-Wave Schedule

### Wave 1 — all lanes start (fully parallel, disjoint footprints)

| Story | Lane | Why first | Depends on |
|---|---|---|---|
| **56.1** app_metadata claims | A | Foundation for 56.2/56.3/62.2; highest-severity finding | — |
| **57.1** allergy gate restoration | B | Top clinical-safety fix | — |
| **59.1** lab dead endpoints | C | Registration is dead in production; unblocks 60.3 | Decision #8 for Task 3.4 only (defer that task if pending) |
| **60.2** sync-engine fail-safe hardening | D | Package-level; hub `sync.ts` changes must precede 56.2 | — |
| **59.3** OPD unwired components | E | Independent; activates audit drain needed by 61.1. Defer Task 3 (PhiCleanupGuard) until 61.2 lands — do Tasks 1/2/4/5/6 now | — |
| **59.2 Task 1 ONLY** contract CI guard | small solo agent | Locks in 59.1's repairs; protects all later endpoint work. Land with a known-failures allowlist; empty the allowlist when 59.1 merges | — |

### Wave 2 — after each lane's Wave-1 story merges

| Story | Lane | Gates |
|---|---|---|
| **56.2** sync/patient object-level authz | A | Needs 56.1 merged AND 60.2 merged (both edit hub `sync.ts`) — cross-lane sync point |
| **57.3** dispense durability + idempotency | B | Needs 57.1 merged (scanner file overlap) |
| **58.1** UUID/photo leak fix | C | Needs Decision #1 + 59.1 merged (`lab.ts` overlap) |
| **59.4** appointments repair | D | Needs 60.2 merged; use `serializeHlc(hlc.now())` directly if 60.1's helper isn't in yet |
| **61.1** audit completeness + hash chain vNext | E | Needs 59.3 merged (audit drain now wired). HOLD the one-line `medication.ts:1848` metadata fix until Lane B's 57.2 merges (Wave 4) — everything else proceeds |

### Wave 3

| Story | Lane | Gates |
|---|---|---|
| **56.3** MFA org toggle | A | Needs 56.1. Touches all 4 login pages — no other active story touches them this wave |
| **57.4** inventory deduction integrity | B | Needs 57.3 merged (`fulfillment-store.ts` overlap) |
| **58.2** lab surface scoping | C | Needs 58.1 merged (`lab.ts` + lab-lite `db.ts` overlap) |
| **61.2** KDF hardening + tamper signaling | E | Needs Decision #6. Coordinates with Lane C's 58.3 (Wave 5 — lab-lite adopts encryption on the NEW key scheme; land 61.2 first) |
| (D idle or assists) | D | 60.1 waits for 57.4 (pharmacy lib sweep collision) |

### Wave 4

| Story | Lane | Gates |
|---|---|---|
| **56.4** auth perimeter hardening | A | Needs 56.3 merged (admin login page overlap) |
| **57.2** server-side interaction gate + supervisor override | B | Needs 57.1 (hub allergy source). `medication.ts` is now Lane B's exclusively |
| **58.4** consent enforcement completeness | C | Needs Decision #3 + 58.2 merged (`lab.ts`) |
| **60.1** HLC discipline platform-wide | D | Needs 57.4 merged (pharmacy `stock-service.ts`/`expiry-watchdog.ts` collision cleared) and 58.2 merged (lab result-entry page collision cleared). Hub format validation ships in `log-only` mode |
| (E) 59.3 Task 3 PhiCleanupGuard | E | Now unblocked by 61.2 |

### Wave 5

| Story | Lane | Gates |
|---|---|---|
| **62.2** hub/admin enterprise hardening (incl. `admin.ts` split) | A | LAST `admin.ts` toucher (after 56.1/56.3/56.4 provisioning+endpoints+reportAuthEvent edits). Needs Decision #7 + 56.1 |
| **62.1** pharmacy financial correctness | B | Needs 57.3/57.4 merged (POS/store overlap) |
| **58.3** spoke PHI-at-rest completeness | C | Needs 61.2 merged (encrypt on the new key scheme); pharmacy-financial portion needs 57.3 merged (`phi-cleanup.ts`) |
| **60.3** offline patient registration + MPI | D | Needs 59.1 (lab endpoints), 60.2, Decision #5; registration forms untouched by other lanes |
| **61.3** atomic multi-write RPCs | E | Needs 57.2 (`medication.ts`), 58.x/59.1 (`lab.ts`), 61.1 (`patient-admin.ts`) ALL merged — this story deliberately runs after the routers stabilize |

### Wave 6 — cross-cutting & polish (after Waves 1–5 merge)

| Story | Gates / notes |
|---|---|
| **60.4** sync failure visibility + notification producers | After 61.3 (`medication.ts` outbox coordination) and 60.1/60.2. Any lane's freed agent |
| **59.2 Task 2** typed spoke clients migration | After ALL endpoint churn (56.2, 58.x, 59.1) — mechanical migration against the settled surface |
| **63.1** safety-critical i18n sweep + lint guard | After functional UI changes settle (57.x scanner, 59.3 consent modal, admin pages). Lint guard lands LAST in the story |
| **63.2** lab-lite content gating + palette/RTL sweep | After 58.x/59.1 lab functional changes. Can parallel 63.1 (different files — coordinate on lab-lite) |
| **63.3** platform consistency + doc truth | LAST story overall: ui-kit build-model decision, DTO consolidation (needs 59.2 T2), Supabase version alignment, CLAUDE.md corrections |

### Final gate (after Wave 6)

Full monorepo regression: `pnpm typecheck`, `pnpm test` (all workspaces), flip 60.1's hub HLC validation from `log-only` → `enforce` after one clean cycle, empty the 59.2 contract-test allowlist, manual smoke of the four cross-app flows (register→encounter, order→result→OPD, prescribe→scan→dispense, admin provisioning→spoke login).

## Dependency quick-reference (story → hard prerequisites)

```
56.1 → (none)                     58.3 → 61.2, 57.3, 58.2
56.2 → 56.1, 60.2                 58.4 → 58.2, Decision #3
56.3 → 56.1                      59.1 → (none; Task 3.4 needs Decision #8)
56.4 → 56.3                      59.2T1 → (none)   59.2T2 → 56.2, 58.x, 59.1
57.1 → (none)                    59.3 → (none; Task 3 needs 61.2)
57.2 → 57.1                      59.4 → 60.2
57.3 → 57.1                      60.1 → 57.4, 58.2
57.4 → 57.3                      60.2 → (none)
58.1 → 59.1, Decision #1         60.3 → 59.1, 60.2, Decision #5
58.2 → 58.1                      60.4 → 60.1, 60.2, 61.3
61.1 → 59.3                      62.1 → 57.3, 57.4
61.2 → Decision #6               62.2 → 56.1, 56.3, 56.4, Decision #7
61.3 → 57.2, 58.4, 59.1, 61.1    63.1/63.2 → functional waves done
                                  63.3 → 59.2T2 (last overall)
```

## Hot-file ownership calendar (collision avoidance)

| File | Wave 1 | Wave 2 | Wave 3 | Wave 4 | Wave 5 |
|---|---|---|---|---|---|
| hub `lab.ts` | 59.1 (C) | 58.1 (C) | 58.2 (C) | 58.4 (C) | 61.3 (E) |
| hub `medication.ts` | — | — | — | 57.2 (B) | 61.3 (E) |
| hub `admin.ts` | 56.1 (A) | — | 56.3 (A) | 56.4 (A) | 62.2 (A) |
| hub `sync.ts` | 60.2 (D) | 56.2 (A) | — | 60.1 (D, schema only) | — |
| pharmacy `fulfillment-store.ts` | 57.1 (B) | 57.3 (B) | 57.4 (B) | — | 62.1 (B) |
| pharmacy `phi-cleanup.ts` | — | 57.3 (B) | — | — | 58.3 (C) |
| lab-lite `db.ts` | 59.1 (C, light) | 58.1 (C) | 58.2 (C) | 60.1 (D, enqueue) | 58.3 (C, encryption) |
| opd `lib/trpc.ts` | 59.3 (E) | — | — | — | 59.2T2 (W6) |
| 4× login pages | 56.1 (A, claims) | — | 56.3 (A, MFA) | 56.4 (A, redirect) | — |

If a wave slips, the rule is simple: **a story may not start while another in-flight story owns one of its hot files.**

## Suggested agent assignment per wave

- 5 lane agents + 1 small utility agent (59.2 T1, ops quick-wins) = 6 concurrent worktrees maximum.
- Waves are gated by MERGE, not by calendar: a lane advances the moment its previous story passes review and lands on `audit-sep-23-improvements`.
- Rough effort (agent-sessions, for planning only): Wave 1 ≈ 6, Wave 2 ≈ 5, Wave 3 ≈ 4, Wave 4 ≈ 5, Wave 5 ≈ 5, Wave 6 ≈ 5 → ~30 story-sessions total.
- Review each story with fresh-context code review (per sprint-status.yaml workflow notes) before merging its worktree branch.
