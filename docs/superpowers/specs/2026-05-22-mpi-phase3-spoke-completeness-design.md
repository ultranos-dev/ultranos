# MPI Phase 3 — Spoke App Completeness & Admin Tools

**Date:** 2026-05-22  
**Status:** Approved for implementation planning  
**Scope:** Phase 3 of 3 — Spoke App Completeness  
**Depends on:** Phase 1 (Identity Foundation) — fully implemented; Phase 2 (Registration UI) — must be implemented first (duplicate_reviews table, mpi_warn flow, district dataset)  
**Author:** Ultranos Dev / Claude (brainstorming session)

---

## Problem Statement

Phase 1 built the MPI engine and Hub API. Phase 2 delivers registration UIs and offline MPI reconciliation. Phase 3 closes the remaining gaps:

1. **Admin Portal has no patient management.** Flagged duplicates from Phase 2 can be dismissed but not merged. There is no way for administrators to search patients, view records, or resolve true duplicates.

2. **Lab Lite requires network for patient verification.** When offline, technicians are completely blocked from verifying patients — they cannot proceed with lab work.

3. **Pharmacy Lite has no fallback for damaged QR codes.** If the prescription QR is unreadable and the pharmacist is offline, dispensing is impossible.

4. **No consent expiry awareness.** Consent records expire after 3 years (set in Phase 1 RPC). No UI warns clinicians that consent is expiring, and no renewal flow exists.

5. **No biometric version migration path.** When the biometric algorithm is updated, existing fingerprint hashes become stale with no mechanism to prompt re-enrolment.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Merge strategy | Soft merge with 72-hour reversible unmerge window + audit trail | Wrong merges happen in healthcare (family members with similar names). Must be reversible. |
| Merge data handling | `merged_into` pointer on duplicate, NOT foreign key re-pointing | Simpler, reversible, no cascade risk. Queries follow the link at read time. |
| Lab Lite offline | QR signature verification + recent patient cache (50 entries, 24h TTL) | QR is cryptographically sound; cache covers repeat verifications. Data-minimized per CLAUDE.md Rule #7. |
| Pharmacy Lite fallback | Rx ID manual entry + offline grace mode with mandatory flagging | Refusing to dispense because QR is damaged and network is down is a patient safety issue. Flag and review on sync. |
| Consent expiry | Dashboard card + patient-level banner. Non-blocking. | Blocking modal would delay urgent care. Banner + dashboard count gives proactive + contextual awareness. |
| Biometric re-enrolment | Opportunistic — re-enrol when patient visits, not bulk migration | Hardware may not be present at all sites. Stale hash still useful for MPI scoring. |

---

## 1. Admin Portal Patient Management

### 1.1 Patient Search Page

Route: `/patients`

New sidebar section "Patient Management" with "Patient Search" link.

**Page layout:**
- Search input: name (local/Latin), national ID, phone, or patient UUID
- Filter toggles: "Flagged only" (mpi_warn=true), "Pending reviews", "Active only" (default on)
- Results table columns: Name (given + father), Gender, Birth Year, District, MPI Score, MPI Warn flag, Tier, Created At
- Pagination (20 per page)
- Click row → navigates to Patient Detail page

**Hub API:** Uses existing `patient.search` endpoint (already returns MPI fields from Phase 1). Add a new `patient.adminSearch` endpoint for admin-specific features:
- Accepts additional filters: `mpiWarnOnly`, `hasPendingReview`, `includeInactive`
- Returns additional fields: `mpiScore`, `createdBy`, `consentStatus`
- Requires `ADMIN` role

### 1.2 Patient Detail Page

Route: `/patients/[patientId]`

**Sections:**

**A. Demographics Card**
- All MPI fields displayed read-only: given name, father, grandfather, gender, birth date/year, phone, province, district, village (origin + current), national ID status (hashed — show "On file" or "Not provided"), is_nomadic, patient_tier, preferred_language
- "Edit Demographics" button → modal with editable fields → calls `patient.update`

**B. Consent History Timeline**
- Chronological list of all `consent_records` for this patient
- Each entry shows: method, language, version, status, valid_from, valid_until, grantor, witnessed_by (if verbal)
- Active consent highlighted; expired/superseded shown dimmed
- "Collect New Consent" button → consent form modal (same fields as OPD Lite registration consent section)

**C. Clinical Data Summary**
- Encounter count (total, last 12 months)
- Active prescriptions count
- Lab results count
- Dispense history count
- Each shows a count badge — NOT the actual clinical data. Admin Portal follows the same data-minimization principle as Lab Lite for non-clinical staff.

**D. MPI Duplicate Review Section** (shown only if `mpi_warn = true`)
- Shows the `duplicate_reviews` entry for this patient (if any)
- Candidate comparison cards (same component pattern as OPD Lite Phase 2)
- Actions: Dismiss, Initiate Merge (navigates to Merge Tool)

**E. Actions**
- Edit Demographics
- Deactivate Patient (soft delete — sets `is_active = false`)
- Initiate Merge (shown only if duplicates flagged or admin manually identifies a duplicate)

### 1.3 Merge Tool

Route: `/patients/merge?survivor=[id]&duplicate=[id]`

Reached from:
- Patient Detail → "Initiate Merge" (pre-fills duplicate from the flagged candidate)
- Duplicate review section → "Merge with [candidate name]"
- Admin can also manually enter two patient IDs

**Step 1: Side-by-Side Comparison**
- Two columns showing every field for both records
- Differences highlighted in amber
- Clinical data counts shown for each record (encounters, prescriptions, lab results)
- System recommendation: "Suggested survivor: [patient with more clinical data / older created_at]"

**Step 2: Field Resolution**
- For each conflicting field, admin selects which value to keep (radio buttons: "Patient A" / "Patient B")
- Non-conflicting fields auto-resolved to the non-null value
- Required fields must have a resolution (cannot leave blank)

**Step 3: Preview & Confirm**
- Summary of merge actions:
  - Survivor record: [ID] — will retain selected field values
  - Duplicate record: [ID] — will be marked as merged, set inactive
  - Clinical data: [N] encounters, [N] prescriptions, [N] lab results will follow the merge link
  - Unmerge available for 72 hours after merge
- "Confirm Merge" button (requires typing "MERGE" to confirm — destructive action safety)

### 1.4 Merge Mechanics (Hub API)

**New endpoint: `patient.merge`**

Input:
```typescript
z.object({
  survivorId: z.string().uuid(),
  duplicateId: z.string().uuid(),
  fieldResolutions: z.record(z.string(), z.enum(['survivor', 'duplicate'])),
})
```

Logic:
1. Validate both patients exist and are active
2. Apply field resolutions to the survivor record (update selected fields from the duplicate)
3. Set `merged_into = survivorId` on the duplicate record
4. Set `is_active = false` on the duplicate record
5. Create `merge_audits` row:
   - `survivor_id`, `duplicate_id`, `field_resolutions` (JSON), `merged_by`, `merged_at`
   - `status = 'ACTIVE'`
   - `unmerge_deadline = NOW() + INTERVAL '72 hours'`
6. Update any `duplicate_reviews` for the duplicate: set `status = 'MERGED'`
7. Clear `mpi_warn` on the survivor if no other pending reviews exist
8. Emit audit event: `PHI_WRITE`, `operation: 'merge'`

**New endpoint: `patient.unmerge`**

Input: `z.object({ mergeAuditId: z.string().uuid() })`

Logic:
1. Validate merge audit exists, status = 'ACTIVE', within 72-hour window
2. Restore duplicate: clear `merged_into`, set `is_active = true`
3. Reverse field resolutions on survivor (restore original values from audit JSON)
4. Set merge audit `status = 'REVERSED'`
5. Restore `mpi_warn = true` on both records
6. Emit audit event: `PHI_WRITE`, `operation: 'unmerge'`

**Scheduled job: `archiveMergedPatients`**
- Runs daily
- For merge audits where `status = 'ACTIVE'` and `unmerge_deadline < NOW()`:
  - Set merge audit `status = 'ARCHIVED'`
  - Unmerge no longer available

### 1.5 Query-Time Merge Resolution

Existing `patient.read` and `patient.search` endpoints add a check:

```typescript
// If patient has merged_into, transparently follow the link
if (patient.merged_into) {
  return ctx.caller.patient.read({ patientId: patient.merged_into })
}
```

`patient.search` filters `is_active = true` (already in place), which excludes merged duplicates.

### 1.6 Database Schema

**New column on `patients`:**
```sql
ALTER TABLE patients ADD COLUMN merged_into UUID REFERENCES patients(id);
CREATE INDEX idx_patients_merged_into ON patients(merged_into) WHERE merged_into IS NOT NULL;
```

**New table: `merge_audits`**
```sql
CREATE TABLE merge_audits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survivor_id         UUID NOT NULL REFERENCES patients(id),
  duplicate_id        UUID NOT NULL REFERENCES patients(id),
  field_resolutions   JSONB NOT NULL,
  original_survivor   JSONB NOT NULL,  -- snapshot of survivor fields before merge
  original_duplicate  JSONB NOT NULL,  -- snapshot of duplicate fields before merge
  merged_by           UUID NOT NULL REFERENCES practitioners(id),
  merged_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unmerge_deadline    TIMESTAMPTZ NOT NULL,
  status              TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVERSED', 'ARCHIVED')),
  reversed_by         UUID REFERENCES practitioners(id),
  reversed_at         TIMESTAMPTZ
);

CREATE INDEX idx_merge_audits_status ON merge_audits(status) WHERE status = 'ACTIVE';
```

### 1.7 Components (Admin Portal)

| Component | Path | Purpose |
|---|---|---|
| `PatientSearchPage` | `apps/admin-portal/src/app/patients/page.tsx` | Patient search with filters |
| `PatientDetailPage` | `apps/admin-portal/src/app/patients/[patientId]/page.tsx` | Full patient view |
| `MergeToolPage` | `apps/admin-portal/src/app/patients/merge/page.tsx` | Side-by-side merge wizard |
| `PatientComparisonTable` | `apps/admin-portal/src/components/patients/PatientComparisonTable.tsx` | Two-column field comparison |
| `FieldResolutionRow` | `apps/admin-portal/src/components/patients/FieldResolutionRow.tsx` | Per-field radio selector |
| `ConsentTimeline` | `apps/admin-portal/src/components/patients/ConsentTimeline.tsx` | Chronological consent display |
| `ClinicalDataSummary` | `apps/admin-portal/src/components/patients/ClinicalDataSummary.tsx` | Count badges for clinical data |
| `MergePreview` | `apps/admin-portal/src/components/patients/MergePreview.tsx` | Pre-merge summary + confirm |

---

## 2. Lab Lite Offline Verification Fallback

### 2.1 QR Offline Verification

Port the Ed25519 signature verification pattern from Pharmacy Lite's `prescription-verify.ts`:

**Public key cache:**
- On each successful online verification, cache the practitioner's public key in a Dexie `practitioner_keys` table: `{ practitionerId, publicKey, cachedAt }`
- Keys are refreshed on online verification if older than 24 hours
- Max 100 cached keys, LRU eviction

**Offline QR verification flow:**
1. Scan Health Passport QR → extract `{ pid, iat, exp, sig }`
2. Check `exp` — reject if expired (even offline)
3. Look up signing practitioner's public key in Dexie cache
4. Verify `sig` against `pid + iat + exp` using cached key
5. If valid: show data-minimized patient card (first name + age only — CLAUDE.md Rule #7)
6. If key not cached: show "Verification unavailable offline — practitioner key not cached"
7. If signature invalid: show "QR code verification failed" error

### 2.2 Recent Patient Cache

**Cache structure** (Dexie `verified_patients` table):
```typescript
interface VerifiedPatientCache {
  patientId: string       // UUID
  firstName: string       // first name only (CLAUDE.md Rule #7)
  age: number             // computed age, not DOB
  verifiedAt: string      // ISO timestamp
}
```

**Cache behavior:**
- After each successful online verification, upsert entry
- Maximum 50 entries, LRU eviction (oldest `verifiedAt` removed)
- Entries expire after 24 hours — auto-purged on app start
- **Data minimization enforced:** ONLY first name + age stored. No PHI beyond Rule #7 allowance.

**Offline manual lookup:**
- When offline and national ID entered: hash the ID locally, check against Dexie `patients` table (if synced) for a matching `nationalIdHash`
- If match found AND in `verified_patients` cache: show cached patient card with "Verified from cache" badge
- If match not in cache: show "Patient verification unavailable offline. Use QR scan or retry when connected."

### 2.3 UI Changes

**PatientVerifyScanner** updates:
- Add offline status indicator in header (green dot = online, amber = offline)
- When offline: QR scan still available, results show "Offline verification" badge

**PatientVerifyForm** updates:
- When offline with no cache: disable national ID input, show message "Manual verification requires network. Use QR scan."
- When offline with cache available: national ID input enabled, results show "Verified from cache — limited offline mode" badge
- When online: no changes to existing behavior

### 2.4 Components

| Component | Path | Purpose |
|---|---|---|
| `OfflineVerificationBadge` | `apps/lab-lite/src/components/OfflineVerificationBadge.tsx` | "Offline" / "Cached" status badge |
| `OnlineStatusIndicator` | `apps/lab-lite/src/components/OnlineStatusIndicator.tsx` | Green/amber dot in header |

Existing components modified:
- `PatientVerifyScanner.tsx` — add offline Ed25519 verification path
- `PatientVerifyForm.tsx` — add cache lookup + offline state handling
- New Dexie tables added to `db.ts`: `practitioner_keys`, `verified_patients`

---

## 3. Pharmacy Lite Manual Prescription Fallback

### 3.1 Manual Rx Entry Component

New component `ManualRxEntry` added to the dispensing flow as an alternative to QR scanning:

- Text input for prescription ID (printed on paper Rx below the QR code)
- "Look Up" button
- If **online**: calls `medication.read(rxId)` → shows full prescription details → normal dispensing flow
- If **offline**: triggers offline grace mode (see 3.2)

**Entry point:** A "Can't scan QR?" link below the QR scanner, or a tab toggle "Scan QR / Enter Rx ID" at the top of the dispensing page.

### 3.2 Offline Grace Mode

When offline and Rx ID is entered:

1. Show clear warning banner: "Network unavailable — prescription status cannot be verified. Dispensing will be flagged for review."
2. Require mandatory fields before allowing dispensing:
   - **Supervisor selection**: dropdown from locally cached practitioner list (practitioners with Pharmacist or Admin role)
   - **Override reason**: free text, minimum 10 characters (e.g., "Patient presenting paper Rx, network outage, urgent need")
3. Create the dispense record in local Dexie with:
   - `verification_status: 'UNVERIFIED'`
   - `override_reason: <text>`
   - `override_supervisor: <practitionerId>`
   - `offline_dispensed_at: <ISO timestamp>`
4. Normal dispensing UI proceeds (medication selection, quantity, etc.)

**Safety guardrails:**
- Max 5 unverified dispenses per shift per pharmacist (tracked in Dexie session store). After 5, grace mode is disabled with message: "Maximum unverified dispenses reached. Network connection required."
- If no cached supervisors available (first time offline, cache empty): grace mode is unavailable. Show: "Supervisor list not available offline. Connect to network first."
- Each unverified dispense emits a local audit event with action `UNVERIFIED_DISPENSE`

### 3.3 Review-on-Sync

When the unverified dispense syncs to the Hub:

1. Hub API receives the dispense with `verification_status: 'UNVERIFIED'`
2. Creates an entry in `dispense_reviews` table:
   - `dispense_id`, `prescription_id`, `override_reason`, `override_supervisor`, `status: 'PENDING'`
3. Notifies the pharmacy supervisor via Supabase Realtime

**`dispense_reviews` table:**
```sql
CREATE TABLE dispense_reviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispense_id           UUID NOT NULL REFERENCES medication_dispenses(id),
  prescription_id       UUID,
  override_reason       TEXT NOT NULL,
  override_supervisor   UUID NOT NULL REFERENCES practitioners(id),
  status                TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'FLAGGED')),
  reviewed_by           UUID REFERENCES practitioners(id),
  reviewed_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dispense_reviews_status ON dispense_reviews(status) WHERE status = 'PENDING';
```

### 3.4 Pharmacy Dashboard Update

- New `UnverifiedDispensesCard` on the pharmacy dashboard — shows count of PENDING dispense reviews
- Click → navigates to a review list (simple table: Rx ID, patient, pharmacist, reason, date)
- Review actions: **Approve** (legitimate offline dispense) or **Flag** (suspicious — escalates to admin)

### 3.5 Components

| Component | Path | Purpose |
|---|---|---|
| `ManualRxEntry` | `apps/pharmacy-lite/src/components/pharmacy/ManualRxEntry.tsx` | Rx ID input + lookup |
| `OfflineGraceForm` | `apps/pharmacy-lite/src/components/pharmacy/OfflineGraceForm.tsx` | Supervisor + reason form |
| `UnverifiedDispensesCard` | `apps/pharmacy-lite/src/components/pharmacy/UnverifiedDispensesCard.tsx` | Dashboard count card |
| `DispenseReviewList` | `apps/pharmacy-lite/src/components/pharmacy/DispenseReviewList.tsx` | Review table |

---

## 4. Consent Expiry Warning

### 4.1 Hub API

**New endpoint: `consent.expiringCount`**
- Query: counts `consent_records WHERE valid_until < NOW() + INTERVAL '90 days' AND valid_until > NOW() AND status = 'ACTIVE'`
- Returns `{ count: number }`
- Requires `protectedProcedure` + `enforceResourceAccess('Patient')`

**New endpoint: `consent.expiringSoon`**
- Query: returns patient list with expiring consents (patient ID, name, consent expiry date)
- Paginated, sorted by nearest expiry first
- Same access control

**New endpoint: `consent.renew`**
- Mutation: creates a new `consent_records` row with fresh `valid_from = NOW()`, `valid_until = NOW() + 3 years`
- Updates the previous consent record: `status = 'SUPERSEDED'`
- Input: `{ patientId, method, witnessedBy?, language, version }`
- `grantor_id` set from `ctx.user.sub` (the clinician collecting renewal), `grantor_role` from `ctx.user.role`
- Audit event: `PHI_WRITE`, `operation: 'consent_renewal'`

### 4.2 enforceConsent Middleware Update

Current behavior: blocks access when no active consent exists. Add a response header or context flag:

```typescript
// In enforceConsent middleware, after finding active consent:
const daysUntilExpiry = Math.floor(
  (new Date(consent.valid_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
)
ctx.consentExpiryWarning = daysUntilExpiry <= 90 ? daysUntilExpiry : null
```

The UI reads `consentExpiryWarning` from the response context to show the banner. Access is NOT blocked — the consent is still active.

### 4.3 OPD Lite Dashboard Card

New `ExpiringConsentsCard` on the clinical dashboard:
- Shows: "N Consents Expiring Soon" with a count badge
- Fetches via `consent.expiringCount`
- Click → navigates to `/expiring-consents` page showing the patient list
- Follows existing card pattern (same styling as DuplicateReviewsCard)

### 4.4 Patient-Level Banner

When viewing a patient whose consent expires within 90 days:

- Amber banner below the header: "Consent expires on [date] ([N] days). Collect renewed consent."
- "Renew Consent" button → opens consent renewal modal
- Modal fields: method (Written/Verbal Witnessed), witness (if verbal), language
- Submit calls `consent.renew` → creates new consent record, supersedes old one
- Banner disappears after successful renewal

### 4.5 Components (OPD Lite)

| Component | Path | Purpose |
|---|---|---|
| `ExpiringConsentsCard` | `apps/opd-lite/src/components/dashboard/ExpiringConsentsCard.tsx` | Dashboard count card |
| `ExpiringConsentsPage` | `apps/opd-lite/src/app/[locale]/expiring-consents/page.tsx` | Patient list with expiry dates |
| `ConsentExpiryBanner` | `apps/opd-lite/src/components/patient/ConsentExpiryBanner.tsx` | Amber warning banner |
| `ConsentRenewalModal` | `apps/opd-lite/src/components/patient/ConsentRenewalModal.tsx` | Renewal form modal |

---

## 5. Biometric Re-enrolment

### 5.1 Version Detection

Environment variable `BIOMETRIC_ALGORITHM_VERSION` (e.g., `"v1"`) defines the current algorithm version. Stored on the Hub API.

When a patient record is loaded and `biometric_algorithm_version` does not match the current env var:
- The response includes `biometricStale: true` flag
- The UI shows a banner

### 5.2 Patient-Level Banner (OPD Lite)

When viewing a patient with stale biometric data:

- Blue informational banner: "Biometric data needs to be updated (algorithm version changed)."
- "Update Biometric" button → initiates biometric capture flow
- If biometric hardware not available: button shows "No biometric hardware detected" (disabled)

### 5.3 Re-enrolment Flow

1. Clinician taps "Update Biometric" → biometric capture UI (hardware-dependent, device API)
2. New fingerprint hash computed with current algorithm
3. Call `patient.updateBiometric` endpoint:
   - Input: `{ patientId, biometricFingerprintHash, biometricAlgorithmVersion }`
   - Updates both columns on the patient record
   - Audit event: `PHI_WRITE`, `operation: 'biometric_reenrolment'`
4. Banner disappears after successful update

### 5.4 Design Constraints

- **No bulk migration**: re-enrolment is opportunistic (happens when patient visits clinic)
- **Stale hash still useful**: MPI scoring uses the old hash for matching — better than no biometric signal
- **Hardware dependency**: biometric capture requires device-specific hardware. If absent, the banner is informational only.
- **Mobile vs. PWA**: biometric capture is primarily a mobile feature (Expo + device API). PWA support depends on WebAuthn availability — out of scope for Phase 3.

### 5.5 Components

| Component | Path | Purpose |
|---|---|---|
| `BiometricStaleBanner` | `apps/opd-lite/src/components/patient/BiometricStaleBanner.tsx` | Informational banner |
| `BiometricCaptureModal` | `apps/opd-lite/src/components/patient/BiometricCaptureModal.tsx` | Re-enrolment capture UI |

Hub API endpoint:
- `patient.updateBiometric` — mutation, `protectedProcedure`, `enforceResourceAccess('Patient')`

---

## 6. Testing Strategy

### 6.1 Admin Portal
- Patient search: filters, pagination, results display
- Patient detail: demographics, consent timeline, clinical data counts
- Merge tool: side-by-side comparison, field resolution, preview, confirm
- Merge mechanics: `merged_into` set, `is_active` false, audit created
- Unmerge: within 72 hours restores both records, after deadline rejected
- Query-time resolution: `patient.read` follows `merged_into` link

### 6.2 Lab Lite
- QR offline verification: valid signature accepted, expired QR rejected, missing key handled
- Cache: entries stored after online verification, LRU eviction at 50, 24-hour expiry
- UI: offline indicator, cache badge, disabled manual input when no cache

### 6.3 Pharmacy Lite
- Manual Rx entry: online lookup, offline grace mode trigger
- Grace mode: supervisor + reason required, max 5 per shift enforced
- Review-on-sync: dispense_reviews created, supervisor notified
- Dashboard: unverified count card

### 6.4 Consent
- Expiry count endpoint: counts correctly within 90-day window
- Renewal: new record created, old record superseded
- Middleware: consentExpiryWarning flag set when within 90 days, access not blocked
- Banner: appears and disappears on renewal

### 6.5 Biometric
- Version mismatch detection
- Re-enrolment updates both hash and version
- Banner shows only when stale

---

## 7. Dependencies on Phase 2

Phase 3 requires Phase 2 to be complete:

| Phase 3 Feature | Phase 2 Dependency |
|---|---|
| Admin merge tool | `duplicate_reviews` table, `mpi_warn` flow |
| Admin patient search | MPI fields in patient records (Phase 1), district dataset (Phase 2) |
| Lab Lite geography display | District dataset from `afghanistan-districts.ts` (Phase 2) |
| Consent expiry | `consent_records` with `valid_until` (Phase 1 RPC) |
| Biometric re-enrolment | `biometric_algorithm_version` column (Phase 1 migration 018) |
