# Dispense-Review Queue Population (interaction/allergy override) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Populate the (currently always-empty) dispense-review queue: when a pharmacist dispenses **past a surfaced interaction/allergy warning** (or an unavailable check), require a reason + supervisor name, and create a PENDING `dispense_reviews` row so it appears in the already-built `/unverified` page for physician review. Self-attested supervisor (the review's `override_supervisor` = the logged-in pharmacist's practitioner UUID; the typed supervisor **name** and reason live in `override_reason` text).

**Architecture:** The live dispense safety gate (`DispensingConfirmationModal`) already runs the interaction check. Today `contraindicated`/`checking` hard-block and everything else proceeds on a simple acknowledgment. This plan adds an **override step** for the `warning` and `unavailable` states (reason + supervisor), threads the override through the existing dispense→sync path (`confirmDispense` → `createMedicationDispense._ultranos.reviewOverride` → `dispense-sync` payload `overrideReason`), and has the Hub's `recordDispense` insert a PENDING `dispense_reviews` row when `overrideReason` is present (`override_supervisor` = `ctx.user.sub`). Offline-safe (rides the existing dispense sync entry); no new endpoint; no schema change (the `dispense_reviews` table + `dispenseReview` router already exist). NO Tier-1 append-only machinery is touched — this records a review, it does not block prescribing.

**Tech Stack:** Next.js 15 PWA, Dexie, Zustand, tRPC, Supabase, `@ultranos/shared-types`, Vitest. Hub at `apps/hub-api`.

**Spec:** No formal story; authority is PRD §17.1 (conflict/override review) + migration 026 (`dispense_reviews`). Scope approved inline: interaction/allergy-override trigger + self-attested supervisor.

## Global Constraints

- **Override trigger = `interaction.state === 'warning' || interaction.state === 'unavailable'`.** `clear` → no override (normal ack). `contraindicated`/`checking` → still hard-blocked (never dispensable). Confirm remains disabled until the ack is checked AND (when override is required) a reason (min 10 chars) + a non-empty supervisor name are provided.
- **Self-attested supervisor:** the Hub sets `dispense_reviews.override_supervisor = ctx.user.sub` (the pharmacist's own practitioner UUID — verified FK-valid in the dispense-review slice). The typed supervisor **name** is carried only inside `override_reason` text. Do NOT try to resolve the typed name to a practitioner UUID (offline-impossible; explicitly out of scope).
- **PHI in logs:** `override_reason` may reference clinical context — never log its content; audit metadata carries only opaque ids/opcodes. The dispense-review router already returns `override_reason` to the authorized pharmacist UI (that is the feature).
- **Money:** N/A. **Offline-first:** the override rides the existing `MedicationDispense` sync entry — it must work with no network at capture time.
- **Review-insert is best-effort relative to the dispense:** the dispense write is the safety-critical record and must not be rolled back if the review insert fails; a failed review insert is logged + audited (`outcome:'FAILURE'`), not thrown. (The dispense already succeeded; losing it would be worse than a missing review row.)
- **Rebuild `@ultranos/shared-types`** after editing its schema (Task 2) before apps pick it up: `pnpm --filter @ultranos/shared-types build`.
- **Layout/token/RTL/i18n standards** for the modal addition; new strings via the `dispensingConfirmation` i18n namespace in all four `messages/*.json`.
- **NO-COMMIT mode.**

---

### Task 1: Hub — `recordDispense` creates a PENDING review on override

**Files:**
- Modify: `apps/hub-api/src/trpc/routers/medication.ts` (`recordDispense`: input + `dispense_reviews` insert)
- Test: `apps/hub-api/src/__tests__/record-dispense-review.test.ts` (or extend an existing recordDispense test if present — check first)

**Interfaces:**
- `recordDispense` input gains `overrideReason: z.string().min(1).optional()`. When present, after the `medication_dispenses` insert + `medication_requests` status update, insert one `dispense_reviews` row: `{ dispense_id: input.dispenseId, prescription_id: input.prescriptionId, override_reason: input.overrideReason, override_supervisor: <ctx.user.sub>, status: 'PENDING' }`.

- [ ] **Step 1: Read `recordDispense`** (`medication.ts` ~lines 735-1015) to locate the input schema (~740-752), the `verifiedPharmacistRef`/`ctx.user.sub` (~833), the `medication_dispenses` insert (~854-870), and the audit block (~986-1006). The review insert goes AFTER the dispense insert succeeds.

- [ ] **Step 2: Write the failing test** — `apps/hub-api/src/__tests__/record-dispense-review.test.ts`. Mirror the caller/mocks harness from `duplicate-review.test.ts` / any existing medication test (stub encryption env; mock `@/lib/supabase`, `@ultranos/audit-logger`, `enforceResourceAccess`/`enforceConsent`, the entitlement/verified-org middleware, and the MPI modules `_app` loads). Use a `from` mock that records inserts per table. Assert:

```typescript
// with overrideReason → a dispense_reviews PENDING row is inserted with override_supervisor = the caller's sub
it('creates a PENDING dispense_reviews row when overrideReason is provided', async () => {
  const inserts: Record<string, unknown[]> = {}
  const mockFrom = vi.fn().mockImplementation((table: string) => ({
    insert: (row: unknown) => { (inserts[table] ??= []).push(row); return Promise.resolve({ error: null }) },
    update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
  }))
  const ctx = createTestContext(mockFrom, { sub: 'pharm-uuid-1', role: 'PHARMACIST', sessionId: 's1' })
  const caller = createCaller(ctx)
  await caller.medication.recordDispense({ /* valid dispense input */, overrideReason: 'Dispensed past interaction warning. Supervisor: Dr. Sahar. Reason: chronic med, benefit outweighs risk.' })
  const review = (inserts['dispense_reviews'] ?? [])[0] as Record<string, unknown>
  expect(review).toBeTruthy()
  expect(review.status).toBe('PENDING')
  expect(review.override_supervisor).toBe('pharm-uuid-1') // self-attested = ctx.user.sub
  expect(review.dispense_id).toBeTruthy()
  expect(String(review.override_reason)).toContain('Supervisor: Dr. Sahar')
})

// without overrideReason → NO dispense_reviews insert
it('does NOT create a review when no overrideReason is provided', async () => {
  /* same harness, call recordDispense WITHOUT overrideReason */
  expect(inserts['dispense_reviews']).toBeUndefined()
})
```
(Adapt the exact valid `recordDispense` input + `createTestContext` signature to match the existing medication test harness — read it first; the two assertions above are the behavior to pin.)

- [ ] **Step 3: Run to verify FAIL** — `pnpm -F hub-api test record-dispense-review` → FAIL (no review insert / schema rejects `overrideReason`).

- [ ] **Step 4: Implement** — in `recordDispense`:
  - Add `overrideReason: z.string().min(1).optional()` to the input `z.object({...})`.
  - After the `medication_dispenses` insert (and the existing prescription-status update) succeed, add:

```typescript
    // Overridden dispense (pharmacist proceeded past an interaction/allergy
    // warning): record a PENDING review for physician sign-off. Self-attested —
    // override_supervisor is the pharmacist's own practitioner id; the typed
    // supervisor name lives inside override_reason. Best-effort: the dispense is
    // already committed and must not be rolled back if this insert fails.
    if (input.overrideReason) {
      const { error: reviewError } = await ctx.supabase.from('dispense_reviews').insert({
        dispense_id: input.dispenseId,
        prescription_id: input.prescriptionId,
        override_reason: input.overrideReason,
        override_supervisor: ctx.user.sub,
        status: 'PENDING',
      })
      const reviewAudit = new AuditLogger(ctx.supabase, ctx.user?.orgId ?? undefined)
      try {
        await reviewAudit.emit({
          action: 'PHI_WRITE',
          resourceType: 'MEDICATION_DISPENSE',
          resourceId: input.dispenseId,
          patientId: input.patientRef.replace('Patient/', ''),
          actorId: ctx.user.sub,
          actorRole: ctx.user.role,
          outcome: reviewError ? 'FAILURE' : 'SUCCESS',
          sessionId: ctx.user.sessionId,
          metadata: { operation: 'dispense_review_created', dispenseId: input.dispenseId },
        })
      } catch {
        console.warn('[AUDIT_FAILURE]', { action: 'PHI_WRITE', resourceId: input.dispenseId })
      }
      if (reviewError) {
        console.error('[DISPENSE_REVIEW] Create-on-override failed:', { code: reviewError.code })
        // do NOT throw — the dispense is committed; a missing review is logged + audited
      }
    }
```

- [ ] **Step 5: Run to verify PASS** — `pnpm -F hub-api test record-dispense-review` → green (+ existing medication tests still pass: `pnpm -F hub-api test medication`).
- [ ] **Step 6: Typecheck** — `pnpm -F hub-api typecheck` → no NEW errors in `medication.ts` / the new test (pre-existing repo noise out of scope).
- [ ] **Step 7: Commit** (skip in NO-COMMIT).

---

### Task 2: shared-types + client dispense/sync carry the override

**Files:**
- Modify: `packages/shared-types/src/fhir/medication-dispense.schema.ts` (`_ultranos` ext += `reviewOverride`)
- Modify: `apps/pharmacy-lite/src/lib/medication-dispense.ts` (`createMedicationDispense` override option)
- Modify: `apps/pharmacy-lite/src/lib/dispense-sync.ts` (payload `overrideReason`)
- Test: `apps/pharmacy-lite/src/__tests__/dispense-override.test.ts`

**Interfaces:**
- `_ultranos.reviewOverride?: { reason: string; supervisorName: string }` (shared-types).
- `createMedicationDispense(item, pharmacistRef, fulfillmentContext?, options?)` — `options` gains `override?: { reason: string; supervisorName: string }`; when present, sets `_ultranos.reviewOverride`.
- `dispense-sync` `recordDispense` payload gains `overrideReason` (a combined string) when `dispense._ultranos.reviewOverride` is present.

- [ ] **Step 1: Extend the schema** — in `medication-dispense.schema.ts`, add to `MedicationDispenseUltranosExtSchema` (alongside `batchLot`/`controlledSubstanceSchedule`): `reviewOverride: z.object({ reason: z.string(), supervisorName: z.string() }).optional(),`. Then **rebuild:** `pnpm --filter @ultranos/shared-types build`.

- [ ] **Step 2: Write the failing test** — `apps/pharmacy-lite/src/__tests__/dispense-override.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { createMedicationDispense } from '@/lib/medication-dispense'
import { buildRecordDispensePayload } from '@/lib/dispense-sync' // export a small pure builder (see Step 4)

const item = { /* minimal FulfillmentItem: prescription with id, pat, med, medN, medT, dos, dur */ } as never

describe('dispense override → review', () => {
  it('createMedicationDispense records reviewOverride in _ultranos when provided', () => {
    const d = createMedicationDispense(item, 'Practitioner/p1', undefined, {
      override: { reason: 'chronic med, benefit outweighs risk', supervisorName: 'Dr. Sahar' },
    })
    expect(d._ultranos.reviewOverride).toEqual({ reason: 'chronic med, benefit outweighs risk', supervisorName: 'Dr. Sahar' })
  })

  it('omits reviewOverride when no override is given', () => {
    const d = createMedicationDispense(item, 'Practitioner/p1')
    expect(d._ultranos.reviewOverride).toBeUndefined()
  })

  it('the sync payload carries overrideReason text (supervisor name + reason) only when overridden', () => {
    const withOverride = createMedicationDispense(item, 'Practitioner/p1', undefined, { override: { reason: 'R', supervisorName: 'Dr. S' } })
    const p1 = buildRecordDispensePayload(withOverride)
    expect(p1.overrideReason).toContain('Dr. S')
    expect(p1.overrideReason).toContain('R')

    const clean = createMedicationDispense(item, 'Practitioner/p1')
    expect(buildRecordDispensePayload(clean).overrideReason).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run to verify FAIL** — `pnpm -F pharmacy-lite test dispense-override` → FAIL.

- [ ] **Step 4: Implement:**
  - `medication-dispense.ts`: extend the `options` param type with `override?: { reason: string; supervisorName: string }`, and in `_ultranos` add `...(options?.override ? { reviewOverride: options.override } : {})`.
  - `dispense-sync.ts`: extract/emit a small pure builder `export function buildRecordDispensePayload(dispense: LocalMedicationDispense): { ...existing fields..., overrideReason?: string }` that the existing sync code uses, adding: `...(dispense._ultranos?.reviewOverride ? { overrideReason: \`Dispensed past interaction/allergy warning. Supervisor: ${dispense._ultranos.reviewOverride.supervisorName}. Reason: ${dispense._ultranos.reviewOverride.reason}\` } : {})`. Wire the existing `syncDispenseToHub` mutation to build its payload via this function (so the override rides along). Keep every existing field (dispenseId, prescriptionId, medicationCode, medicationDisplay, patientRef, pharmacistRef, whenHandedOver, hlcTimestamp, status, batchLot) unchanged.

- [ ] **Step 5: Run to verify PASS** — `pnpm -F pharmacy-lite test dispense-override` → green (+ existing `dispense-sync` tests still pass).
- [ ] **Step 6: Typecheck** — `pnpm -F pharmacy-lite typecheck` and `pnpm -F shared-types typecheck` → no NEW errors in touched files.
- [ ] **Step 7: Commit** (skip).

---

### Task 3: Client UI — override sub-form in the modal + threading

**Files:**
- Modify: `apps/pharmacy-lite/src/components/pharmacy/DispensingConfirmationModal.tsx`
- Modify: `apps/pharmacy-lite/src/components/pharmacy/FulfillmentChecklist.tsx`
- Modify: `apps/pharmacy-lite/src/app/[locale]/(app)/fulfillment/page.tsx`
- Modify: `apps/pharmacy-lite/src/stores/fulfillment-store.ts`
- Modify: `apps/pharmacy-lite/messages/{en,ar,prs,ps}.json`
- Test: `apps/pharmacy-lite/src/__tests__/DispensingConfirmationModal.override.test.tsx` (+ adjust `fulfillment-page.test.tsx`/`FulfillmentChecklist.test.tsx` mocks if the `onConfirm` signature change breaks them — the existing mocks call `onConfirm()` with no args, which stays valid since override is optional)

**Interfaces (thread an optional override end-to-end):**
- `DispensingConfirmationModal` prop `onConfirm: (override?: { reason: string; supervisorName: string }) => void`.
- `FulfillmentChecklist` prop `onConfirm?: (selectedItems: FulfillmentItem[], override?: { reason: string; supervisorName: string }) => void`.
- `confirmDispense(override?: { reason: string; supervisorName: string })` in the store → passes `override` into `createMedicationDispense(..., { controlledSubstanceSchedule, override })` inside the loop.

- [ ] **Step 1: Write the failing modal test** — `DispensingConfirmationModal.override.test.tsx`. Mock `next-intl` (identity), and mock `runDispenseInteractionCheck`/`getRecallAlertsForAtc`/`fetchActiveMedicationDisplays` so the interaction status resolves to a chosen state. Assert:
  - state `clear`: no override fields (`catalog`-style: query `data-testid="override-reason"` is null); confirm enabled after ack; clicking confirm calls `onConfirm()` (no override arg).
  - state `warning`: override reason (`data-testid="override-reason"`) + supervisor (`data-testid="override-supervisor"`) inputs render; confirm stays DISABLED until ack + a ≥10-char reason + a non-empty supervisor are provided; on confirm, `onConfirm` is called with `{ reason, supervisorName }`.
  - state `contraindicated`: confirm disabled regardless (unchanged).

- [ ] **Step 2: Run to verify FAIL** — `pnpm -F pharmacy-lite test DispensingConfirmationModal.override` → FAIL.

- [ ] **Step 3: Implement the modal** — in `DispensingConfirmationModal.tsx`:
  - `const needsOverride = interaction.state === 'warning' || interaction.state === 'unavailable'`.
  - Add state `const [overrideReason, setOverrideReason] = useState('')` and `const [supervisorName, setSupervisorName] = useState('')`.
  - When `needsOverride`, render (below the `InteractionCheckBanner`, above the ack) a boxed override sub-form: a labelled `textarea` (`data-testid="override-reason"`, min 10 chars, i18n label/placeholder, `dir="auto"`) + a labelled supervisor-name `input` (`data-testid="override-supervisor"`, i18n). Add a short i18n explainer that proceeding will be flagged for physician review.
  - `const overrideValid = !needsOverride || (overrideReason.trim().length >= 10 && supervisorName.trim().length > 0)`.
  - Confirm button `disabled={!acknowledged || blockedByInteraction || !overrideValid}`.
  - `onClick={() => onConfirm(needsOverride ? { reason: overrideReason.trim(), supervisorName: supervisorName.trim() } : undefined)}`.
  - Semantic tokens (`text-warning`/`bg-warning/10` for the override box — a caution, not destructive), RTL-safe, every string via `t()`.

- [ ] **Step 4: Thread it through** —
  - `FulfillmentChecklist.tsx` (~line 190): `onConfirm={(override) => { setShowConfirmModal(false); const selected = items.filter((i) => i.selected); onConfirm?.(selected, override); setDispensingComplete(true) }}`. Update the prop type.
  - `fulfillment/page.tsx` `handleConfirm`: `useCallback(async (_selected, override?: { reason: string; supervisorName: string }) => { ...; await store.confirmDispense(override); ... })`.
  - `fulfillment-store.ts` `confirmDispense`: signature `async (override?: { reason: string; supervisorName: string }) => {...}`; inside the loop pass `{ controlledSubstanceSchedule: catalogItem?.controlledSchedule, override }` as the 4th arg to `createMedicationDispense`.

- [ ] **Step 5: i18n** — add to the `dispensingConfirmation` namespace in all four `messages/*.json`: `overrideRequiredTitle`, `overrideReviewNotice` (e.g. "Proceeding will be recorded for physician review."), `overrideReasonLabel`, `overrideReasonPlaceholder`, `overrideSupervisorLabel`, `overrideSupervisorPlaceholder`. Native ar/prs/ps where straightforward; English fallback OK (note which). Key parity across all four.

- [ ] **Step 6: Run to verify PASS** — `pnpm -F pharmacy-lite test DispensingConfirmationModal.override fulfillment FulfillmentChecklist` → green (existing fulfillment/checklist tests unaffected — the no-arg `onConfirm()` calls remain valid).
- [ ] **Step 7: Typecheck + parity** — `pnpm -F pharmacy-lite typecheck` (no NEW errors in touched files); confirm the new keys exist in all four message files.
- [ ] **Step 8: Commit** (skip).

---

### Task 4: Live end-to-end verification

**Files:** none (Supabase MCP + optionally Playwright).

- [ ] **Step 1:** Confirm the loop at the data layer. The hub dev server (:3004) must be serving the Task-1 `recordDispense`. Since driving a real `warning` interaction state through the browser offline is hard to force, verify the Hub half authoritatively: using Supabase MCP, confirm `dispense_reviews` is empty, then exercise the exact insert `recordDispense` runs on override — `INSERT INTO dispense_reviews (dispense_id, prescription_id, override_reason, override_supervisor, status) VALUES (gen_random_uuid(), gen_random_uuid(), 'CANARY override review', '<a real practitioner id>', 'PENDING')` — and confirm the row is created (FK holds). This mirrors Task 1's server code path.
- [ ] **Step 2:** If feasible, drive the UI with Playwright: reach the fulfillment modal, force/observe a `warning` state, fill the override reason + supervisor, confirm, and check `dispense_reviews` gained a PENDING row (and it renders on `/unverified`). If a real warning can't be forced in the environment, record that the browser click-path wasn't driven and rely on the T1 unit test + T3 modal test + the Step-1 DB check. State clearly which was done.
- [ ] **Step 3:** Delete any canary rows; confirm `dispense_reviews` clean. No canary left behind. Report PASS/FAIL with the DB before/after (no PHI).

---

## Self-Review

**Coverage:** Hub create-on-override → T1; schema + client carry → T2; modal capture + threading → T3; live-verify → T4. **Trigger correctness:** override required exactly for `warning`/`unavailable` (T3 gate); `contraindicated`/`checking` stay hard-blocked; `clear` unchanged. **Self-attested supervisor:** Hub sets `override_supervisor = ctx.user.sub` (FK-valid), typed name only in `override_reason` text — no offline-impossible name→UUID lookup. **Dispense safety:** the review insert is best-effort AFTER the committed dispense (never rolls it back); failure is logged + audited, not thrown. **Offline-first:** the override rides the existing `MedicationDispense` sync entry via `_ultranos.reviewOverride`; nothing needs network at capture. **No Tier-1 machinery touched:** this records a review; it does not block prescribing. **Type consistency:** `override?: { reason; supervisorName }` is the SAME shape from the modal → checklist → page → `confirmDispense` → `createMedicationDispense`; `_ultranos.reviewOverride` (T2 schema) is written by `createMedicationDispense` and read by `buildRecordDispensePayload` → sent as `overrideReason` (T1 input). **Rebuild note:** shared-types rebuilt after the schema edit (T2 Step 1). **Placeholder scan:** none — the Hub insert, the schema field, the payload builder, and the gate logic are concrete; the modal spec gives exact testids, the gate expression, and i18n keys. **Deferred (noted):** forcing a real `warning` state in the live browser may not be reproducible in the verify env (T4 falls back to the DB-path check); a real supervisor directory (name→UUID) remains out of scope.
