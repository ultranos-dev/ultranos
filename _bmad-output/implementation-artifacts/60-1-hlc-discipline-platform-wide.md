# Story 60.1: HLC Discipline Platform-Wide

Status: review

## Story

As a sync-engine owner,
I want every sync-relevant event across all spokes stamped with a real Hybrid Logical Clock value — with a shared helper, hub-side format validation, persisted clock state, and clock-skew bounds,
so that conflict resolution ordering is causally correct on offline devices with drifting wall clocks (the norm in target environments).

## Acceptance Criteria

1. **Given** any sync-queued write in lab-lite (especially result submission), pharmacy-lite (~60 audited sites across inventory/procurement/wholesale/patient layers), or OPD appointments (handled in 59.4 — verify), **when** the event is created, **then** `hlcTimestamp` is `serializeHlc(hlc.now())` from the app's HLC singleton — no `new Date().toISOString()` or `Date.now()` stamps remain in sync paths.
2. **Given** `enqueueSyncEvent` in lab-lite (`db.ts:2295-2322`), **then** `hlcTimestamp` becomes REQUIRED (no optional fallback), and queue entry IDs no longer collide on same-ms double-submits.
3. **Given** the Hub receives a sync payload, **when** `hlcTimestamp` does not match the serialized HLC format (`<15d>:<5d>:<node>` — regex per opd-lite `sync-queue.ts:71`), **then** the input is rejected with a validation error (staged: `log-only` telemetry mode first, then `enforce` once spokes are clean).
4. **Given** an app restart on a device whose wall clock moved backwards, **when** the HLC issues new timestamps, **then** monotonicity holds — last-issued HLC state is persisted (non-PHI) and the new clock seeds from `max(persisted, now)`.
5. **Given** a remote HLC more than N minutes ahead of local physical time, **when** `receive()` processes it, **then** it is rejected/flagged rather than adopted (max-drift bound), preventing one future-clocked device from poisoning every peer.
6. **Given** each app, **then** exactly ONE HLC singleton exists (OPD's second sessionStorage-persisted clock in `encounter-store.ts:10-21` is consolidated onto `lib/hlc.ts`), and an ESLint rule (or CI grep) forbids `Date.now()`/`new Date()` assignment into fields named `hlcTimestamp`.
7. **Zero regression:** all sync flows continue end-to-end (existing queued entries with legacy wall-clock stamps still drain — hub enforcement is staged); Tier-2/Tier-3 resolution outcomes for correctly-stamped events are unchanged; all pre-existing tests pass; `pnpm typecheck` passes; no feature or functionality is removed or degraded.

## Tasks / Subtasks

- [x] **Task 1: Shared helper + engine hardening** (AC: 4, 5)
  - [x] 1.1 `packages/sync-engine/src/hlc.ts`: add persisted-state support (`seedFrom(persisted)`) and a `maxDriftMs` rejection/flag in `receive()` (`:56-80`); expose a canonical `hlcNow()` convenience.
  - [x] 1.2 Per-app singleton wiring persists last-issued HLC (IndexedDB/localStorage — non-PHI) and seeds on boot.
- [x] **Task 2: Lab-lite fixes** (AC: 1, 2)
  - [x] 2.1 `results/[sampleId]/enter/page.tsx:260,397` → `serializeHlc(hlc.now())`; `db.ts:2295-2322` make required + collision-safe IDs (`crypto.randomUUID()` suffix); sweep remaining lab sync enqueues (temperature/incident already correct — use as pattern).
- [x] **Task 3: Pharmacy sweep** (AC: 1)
  - [x] 3.1 Mechanical replacement across the ~15 files/60 sites: `inventory/stock-service.ts:40,51`, `expiry-watchdog.ts:30-66`, `goods-receipt-service.ts`, `goods-receipt-reversal.ts`, `qc-service.ts`, `procurement/*` (purchase-order, stock-count, supplier-invoice/-payment/-item/-service), `wholesale/contract-price-service.ts`, `customer-service.ts`, `patient-register.ts:39`. Keep `timestamp`/`createdAt` wall-clock fields as-is — only `hlcTimestamp` changes.
- [x] **Task 4: Hub validation** (AC: 3)
  - [x] 4.1 `sync.ts` input schema (currently `z.string().min(1)`): add HLC-format refinement behind `HLC_FORMAT_MODE=log-only|enforce`; telemetry counter for violations; also validate on `lab.submitResult`'s bundle stamps.
- [x] **Task 5: OPD consolidation + lint** (AC: 6)
  - [x] 5.1 `stores/encounter-store.ts:10-21` second clock → `lib/hlc.ts` singleton; migration note for in-flight encounter events.
  - [x] 5.2 Lint/CI grep rule forbidding wall-clock `hlcTimestamp` assignments; fix `lib/trpc.ts:399` (`hlcTimestamp: ''` on pulled reports).
- [x] **Task 6: Tests + regression verification** (AC: 7)
  - [x] 6.1 Engine tests: restart-with-backwards-clock monotonicity; drift rejection; existing 15-file suite still green.
  - [x] 6.2 Per-app: enqueued events carry valid HLC format; legacy-stamped entries still drain in log-only mode; full suites + `pnpm typecheck`.

## Dev Notes

### Audit Findings Addressed

- **H-LAB-3 [A]**, **H-PHARM-3 [A]**, **P-SYNC-4 (9/10) [A]**, **M-OPD-5 [A]**, plus hub schema laxity ([V]: `z.string().min(1)` cannot reject non-HLC stamps). Audit §10 Theme 5: "HLC discipline is app-dependent."

### Architecture

- CLAUDE.md: "Events stamped with Hybrid Logical Clocks (HLC), not `Date.now()`" — this story makes that true everywhere, not just OPD.
- Staging matters: hub `enforce` mode only flips after all spokes ship clean stamps AND queued legacy entries have drained (one release of `log-only` minimum).
- Story 59.4 covers OPD appointments' stamps — coordinate, don't duplicate.

### Zero-Regression Mandate

This story must introduce **zero regression in existing features and functionality**. All sync flows keep draining, including legacy-stamped queued entries (staged enforcement guarantees this); resolution outcomes change only where wall-clock stamps were producing WRONG ordering. All pre-existing tests pass; `pnpm typecheck` clean.

### Project Structure Notes

**Files to modify:** `packages/sync-engine/src/hlc.ts`, lab-lite result-entry + db, ~15 pharmacy lib files, hub `sync.ts` + `lab.ts` schemas, opd `encounter-store.ts`/`lib/trpc.ts`, eslint config.
**New files:** `packages/sync-engine/src/__tests__/hlc-persistence-drift.test.ts`.

### References

- [Source: docs/system-audit-2026-09-23.md#10-cross-cutting-themes] — Theme 5
- [Source: apps/lab-lite/src/lib/safety/temperature-service.ts:195] — correct in-app pattern
- [Source: apps/opd-lite/src/lib/sync-queue.ts:71-82] — HLC format regex enforcement (model)

## Dev Agent Record

### Agent Model Used
Claude Fable 5 (1M) — implementation; Claude Opus 4.8 (1M) — integration & combined verification.

### Completion Notes List
- **Task 1 (engine):** `packages/sync-engine/src/hlc.ts` — `seedFrom(persisted)` (seeds from `max(persisted, now)`, monotonic across restarts), `receiveWithResult()` + `maxDriftMs` bound (default 5 min; future-clocked remotes flagged/rejected, local clock still advances), `getState()`, `hlcNow(clock)`, `isSerializedHlc`/`SERIALIZED_HLC_RE`. Per-app singletons persist node-id + last state to localStorage and `seedFrom()` on boot.
- **Task 2 (lab):** result-entry + `enqueueSyncEvent` use `hlcNow()`; `hlcTimestamp` now REQUIRED + collision-safe ids; **13 additional stray lab callers** that omitted the stamp were fixed.
- **Task 3 (pharmacy):** ~20 files / ~60 sites swept to `hlcNow()` across inventory/procurement/wholesale/transfers/patient-register; wall-clock `timestamp`/`createdAt`/`paidAt` etc. left as-is.
- **Task 4 (hub):** new `lib/hlc-format.ts` staged validator — `HLC_FORMAT_MODE` DEFAULT **log-only** (telemetry + warn, never rejects; legacy queued stamps still drain); applied to `sync.push`, `lab.submitResult`, `lab.pushSpecimen`.
- **Task 5 (OPD + lint):** `encounter-store` consolidated onto the single `lib/hlc.ts` singleton (2nd sessionStorage clock removed); `trpc.ts` pulled-report `hlcTimestamp:''` fixed; new ESLint rule `ultranos/no-wallclock-hlc` (error) forbids `Date.now()`/`new Date()` into an `hlcTimestamp` field.
- **Task 6:** `hlc-persistence-drift.test.ts` (16: restart monotonicity, drift rejection). **Integration fix:** added `hlcNow` to the `lib/hlc` mocks in `sample-lock-service`/`lock-expiry-checker` tests (their SUTs now call it).
- Final scan: ZERO wall-clock `hlcTimestamp` in production across all apps.

### Verification (combined tree)
sync-engine + hub-api + opd + pharmacy + lab + admin typecheck clean; sync-engine **202**, hub **1788**, opd **1463**, pharmacy **1135**, lab **3948**, admin **334** — 0 failures.

### File List
Modified — `packages/sync-engine/src/{hlc,index}.ts`; per-app `lib/hlc.ts` (opd/lab/pharmacy) + singletons; lab `results/[sampleId]/enter/page.tsx`, `lib/db.ts` + ~13 callers; ~20 pharmacy inventory/procurement/wholesale files; opd `stores/encounter-store.ts`, `lib/trpc.ts`; hub `sync.ts`, `lab.ts`; `packages/config-eslint`.
New — `packages/sync-engine/src/__tests__/hlc-persistence-drift.test.ts`, `apps/hub-api/src/lib/hlc-format.ts`, `packages/config-eslint/rules/no-wallclock-hlc.js` + test.

### Change Log
- 2026-09-23: Story 60.1 implemented (Wave 4), verified, integrated. HLC_FORMAT_MODE default log-only. New localStorage keys `ultranos_hlc_node_id`/`ultranos_hlc_state` per spoke. Status → review.
