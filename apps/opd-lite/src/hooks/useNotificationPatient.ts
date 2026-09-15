/**
 * useNotificationPatient — authorized, audited on-demand patient name lookup
 * for the notification detail modal.
 *
 * PHI RULES:
 * - The patient name is NEVER stored in NotificationItem. It is resolved live
 *   from the local encrypted store at modal-open time.
 * - Every resolution emits ONE PHI_READ audit event via auditPhiAccess (Rule #6).
 * - Fails soft: network/DB errors → {name: null, loading: false} (never throws).
 *
 * Supported notification types (patient-bearing):
 *   ORDER_RECEIVED         → payload.orderId → db.serviceRequests → subject.reference
 *   LAB_RESULT_AVAILABLE   → payload.diagnosticReportId → db.diagnosticReports → subject.reference
 *   LAB_RESULT_ESCALATION  → payload.diagnosticReportId → db.diagnosticReports → subject.reference
 *   PRESCRIPTION_DISPENSED → payload.prescriptionId → db.medications → subject.reference
 *
 * All other types return {name: null, loading: false} immediately.
 */

import { useState, useEffect, useRef } from 'react'
import { db } from '@/lib/db'
import { loadPatientResilient } from '@/lib/patient-loader'
import { auditPhiAccess, AuditAction, AuditResourceType } from '@/lib/audit'
import { fetchOrderPatientRef } from '@/lib/trpc'
import type { NotificationItem } from '@/lib/notification-api'

export interface UseNotificationPatientResult {
  name: string | null
  loading: boolean
}

/**
 * Derive a display name from a resolved FhirPatient.
 * Priority: nameLatin → nameLocal → name[0].text → name[0].given[0].
 */
function deriveDisplayName(patient: {
  _ultranos?: { nameLatin?: string; nameLocal?: string }
  name?: Array<{ text?: string; given?: string[] }>
}): string | null {
  const latin = patient._ultranos?.nameLatin
  if (latin && latin.trim()) return latin.trim()

  const local = patient._ultranos?.nameLocal
  if (local && local.trim()) return local.trim()

  const nameEntry = patient.name?.[0]
  if (nameEntry?.text && nameEntry.text.trim()) return nameEntry.text.trim()
  if (nameEntry?.given?.[0] && nameEntry.given[0].trim()) return nameEntry.given[0].trim()

  return null
}

type LookupConfig = {
  table: 'serviceRequests' | 'diagnosticReports' | 'medications'
  refId: string
  resourceType: AuditResourceType
}

/**
 * Determine the Dexie table, source reference id, and audit resource type for
 * a given notification. Returns null for types that don't carry patient refs.
 */
function getLookupConfig(n: NotificationItem): LookupConfig | null {
  switch (n.type) {
    case 'ORDER_RECEIVED': {
      const refId = n.payload?.orderId
      if (!refId) return null
      return { table: 'serviceRequests', refId, resourceType: AuditResourceType.SERVICE_REQUEST }
    }
    case 'LAB_RESULT_AVAILABLE':
    case 'LAB_RESULT_ESCALATION': {
      const refId = n.payload?.diagnosticReportId
      if (!refId) return null
      return { table: 'diagnosticReports', refId, resourceType: AuditResourceType.LAB_RESULT }
    }
    case 'PRESCRIPTION_DISPENSED': {
      const refId = n.payload?.prescriptionId
      if (!refId) return null
      return { table: 'medications', refId, resourceType: AuditResourceType.PRESCRIPTION }
    }
    default:
      return null
  }
}

export function useNotificationPatient(
  n: NotificationItem | null,
): UseNotificationPatientResult {
  const [name, setName] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  // Track the last notification id we resolved so we don't re-run for the
  // same notification while the modal stays open.
  const lastResolvedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!n) {
      setName(null)
      setLoading(false)
      return
    }

    const config = getLookupConfig(n)
    if (!config) {
      setName(null)
      setLoading(false)
      return
    }

    // Skip if we already resolved this notification
    const cacheKey = `${n.id}:${config.refId}`
    if (lastResolvedIdRef.current === cacheKey) return

    let cancelled = false
    const controller = new AbortController()

    const resolve = async () => {
      setLoading(true)
      setName(null)

      try {
        // 1. Look up the source record to get the patient reference.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sourceRecord = await (db[config.table] as any).get(config.refId) as
          | { subject?: { reference?: string } }
          | undefined

        let patientRef: string | null = sourceRecord?.subject?.reference ?? null

        // ORDER_RECEIVED fallback: if the order isn't in the local Dexie store (or
        // has no subject.reference), ask the Hub — the Hub has the patient_id chain
        // and scopes the response to the ordering doctor only.
        if (!patientRef && n?.type === 'ORDER_RECEIVED') {
          const hubRef = await fetchOrderPatientRef(config.refId, controller.signal)
          if (hubRef) {
            // Hub returns a bare UUID; normalise to "Patient/<uuid>" to match the
            // existing code path below that strips the prefix.
            patientRef = hubRef.startsWith('Patient/') ? hubRef : `Patient/${hubRef}`
          }
        }

        if (!patientRef) {
          if (!cancelled) { setName(null); setLoading(false) }
          return
        }

        // Extract patient id from "Patient/<uuid>"
        const patientId = patientRef.replace(/^Patient\//, '')
        if (!patientId) {
          if (!cancelled) { setName(null); setLoading(false) }
          return
        }

        // 2. Emit audit BEFORE reading patient data (Rule #6)
        auditPhiAccess(
          AuditAction.PHI_READ,
          config.resourceType,
          config.refId,
          patientId,
          { phiAccess: 'notification_modal' },
        )

        // 3. Resolve the patient (offline-resilient with decryption)
        const { patient } = await loadPatientResilient(patientId)

        if (!cancelled) {
          const displayName = patient ? deriveDisplayName(patient) : null
          setName(displayName)
          setLoading(false)
          lastResolvedIdRef.current = cacheKey
        }
      } catch {
        // Fail soft — never expose errors to the UI
        if (!cancelled) {
          setName(null)
          setLoading(false)
        }
      }
    }

    void resolve()

    return () => {
      cancelled = true
      controller.abort()
    }
    // Derive the refId from the notification payload to include in dependencies.
    // If n.id stays the same but refId changes, the effect re-runs and re-resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n?.id, n?.type, n?.payload?.orderId, n?.payload?.diagnosticReportId, n?.payload?.prescriptionId])

  return { name, loading }
}
