export interface MonitoringTestSpec {
  loincCode: string
  testDisplay: string
  frequencyDays: number
  initialDelayDays: number
  priority: 'routine' | 'urgent'
}

export interface MedicationLabMapping {
  atcCode: string
  medicationDisplay: string
  version: number
  requiredTests: MonitoringTestSpec[]
}

/**
 * A single monitoring REQUIREMENT the lab must fulfil, resolved server-side from
 * the dispensed medication (Story 58.2 / audit H-HUB-3 / C-LAB-1). The lab needs
 * only the test to run and when it is due — NOT which drug triggered it. The
 * ATC code / medication display are stripped server-side and never cross to the lab.
 */
export interface MonitoringRequirementDTO {
  loincCode: string
  testDisplay: string
  /** Days from dispense until this test first becomes due (initial delay). */
  initialDelayDays: number
  /** Repeat cadence in days once monitoring has started. */
  frequencyDays: number
  priority: 'routine' | 'urgent'
}

/**
 * Data-minimized dispense→monitoring event as delivered to the lab (Rule #7).
 *
 * Medication identity (atcCode / medicationDisplay) is intentionally ABSENT — it
 * exceeds every documented lab tier (audit C-LAB-1). The hub resolves the
 * medication→required-tests mapping server-side and delivers only the LOINC
 * test(s) the lab must run plus the due window. `dispensedAt` is the clock
 * anchor for the due-date calculation, not a medication disclosure.
 */
export interface DispenseMonitoringEventDTO {
  dispensingEventId: string
  patientRef: string          // "Patient/<blindIndex>" — never the raw UUID
  patientFirstName: string
  patientAge: number | null
  /** Required monitoring test(s) resolved server-side — no medication identity. */
  requirements: MonitoringRequirementDTO[]
  dispensedAt: string
  orderingPractitionerRef: string
  hlcTimestamp: string
}
