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

/** Data-minimized dispense→monitoring event as delivered to the lab (Rule #7). */
export interface DispenseMonitoringEventDTO {
  dispensingEventId: string
  patientRef: string          // "Patient/<blindIndex>" — never the raw UUID
  patientFirstName: string
  patientAge: number | null
  atcCode: string
  medicationDisplay: string
  dispensedAt: string
  orderingPractitionerRef: string
  hlcTimestamp: string
}
