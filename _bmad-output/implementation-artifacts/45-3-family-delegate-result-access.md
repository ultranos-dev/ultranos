# Story 45.3: Family Delegate Result Access

Status: ready-for-dev

## Story

As a patient's family member,
I want to be designated as a result delegate so I can receive and view lab results on behalf of my illiterate parent,
So that results reach someone who can understand and act on them.

## Acceptance Criteria

1. **Given** a patient designates a family delegate at registration, **when** results are ready, **then** the delegate receives the SMS receipt code and can view results in Patient-Lite on the patient's behalf
2. **And** delegation requires one-time consent from the patient (audio + thumbprint from Story 45.1 or verbal witnessed)
3. **And** the delegate's phone number and relationship are recorded
4. **And** delegation is revocable by the patient at any time
5. **And** the delegation relationship and all access events are audit-logged
6. **And** the delegate sees the same data minimization as the patient — no internal lab notes or raw values beyond what the patient view shows

## Tasks / Subtasks

- [ ] **Task 1: Delegate data model in Dexie** (AC: #1, #3)
  - [ ] 1.1 Define `FamilyDelegate` interface in `apps/lab-lite/src/lib/db.ts`:
    ```typescript
    export interface FamilyDelegate {
      id?: number
      patientRef: string           // Patient/<uuid>
      delegatePhone: string        // phone number (encrypted)
      delegateRelationship: DelegateRelationship
      delegateName?: string        // optional, encrypted — some delegates may be illiterate too
      consentRecordId: number      // FK to ConsentRecord from Story 45.1
      status: 'active' | 'revoked'
      registeredAt: string         // ISO 8601
      registeredByTechId: string   // witnessing technician
      revokedAt?: string
      revocationReason?: string
      hlcTimestamp: string
      syncStatus: 'pending' | 'synced'
    }

    export type DelegateRelationship =
      | 'spouse' | 'parent' | 'child' | 'sibling'
      | 'grandchild' | 'in-law' | 'other'
    ```
  - [ ] 1.2 Add `familyDelegates` table to `LabLiteDatabase` — bump Dexie version. Indexes: `++id, patientRef, status, delegatePhone, syncStatus`
  - [ ] 1.3 Create helpers: `addFamilyDelegate()`, `getDelegatesByPatient(patientRef)`, `getActiveDelegateByPhone(phone)`, `revokeDelegate(id, reason)`, `getDelegateByConsentId(consentRecordId)`
  - [ ] 1.4 The `revokeDelegate` helper sets `status: 'revoked'`, `revokedAt`, `revocationReason` — NEVER deletes the record (append-only, auditability)
  - [ ] 1.5 Encrypt `delegatePhone` and optional `delegateName` before storage using Web Crypto AES-GCM (these are PII)

- [ ] **Task 2: Delegate registration UI** (AC: #2, #3)
  - [ ] 2.1 Create `apps/lab-lite/src/components/consent/DelegateRegistration.tsx` — form for registering a family delegate
  - [ ] 2.2 Form fields: delegate phone number (with country code picker defaulting to +93 Afghanistan), relationship (dropdown from `DelegateRelationship` enum), optional delegate name
  - [ ] 2.3 Phone number validation: basic format check, length validation for Afghan (+93, 9 digits) and other MENA country codes
  - [ ] 2.4 Consent linkage: require an active consent record (from Story 45.1) for the patient. If no consent exists, prompt to capture consent first. Display: "Patient has consented via [method] on [date]"
  - [ ] 2.5 If consent was captured with `purpose: 'delegation'` or general lab consent, link the consent record ID to the delegate entry
  - [ ] 2.6 On submit: create `FamilyDelegate` record in Dexie, emit audit event

- [ ] **Task 3: Integrate delegate registration into patient workflow** (AC: #2)
  - [ ] 3.1 Add "Add Family Delegate" button on the patient profile/detail view in Lab-Lite (accessible from `apps/lab-lite/src/app/[locale]/patients/` routes)
  - [ ] 3.2 Add delegate registration step as an optional step in the consent capture workflow (Story 45.1, Task 6) — after consent is captured, offer: "Would you like to designate a family member to receive results?"
  - [ ] 3.3 Show existing active delegates on the patient profile with option to revoke

- [ ] **Task 4: SMS receipt code delivery to delegate** (AC: #1)
  - [ ] 4.1 Create `apps/lab-lite/src/lib/delegate-notification.ts` — logic to queue an SMS notification for the delegate when results are ready
  - [ ] 4.2 When a result is authorized (integration point with Story 42.5 result authorization), check if the patient has an active delegate. If yes, queue an SMS containing the receipt code (same code that would be sent to the patient)
  - [ ] 4.3 The SMS payload contains ONLY the receipt code and a generic message: "Lab results are ready. Use code [CODE] in the health app to view." — NO patient name, NO test names, NO results in the SMS (data minimization)
  - [ ] 4.4 SMS delivery is queued via the sync queue for Hub-side dispatch — Lab-Lite does not send SMS directly
  - [ ] 4.5 Add `delegateNotified` flag and `delegateNotifiedAt` timestamp to the result/order record to prevent duplicate notifications

- [ ] **Task 5: Delegate access logging** (AC: #5)
  - [ ] 5.1 Add `reportDelegateAuditEvent()` to `apps/lab-lite/src/lib/audit-client.ts` — emit events for:
    - `CREATE` when delegate is registered (patientRef, delegateRelationship, consentRecordId)
    - `CONSENT_REVOKE` when delegation is revoked (patientRef, reason)
  - [ ] 5.2 On the Hub API / Patient-Lite side (out of scope for this story, but document the contract): every result access by a delegate must emit a `PHI_READ` audit event with `metadata.accessType: 'delegate'`, `metadata.delegatePhone: '[REDACTED]'`, `metadata.patientRef`
  - [ ] 5.3 Use `AuditResourceType.CONSENT` for delegation lifecycle events, `AuditResourceType.LAB_RESULT` for result access events

- [ ] **Task 6: Revocation mechanism** (AC: #4)
  - [ ] 6.1 Create `apps/lab-lite/src/components/consent/RevokeDelegateDialog.tsx` — confirmation dialog with reason input
  - [ ] 6.2 On revocation: call `revokeDelegate(id, reason)` in Dexie, emit audit event, mark `syncStatus: 'pending'` so the Hub is notified
  - [ ] 6.3 Once revoked, the delegate's receipt code access is invalidated on the Hub side (document this as a Hub API contract requirement — the Hub must check delegate status before allowing access)
  - [ ] 6.4 Revocation is available from the patient profile view — "Revoke" button next to each active delegate
  - [ ] 6.5 A revoked delegate can be re-registered with a new consent — create a new `FamilyDelegate` record, don't reactivate the old one

- [ ] **Task 7: Data minimization enforcement** (AC: #6)
  - [ ] 7.1 Document the contract: delegates accessing results via Patient-Lite see the SAME view as the patient — no internal lab notes, no QC data, no raw analyzer values, no technician comments
  - [ ] 7.2 This is enforced at the Hub API layer (the `/patient/results` endpoint returns the same projection regardless of whether the accessor is the patient or a delegate) — Lab-Lite's responsibility is to correctly register and sync the delegation so the Hub can enforce access control
  - [ ] 7.3 Add a data minimization assertion in tests: verify that the delegate notification SMS contains NO clinical data

- [ ] **Task 8: i18n** (AC: #2, #3)
  - [ ] 8.1 Add translation keys in all 4 locale files under `delegates` namespace:
    - `delegates.addDelegate`, `delegates.phone`, `delegates.relationship`, `delegates.name`
    - Relationship options: `delegates.relationship.spouse`, `.parent`, `.child`, `.sibling`, `.grandchild`, `.inLaw`, `.other`
    - `delegates.consentRequired`, `delegates.revokeDelegate`, `delegates.revokeConfirm`, `delegates.revokeReason`
    - `delegates.activeLabel`, `delegates.revokedLabel`, `delegates.noActiveDelegates`

- [ ] **Task 9: Tests** (AC: all)
  - [ ] 9.1 Unit test: `FamilyDelegate` Dexie CRUD — create, read by patient, revoke (verify NOT deleted), read by phone
  - [ ] 9.2 Unit test: Phone number validation for Afghan and MENA formats
  - [ ] 9.3 Unit test: Delegate registration requires active consent record — reject if no consent exists
  - [ ] 9.4 Component test: DelegateRegistration form — phone input, relationship dropdown, consent linkage display
  - [ ] 9.5 Component test: RevokeDelegateDialog — revocation flow, audit event emission
  - [ ] 9.6 Audit test: assert `CREATE` event on delegate registration and `CONSENT_REVOKE` on revocation with correct metadata
  - [ ] 9.7 Data minimization test: assert SMS notification payload contains ONLY receipt code and generic message — no patient name, no test names, no results
  - [ ] 9.8 Encryption test: verify `delegatePhone` and `delegateName` are encrypted before Dexie storage
  - [ ] 9.9 RTL snapshot test: DelegateRegistration and RevokeDelegateDialog in LTR and RTL
  - [ ] 9.10 Offline test: verify delegate registration works without network (Dexie persistence, sync queued)

## Dev Notes

### Consent Dependency on Story 45.1

Delegate registration REQUIRES a consent record from Story 45.1. The `consentRecordId` field in `FamilyDelegate` links to the `ConsentRecord.id` from the consent table created in Story 45.1. If Story 45.1 is not implemented yet, this story should be sequenced after it.

The consent can be:
- A dedicated delegation consent ("I consent to [delegate name/relationship] receiving my lab results")
- A general lab collection consent that includes a delegation clause in the consent text version

### Phone Number as PII

The delegate's phone number is Personally Identifiable Information (PII). It must be encrypted before storage in IndexedDB using the same Web Crypto AES-GCM pattern used for other PHI in Lab-Lite. The phone number should NEVER appear in logs, audit event metadata (use `[REDACTED]`), or error messages.

### SMS Delivery Architecture

Lab-Lite is a PWA and cannot send SMS directly. The SMS delivery flow:

1. Lab-Lite creates a delegate notification event in the sync queue
2. When online, the sync engine pushes the event to the Hub API
3. The Hub API dispatches the SMS via an SMS gateway (Twilio, local MENA gateway, etc.)
4. The SMS contains ONLY: a receipt code + generic "results ready" message

This story creates the Lab-Lite side of this flow (step 1). The Hub API SMS dispatch is out of scope.

### Delegate Access Control — Hub Contract

This story establishes the delegation relationship in Lab-Lite's local database and syncs it to the Hub. The Hub is responsible for:
- Validating delegate status (active vs. revoked) before granting result access
- Returning the same data-minimized result view to delegates as to patients
- Audit-logging every delegate access as a `PHI_READ` event with `accessType: 'delegate'`

Document these requirements as a Hub API contract in the story so the Hub-side implementation (separate story) knows what to build.

### Relationship Types

The `DelegateRelationship` enum covers common MENA family structures. "In-law" is a single category rather than specific (mother-in-law, father-in-law) to keep the UI simple for illiterate patients who may be selecting via the technician. "Other" with a free-text note covers edge cases.

### Sync Priority

Family delegate records sync at the same priority as consent (Tier 1 / priority 1) because they represent a consent-derived access grant. Use append-only merge — delegate records are never overwritten via LWW. Revocations are new records, not updates to existing ones (in the sync sense).

### Project Structure Notes

- New components: `apps/lab-lite/src/components/consent/DelegateRegistration.tsx`, `apps/lab-lite/src/components/consent/RevokeDelegateDialog.tsx`
- New files: `apps/lab-lite/src/lib/delegate-notification.ts`
- Modified files: `apps/lab-lite/src/lib/db.ts` (new table + version bump), `apps/lab-lite/src/lib/audit-client.ts` (new audit helper), patient profile/detail views (add delegate management), consent workflow page (add optional delegate step), all 4 locale message files

### References

- Story 45.1: Audio & Thumbprint Consent Capture — consent dependency
- Story 42.5: Result Authorization Workflow — integration point for triggering delegate notification
- CLAUDE.md: PHI/PII encryption rules, audit rules, consent sync tier (append-only, priority 1)
- `packages/shared-types/src/fhir/consent.ts` — FHIR R4 Consent resource type
- `packages/shared-types/src/enums.ts` — `AuditAction`, `AuditResourceType` enums
- `apps/lab-lite/src/lib/db.ts` — existing Dexie database
- `apps/lab-lite/src/lib/audit-client.ts` — existing audit helpers
- `apps/lab-lite/src/lib/hlc.ts` — HLC singleton
