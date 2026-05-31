/**
 * SOP Library types — Story 46.1
 *
 * Standard Operating Procedures stored in Dexie for full offline access.
 * No patient data exists in this module (CLAUDE.md Rule #7 non-applicable).
 */

export enum SOPCategory {
  HEMATOLOGY = 'HEMATOLOGY',
  CHEMISTRY = 'CHEMISTRY',
  MICROBIOLOGY = 'MICROBIOLOGY',
  GENERAL_LAB_SAFETY = 'GENERAL_LAB_SAFETY',
  OTHER = 'OTHER',
}

export type SOPStatus = 'active' | 'superseded' | 'draft'

export interface SOPImage {
  id: string
  alt: string
  data: string // base64-encoded
  mimeType: string
}

export interface SOP {
  id: string // UUID
  title: string
  version: string // semver e.g. "1.0.0"
  effectiveDate: string // ISO 8601
  author: string // author name or role
  category: SOPCategory
  content: string // markdown body
  images: SOPImage[]
  status: SOPStatus
  meta: {
    lastUpdated: string // ISO 8601 instant (FHIR canonical)
    versionId: string
  }
}

export type SOPAcknowledgmentSyncStatus = 'pending' | 'synced'

export interface SOPAcknowledgment {
  id: string // UUID
  sopId: string
  sopVersion: string
  technicianId: string
  acknowledgedAt: string // ISO 8601
  syncStatus: SOPAcknowledgmentSyncStatus
}
