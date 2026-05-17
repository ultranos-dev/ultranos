import type { LabStatus } from '../enums.js'

/**
 * Lab registration record — tracks a lab's lifecycle from PENDING through
 * ACTIVE ↔ SUSPENDED. Aligned with FHIR R4 Organization resource concepts
 * but scoped to Ultranos lab-specific workflow.
 *
 * Story 22.3: Lab Approval & Suspension Workflow.
 */
export interface LabStatusHistoryEntry {
  status: LabStatus
  changedBy: string
  changedAt: string // ISO 8601
  reason?: string
}

export interface LabRegistration {
  id: string
  labName: string
  licenseReference: string
  accreditationReference?: string // ISO 15189
  technicianId: string
  technicianName: string
  registeredAt: string // ISO 8601
  status: LabStatus
  statusHistory: LabStatusHistoryEntry[]
}
