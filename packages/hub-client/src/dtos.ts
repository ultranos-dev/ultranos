/**
 * Canonical Hub wire DTOs — ONE source of truth per wire shape (Story 59.2 AC4 /
 * absorbing the spoke-DTO half of Story 63.3 Task 2).
 *
 * These were previously re-declared inside individual spokes' `lib/trpc.ts`. They
 * describe the unwrapped `result.data.json` payloads of specific Hub procedures.
 * Each spoke now re-exports the relevant type from here under its existing name, so
 * consumers are untouched and the shape can't drift per-spoke. Type-only — no
 * runtime footprint.
 *
 * NOTE: these are hand-maintained mirrors of the Hub projection (kept because they
 * carry the data-minimization intent in their doc comments and are the public API
 * surface of the spokes' trpc helpers). For a fully inference-checked shape, prefer
 * `HubOutputs['<router>']['<proc>']` from the package root.
 */

// ── diagnosticReport.listByPatient / .read (opd-lite) ────────────────────────

/**
 * Flat lab-report row as returned by the Hub `diagnosticReport.listByPatient`
 * procedure. The list projection is data-minimized: `performerDisplay`,
 * `conclusion`, and `presentedForm` (PHI / file content) are only returned by
 * `diagnosticReport.read` for a single report, so they are optional here.
 */
export interface HubDiagnosticReportItem {
  id: string
  resourceType: 'DiagnosticReport'
  status: string
  loincCode: string | null
  loincDisplay: string | null
  patientRef: string
  performerId: string | null
  performerDisplay?: string | null
  labId: string | null
  issued: string | null
  collectionDate: string | null
  virusScanStatus: string
  createdAt: string | null
  conclusion?: string | null
  presentedForm?:
    | Array<{ contentType?: string; data?: string; title?: string; url?: string }>
    | null
}

// ── lab.pullOrders (lab-lite) ────────────────────────────────────────────────

/**
 * Data-minimized order summary from `lab.pullOrders` (CLAUDE.md Rule #7): first
 * name + age only for the patient; no photo on the list tier (audit C-SYS-4).
 */
export interface LabOrderResponse {
  orderId: string
  patientFirstName: string
  patientAge: number | null
  /** Rule #7 (revised 2026-09-24): signed photo URL over an opaque key (never the
   *  patient UUID), plus demographics — now permitted on the lab list tier. */
  patientPhotoUrl: string | null
  patientGender: string | null
  patientPhone: string | null
  patientRef: string
  testsRequested: Array<{ loincCode: string; loincDisplay: string }>
  urgency: 'routine' | 'urgent' | 'asap' | 'stat'
  orderingPhysicianName: string
  specialInstructions: string | null
  status: string
  authoredOn: string
  /** True = claimed by this lab; false = unassigned/available. */
  assignedToLab: boolean
}

export interface PullOrdersResult {
  orders: LabOrderResponse[]
  syncTimestamp: string | null
  /** Keyset cursor for the next page, or null when the last page has been reached. */
  nextCursor: string | null
}

// ── lab.verifyPatient (lab-lite) ─────────────────────────────────────────────

/**
 * `lab.verifyPatient` result — identity/detail tier (Rule #7): first name + age +
 * photo + opaque blind-index ref. NEVER the real patient UUID or National ID.
 */
export interface VerifyPatientResult {
  firstName: string
  age: number
  patientRef: string
  photoUrl: string | null
}

// ── lab.searchPatients (lab-lite) ────────────────────────────────────────────

/**
 * Rule #7 list-tier DTO (revised 2026-09-24): firstName + age + the opaque blind-index
 * ref, PLUS photo (signed URL over an opaque key) + demographics (gender, phone).
 * Never the real patient UUID or National ID.
 */
export interface PatientSearchResult {
  /** Opaque blind-index ref (`Patient/<hmac>`) — never the real patient UUID. */
  ref: string
  firstName: string
  age: number | null
  photoUrl: string | null
  gender: string | null
  phone: string | null
}

// ── lab.getOrderPatientDetails (lab-lite) ────────────────────────────────────

/**
 * Detail-view PHI for the patient behind an order (Rule #7 detail-view scope):
 * full name + gender + blood group + latest basic vitals. Order-scoped and only
 * for claimed orders. NEVER carries National ID or the raw patient UUID.
 */
export interface LabOrderPatientDetails {
  fullName: { given: string | null; father: string | null; grandfather: string | null }
  gender: string | null
  bloodGroup: string | null
  photoUrl: string | null
  vitals: {
    weightKg: number | null
    heightCm: number | null
    bmi: number | null
    temperatureC: number | null
    bpSystolic: number | null
    bpDiastolic: number | null
    recordedAt: string | null
  }
}

// ── medication.listForPharmacy (pharmacy-lite) ───────────────────────────────

/** A patient's un-dispensed prescription, data-minimized for the pharmacy. */
export interface PharmacyPrescriptionItem {
  id: string
  prescriptionStatus: string | null
  medicationDisplay: string | null
  medicationText: string | null
  dosageInstruction: unknown
  authoredOn: string | null
  requesterId: string | null
}
