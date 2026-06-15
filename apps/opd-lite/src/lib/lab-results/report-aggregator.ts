/**
 * DiagnosticReport Aggregation Service (Story 52.4 — Task 1)
 *
 * Queries the local Dexie store for a patient's diagnostic reports.
 * Supports pagination, LOINC filtering, date range, and multi-lab aggregation.
 * All data comes from IndexedDB — offline-first, no network calls.
 */

import { db, type LocalDiagnosticReport } from '@/lib/db'

export interface ReportQueryOptions {
  loincFilter?: string[]
  dateRange?: { from: string; to: string }
  /** Page size — defaults to 20 */
  limit?: number
  /** Cursor: effectiveDateTime of last result from previous page (ISO string) */
  cursor?: string
}

export interface ReportPage {
  reports: LocalDiagnosticReport[]
  /** Cursor to pass for the next page; null if no more results */
  nextCursor: string | null
  /** ISO timestamp of the most recent successful sync (from syncMeta) */
  lastSyncedAt: string | null
}

const DEFAULT_PAGE_SIZE = 20

/**
 * Fetch a page of diagnostic reports for a patient from local Dexie.
 *
 * Sort order: effectiveDateTime descending (most recent first), fallback to issued.
 * Multi-lab: aggregates from all labs — each report carries _ultranos.labId.
 *
 * AC: 1, 7, 8 (Story 52.4)
 */
export async function getPatientReports(
  patientRef: string,
  options: ReportQueryOptions = {},
): Promise<ReportPage> {
  const { loincFilter, dateRange, limit = DEFAULT_PAGE_SIZE, cursor } = options

  // Query by subject.reference index — fast, encrypted fields stay encrypted
  let reports = await db.diagnosticReports
    .where('subject.reference')
    .equals(patientRef)
    .toArray()

  // Apply LOINC filter if requested
  if (loincFilter && loincFilter.length > 0) {
    const filterSet = new Set(loincFilter)
    reports = reports.filter((r) => {
      const code = r.code.coding?.[0]?.code
      return code !== undefined && filterSet.has(code)
    })
  }

  // Apply date range filter
  if (dateRange) {
    const from = new Date(dateRange.from).getTime()
    const to = new Date(dateRange.to).getTime()
    reports = reports.filter((r) => {
      const t = new Date(r.effectiveDateTime ?? r.issued ?? '').getTime()
      return !Number.isNaN(t) && t >= from && t <= to
    })
  }

  // Sort descending by effectiveDateTime (most recent first)
  reports.sort((a, b) => {
    const tA = new Date(a.effectiveDateTime ?? a.issued ?? 0).getTime()
    const tB = new Date(b.effectiveDateTime ?? b.issued ?? 0).getTime()
    return tB - tA
  })

  // Cursor-based pagination: skip past the cursor position
  let startIndex = 0
  if (cursor) {
    const cursorTime = new Date(cursor).getTime()
    const idx = reports.findIndex((r) => {
      const t = new Date(r.effectiveDateTime ?? r.issued ?? 0).getTime()
      return t < cursorTime
    })
    startIndex = idx === -1 ? reports.length : idx
  }

  const page = reports.slice(startIndex, startIndex + limit)
  const hasMore = startIndex + limit < reports.length

  // Determine next cursor: effectiveDateTime of the last item in this page
  let nextCursor: string | null = null
  if (hasMore && page.length > 0) {
    const last = page[page.length - 1]!
    nextCursor = last.effectiveDateTime ?? last.issued ?? null
  }

  // Last sync timestamp from syncMeta (uses patient UUID from "Patient/<uuid>")
  let lastSyncedAt: string | null = null
  try {
    const patientId = patientRef.replace('Patient/', '')
    const meta = await db.syncMeta.get(patientId)
    lastSyncedAt = meta?.lastPulledAt ?? null
  } catch {
    // Non-critical — offline indicator degrades gracefully
  }

  return { reports: page, nextCursor, lastSyncedAt }
}

/**
 * Fetch ALL reports for a patient (no pagination).
 * Used by the grouper for trend computation — only called when explicitly needed.
 *
 * AC: 2, 3 (Story 52.4)
 */
export async function getAllPatientReports(
  patientRef: string,
): Promise<LocalDiagnosticReport[]> {
  const reports = await db.diagnosticReports
    .where('subject.reference')
    .equals(patientRef)
    .toArray()

  reports.sort((a, b) => {
    const tA = new Date(a.effectiveDateTime ?? a.issued ?? 0).getTime()
    const tB = new Date(b.effectiveDateTime ?? b.issued ?? 0).getTime()
    return tB - tA
  })

  return reports
}
