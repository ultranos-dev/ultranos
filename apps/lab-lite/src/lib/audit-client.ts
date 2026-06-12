import { emitClientAudit, setAuditStoreAdapter } from '@ultranos/audit-logger/client'
import type { ClientAuditEventInput } from '@ultranos/audit-logger/client'
import { DexieAuditAdapter } from '@ultranos/audit-logger/adapters/dexie'
import { AuditDrainWorker } from '@ultranos/audit-logger/drain'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { getDb } from './db'
import { hlc, serializeHlc } from './hlc'
import { getHubApiUrl } from './trpc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// Wire the Dexie adapter to the client audit module (client-side only)
let auditAdapter: DexieAuditAdapter | null = null
if (typeof window !== 'undefined') {
  auditAdapter = new DexieAuditAdapter(getDb().clientAuditLog)
  setAuditStoreAdapter(auditAdapter)
}

// Initialize drain worker (syncs pending events to Hub when online)
let drainWorker: AuditDrainWorker | null = null

export function startAuditDrain(): void {
  drainWorker?.stop()
  drainWorker = new AuditDrainWorker({
    store: auditAdapter!,
    syncFn: async (events) => {
      const session = useAuthSessionStore.getState().session
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      // Auth events may be emitted pre-login, so token is optional
      if (session) {
        const supabase = (await import('@/lib/supabase')).getSupabaseBrowserClient()
        const { data } = await supabase.auth.getSession()
        if (data.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`
        }
      }
      const res = await fetch(`${getHubApiUrl()}/audit.sync`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ json: { events } }),
      })
      if (!res.ok) throw new Error(`audit.sync failed: ${res.status}`)
      const body = (await res.json()) as { result: { data: { json: { results: Array<{ id: string; success: boolean }> } } } }
      return body.result.data.json.results
    },
  })
  drainWorker.start()
}

export function stopAuditDrain(): void {
  drainWorker?.stop()
  drainWorker = null
}

/**
 * Emit an auth audit event (LOGIN, MFA).
 * Works pre-authentication — actorId/actorRole are optional.
 * Never throws — auth flow must not be blocked by audit failures.
 */
export function reportAuthEvent(
  event: 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'MFA_VERIFY_SUCCESS' | 'MFA_VERIFY_FAILURE',
  opts?: { actorId?: string; actorEmail?: string },
): void {
  const action = event.startsWith('MFA') ? AuditAction.MFA_FAIL : AuditAction.LOGIN
  const outcome = event.includes('SUCCESS') ? 'SUCCESS' : 'FAILURE'

  const input: ClientAuditEventInput = {
    actorId: opts?.actorId ?? 'anonymous',
    actorRole: UserRole.LAB_TECH,
    action,
    resourceType: AuditResourceType.USER_ACCOUNT,
    resourceId: opts?.actorId ?? 'pre-auth',
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      authEvent: event,
      outcome,
      ...(opts?.actorEmail ? { failedEmail: '[REDACTED]' } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

/**
 * Emit a queue audit event (QUEUE_ENTRY_CREATED, QUEUE_DRAIN_SUCCESS, etc.).
 * Never throws — queue operations must not be blocked by audit failures.
 */
export function reportQueueAuditEvent(payload: {
  action: 'QUEUE_ENTRY_CREATED' | 'QUEUE_DRAIN_SUCCESS' | 'QUEUE_ITEM_EXPIRED' | 'QUEUE_ITEM_DISCARDED'
  queueEntryId: number
  testCategory: string
  patientRef: string
  timestamp: string
  technicianId?: string
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<string, AuditAction> = {
    QUEUE_ENTRY_CREATED: AuditAction.CREATE,
    QUEUE_DRAIN_SUCCESS: AuditAction.UPDATE,
    QUEUE_ITEM_EXPIRED: AuditAction.UPDATE,
    QUEUE_ITEM_DISCARDED: AuditAction.UPDATE,
  }

  const outcomeMap: Record<string, 'SUCCESS' | 'FAILURE'> = {
    QUEUE_ENTRY_CREATED: 'SUCCESS',
    QUEUE_DRAIN_SUCCESS: 'SUCCESS',
    QUEUE_ITEM_EXPIRED: 'FAILURE',
    QUEUE_ITEM_DISCARDED: 'FAILURE',
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.technicianId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: AuditResourceType.LAB_RESULT,
    resourceId: String(payload.queueEntryId),
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      queueEvent: payload.action,
      outcome: outcomeMap[payload.action],
      queueEntryId: payload.queueEntryId,
      testCategory: payload.testCategory,
      patientRef: payload.patientRef,
      timestamp: payload.timestamp,
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

/**
 * Emit a payment audit event (PAYMENT_CREATED, PAYMENT_VOIDED, RECEIPT_GENERATED, RECONCILIATION_VIEWED).
 * Never throws — payment flow must not be blocked by audit failures.
 * Metadata uses opaque IDs only — never test names or patient names (CLAUDE.md Rule #7).
 */
export function reportPaymentEvent(payload: {
  action: 'PAYMENT_CREATED' | 'PAYMENT_VOIDED' | 'RECEIPT_GENERATED' | 'RECONCILIATION_VIEWED'
  paymentId: string
  amount?: number
  paymentMethod?: string
  cashierId: string
  patientRef?: string
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<string, AuditAction> = {
    PAYMENT_CREATED: AuditAction.CREATE,
    PAYMENT_VOIDED: AuditAction.UPDATE,
    RECEIPT_GENERATED: AuditAction.READ,
    RECONCILIATION_VIEWED: AuditAction.READ,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.cashierId,
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: 'PAYMENT' as AuditResourceType,
    resourceId: payload.paymentId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      paymentEvent: payload.action,
      outcome: 'SUCCESS',
      paymentId: payload.paymentId,
      ...(payload.amount != null ? { amount: payload.amount } : {}),
      ...(payload.paymentMethod ? { paymentMethod: payload.paymentMethod } : {}),
      ...(payload.patientRef ? { patientRef: payload.patientRef } : {}),
      cashierId: payload.cashierId,
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

/**
 * Emit a waste tracking audit event.
 * Never throws — waste operations must not be blocked by audit failures.
 * No PHI involved in waste tracking (CLAUDE.md — no patient data).
 */
export function reportWasteEvent(payload: {
  action:
    | 'WASTE_CONTAINER_ACTIVATED'
    | 'WASTE_FILL_LEVEL_UPDATED'
    | 'WASTE_CONTAINER_DISPOSED'
    | 'WASTE_SUMMARY_GENERATED'
  containerId: string
  location: string
  containerType: string
  actorId?: string
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<string, AuditAction> = {
    WASTE_CONTAINER_ACTIVATED: AuditAction.CREATE,
    WASTE_FILL_LEVEL_UPDATED: AuditAction.UPDATE,
    WASTE_CONTAINER_DISPOSED: AuditAction.UPDATE,
    WASTE_SUMMARY_GENERATED: AuditAction.READ,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.actorId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: AuditResourceType.WASTE_CONTAINER,
    resourceId: payload.containerId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      wasteEvent: payload.action,
      outcome: 'SUCCESS',
      containerId: payload.containerId,
      location: payload.location,
      containerType: payload.containerType,
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

/**
 * Emit a consent audit event (CONSENT_GRANT or CONSENT_REVOKE).
 * Never throws — consent flow must not be blocked by audit failures.
 * Metadata includes consent version for traceability.
 */
export function reportConsentAuditEvent(payload: {
  action: 'CONSENT_GRANT' | 'CONSENT_REVOKE'
  consentRecordId: number
  patientRef: string
  method?: string
  language?: string
  consentTextVersion?: string
  reason?: string
  technicianId?: string
}): void {
  const session = useAuthSessionStore.getState().session

  const auditAction = payload.action === 'CONSENT_GRANT'
    ? AuditAction.CONSENT_GRANT
    : AuditAction.CONSENT_REVOKE

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.technicianId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: auditAction,
    resourceType: AuditResourceType.CONSENT,
    resourceId: String(payload.consentRecordId),
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      consentEvent: payload.action,
      outcome: 'SUCCESS',
      consentRecordId: payload.consentRecordId,
      patientRef: payload.patientRef,
      ...(payload.method ? { method: payload.method } : {}),
      ...(payload.language ? { language: payload.language } : {}),
      ...(payload.consentTextVersion ? { consentTextVersion: payload.consentTextVersion } : {}),
      ...(payload.reason ? { reason: payload.reason } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

/**
 * Emit a health record audit event.
 * Never throws — health record operations must not be blocked by audit failures.
 * Metadata tracks field names only, NEVER field values (PHI-equivalent sensitivity).
 */
export function reportHealthRecordAuditEvent(payload: {
  action:
    | 'HEALTH_RECORD_CREATED'
    | 'HEALTH_RECORD_ACCESSED'
    | 'HEALTH_RECORD_UPDATED'
    | 'HEALTH_RECORD_ACCESS_DENIED'
    | 'EXPOSURE_HISTORY_ADDED'
  practitionerId: string
  accessedBy: string
  fieldsModified: string[]
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<string, AuditAction> = {
    HEALTH_RECORD_CREATED: AuditAction.CREATE,
    HEALTH_RECORD_ACCESSED: AuditAction.READ,
    HEALTH_RECORD_UPDATED: AuditAction.UPDATE,
    HEALTH_RECORD_ACCESS_DENIED: AuditAction.READ,
    EXPOSURE_HISTORY_ADDED: AuditAction.UPDATE,
  }

  const outcome = payload.action === 'HEALTH_RECORD_ACCESS_DENIED' ? 'FAILURE' : 'SUCCESS'

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.accessedBy,
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: AuditResourceType.EMPLOYEE_HEALTH,
    resourceId: payload.practitionerId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      healthEvent: payload.action,
      outcome,
      practitionerId: payload.practitionerId,
      accessedBy: payload.accessedBy,
      ...(payload.fieldsModified.length > 0 ? { fieldsModified: payload.fieldsModified } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

/**
 * Emit a temperature monitoring audit event.
 * Never throws — temperature monitoring must not be blocked by audit failures.
 * No PHI involved in temperature monitoring.
 */
export function reportTemperatureEvent(payload: {
  action:
    | 'TEMPERATURE_READING_LOGGED'
    | 'TEMPERATURE_EXCURSION_DETECTED'
    | 'TEMPERATURE_EXCURSION_ACKNOWLEDGED'
    | 'BLE_SENSOR_CONNECTED'
  locationId: string
  locationName: string
  temperature?: number
  source?: string
  actorId?: string
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<string, AuditAction> = {
    TEMPERATURE_READING_LOGGED: AuditAction.CREATE,
    TEMPERATURE_EXCURSION_DETECTED: AuditAction.CREATE,
    TEMPERATURE_EXCURSION_ACKNOWLEDGED: AuditAction.UPDATE,
    BLE_SENSOR_CONNECTED: AuditAction.CREATE,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.actorId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: AuditResourceType.TEMPERATURE_MONITORING,
    resourceId: payload.locationId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      temperatureEvent: payload.action,
      outcome: 'SUCCESS',
      locationId: payload.locationId,
      locationName: payload.locationName,
      ...(payload.temperature != null ? { temperature: payload.temperature } : {}),
      ...(payload.source ? { source: payload.source } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

/**
 * Emit a safety report manager action audit event.
 * Only manager actions are audited — report submission is NOT audited
 * to preserve reporter anonymity (Story 47.6, CLAUDE.md Rule #6 exception).
 * Never throws — safety workflow must not be blocked by audit failures.
 */
export function reportSafetyManagerEvent(payload: {
  action:
    | 'SAFETY_REPORT_ACKNOWLEDGED'
    | 'SAFETY_REPORT_INVESTIGATED'
    | 'SAFETY_REPORT_CLOSED'
  reportId: string
  category: string
  managerId: string
}): void {
  const session = useAuthSessionStore.getState().session

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.managerId,
    actorRole: UserRole.LAB_TECH,
    action: AuditAction.UPDATE,
    resourceType: 'SAFETY_REPORT' as AuditResourceType,
    resourceId: payload.reportId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      safetyEvent: payload.action,
      outcome: 'SUCCESS',
      reportId: payload.reportId,
      category: payload.category,
      managerId: payload.managerId,
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

/**
 * Emit a data budget configuration change audit event.
 * Never throws — settings flow must not be blocked by audit failures.
 * No PHI involved in data budget configuration.
 */
export function reportDataBudgetConfigEvent(payload: {
  action: 'DATA_BUDGET_CONFIG_UPDATED' | 'DATA_BUDGET_CYCLE_ROLLOVER'
  field?: string
  oldValue?: string
  newValue?: string
}): void {
  const session = useAuthSessionStore.getState().session

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? 'unknown',
    actorRole: (session?.labRole as unknown as UserRole) ?? UserRole.LAB_TECH,
    action: AuditAction.UPDATE,
    resourceType: AuditResourceType.DATA_BUDGET,
    resourceId: 'config',
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      dataBudgetEvent: payload.action,
      outcome: 'SUCCESS',
      ...(payload.field ? { field: payload.field } : {}),
      ...(payload.oldValue != null ? { oldValue: payload.oldValue } : {}),
      ...(payload.newValue != null ? { newValue: payload.newValue } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 49.4 — Security Audit Events
// High-priority events emitted during conflict-zone security protocols.
// These NEVER include the encryption key, backup contents, or PHI.
// ---------------------------------------------------------------------------

type SecurityAuditAction =
  | 'SECURITY_ALERT_ACTIVATED'
  | 'SECURITY_EMERGENCY_ENCRYPT'
  | 'SECURITY_BACKUP_GENERATED'
  | 'SECURITY_BACKUP_EXPORTED'
  | 'SECURITY_CHECKLIST_COMPLETED'
  | 'SECURITY_WIPE_INITIATED'
  | 'SECURITY_WIPE_COMPLETED'
  | 'SECURITY_RESTORE_INITIATED'
  | 'SECURITY_RESTORE_COMPLETE'
  | 'SECURITY_ALERT_DEACTIVATED'

interface SecurityAuditPayload {
  action: SecurityAuditAction
  backupMethod?: 'usb' | 'cloud' | 'qr_key'
  tablesAffected?: string[]
}

/**
 * Emit a security protocol audit event.
 *
 * Never throws — security workflow must not be blocked by audit failures.
 * Metadata NEVER includes: the encryption key, backup contents, or PHI.
 */
export function reportSecurityAuditEvent(payload: SecurityAuditPayload): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<SecurityAuditAction, AuditAction> = {
    SECURITY_ALERT_ACTIVATED: AuditAction.CREATE,
    SECURITY_EMERGENCY_ENCRYPT: AuditAction.UPDATE,
    SECURITY_BACKUP_GENERATED: AuditAction.CREATE,
    SECURITY_BACKUP_EXPORTED: AuditAction.READ,
    SECURITY_CHECKLIST_COMPLETED: AuditAction.UPDATE,
    SECURITY_WIPE_INITIATED: AuditAction.DELETE,
    SECURITY_WIPE_COMPLETED: AuditAction.DELETE,
    SECURITY_RESTORE_INITIATED: AuditAction.CREATE,
    SECURITY_RESTORE_COMPLETE: AuditAction.CREATE,
    SECURITY_ALERT_DEACTIVATED: AuditAction.UPDATE,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: 'SECURITY_PROTOCOL' as AuditResourceType,
    resourceId: 'device',
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      securityEvent: payload.action,
      outcome: 'SUCCESS',
      ...(payload.backupMethod ? { backupMethod: payload.backupMethod } : {}),
      ...(payload.tablesAffected ? { tablesAffected: payload.tablesAffected } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 54.1 — Network Audit Events
// Tracks lab network topology changes, mode switches, and sample/result routing.
// No PHI involved — locationId is an opaque identifier.
// ---------------------------------------------------------------------------

export type NetworkAuditAction =
  | 'NETWORK_LOCATION_ADDED'
  | 'NETWORK_LOCATION_UPDATED'
  | 'NETWORK_LOCATION_DEACTIVATED'
  | 'NETWORK_MODE_CHANGED'
  | 'SAMPLE_ROUTED_TO_MAIN'
  | 'RESULT_ROUTED_TO_SATELLITE'

/**
 * Emit a lab network audit event (location management, mode changes, sample/result routing).
 * Never throws — network operations must not be blocked by audit failures.
 * No PHI involved — locationId is an opaque identifier.
 */
export function reportNetworkAuditEvent(payload: {
  action: NetworkAuditAction
  locationId: string
  actorId: string
  timestamp: string
  details?: Record<string, unknown>
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<NetworkAuditAction, AuditAction> = {
    NETWORK_LOCATION_ADDED: AuditAction.CREATE,
    NETWORK_LOCATION_UPDATED: AuditAction.UPDATE,
    NETWORK_LOCATION_DEACTIVATED: AuditAction.UPDATE,
    NETWORK_MODE_CHANGED: AuditAction.UPDATE,
    SAMPLE_ROUTED_TO_MAIN: AuditAction.CREATE,
    RESULT_ROUTED_TO_SATELLITE: AuditAction.CREATE,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.actorId,
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: 'NETWORK_LOCATION' as AuditResourceType,
    resourceId: payload.locationId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      networkEvent: payload.action,
      outcome: 'SUCCESS',
      locationId: payload.locationId,
      timestamp: payload.timestamp,
      ...(payload.details ? { details: payload.details } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

export { AuditAction, AuditResourceType }

// ---------------------------------------------------------------------------
// Story 49.2 — SMS Audit Events
// Tracks SMS delivery lifecycle for critical value notifications.
// PHI rule: NEVER include phone number, message body, patient ID code, or
// test values in audit metadata. Only opaque references and status codes.
// ---------------------------------------------------------------------------

type SmsAuditAction =
  | 'SMS_QUEUED'
  | 'SMS_SENT'
  | 'SMS_DELIVERED'
  | 'SMS_FAILED'
  | 'SMS_CONFIRMED'
  | 'SMS_RATE_LIMITED'

export interface SmsAuditPayload {
  action: SmsAuditAction
  smsQueueEntryId: number
  criticalResultRef: string
  escalationStep: number
  recipientRole: string  // 'physician' | 'medical_director' | 'dho'
}

/**
 * Emit an SMS delivery audit event.
 * Never throws — SMS workflow must not be blocked by audit failures.
 * Metadata NEVER includes: phone number, message body, patient ID code, or test values.
 */
export function reportSmsAuditEvent(payload: SmsAuditPayload): void {
  const session = useAuthSessionStore.getState().session

  const outcome = payload.action === 'SMS_FAILED' || payload.action === 'SMS_RATE_LIMITED'
    ? 'FAILURE'
    : 'SUCCESS'

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: AuditAction.CREATE,
    resourceType: 'SMS_NOTIFICATION' as AuditResourceType,
    resourceId: String(payload.smsQueueEntryId),
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      smsEvent: payload.action,
      outcome,
      smsQueueEntryId: payload.smsQueueEntryId,
      criticalResultRef: payload.criticalResultRef,
      escalationStep: payload.escalationStep,
      recipientRole: payload.recipientRole,
      // NEVER include: recipientPhone, messageBody, patientIdCode, value
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 50.1 — HMIS Report Audit Events
// Tracks HMIS report lifecycle: generation, corrections, finalization, export.
// PHI rule: no PHI in any HMIS audit event. All fields are opaque IDs, counts,
// or report metadata. NEVER include aggregated values or patient references.
// ---------------------------------------------------------------------------

type HmisAuditAction =
  | 'HMIS_REPORT_GENERATED'
  | 'HMIS_REPORT_CORRECTED'
  | 'HMIS_REPORT_FINALIZED'
  | 'HMIS_REPORT_EXPORTED'

/**
 * Emit an HMIS report lifecycle audit event.
 * Never throws — report workflow must not be blocked by audit failures.
 * Metadata: reportId (opaque UUID), month, year — no aggregate values, no PHI.
 */
export function reportHmisAuditEvent(payload: {
  action: HmisAuditAction
  reportId: string
  reportMonth: number
  reportYear: number
  fieldPath?: string           // HMIS_REPORT_CORRECTED only — field path, never value
  format?: string              // HMIS_REPORT_EXPORTED only — 'pdf' | 'dhis2-json' | 'dhis2-csv'
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<HmisAuditAction, AuditAction> = {
    HMIS_REPORT_GENERATED: AuditAction.CREATE,
    HMIS_REPORT_CORRECTED: AuditAction.UPDATE,
    HMIS_REPORT_FINALIZED: AuditAction.UPDATE,
    HMIS_REPORT_EXPORTED: AuditAction.READ,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? 'unknown',
    actorRole: (session?.labRole as unknown as UserRole) ?? UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: 'HMIS_REPORT' as AuditResourceType,
    resourceId: payload.reportId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      hmisEvent: payload.action,
      outcome: 'SUCCESS',
      reportId: payload.reportId,             // opaque UUID — never aggregate values
      reportMonth: payload.reportMonth,
      reportYear: payload.reportYear,
      // Field path only for corrections — NEVER the value (could be PHI-adjacent)
      ...(payload.fieldPath ? { fieldPath: payload.fieldPath } : {}),
      ...(payload.format ? { format: payload.format } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 47.7 — Infection Control Audit Events
// Tracks audit lifecycle: creation, item recording, completion, and inspection pack generation.
// No PHI involved — conductedBy is an opaque practitioner ID.
// ---------------------------------------------------------------------------

type InfectionControlAuditAction =
  | 'IC_AUDIT_STARTED'
  | 'IC_AUDIT_ITEM_RECORDED'
  | 'IC_AUDIT_COMPLETED'
  | 'INSPECTION_PACK_GENERATED'

/**
 * Emit an infection control audit lifecycle event.
 * Never throws — audit workflow must not be blocked by audit failures.
 * No PHI involved — conductedBy is an opaque practitioner ID.
 */
export function reportInfectionControlAuditEvent(payload: {
  action: InfectionControlAuditAction
  auditId: string
  auditMonth: string
  conductedBy: string
  complianceScore?: number | null
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<InfectionControlAuditAction, AuditAction> = {
    IC_AUDIT_STARTED: AuditAction.CREATE,
    IC_AUDIT_ITEM_RECORDED: AuditAction.UPDATE,
    IC_AUDIT_COMPLETED: AuditAction.UPDATE,
    INSPECTION_PACK_GENERATED: AuditAction.READ,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.conductedBy,
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: 'INFECTION_CONTROL_AUDIT' as AuditResourceType,
    resourceId: payload.auditId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      auditEvent: payload.action,
      outcome: 'SUCCESS',
      auditId: payload.auditId,
      auditMonth: payload.auditMonth,
      conductedBy: payload.conductedBy,
      ...(payload.complianceScore != null ? { complianceScore: payload.complianceScore } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 44.3 — Reagent Audit Events
// Tracks reagent lifecycle: registration, consumption, disposal, auto-expiry.
// Metadata uses opaque IDs — reagent names are omitted (may contain supplier info).
// ---------------------------------------------------------------------------

type ReagentAuditAction =
  | 'REAGENT_REGISTERED'
  | 'REAGENT_CONSUMPTION_LOGGED'
  | 'REAGENT_DISPOSED'
  | 'REAGENT_AUTO_EXPIRED'

/**
 * Emit a reagent lifecycle audit event.
 * Never throws — reagent workflow must not be blocked by audit failures.
 * Metadata uses only the reagentId (opaque) — never the reagent name.
 */
export function reportReagentEvent(payload: {
  action: ReagentAuditAction
  reagentId: string
  lotNumber?: string
  statusChange?: string
  wasteAmount?: number
  actorId?: string
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<ReagentAuditAction, AuditAction> = {
    REAGENT_REGISTERED: AuditAction.CREATE,
    REAGENT_CONSUMPTION_LOGGED: AuditAction.UPDATE,
    REAGENT_DISPOSED: AuditAction.UPDATE,
    REAGENT_AUTO_EXPIRED: AuditAction.UPDATE,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.actorId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: 'REAGENT_INVENTORY' as AuditResourceType,
    resourceId: payload.reagentId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      reagentEvent: payload.action,
      outcome: 'SUCCESS',
      reagentId: payload.reagentId, // opaque ID only — never name
      ...(payload.lotNumber ? { lotNumber: payload.lotNumber } : {}),
      ...(payload.statusChange ? { statusChange: payload.statusChange } : {}),
      ...(payload.wasteAmount != null ? { wasteAmount: payload.wasteAmount } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 42.5 — Authorization Audit Events
// Tracks all authorization workflow actions on lab results.
// Metadata uses opaque IDs only — never patient name (CLAUDE.md Rule #7).
// ---------------------------------------------------------------------------

type AuthorizationAuditAction =
  | 'RESULT_APPROVED'
  | 'RESULT_REJECTED'
  | 'RESULT_HELD'
  | 'RESULT_AUTO_VERIFIED'
  | 'CRITICAL_VALUE_ACKNOWLEDGED'
  | 'SELF_AUTHORIZATION'

/**
 * Emit an authorization workflow audit event.
 * Never throws — authorization flow must not be blocked by audit failures.
 * Metadata contains only opaque IDs and action metadata — no PHI.
 */
export function reportAuthorizationAuditEvent(payload: {
  action: AuthorizationAuditAction
  resultId: string
  actorId?: string
  actorRole?: string
  reason?: string
  flags?: string[]
  criteria?: Record<string, boolean>
  autoVerified?: boolean
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<AuthorizationAuditAction, AuditAction> = {
    RESULT_APPROVED: AuditAction.UPDATE,
    RESULT_REJECTED: AuditAction.UPDATE,
    RESULT_HELD: AuditAction.UPDATE,
    RESULT_AUTO_VERIFIED: AuditAction.UPDATE,
    CRITICAL_VALUE_ACKNOWLEDGED: AuditAction.UPDATE,
    SELF_AUTHORIZATION: AuditAction.BREAK_GLASS,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.actorId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: AuditResourceType.LAB_RESULT,
    resourceId: payload.resultId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      authEvent: payload.action,
      outcome: 'SUCCESS',
      resultId: payload.resultId,
      ...(payload.actorId ? { authorizedBy: payload.actorId } : {}),
      ...(payload.actorRole ? { actorRole: payload.actorRole } : {}),
      ...(payload.reason ? { reason: payload.reason } : {}),
      ...(payload.flags ? { flags: payload.flags } : {}),
      ...(payload.criteria ? { criteria: payload.criteria } : {}),
      ...(payload.autoVerified != null ? { autoVerified: payload.autoVerified } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 42.4 — Lab Result Audit Events
// Tracks technician result entry (draft or complete) for audit compliance.
// Metadata uses opaque IDs only — never patient name (CLAUDE.md Rule #7).
// ---------------------------------------------------------------------------

/**
 * Emit a lab result entry audit event.
 * Never throws — result entry must not be blocked by audit failures.
 * Metadata contains only opaque IDs, counts, and flag summaries — no PHI.
 */
export function reportLabResultAuditEvent(payload: {
  action: 'LAB_RESULT_ENTERED'
  sampleId: string
  templateVersion: string
  fieldCount: number
  flagSummary: Record<string, number>
  saveType: 'draft' | 'complete'
  technicianId: string
  resultId: string
}): void {
  const session = useAuthSessionStore.getState().session

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.technicianId,
    actorRole: UserRole.LAB_TECH,
    action: AuditAction.CREATE,
    resourceType: AuditResourceType.LAB_RESULT,
    resourceId: payload.resultId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      resultEvent: payload.action,
      outcome: 'SUCCESS',
      sampleId: payload.sampleId,
      templateVersion: payload.templateVersion,
      fieldCount: payload.fieldCount,
      flagSummary: payload.flagSummary,
      saveType: payload.saveType,
      technicianId: payload.technicianId,
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

/**
 * Emit a sample accessioning audit event.
 * Never throws — lab workflow must not be blocked by audit failures.
 * Metadata uses opaque IDs only — never patient name (CLAUDE.md Rule #7).
 */
export function reportSampleAuditEvent(payload: {
  action: 'SAMPLE_ACCESSIONED' | 'SAMPLE_STATUS_CHANGED' | 'SAMPLE_REJECTED' | 'SAMPLE_HANDOFF'
  sampleId: string
  labSampleId: string
  actorId: string
  patientRef: string
  fromStatus?: string
  toStatus?: string
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<string, AuditAction> = {
    SAMPLE_ACCESSIONED: AuditAction.CREATE,
    SAMPLE_STATUS_CHANGED: AuditAction.UPDATE,
    SAMPLE_REJECTED: AuditAction.UPDATE,
    SAMPLE_HANDOFF: AuditAction.UPDATE,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.actorId,
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: AuditResourceType.SPECIMEN,
    resourceId: payload.sampleId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      sampleEvent: payload.action,
      outcome: 'SUCCESS',
      sampleId: payload.sampleId,
      labSampleId: payload.labSampleId,
      actorId: payload.actorId,
      patientRef: payload.patientRef, // opaque Patient/<uuid> — never a name
      ...(payload.fromStatus ? { fromStatus: payload.fromStatus } : {}),
      ...(payload.toStatus ? { toStatus: payload.toStatus } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 45.3 — Family Delegate Audit Events
// Tracks delegation lifecycle: registration and revocation.
// Phone is NEVER logged — use '[REDACTED]' per CLAUDE.md Rule #1.
// ---------------------------------------------------------------------------

/**
 * Emit a family delegate lifecycle audit event.
 * Never throws — delegate registration must not be blocked by audit failures.
 * Metadata: patientRef (opaque), delegateRelationship, consentRecordId — NO phone, NO name.
 */
export function reportDelegateAuditEvent(payload: {
  action: 'DELEGATE_REGISTERED' | 'DELEGATE_REVOKED'
  delegateId?: number
  patientRef: string
  delegateRelationship?: string
  consentRecordId?: number
  reason?: string
  technicianId?: string
}): void {
  const session = useAuthSessionStore.getState().session

  const auditAction =
    payload.action === 'DELEGATE_REGISTERED'
      ? AuditAction.CREATE
      : AuditAction.CONSENT_REVOKE

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.technicianId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: auditAction,
    resourceType: AuditResourceType.CONSENT,
    resourceId: payload.delegateId != null ? String(payload.delegateId) : 'pending',
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      delegateEvent: payload.action,
      outcome: 'SUCCESS',
      patientRef: payload.patientRef,
      delegatePhone: '[REDACTED]', // NEVER log phone — CLAUDE.md Rule #1
      ...(payload.delegateRelationship
        ? { delegateRelationship: payload.delegateRelationship }
        : {}),
      ...(payload.consentRecordId != null
        ? { consentRecordId: payload.consentRecordId }
        : {}),
      ...(payload.reason ? { reason: payload.reason } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 47.1 — Safety Protocol Audit Events
// Tracks all exposure protocol actions for HIPAA-compliant audit trail.
// PHI rule: patientRef is opaque ID only — never patient name (CLAUDE.md Rule #6 + Rule #7).
// ---------------------------------------------------------------------------

type SafetyAuditAction =
  | 'EXPOSURE_PROTOCOL_STARTED'
  | 'SOURCE_PATIENT_ACCESSED'
  | 'INCIDENT_REPORT_CREATED'
  | 'EXPOSURE_NOTIFICATION_SENT'

/**
 * Emit a safety protocol audit event.
 *
 * Never throws — emergency workflow must not be blocked by audit failures.
 * Metadata NEVER includes: patient name, DOB, or clinical details.
 * patientRef is opaque "Patient/<uuid>" only.
 */
export function reportSafetyAuditEvent(payload: {
  action: SafetyAuditAction
  incidentId?: string
  exposureType?: string
  techId: string
  patientRef?: string  // opaque Patient/<uuid> — NEVER a name
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<SafetyAuditAction, AuditAction> = {
    EXPOSURE_PROTOCOL_STARTED: AuditAction.READ,
    SOURCE_PATIENT_ACCESSED: AuditAction.READ,
    INCIDENT_REPORT_CREATED: AuditAction.CREATE,
    EXPOSURE_NOTIFICATION_SENT: AuditAction.CREATE,
  }

  const resourceTypeMap: Record<SafetyAuditAction, AuditResourceType | string> = {
    EXPOSURE_PROTOCOL_STARTED: 'SAFETY_PROTOCOL' as AuditResourceType,
    SOURCE_PATIENT_ACCESSED: AuditResourceType.PATIENT,
    INCIDENT_REPORT_CREATED: 'INCIDENT_REPORT' as AuditResourceType,
    EXPOSURE_NOTIFICATION_SENT: 'NOTIFICATION' as AuditResourceType,
  }

  const resourceId =
    payload.action === 'SOURCE_PATIENT_ACCESSED'
      ? (payload.patientRef ?? 'unknown')
      : (payload.incidentId ?? 'unknown')

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.techId,
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: resourceTypeMap[payload.action] as AuditResourceType,
    resourceId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      safetyEvent: payload.action,
      outcome: 'SUCCESS',
      techId: payload.techId,
      ...(payload.incidentId ? { incidentId: payload.incidentId } : {}),
      ...(payload.exposureType ? { exposureType: payload.exposureType } : {}),
      ...(payload.patientRef ? { patientRef: payload.patientRef } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 43.4 — Patient ID Verification Audit Events
// Tracks HOW patient identity was verified before sample collection.
// Metadata uses method enums only — no patient name, no ID number (CLAUDE.md Rule #7).
// ---------------------------------------------------------------------------

/**
 * Emit a PATIENT_IDENTITY_VERIFIED audit event.
 * Called after verification record is saved to Dexie.
 * Never throws — verification workflow must not be blocked by audit failures.
 */
export function reportVerificationEvent(payload: {
  sampleId: string
  methodsUsed: import('@ultranos/shared-types').PatientVerificationMethod[]
  isComplete: boolean
  verifiedBy: string
  deviationReason?: string
  overrideAcknowledged?: boolean
}): void {
  const session = useAuthSessionStore.getState().session

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.verifiedBy,
    actorRole: UserRole.LAB_TECH,
    action: AuditAction.PATIENT_IDENTITY_VERIFIED,
    resourceType: AuditResourceType.SPECIMEN,
    resourceId: payload.sampleId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      verificationEvent: 'PATIENT_IDENTITY_VERIFIED',
      outcome: 'SUCCESS',
      sampleId: payload.sampleId,
      methodsUsed: payload.methodsUsed,
      isComplete: payload.isComplete,
      verifiedBy: payload.verifiedBy,
      ...(!payload.isComplete && payload.deviationReason
        ? { deviationReason: payload.deviationReason, overrideAcknowledged: true }
        : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 43.8 — Reference Range Audit Events
// Tracks configuration changes to localized reference ranges.
// No PHI involved — metadata is limited to LOINC codes and version numbers.
// ---------------------------------------------------------------------------

/**
 * Emit a reference range configuration change audit event.
 * Never throws — settings flow must not be blocked by audit failures.
 * Metadata uses LOINC codes and version numbers only — no patient data.
 */
export function reportRangeChangeEvent(payload: {
  loincCode: string
  analyteName: string
  previousVersion: number
  newVersion: number
  changeReason: string
  changedBy: string
}): void {
  const session = useAuthSessionStore.getState().session

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.changedBy,
    actorRole: UserRole.LAB_TECH,
    action: AuditAction.REFERENCE_RANGE_UPDATED,
    resourceType: 'REFERENCE_RANGE' as AuditResourceType,
    resourceId: payload.loincCode,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      rangeEvent: 'REFERENCE_RANGE_UPDATED',
      outcome: 'SUCCESS',
      loincCode: payload.loincCode,
      analyteName: payload.analyteName,
      previousVersion: payload.previousVersion,
      newVersion: payload.newVersion,
      changeReason: payload.changeReason,
      changedBy: payload.changedBy,
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 43.1 — Lab Lifecycle Audit Events (Immutable Result Audit Chain)
// Covers the full sample-to-report lifecycle: receipt → processing →
// result entry → authorization → release → delivery → amendment.
//
// PHI rule (CLAUDE.md Rule #7): metadata uses only opaque IDs and codes.
// NEVER include patient names, diagnoses, or result values in any field.
// ---------------------------------------------------------------------------

/**
 * Discriminated payload for the seven lab lifecycle audit events.
 */
interface LabLifecycleAuditPayload {
  event:
    | 'SAMPLE_RECEIVED'
    | 'SAMPLE_PROCESSED'
    | 'RESULT_ENTERED'
    | 'RESULT_AUTHORIZED'
    | 'RESULT_RELEASED'
    | 'RESULT_AMENDED'
    | 'RESULT_DELIVERED'
  sampleId: string
  orderId?: string
  diagnosticReportId?: string
  technicianId?: string
  custodyFrom?: string   // actorId of person handing off the sample
  custodyTo?: string     // actorId of person receiving the sample
  amendmentReason?: string  // reason code for RESULT_AMENDED (opaque code only)
  deliveryMethod?: string   // 'push_notification' | 'opd_sync' | 'patient_portal'
}

/**
 * Emit a lab lifecycle audit event covering the full sample-to-report chain.
 *
 * Maps each lifecycle event to its canonical AuditAction and resourceType:
 *   SAMPLE_RECEIVED / SAMPLE_PROCESSED → AuditResourceType.LAB_SAMPLE
 *   RESULT_ENTERED … RESULT_DELIVERED  → AuditResourceType.LAB_RESULT
 *
 * resourceId is always sampleId — the canonical chain identifier.
 * Never throws — lab workflows must not be blocked by audit failures.
 * Metadata contains only opaque IDs and codes — no PHI.
 */
export function reportLabLifecycleEvent(payload: LabLifecycleAuditPayload): void {
  try {
    const session = useAuthSessionStore.getState().session

    const actionMap: Record<LabLifecycleAuditPayload['event'], AuditAction> = {
      SAMPLE_RECEIVED:   AuditAction.SAMPLE_RECEIVED,
      SAMPLE_PROCESSED:  AuditAction.SAMPLE_PROCESSED,
      RESULT_ENTERED:    AuditAction.RESULT_ENTERED,
      RESULT_AUTHORIZED: AuditAction.RESULT_AUTHORIZED,
      RESULT_RELEASED:   AuditAction.RESULT_RELEASED,
      RESULT_AMENDED:    AuditAction.RESULT_AMENDED,
      RESULT_DELIVERED:  AuditAction.RESULT_DELIVERED,
    }

    const sampleScopedEvents = new Set<LabLifecycleAuditPayload['event']>([
      'SAMPLE_RECEIVED',
      'SAMPLE_PROCESSED',
    ])

    const resourceType = sampleScopedEvents.has(payload.event)
      ? AuditResourceType.LAB_SAMPLE
      : AuditResourceType.LAB_RESULT

    const input: ClientAuditEventInput = {
      actorId: session?.userId ?? payload.technicianId ?? 'unknown',
      actorRole: UserRole.LAB_TECH,
      action: actionMap[payload.event],
      resourceType,
      // sampleId is the canonical chain identifier for the full lifecycle
      resourceId: payload.sampleId,
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        lifecycleEvent: payload.event,
        outcome: 'SUCCESS',
        sampleId: payload.sampleId,
        ...(payload.orderId ? { orderId: payload.orderId } : {}),
        ...(payload.diagnosticReportId ? { diagnosticReportId: payload.diagnosticReportId } : {}),
        ...(payload.technicianId ? { technicianId: payload.technicianId } : {}),
        ...(payload.custodyFrom ? { custodyFrom: payload.custodyFrom } : {}),
        ...(payload.custodyTo ? { custodyTo: payload.custodyTo } : {}),
        ...(payload.amendmentReason ? { amendmentReason: payload.amendmentReason } : {}),
        ...(payload.deliveryMethod ? { deliveryMethod: payload.deliveryMethod } : {}),
        source: 'lab-lite',
      },
    }

    void emitClientAudit(input)
  } catch {
    // Never throw — lab workflows must not be blocked by audit failures.
    console.warn('[audit] reportLabLifecycleEvent failed — continuing')
  }
}

/**
 * Emit a daily log audit event (GENERATED, SHARED, DOWNLOADED).
 * Payload uses only opaque IDs — never PHI.
 * Never throws.
 */
export function reportDailyLogAuditEvent(payload: {
  action: 'DAILY_LOG_GENERATED' | 'DAILY_LOG_SHARED' | 'DAILY_LOG_DOWNLOADED'
  logId: string
  logDate: string
}): void {
  const session = useAuthSessionStore.getState().session

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: AuditAction.UPDATE,
    resourceType: 'DAILY_LOG' as AuditResourceType,
    resourceId: payload.logId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      dailyLogEvent: payload.action,
      logDate: payload.logDate,
      outcome: 'SUCCESS',
      source: 'lab-lite',
    },
  }

  emitClientAudit(input).catch(() => {
    // Audit emission must not throw — but log silently for debugging
  })
}

// ---------------------------------------------------------------------------
// Story 48.4 — Critical Value Escalation Audit Events
// Tracks every step of the multi-step escalation chain triggered by critical lab values.
// PHI rule: critical VALUE is NEVER logged — only chain/result IDs (opaque) and step metadata.
// ---------------------------------------------------------------------------

export type EscalationAuditAction =
  | 'CRITICAL_VALUE_DETECTED'
  | 'ESCALATION_INITIATED'
  | 'ESCALATION_STEP_SENT'
  | 'ESCALATION_STEP_ACKNOWLEDGED'
  | 'ESCALATION_STEP_ESCALATED'
  | 'ESCALATION_COMPLETED'
  | 'ESCALATION_EXPIRED'

/**
 * Emit an escalation chain audit event.
 * Never throws — escalation workflow must not be blocked by audit failures.
 * Metadata NEVER includes the critical value itself — only opaque IDs and step metadata.
 */
export function reportEscalationEvent(payload: {
  action: EscalationAuditAction
  chainId: string
  resultId: string
  stepNumber?: number
  recipientRole?: string
  notificationType?: string
  timestamp: string
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<EscalationAuditAction, AuditAction> = {
    CRITICAL_VALUE_DETECTED: AuditAction.CREATE,
    ESCALATION_INITIATED: AuditAction.CREATE,
    ESCALATION_STEP_SENT: AuditAction.CREATE,
    ESCALATION_STEP_ACKNOWLEDGED: AuditAction.UPDATE,
    ESCALATION_STEP_ESCALATED: AuditAction.UPDATE,
    ESCALATION_COMPLETED: AuditAction.UPDATE,
    ESCALATION_EXPIRED: AuditAction.UPDATE,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: AuditResourceType.LAB_RESULT,
    resourceId: payload.chainId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      escalationEvent: payload.action,
      outcome: 'SUCCESS',
      chainId: payload.chainId,
      resultId: payload.resultId,
      // NEVER include criticalValue, value, or analyte name — PHI
      ...(payload.stepNumber != null ? { stepNumber: payload.stepNumber } : {}),
      ...(payload.recipientRole ? { recipientRole: payload.recipientRole } : {}),
      ...(payload.notificationType ? { notificationType: payload.notificationType } : {}),
      timestamp: payload.timestamp,
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

export function reportAtlasView(payload: { entryId: string; categoryId: string }): void {
  const session = useAuthSessionStore.getState().session
  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: AuditAction.READ,
    resourceType: 'VISUAL_ATLAS' as AuditResourceType,
    resourceId: payload.entryId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      atlasEvent: 'ATLAS_ENTRY_VIEWED',
      outcome: 'SUCCESS',
      entryId: payload.entryId,
      categoryId: payload.categoryId,
      source: 'lab-lite',
    },
  }
  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 43.6 — QC Drift Detection Audit Events
// Tracks drift detection lifecycle: alert creation and acknowledgment.
// No PHI: analyte names and instrument IDs are operational data, not patient data.
// ---------------------------------------------------------------------------

/**
 * Emit a QC drift detection or acknowledgment audit event.
 * Called when a drift alert is created (QC_DRIFT_DETECTED) or when a supervisor
 * acknowledges the alert (QC_DRIFT_ACKNOWLEDGED).
 *
 * Never throws — QC workflow must not be blocked by audit failures.
 * No PHI: analyte, instrumentId, and ruleViolated are operational metadata only.
 */
export function reportQcDriftEvent(payload: {
  action: 'QC_DRIFT_DETECTED' | 'QC_DRIFT_ACKNOWLEDGED'
  alertId: string
  analyte: string
  instrumentId: string
  ruleViolated?: string
  severity?: string
  resolution?: string
  acknowledgedBy?: string
  resultId?: string   // when flagging a patient result with advisory (no result values)
}): void {
  const session = useAuthSessionStore.getState().session

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.acknowledgedBy ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: payload.action === 'QC_DRIFT_DETECTED'
      ? AuditAction.QC_DRIFT_DETECTED
      : AuditAction.QC_DRIFT_ACKNOWLEDGED,
    resourceType: 'QC_DRIFT_ALERT' as AuditResourceType,
    resourceId: payload.alertId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      qcDriftEvent: payload.action,
      outcome: 'SUCCESS',
      alertId: payload.alertId,
      analyte: payload.analyte,
      instrumentId: payload.instrumentId,
      ...(payload.ruleViolated ? { ruleViolated: payload.ruleViolated } : {}),
      ...(payload.severity ? { severity: payload.severity } : {}),
      ...(payload.resolution ? { resolution: payload.resolution } : {}),
      ...(payload.acknowledgedBy ? { acknowledgedBy: payload.acknowledgedBy } : {}),
      ...(payload.resultId ? { resultId: payload.resultId } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

/**
 * Emit an audit event for the amendment workflow.
 * Story 43.3 AC #8: Every amendment action is audited.
 * CLAUDE.md Rule #1: No PHI in audit metadata — opaque IDs only.
 */
/**
 * Emit an audit event when the pre-release critical value checklist is completed.
 * Story 43.7 AC #3: Completed checklist is stored as part of the result's audit trail.
 *
 * CLAUDE.md Rule #1: No PHI in audit metadata.
 *   - resultId is opaque (UUID)
 *   - criticalAnalytes lists analyte NAMES only — no numeric values
 *   - No patient names, IDs, or demographic data
 */
export function reportChecklistEvent(payload: {
  checklistId: string
  resultId: string
  /** Analyte names only — NO numeric values (CLAUDE.md Rule #1) */
  criticalAnalytes: string[]
  allItemsChecked: boolean
  checkedBy: string
}): void {
  const session = useAuthSessionStore.getState().session

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.checkedBy,
    actorRole: UserRole.LAB_TECH,
    action: AuditAction.CRITICAL_VALUE_CHECKLIST_COMPLETED,
    resourceType: AuditResourceType.LAB_RESULT,
    resourceId: payload.resultId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      checklistEvent: 'CRITICAL_VALUE_CHECKLIST_COMPLETED',
      checklistId: payload.checklistId,
      // INTENTIONALLY OMIT actual critical values/numbers — CLAUDE.md Rule #1
      criticalAnalytes: payload.criticalAnalytes,
      allItemsChecked: payload.allItemsChecked,
      outcome: 'SUCCESS',
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

export function reportAmendmentEvent(payload: {
  action: 'AMENDMENT_INITIATED' | 'AMENDMENT_AUTHORIZED' | 'AMENDMENT_AUTH_DENIED' | 'AMENDMENT_COMMITTED'
  amendmentId: string
  originalReportId: string
  initiatedBy: string
  outcome: 'SUCCESS' | 'FAILURE'
  meta?: Record<string, unknown>
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<string, AuditAction> = {
    AMENDMENT_INITIATED: AuditAction.UPDATE,
    AMENDMENT_AUTHORIZED: AuditAction.UPDATE,
    AMENDMENT_AUTH_DENIED: AuditAction.SECURITY_VIOLATION,
    AMENDMENT_COMMITTED: AuditAction.RESULT_AMENDED,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.initiatedBy,
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action] ?? AuditAction.UPDATE,
    resourceType: AuditResourceType.LAB_RESULT,
    resourceId: payload.originalReportId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      amendmentEvent: payload.action,
      amendmentId: payload.amendmentId,
      outcome: payload.outcome,
      source: 'lab-lite',
      ...payload.meta,
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 54.3 — Transport Audit Events
// Tracks courier transport session lifecycle: start, delivery, stability flags.
// No PHI: transportSessionId, courierId, and sampleCount are non-PHI operational data.
// ---------------------------------------------------------------------------

/**
 * Emit a transport lifecycle audit event.
 *
 * Never throws — transport workflow must not be blocked by audit failures.
 * Metadata NEVER includes: patient name, specimen type details, or any PHI.
 * Only opaque IDs, counts, and flag type enums are logged.
 */
export function reportTransportAuditEvent(payload: {
  action: 'TRANSPORT_STARTED' | 'TRANSPORT_DELIVERED' | 'TRANSPORT_STABILITY_FLAG' | 'TRANSPORT_MANIFEST_GENERATED' | 'TRANSPORT_FLAG_ACKNOWLEDGED'
  transportSessionId: string
  courierId: string
  sampleCount?: number
  flagCount?: number
  flagTypes?: string[]
  missingSpecimenCount?: number
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<string, AuditAction> = {
    TRANSPORT_STARTED: AuditAction.CREATE,
    TRANSPORT_DELIVERED: AuditAction.UPDATE,
    TRANSPORT_STABILITY_FLAG: AuditAction.CREATE,
    TRANSPORT_MANIFEST_GENERATED: AuditAction.READ,
    TRANSPORT_FLAG_ACKNOWLEDGED: AuditAction.UPDATE,
  }

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? payload.courierId,
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: 'TRANSPORT_SESSION' as AuditResourceType,
    resourceId: payload.transportSessionId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      transportEvent: payload.action,
      outcome: 'SUCCESS',
      transportSessionId: payload.transportSessionId,
      courierId: payload.courierId,
      ...(payload.sampleCount != null ? { sampleCount: payload.sampleCount } : {}),
      ...(payload.flagCount != null ? { flagCount: payload.flagCount } : {}),
      ...(payload.flagTypes ? { flagTypes: payload.flagTypes } : {}),
      ...(payload.missingSpecimenCount != null ? { missingSpecimenCount: payload.missingSpecimenCount } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 50.2 — Donor Report Audit Events
// PHI-safe: no patient-level data, only opaque IDs, program codes, periods.
// ---------------------------------------------------------------------------

type DonorAuditAction =
  | 'DONOR_PROGRAM_REGISTERED'
  | 'DONOR_REPORT_GENERATED'
  | 'DONOR_REPORT_FINALIZED'
  | 'DONOR_REPORT_EXPORTED'
  | 'DONOR_REPORT_CORRECTED'

/**
 * Emit a donor report lifecycle audit event.
 * Contains NO PHI — all identifiers are opaque UUIDs or program codes.
 * Financial data (programCode, period) is permissible in audit trail.
 */
export function reportDonorAuditEvent(payload: {
  action: DonorAuditAction
  programCode?: string
  programId?: string
  reportId?: string
  periodStart?: string
  periodEnd?: string
  finalizerId?: string
  format?: 'pdf' | 'share' | 'download'
  fieldPath?: string
  correctedBy?: string
}): void {
  try {
    const session = useAuthSessionStore.getState().session
    const resourceId = payload.reportId ?? payload.programId ?? 'unknown'
    const auditAction =
      payload.action === 'DONOR_REPORT_GENERATED' || payload.action === 'DONOR_PROGRAM_REGISTERED'
        ? AuditAction.CREATE
        : AuditAction.UPDATE

    const input: ClientAuditEventInput = {
      actorId: session?.userId ?? 'unknown',
      actorRole: session?.labRole ? (session.labRole as unknown as UserRole) : UserRole.LAB_TECH,
      action: auditAction,
      resourceType: AuditResourceType.DIAGNOSTIC_REPORT,
      resourceId,
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        donorEvent: payload.action,
        ...(payload.programCode ? { programCode: payload.programCode } : {}),
        ...(payload.programId ? { programId: payload.programId } : {}),
        ...(payload.reportId ? { reportId: payload.reportId } : {}),
        ...(payload.periodStart ? { periodStart: payload.periodStart } : {}),
        ...(payload.periodEnd ? { periodEnd: payload.periodEnd } : {}),
        ...(payload.finalizerId ? { finalizerId: payload.finalizerId } : {}),
        ...(payload.format ? { format: payload.format } : {}),
        ...(payload.fieldPath ? { fieldPath: payload.fieldPath } : {}),
        ...(payload.correctedBy ? { correctedBy: payload.correctedBy } : {}),
        source: 'lab-lite',
      },
    }

    void emitClientAudit(input)
  } catch {
    // Never throws — audit failures must not surface as UI errors
  }
}

// ---------------------------------------------------------------------------
// Story 54.5 — Outbreak Mode Audit Events
// HIGH-ACCOUNTABILITY events: activation MUST include actorRole, pathogenCode,
// scope, and activationReason so the record is auditable by health authorities.
// ---------------------------------------------------------------------------

export type OutbreakAuditAction =
  | 'OUTBREAK_MODE_ACTIVATED'
  | 'OUTBREAK_MODE_DEACTIVATED'
  | 'OUTBREAK_SITREP_GENERATED'
  | 'OUTBREAK_SURGE_ALERT'
  | 'OUTBREAK_CONFIG_CHANGED'

export function reportOutbreakAuditEvent(payload: {
  action: OutbreakAuditAction
  outbreakConfigId: string
  actorId: string
  actorRole: string
  pathogenCode: string
  scope: string[]
  activationReason?: string
}): void {
  const actionMap: Record<OutbreakAuditAction, AuditAction> = {
    OUTBREAK_MODE_ACTIVATED: AuditAction.CREATE,
    OUTBREAK_MODE_DEACTIVATED: AuditAction.UPDATE,
    OUTBREAK_SITREP_GENERATED: AuditAction.CREATE,
    OUTBREAK_SURGE_ALERT: AuditAction.CREATE,
    OUTBREAK_CONFIG_CHANGED: AuditAction.UPDATE,
  }

  const input: ClientAuditEventInput = {
    actorId: payload.actorId,
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: 'OUTBREAK_CONFIG' as AuditResourceType,
    resourceId: payload.outbreakConfigId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      outbreakEvent: payload.action,
      outcome: 'SUCCESS',
      actorRole: payload.actorRole,
      pathogenCode: payload.pathogenCode,
      scope: payload.scope,
      ...(payload.activationReason ? { activationReason: payload.activationReason } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Story 50.3 — Surveillance audit events
// PHI Safety: NO patient IDs, names, or results in any metadata field.
// ---------------------------------------------------------------------------

type SurveillanceAuditAction =
  | 'SURVEILLANCE_ALERT_GENERATED'
  | 'SURVEILLANCE_CHECK_COMPLETED'
  | 'SURVEILLANCE_CONFIG_UPDATED'
  | 'SURVEILLANCE_ALERT_TRANSMITTED'

/**
 * Emit a surveillance audit event.
 * Metadata contains only: alertId (UUID), diseaseCode, alertType, severity, counts.
 * NO patient identifiers are permitted.
 */
export function reportSurveillanceAuditEvent(payload: {
  action: SurveillanceAuditAction
  alertId?: string
  diseaseCode?: string
  alertType?: 'spike' | 'cluster'
  severity?: 'warning' | 'critical'
  diseasesChecked?: number
  alertsGenerated?: number
}): void {
  const actionMap: Record<SurveillanceAuditAction, AuditAction> = {
    SURVEILLANCE_ALERT_GENERATED: AuditAction.CREATE,
    SURVEILLANCE_CHECK_COMPLETED: AuditAction.READ,
    SURVEILLANCE_CONFIG_UPDATED: AuditAction.UPDATE,
    SURVEILLANCE_ALERT_TRANSMITTED: AuditAction.UPDATE,
  }

  const input: ClientAuditEventInput = {
    actorId: 'system',
    actorRole: UserRole.LAB_TECH,
    action: actionMap[payload.action],
    resourceType: 'SURVEILLANCE_ALERT' as AuditResourceType,
    resourceId: payload.alertId ?? payload.diseaseCode ?? 'system',
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      surveillanceEvent: payload.action,
      outcome: 'SUCCESS',
      ...(payload.diseaseCode ? { diseaseCode: payload.diseaseCode } : {}),
      ...(payload.alertType ? { alertType: payload.alertType } : {}),
      ...(payload.severity ? { severity: payload.severity } : {}),
      ...(payload.diseasesChecked !== undefined ? { diseasesChecked: payload.diseasesChecked } : {}),
      ...(payload.alertsGenerated !== undefined ? { alertsGenerated: payload.alertsGenerated } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

/**
 * Emit a P2P sync audit event (Story 49.3).
 * Never throws — P2P transfer must not be blocked by audit failures.
 * NEVER include patient data in audit metadata — only opaque IDs and operational fields.
 */
export function reportP2PAuditEvent(payload: {
  action: 'P2P_DISCOVERY_STARTED' | 'P2P_DEVICE_PAIRED' | 'P2P_RESULT_SENT' | 'P2P_TRANSFER_FAILED'
  remoteDeviceId: string
  diagnosticReportRef?: string
  transferMethod: 'ble' | 'wifi-direct' | 'local-network'
  transferSizeBytes?: number
  durationMs?: number
}): void {
  const session = useAuthSessionStore.getState().session
  const outcome = payload.action === 'P2P_TRANSFER_FAILED' ? 'FAILURE' : 'SUCCESS'

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: AuditAction.P2P_SYNC,
    resourceType: AuditResourceType.DIAGNOSTIC_REPORT,
    resourceId: payload.diagnosticReportRef ?? 'n/a',
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      p2pEvent: payload.action,
      outcome,
      remoteDeviceId: payload.remoteDeviceId,
      transferMethod: payload.transferMethod,
      ...(payload.diagnosticReportRef ? { diagnosticReportRef: payload.diagnosticReportRef } : {}),
      ...(payload.transferSizeBytes !== undefined ? { transferSizeBytes: payload.transferSizeBytes } : {}),
      ...(payload.durationMs !== undefined ? { durationMs: payload.durationMs } : {}),
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}

// ---------------------------------------------------------------------------
// Shift Handover audit events — Story 51.1
// AC 6: Emit for creation, acknowledgment, and expiry alert.
// No PHI — tech IDs and operational counts only.
// ---------------------------------------------------------------------------

type HandoverAuditAction =
  | 'HANDOVER_CREATED'
  | 'HANDOVER_ACKNOWLEDGED'
  | 'HANDOVER_EXPIRY_ALERT'

/**
 * Emit a shift handover lifecycle audit event.
 * Never throws — handover workflow must not be blocked by audit failures.
 * No PHI in metadata — tech IDs only (AC 6).
 */
export function reportHandoverAuditEvent(payload: {
  action: HandoverAuditAction
  reportId: string
  outgoingTechId?: string
  incomingTechId?: string
}): void {
  try {
    const session = useAuthSessionStore.getState().session
    const auditAction =
      payload.action === 'HANDOVER_CREATED' ? AuditAction.CREATE : AuditAction.UPDATE

    const input: ClientAuditEventInput = {
      actorId: session?.userId ?? 'unknown',
      actorRole: session?.labRole ? (session.labRole as unknown as UserRole) : UserRole.LAB_TECH,
      action: auditAction,
      resourceType: AuditResourceType.SHIFT_HANDOVER,
      resourceId: payload.reportId,
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        handoverEvent: payload.action,
        ...(payload.outgoingTechId ? { outgoingTechId: payload.outgoingTechId } : {}),
        ...(payload.incomingTechId ? { incomingTechId: payload.incomingTechId } : {}),
        source: 'lab-lite',
      },
    }

    void emitClientAudit(input)
  } catch {
    // Never throws — audit failures must not surface as UI errors
  }
}

export function reportSampleLockAuditEvent(payload: {
  action: 'SAMPLE_LOCK_ACQUIRED' | 'SAMPLE_LOCK_RELEASED' | 'SAMPLE_LOCK_EXPIRED' | 'SAMPLE_LOCK_RELEASE_REQUESTED'
  sampleId: string
  techId: string
  detail?: Record<string, unknown>
}): void {
  try {
    const input: ClientAuditEventInput = {
      action: AuditAction.UPDATE,
      resourceType: AuditResourceType.LAB_RESULT,
      resourceId: payload.sampleId,
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        lockEvent: payload.action,
        techId: payload.techId,
        ...(payload.detail ?? {}),
        source: 'lab-lite',
      },
    }

    void emitClientAudit(input)
  } catch {
    // Never throws — audit failures must not surface as UI errors
  }
}

export function reportWorkloadAuditEvent(payload: {
  action: 'SAMPLE_REASSIGNED' | 'TECH_AVAILABILITY_CHANGED'
  sampleId?: string
  techId?: string
  fromTechId?: string
  toTechId?: string
  status?: string
  reassignedBy?: string
  changedBy?: string
}): void {
  try {
    const isSampleEvent = payload.action === 'SAMPLE_REASSIGNED'
    const input: ClientAuditEventInput = {
      action: AuditAction.UPDATE,
      resourceType: isSampleEvent ? AuditResourceType.LAB_RESULT : ('TECH_AVAILABILITY' as AuditResourceType),
      resourceId: isSampleEvent ? (payload.sampleId ?? '') : (payload.techId ?? ''),
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        workloadEvent: payload.action,
        ...(payload.fromTechId ? { fromTechId: payload.fromTechId } : {}),
        ...(payload.toTechId ? { toTechId: payload.toTechId } : {}),
        ...(payload.status ? { status: payload.status } : {}),
        ...(payload.reassignedBy ? { reassignedBy: payload.reassignedBy } : {}),
        ...(payload.changedBy ? { changedBy: payload.changedBy } : {}),
        source: 'lab-lite',
      },
    }

    void emitClientAudit(input)
  } catch {
    // Never throws — audit failures must not surface as UI errors
  }
}

// ---------------------------------------------------------------------------
// CHW Collection Module audit events (Story 54.2) — AC #9
// All metadata uses opaque IDs only — no patient name, no diagnosis (Rule #6).
// ---------------------------------------------------------------------------

/** Emit CHW_PATIENT_IDENTIFIED when a CHW successfully identifies a patient. */
export function reportCHWPatientIdentifiedEvent(payload: {
  patientRef: string
  identificationMethod: 'qr' | 'name'
  chwPractitionerId: string
}): void {
  try {
    void emitClientAudit({
      action: AuditAction.READ,
      resourceType: AuditResourceType.LAB_SAMPLE,
      resourceId: payload.patientRef,
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        chwEvent: 'CHW_PATIENT_IDENTIFIED',
        identificationMethod: payload.identificationMethod,
        chwPractitionerId: payload.chwPractitionerId,
        source: 'lab-lite-chw',
      },
    })
  } catch {
    // Never throws — audit failures must not surface as UI errors
  }
}

/** Emit CHW_SAMPLE_COLLECTED when a CHW persists a new sample to Dexie. */
export function reportCHWSampleCollectedEvent(payload: {
  sampleId: string
  sampleType: string
  labelNumber: string
  chwPractitionerId: string
}): void {
  try {
    void emitClientAudit({
      action: AuditAction.CREATE,
      resourceType: AuditResourceType.LAB_SAMPLE,
      resourceId: payload.sampleId,
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        chwEvent: 'CHW_SAMPLE_COLLECTED',
        sampleType: payload.sampleType,
        labelNumber: payload.labelNumber,
        chwPractitionerId: payload.chwPractitionerId,
        source: 'lab-lite-chw',
      },
    })
  } catch {
    // Never throws — audit failures must not surface as UI errors
  }
}

/** Emit CHW_LABEL_PRINTED when a CHW prints or displays a sample label. */
export function reportCHWLabelPrintedEvent(payload: {
  sampleId: string
  labelNumber: string
  chwPractitionerId: string
}): void {
  try {
    void emitClientAudit({
      action: AuditAction.READ,
      resourceType: AuditResourceType.LAB_SAMPLE,
      resourceId: payload.sampleId,
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        chwEvent: 'CHW_LABEL_PRINTED',
        labelNumber: payload.labelNumber,
        chwPractitionerId: payload.chwPractitionerId,
        source: 'lab-lite-chw',
      },
    })
  } catch {
    // Never throws — audit failures must not surface as UI errors
  }
}

/** Emit CHW_COURIER_HANDOFF when a CHW records a courier pickup. */
export function reportCHWHandoffEvent(payload: {
  handoffId: string
  sampleCount: number
  courierId: string
  chwPractitionerId: string
}): void {
  try {
    void emitClientAudit({
      action: AuditAction.CREATE,
      resourceType: AuditResourceType.LAB_SAMPLE,
      resourceId: payload.handoffId,
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        chwEvent: 'CHW_COURIER_HANDOFF',
        sampleCount: payload.sampleCount,
        courierId: payload.courierId,
        chwPractitionerId: payload.chwPractitionerId,
        source: 'lab-lite-chw',
      },
    })
  } catch {
    // Never throws — audit failures must not surface as UI errors
  }
}

// ---------------------------------------------------------------------------
// Send-Out Audit Events (Story 54.4 / Task 13)
// All send-out mutations emit structured audit events.
// No PHI — only sendOutId, referenceLabId, actorId, and status codes.
// ---------------------------------------------------------------------------

type SendOutAuditAction =
  | 'SENDOUT_CREATED'
  | 'SENDOUT_STATUS_UPDATED'
  | 'SENDOUT_RESULT_IMPORTED'
  | 'SENDOUT_REFERRAL_GENERATED'
  | 'REFERENCE_LAB_CONFIGURED'

interface SendOutAuditPayload {
  action: SendOutAuditAction
  sendOutId?: string
  referenceLabId?: string
  actorId: string
  timestamp: string
  details?: Record<string, unknown>
}

/**
 * Emit a send-out lifecycle audit event.
 * Fire-and-forget — never throws, never blocks callers.
 * All fields are operational identifiers only — no PHI.
 */
export function reportSendOutAuditEvent(payload: SendOutAuditPayload): void {
  try {
    void emitClientAudit({
      action: AuditAction.UPDATE,
      resourceType: AuditResourceType.LAB_SAMPLE,
      resourceId: payload.sendOutId ?? payload.referenceLabId ?? 'unknown',
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        sendOutEvent: payload.action,
        sendOutId: payload.sendOutId,
        referenceLabId: payload.referenceLabId,
        actorId: payload.actorId,
        timestamp: payload.timestamp,
        ...payload.details,
      },
    })
  } catch {
    // Never throws — audit failures must not surface as UI errors
  }
}

/**
 * Emit a consultation lifecycle audit event.
 * Fire-and-forget — never throws, never blocks callers.
 * All metadata uses opaque IDs only — no PHI, no result values, no observation text (CLAUDE.md Rule #6).
 */
export function reportConsultationEvent(payload: {
  action: 'CONSULTATION_CREATED' | 'CONSULTATION_SUBMITTED' | 'CONSULTATION_RESPONSE_RECEIVED' | 'CONSULTATION_CLOSED'
  consultationId: string
  recipientType: 'pathologist' | 'reference_lab'
  status: string
}): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<string, AuditAction> = {
    CONSULTATION_CREATED: AuditAction.CREATE,
    CONSULTATION_SUBMITTED: AuditAction.UPDATE,
    CONSULTATION_RESPONSE_RECEIVED: AuditAction.UPDATE,
    CONSULTATION_CLOSED: AuditAction.UPDATE,
  }

  try {
    void emitClientAudit({
      actorId: session?.userId ?? 'unknown',
      actorRole: UserRole.LAB_TECH,
      action: actionMap[payload.action] ?? AuditAction.UPDATE,
      resourceType: AuditResourceType.CONSULTATION,
      resourceId: payload.consultationId,
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        consultationEvent: payload.action,
        recipientType: payload.recipientType,
        status: payload.status,
        outcome: 'SUCCESS',
        source: 'lab-lite',
      },
    })
  } catch {
    // Never throws — audit failures must not surface as UI errors
  }
}

// ---------------------------------------------------------------------------
// Story 53.1 — Contextual Knowledge Card Views
// Tracks every knowledge card display event triggered by result entry.
// PHI rule: no patient identifiers, no result values — only card and rule IDs.
// ---------------------------------------------------------------------------

/**
 * Emit a knowledge card view audit event.
 * Called whenever a KnowledgeCard is displayed to the technician.
 *
 * Never throws — card display must not be blocked by audit failures.
 * Fire-and-forget via void.
 */
export function reportKnowledgeCardView(payload: {
  cardId: string        // e.g. 'KC-WBC-BLAST-001' — no PHI
  triggerRuleId: string // e.g. 'TR-WBC-BLAST-001' — no PHI
  severity: string      // 'critical' | 'warning' | 'informational'
}): void {
  const session = useAuthSessionStore.getState().session
  try {
    void emitClientAudit({
      actorId: session?.userId ?? 'unknown',
      actorRole: UserRole.LAB_TECH,
      action: AuditAction.READ,
      resourceType: 'KNOWLEDGE_CARD' as AuditResourceType,
      resourceId: payload.cardId,
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        cardId: payload.cardId,
        triggerRuleId: payload.triggerRuleId,
        severity: payload.severity,
        source: 'lab-lite',
      },
    })
  } catch {
    // Never throws — audit failures must not surface as UI errors
  }
}

// ---------------------------------------------------------------------------
// AI Anomaly Detection audit helpers (v40) — Story 53.3
// PHI guard: input/output descriptions use analyte codes and counts only.
// ---------------------------------------------------------------------------

/**
 * Emit an ANOMALY_DETECTED audit event after the rule engine runs.
 *
 * Never throws — anomaly audit failures must not block the result entry flow.
 */
export function reportAnomalyDetection(payload: {
  sampleId: string        // opaque sample ID — no patient name
  modelVersion: string    // e.g. 'rule-engine-v1.0.0'
  inputDescription: string // e.g. '7 numeric values, template 58410-2' — no PHI
  flagCount: number
  highestSeverity: 'urgent' | 'elevated' | 'notable'
  confidenceScore: string  // ConfidenceLevel enum value
  technicianId: string
}): void {
  const session = useAuthSessionStore.getState().session
  try {
    void emitClientAudit({
      actorId: session?.userId ?? payload.technicianId,
      actorRole: UserRole.LAB_TECH,
      action: AuditAction.CREATE,
      resourceType: 'AI_ANOMALY_FLAG' as AuditResourceType,
      resourceId: payload.sampleId,
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        modelVersion: payload.modelVersion,
        inputDescription: payload.inputDescription,
        flagCount: payload.flagCount,
        highestSeverity: payload.highestSeverity,
        confidenceScore: payload.confidenceScore,
        source: 'lab-lite',
      },
    })
  } catch {
    // Never throws — audit failures must not surface as UI errors
  }
}

// ---------------------------------------------------------------------------
// Story 53.7 — Public Health Guidance Events
// Tracks every guidance lifecycle event: triggered, attached, delivered, acknowledged.
// PHI rule: no patient identifiers, no result values, no resultId (AC: 9).
// Metadata contains only guidanceId, conditionCode, language, deliveryChannel.
// ---------------------------------------------------------------------------

type GuidanceAuditAction =
  | 'GUIDANCE_TRIGGERED'
  | 'GUIDANCE_ATTACHED'
  | 'GUIDANCE_DELIVERED'
  | 'GUIDANCE_ACKNOWLEDGED'

/**
 * Emit a public health guidance lifecycle audit event.
 * Called from guidance-integration.ts (lab-lite) and GuidanceDisplay (patient-lite).
 *
 * Never throws — guidance display must not be blocked by audit failures.
 * Fire-and-forget via void.
 *
 * AC: 9 — metadata contains only guidanceId, conditionCode, language, deliveryChannel.
 * No resultId, no patient name, no test values.
 */
export function reportGuidanceEvent(payload: {
  action: GuidanceAuditAction
  /** e.g. 'PHG-MALARIA-001' — opaque content ID, no PHI */
  guidanceId: string
  /** e.g. 'MALARIA_POSITIVE' — condition code, no PHI */
  conditionCode: string
  /** e.g. 'ar', 'prs' — language code, no PHI */
  language: string
  /** e.g. 'lab-result', 'patient-lite' — no PHI */
  deliveryChannel: string
  /** Optional: rule IDs that fired (deterministic rule IDs, no PHI) */
  ruleIds?: string[]
}): void {
  const session = useAuthSessionStore.getState().session
  const actionMap: Record<GuidanceAuditAction, AuditAction> = {
    GUIDANCE_TRIGGERED: AuditAction.CREATE,
    GUIDANCE_ATTACHED: AuditAction.UPDATE,
    GUIDANCE_DELIVERED: AuditAction.UPDATE,
    GUIDANCE_ACKNOWLEDGED: AuditAction.UPDATE,
  }
  try {
    void emitClientAudit({
      actorId: session?.userId ?? 'unknown',
      actorRole: UserRole.LAB_TECH,
      action: actionMap[payload.action],
      resourceType: 'PUBLIC_HEALTH_GUIDANCE' as AuditResourceType,
      resourceId: payload.guidanceId,
      hlcTimestamp: serializeHlc(hlc.now()),
      metadata: {
        guidanceEvent: payload.action,
        guidanceId: payload.guidanceId,
        conditionCode: payload.conditionCode,
        language: payload.language,
        deliveryChannel: payload.deliveryChannel,
        ...(payload.ruleIds ? { ruleIds: payload.ruleIds } : {}),
        source: 'lab-lite',
      },
    })
  } catch {
    // Never throws — audit failures must not surface as UI errors
  }
}
