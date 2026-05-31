/**
 * Infection Control Self-Audit types — Story 47.7
 *
 * No PHI involved. Audit records contain only:
 * - conductedBy: practitioner ID (opaque)
 * - item statuses, notes, photo blobs (non-clinical)
 */

export enum ChecklistItemStatus {
  PASS = 'PASS',
  FAIL = 'FAIL',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export enum AuditStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export interface ChecklistItemTemplate {
  id: string
  category: string
  description: string
  order: number
  isDefault: boolean
  requiresPhoto: boolean
  isActive: boolean // default items can be deactivated but not deleted
}

export interface ChecklistItemResult {
  templateId: string
  status: ChecklistItemStatus
  notes: string | null
  photoEvidence: Blob | null
  photoFileName: string | null
  completedAt: string | null
  completedBy: string
}

export interface InfectionControlAudit {
  id: string
  auditDate: string               // ISO date (YYYY-MM-DD)
  auditMonth: string              // YYYY-MM (index key for trend queries)
  conductedBy: string             // practitioner ID — opaque, never name
  status: AuditStatus
  items: ChecklistItemResult[]
  complianceScore: number | null  // null if all items N/A
  completedAt: string | null
  notes: string
  hlcTimestamp: string
}

export interface ComplianceTrend {
  month: string                   // YYYY-MM
  score: number
  totalItems: number
  passedItems: number
  failedItems: string[]           // templateIds of failed items
}

export interface InspectionReadinessPack {
  generatedAt: string
  dateRange: { start: string; end: string }
  auditResults: InfectionControlAudit[]
  wasteSummaries: import('./waste-tracking').WasteSummary[]
  temperatureCompliance: {
    totalReadings: number
    excursionCount: number
    excursionRate: number
  }
  spillIncidents: unknown[]       // Story 47.5 not yet implemented
  overallComplianceScore: number
  availableSections: string[]     // sections included; missing sections noted by absence
  missingSections: string[]       // e.g. ['wasteSummaries', 'spillIncidents']
}
