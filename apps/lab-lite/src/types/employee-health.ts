/**
 * Employee Health & Vaccination Registry — Type Definitions
 * Story 47.3 — Occupational health records for lab technicians.
 *
 * Sensitivity: PHI-equivalent. All clinical fields encrypted at rest.
 * Never log vaccination statuses, titer results, or screening results.
 */

export enum VaccinationStatus {
  COMPLETE = 'COMPLETE',
  INCOMPLETE = 'INCOMPLETE',
  NOT_STARTED = 'NOT_STARTED',
  UNKNOWN = 'UNKNOWN',
}

export enum TbScreeningResult {
  NEGATIVE = 'NEGATIVE',
  POSITIVE = 'POSITIVE',
  INDETERMINATE = 'INDETERMINATE',
  NOT_DONE = 'NOT_DONE',
}

export enum HepBImmunityStatus {
  /** Titer >= 10 mIU/mL */
  IMMUNE = 'IMMUNE',
  NON_IMMUNE = 'NON_IMMUNE',
  UNKNOWN = 'UNKNOWN',
}

export interface ExposureHistoryEntry {
  id: string
  date: string
  type: string
  sourceStatus: string
  pepTaken: boolean
  outcome: string
  incidentReportId: string | null
}

export interface EmployeeHealthRecord {
  id: string
  practitionerId: string

  // Hepatitis B
  hepBStatus: VaccinationStatus
  hepBDoses: number
  hepBTiterDate: string | null
  hepBTiterResult: HepBImmunityStatus

  // Tetanus
  tetanusDate: string | null
  tetanusStatus: VaccinationStatus

  // COVID
  covidDate: string | null
  covidStatus: VaccinationStatus
  covidDoses: number

  // TB Screening
  tbScreeningDate: string | null
  tbScreeningResult: TbScreeningResult
  tbScreeningHistory: Array<{ date: string; result: TbScreeningResult }>

  // Exposure History
  exposureHistory: ExposureHistoryEntry[]

  // Notes & metadata
  notes: string
  lastUpdated: string
  updatedBy: string
  hlcTimestamp: string
}

export interface EncryptedHealthRecord {
  id: string
  practitionerId: string
  encryptedPayload: ArrayBuffer
  iv: Uint8Array
  lastUpdated: string
}

export interface ScreeningReminder {
  practitionerId: string
  screeningType: string
  dueDate: string
  message: string
  daysUntilDue: number
}

export type ReminderState = 'UPCOMING' | 'DUE' | 'OVERDUE'
