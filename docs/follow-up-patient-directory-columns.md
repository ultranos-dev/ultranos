# Follow-up: Complete Patient Directory columns on first login

Status: **scoped, not implemented**
Context: `apps/opd-lite/src/components/patients/PatientDirectory.tsx`

## Problem

The directory's **Allergies** flag and **Last Visit** date are derived from local
IndexedDB (`db.allergyIntolerances`, `db.encounters`). Those tables are populated
only by:

- per-patient `sync.pull` (when a chart is opened), or
- locally-created records (encounters/allergies entered on this device).

`usePatientListSync.syncAll()` pulls **only patient demographics** (`patient.list`)
— never allergies or encounters list-wide. So on a fresh login, patients the user
has never opened show **no allergy flag and no last visit**, even though that data
exists on the Hub.

(The immediate "stale until remount" bug — the directory not re-reading aux data
after sync/while open — is already fixed via `refreshFromDexie()` on mount, after
sync, and on tab re-focus. This follow-up is about the data not being present
locally at all on first login.)

## Goal

On first view after login (online), the Allergies and Last Visit columns are
complete for **all listed patients**, not just locally-cached ones — without
bulk-transferring full PHI for every patient.

## Options

### A. Summary fields on `patient.list` — RECOMMENDED
Hub computes and returns two derived fields per patient row:
- `hasAllergies: boolean` — `EXISTS` against `allergy_intolerances` (clinical-status active), org-scoped.
- `lastVisitAt: string | null` — `MAX(encounters.period_start)` for the patient, org-scoped.

The directory consumes these directly; the local Dexie maps remain as the
**offline fallback** (merge: prefer Hub summary when present, else local).

- **Pros:** one round-trip (already paging `patient.list`); minimal payload (a bool + a date); **data-minimization aligned** — no allergy substance or clinical detail leaves the Hub for the list view; works for all patients immediately.
- **Cons:** adds two columns/subqueries to the list query; a small Hub change.

### B. List-wide `sync.pull` for `AllergyIntolerance` + `Encounter`
Bulk-pull the org's allergies/encounters into Dexie on directory load.
- **Pros:** reuses sync infra; data then available offline for all patients.
- **Cons:** transfers **full PHI** for every patient (heavy, weak data-minimization); larger sync/storage; the directory only needs a bool + date.

### C. Lazy per-visible-row pull
Pull allergies/encounters only for the 25 paginated rows on render.
- **Pros:** bounded transfer.
- **Cons:** N round-trips per page; flicker; complexity.

## Recommendation

**Option A.** The directory needs a boolean and a date, not the full resources.
Summary fields on `patient.list` are the smallest, fastest, most
data-minimization-friendly change, and they make both columns complete on first
login. Keep the local Dexie maps as the offline fallback.

## Implementation sketch (Option A)

1. **Hub** (`apps/hub-api/src/trpc/routers/patient.ts`, `patient.list`): add
   `hasAllergies` (EXISTS subquery) and `lastVisitAt` (MAX(period_start)) to each
   row, org-scoped. No PHI beyond the existing list payload.
2. **shared-types**: extend the `patient.list` result item type.
3. **Client** (`PatientDirectory.tsx`): when building rows, prefer the Hub
   `hasAllergies`/`lastVisitAt`; fall back to the local `allergyPatientIds` /
   `lastVisitMap` (offline). `formatDate(lastVisitAt, locale)` already handles
   rendering.
4. **Tests:** Hub list returns the summary fields (incl. an allergic patient and
   one with no encounters); directory renders the flag/date from the Hub summary
   when local cache is empty; offline path still uses local Dexie.

## Effort / risk

Small–medium. One Hub query change + a type + a client merge. Low risk
(additive, read-only, no schema change). Main care: keep the org-scoping correct
on the subqueries and avoid N+1 (use lateral/aggregate joins).

## Related (separate) follow-up — date format sweep

`formatDate`/`formatDateTime` now guarantee Gregorian **DD/MM/YYYY** with
per-locale digits, and the directory's Last Visit uses it. But ~20 other
components still call bare `toLocaleDateString()` / `toLocaleString()` (browser-
locale-dependent, often US MM/DD/YYYY). They should be migrated to the shared
`formatDate`/`formatDateTime`/`formatTime` helpers for app-wide consistency.
Sample offenders: `ActiveMedicationsList`, `PatientDetailsAccordion`,
`ConsentExpiryBanner`, `NotificationCenter`, `SyncDashboard`,
`expiring-consents/page`, `LabResultsList`, `EncounterHistoryList`,
`appointments/*`.
