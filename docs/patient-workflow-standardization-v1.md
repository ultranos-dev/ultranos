# Patient Workflow Standardization — v1 Plan

Branch: `patient-workflow-standarization-v1`
Status: **PLANNING** (no implementation yet)
Last updated: 2026-09-27

> Goal: one canonical patient, consumed through **one shared UI** and **one policy-tiered
> read/write path**, across OPD-Lite, Pharmacy-Lite, and Lab-Lite — with same-org access
> from any app and consent-gated cross-org continuity of care. This document is the living
> plan; decisions marked ⏳ are proposed and awaiting confirmation before implementation.

---

## 1. Objectives

1. **Kill patient-CRUD UI drift.** Create + edit patients through the *same* modal-based
   form in every app.
2. **One read/write path.** All apps create/edit/read through the canonical Hub services
   (MPI-deduped), with what each app sees/does governed by a single access policy — not
   per-app conditionals.
3. **Same-org sharing.** A patient registered in any app of the org is visible (at the
   viewer's authorized depth) from any other app of the org, from one place.
4. **Cross-org continuity.** When a patient presents at a *different* org, staff can view a
   **consent-gated, read-only** continuity-of-care summary (details + history), with clear
   provenance.
5. Preserve every healthcare-safety guarantee (consent enforcement, audit, Rule #7 identity
   secrets, allergy prominence, offline-first honesty).

## 2. Current state (verified 2026-09-27)

- **UI is triplicated+**: separate `PatientRegistrationForm.tsx` in `apps/opd-lite`,
  `apps/lab-lite`, and **two** in `apps/pharmacy-lite` (`registration/` + `pharmacy/`).
  No shared patient package.
- **Write path is already ~half-canonical**: pharmacy-lite calls the Hub `patient.create`
  + `patient.checkDuplicates`; opd-lite calls `patient.create`/`patient.update`. The
  duplication is mostly **UI + per-app offline glue**, not backend logic.
- **Identity/dedupe already factored out** → `packages/mpi-engine`.
- **Shared client already exists** → `packages/hub-client`; shared types → `shared-types`;
  offline queue → `sync-engine`; presentational components → `ui-kit`.
- **Lab is a deliberate outlier (Rule #7)**: data-minimized, opaque HMAC blind-ref, never
  the real UUID or raw National ID, verify-before-details.
- **Enforcement spine already present**: patients are `org_id`-scoped; every patient-derived
  read runs through consent enforcement + append-only audit at the Hub.

**Implication:** this is a *convergence + extraction* effort, not a backend rewrite.

## 3. Target architecture

### 3.1 Organizing principle
**One canonical patient; many capability-scoped projections; one policy resolver.**

A single Hub function is the source of truth for "who sees/does what":

```
resolvePatientAccess({ viewerOrg, patientOrg, role, entitlement, consent, claimState })
  → { tier: 'FULL' | 'CLINICAL' | 'MINIMIZED' | 'CONTINUITY' | 'NONE',
      fields: string[], canEdit: boolean, provenance: 'own-org' | 'cross-org' }
```

- The **API** returns a projection shaped by `tier`/`fields`.
- The **UI** renders sections + read-only flags from the *same* `tier` (via capability flags).
- No scattered `if (sameOrg)` / per-app field lists.

### 3.2 Access tiers (proposed)
| Tier | Who | Content |
|------|-----|---------|
| FULL | same-org clinician/admin | Full record incl. edit; NID last-4 for edit form |
| CLINICAL | same-org clinical roles **incl. lab** | Full clinical record; **same-org lab uses the real patient reference like every other in-org app — no lab-specific minimization or blind ref** |
| MINIMIZED | **cross-org** lab (no consent) / pre-relationship verify-before-claim | Rule #7 set: photo + name + age + gender + phone; opaque HMAC blind ref, NO real UUID |
| CONTINUITY | cross-org, consented | Read-only summary: allergies, active meds, recent encounters, results; provenance-labeled |
| NONE | no relationship / withdrawn consent | 403 |

## 4. Workstreams

- **A. Standardize creation & editing (UI).** New `@ultranos/patient-kit` package holding a
  shared `<PatientForm>` + create/edit **modals** (the pattern already shipped in opd-lite).
  Data layer is **injected per app** (adapter), capabilities **driven by policy**.
- **B. Same-org read + shared detail surface.** Converge reads on the policy-tiered
  `patient.read`/directory; extract the Patient Detail surface (header, allergies-first
  banner, details accordion, history) into `patient-kit`, capability-gated.
- **C. Cross-org continuity.** Identity resolution (MPI blind index / signed Health Passport
  QR) → patient-mediated, org-scoped, time-boxed consent grant → read-only CONTINUITY view.

## 5. Phased roadmap

| Phase | Scope | Risk | Delivers |
|-------|-------|------|----------|
| **1** | Extract `@ultranos/patient-kit` (shared form + create/edit modals + adapter/capability interfaces). Migrate the 3 apps onto it. | Low–med | "Same modals everywhere"; ends 4× drift |
| **2** | Policy resolver + tiered `patient.read` + shared Patient Detail surface; same-org access from any app | Med | Same-org sharing from one place |
| **3** | Cross-org identity resolution + org-scoped consent grant + CONTINUITY read model + provenance UI | High | Cross-org continuity of care |

Each phase ships independently and is separately reviewable/deployable.

## 6. Phase 1 — detailed spec (proposed)

### 6.1 New package `packages/patient-kit`
- Exports: `<PatientForm mode>`, `<PatientCreateModal>`, `<PatientEditModal>`, the
  `PatientFormCapabilities` + `PatientDataAdapter` interfaces, and the shared Zod input
  schema re-exported from `shared-types` (single validation source).
- **Depends on** `ui-kit` (presentational) + `shared-types`. Contains NO app-specific
  db/sync/network code.

### 6.2 The seam: inject data, drive UI by capability
```ts
interface PatientDataAdapter {
  checkDuplicates(input): Promise<DuplicateDecision>   // MPI — every app, no exceptions
  create(input): Promise<{ id: string }>               // canonical Hub create + local persist
  update(id, input, lastKnownUpdate): Promise<...>
  fetchAllergies(id): Promise<AllergyEntry[]>
  // photo upload, consent capture, vitals persist — optional per capability
}
interface PatientFormCapabilities {
  sections: Record<SectionKey, 'edit' | 'read' | 'hidden'>   // from policy tier
  allowConsentCapture: boolean
  allowVitals: boolean
  allowPhoto: boolean
}
```
- OPD injects its Dexie + sync-engine primitive; pharmacy injects `registerPatientLocally`;
  lab injects its minimized/blind-ref adapter. **Same form, same MPI dedupe, zero drift.**

### 6.3 Migration order (lowest risk first)
1. Lift opd-lite's form/modals into `patient-kit` **unchanged in behavior**; opd-lite becomes
   the first consumer (adapter wraps its current logic). Keep opd-lite tests green.
2. Migrate **pharmacy-lite** onto `patient-kit` (delete its 2 form copies; wire adapter to
   `registerPatientLocally` + `patient.create`/`checkDuplicates`).
3. Migrate **lab-lite** with a MINIMIZED capability config + blind-ref adapter (preserves
   Rule #7). Keep lab's verify-first flow.

### 6.x Progress log
- **2026-09-27 — Step 1 DONE (foundation):** scaffolded `packages/patient-kit`
  (source-resolved, workspace-linked, depends on `shared-types`). Landed the reviewed
  contracts (`PatientFormValues`, `PatientDataAdapter`, `PatientFormCapabilities`,
  supporting types) + capability tier presets (`FULL`/`CLINICAL` → full edit; `MINIMIZED`
  → cross-org-lab MPI-only; `CONTINUITY` → read-only) with `capabilitiesForTier`. Typecheck
  clean; 5 capability tests green. **No app consumes it yet** (zero-risk so far).
- **2026-09-27 — Step 2a DONE (pipeline proof):** stood up patient-kit's UI layer (shared
  `Card` primitive + ui-kit/next-intl deps) and moved the first section — `NameInputSection`
  — into `patient-kit`. opd-lite now consumes it cross-package (added to `transpilePackages`
  + tailwind `content` + workspace dep; form import re-pointed; local file deleted; form
  test mock re-pointed). Verified: patient-kit typecheck + 8 tests (incl. a real-component
  render proof) green; opd-lite typecheck + patient-registration/patient-modals (32) green.
  - **Harness note (follow-up for 2b/2c):** interaction (onChange) tests inside patient-kit
    hit a dual-React/JSX-runtime boundary issue for source-consumed ui-kit components
    (render works, synthetic events don't fire; `dedupe`+`deps.inline` didn't fully fix it).
    Component tests here assert render/a11y/derived-state, not cross-boundary events; before
    heavier interactive components move (2b/2c) we need a shared vitest preset that aliases
    react/react-dom/react/jsx-runtime to a single copy. Not a product issue.
- **Next — Step 2b:** move the remaining presentational sections (Social, EmergencyContact,
  Allergies, Consent, PatientPhoto; Geography last) via the same proven pattern.

### 6.5 Step 2 execution plan (grounded 2026-09-27)

**Measured reality:** `PatientRegistrationForm.tsx` is **1802 lines**, wired to ~10 app-local
`@/lib`/`@/stores` modules (hub-auth, patient-photo-api, allergy-store, hlc, sync-queue,
vitals-fhir-mapper, vitals-config, audit, db, encryption-key-store, offline-registration).
Its section components are **lightly coupled / presentational** (deps: `Card`, `Button`,
next-intl; Geography also pulls Province/District autocompletes). **The form test mocks each
section + `Card` by local path** — so every section move must also re-point its test mock.

**Strategy — strangler, bottom-up, one verifiable slice per checkpoint** (never move the
1802-line orchestrator wholesale):

- **2a (pipeline proof, THIS step):** stand up patient-kit's UI layer (shared `Card`
  primitive + ui-kit/next-intl deps) and move the cleanest section — **`NameInputSection`**
  (self-contained: props + `useTranslations` + ui-kit Input). Prove opd-lite consumes a
  patient-kit **client component** end-to-end (transpilePackages + tailwind scan + i18n +
  import + test-mock re-point), tests green. Lowest blast radius (only the form uses it).
- **2b:** move the remaining presentational sections (Social, EmergencyContact, Allergies,
  Consent, PatientPhoto, Name-done) the same way; Geography last (autocomplete coupling).
- **2c:** extract the **data layer** into an `OpdPatientAdapter` implementing
  `PatientDataAdapter` (wrap the form's inline create/update/checkDuplicates/consent/vitals/
  photo/allergy-diff logic). Validates the contract against reality. Additive first.
- **2d:** move the **orchestrator form** into patient-kit, consuming sections + the injected
  adapter + capabilities; opd-lite renders `<PatientForm adapter={opdAdapter} caps={...}/>`.
- **2e:** migrate **pharmacy-lite** onto patient-kit (delete its 2 form copies).
- **2f:** migrate **lab-lite** with a MINIMIZED capability config + blind-ref adapter.

**i18n decision (v1):** moved components keep `useTranslations('registration')`; the
consuming app must provide those keys (opd-lite already does). Consolidating into a
patient-kit-owned message bundle (or prop-injected `t`) is a tracked follow-up before
pharmacy/lab adopt in 2e/2f.

### 6.4 Definition of done (Phase 1)
- One form implementation; the 3 apps consume it; old per-app forms deleted.
- Per-app typecheck + tests green; RTL snapshots for the shared form (LTR+RTL).
- Allergy-first, consent, and offline behaviors preserved per app.
- ui-kit dist rebuild + `check:dist` honored if barrel-exported (patient-kit is a new
  package, so wire its build into CI).

## 7. Key decisions (⏳ proposed — confirm before building)

1. **Shared UI location** → new `@ultranos/patient-kit` (keep ui-kit purely presentational). ⏳
2. **Same-org lab access** → a lab that is part of the patient's org is treated like any
   other same-org clinical app (full clinical record, real patient reference — **no
   lab-specific minimization or blind ref in-org**). The blind-ref minimization +
   identity-secret protection apply only to **cross-org** labs (no established
   org relationship / no consent). *(Product decision 2026-09-27; supersedes the prior
   "lab stays minimized even in-org" stance. CLAUDE.md Rule #7 updated to match.)* ⏳
3. **Cross-org model** → patient-mediated, org-scoped, time-boxed consent grant → read-only
   CONTINUITY projection. NOT "same subscription ⇒ automatic cross-org access." ⏳
4. **Access logic** → single `resolvePatientAccess` policy resolver on the Hub, consumed by
   both API projection and UI capabilities. ⏳
5. **Sequencing** → ship Phase 1 (extraction) first. ⏳

## 8. Non-goals (v1)
- No change to the MPI matching algorithm itself (reuse `mpi-engine`).
- No new patient-facing mobile flows (patient-lite-mobile untouched in v1).
- Break-glass emergency cross-org access → deferred, separate explicit decision.

## 9. Risks & healthcare-safety guardrails
- **Tenancy ≠ authorization.** Org membership scopes *visibility*; consent + role gate
  *depth*; cross-org is always consent-gated. The policy resolver enforces this centrally.
- **Rule #7 (revised 2026-09-27)** — lab minimization is scoped to **cross-org** labs.
  Same-org lab uses the real patient reference like any other in-org app. The MINIMIZED
  tier + blind-ref adapter remain **mandatory for cross-org** lab access; add tests
  asserting NID/UUID never leave the Hub to a *cross-org* lab (and that same-org lab is
  not blind-ref'd).
- **Offline honesty** — cross-org continuity is online-only; UI must say "unavailable
  offline", never imply the patient has no history.
- **Audit everything** — every projection read + write emits an audit event (Rule #6).
- **Allergy prominence** preserved in the shared detail surface (first, red, uncollapsed).

## 10. Testing strategy
- Shared form: unit + RTL snapshots (LTR/RTL), create/edit, dedupe, allergy diff.
- Policy resolver: table-driven tests over (org, role, entitlement, consent, claim) → tier.
- Cross-org: consent grant/withdrawal changes projection; provenance labeling; offline path.
- Per-app migration: existing suites stay green (no behavior change in Phase 1).

## 11. Resolved decisions (confirmed 2026-09-27)

1. **Org boundary = `org_id` (a separate organization).** All branches / sites / locations
   of the same organization live *inside* one `org_id` and share same-org access
   (`CLINICAL`/`FULL`). Cross-`org_id` = a genuinely separate org → `CONTINUITY` tier,
   consent-gated. (If per-branch audit/scoping is later needed, add a `facility_id`
   *within* the org — it does NOT change the access boundary.)

2. **Cross-org consent capture = both, QR-first.** Patient presents the signed Health
   Passport QR (works offline to *identify*); the receiving org requests access; patient
   approves via **OTP** to their phone (proves presence + consent). OTP-only fallback when
   no QR. The grant is time-boxed + org-scoped in the append-only consent ledger.

3. **CONTINUITY scope = clinically-bounded, not time-boxed.** Always-current safety data
   (allergies, active meds, active problems) in **full**, plus recent encounters/results
   (**last 12 months OR last 10, whichever is smaller**). Older history unlocks only on
   **explicit expand + a fresh audit event**.

These feed the Phase 2 `resolvePatientAccess` resolver and the Phase 3 cross-org flow.
