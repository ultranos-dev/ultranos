export type SourceApp = 'LAB_LITE' | 'PHARMACY_LITE' | 'OPD_LITE' | 'ADMIN' | 'SYSTEM'

export interface NotificationContent {
  sourceApp: SourceApp
  subjectKey: string
  bodyKey: string
  bodyParams: Record<string, string | number>
  notesKey: string | null
}

/** Non-PHI payload keys allowed into bodyParams. Extend only with non-PHI fields. */
export const NON_PHI_PARAM_KEYS = [
  'testCategory', 'labName', 'status', 'orderId', 'prescriptionId',
  'diagnosticReportId', 'reviewId', 'count', 'pathogen',
] as const

interface Entry { sourceApp: SourceApp; subjectKey: string; bodyKey: string; notesKey: string | null }

const TYPE_CONTENT: Record<string, Entry> = {
  LAB_RESULT_AVAILABLE:     { sourceApp: 'LAB_LITE',      subjectKey: 'LAB_RESULT_AVAILABLE',   bodyKey: 'labResultBody',        notesKey: 'labResultNotes' },
  LAB_RESULT_ESCALATION:    { sourceApp: 'LAB_LITE',      subjectKey: 'LAB_RESULT_ESCALATION',  bodyKey: 'labResultBody',        notesKey: 'labResultUrgentNotes' },
  ORDER_RECEIVED:           { sourceApp: 'LAB_LITE',      subjectKey: 'ORDER_RECEIVED',         bodyKey: 'orderReceivedBody',    notesKey: 'orderReceivedNotes' },
  PRESCRIPTION_READY:       { sourceApp: 'PHARMACY_LITE', subjectKey: 'PRESCRIPTION_READY',     bodyKey: 'prescriptionReadyBody',notesKey: null },
  PRESCRIPTION_DISPENSED:   { sourceApp: 'PHARMACY_LITE', subjectKey: 'PRESCRIPTION_DISPENSED', bodyKey: 'prescriptionDispensedBody', notesKey: null },
  DISPENSE_REVIEW_RESOLVED: { sourceApp: 'PHARMACY_LITE', subjectKey: 'DISPENSE_REVIEW_RESOLVED', bodyKey: 'dispenseReviewBody', notesKey: null },
  GUARDIAN_LINKED:          { sourceApp: 'OPD_LITE',      subjectKey: 'GUARDIAN_LINKED',        bodyKey: 'guardianLinkedBody',   notesKey: null },
  GUARDIAN_UNLINKED:        { sourceApp: 'OPD_LITE',      subjectKey: 'GUARDIAN_UNLINKED',      bodyKey: 'guardianUnlinkedBody', notesKey: null },
  CONSENT_CHANGE:           { sourceApp: 'OPD_LITE',      subjectKey: 'CONSENT_CHANGE',         bodyKey: 'consentChangeBody',    notesKey: null },
  ALLERGY_UPDATE:           { sourceApp: 'OPD_LITE',      subjectKey: 'ALLERGY_UPDATE',         bodyKey: 'allergyUpdateBody',    notesKey: 'allergyUpdateNotes' },
  SYNC_CONFLICT:            { sourceApp: 'SYSTEM',        subjectKey: 'SYNC_CONFLICT',          bodyKey: 'syncConflictBody',     notesKey: null },
  LICENSE_EXPIRED:          { sourceApp: 'ADMIN',         subjectKey: 'LICENSE_EXPIRED',        bodyKey: 'licenseExpiredBody',   notesKey: 'licenseExpiredNotes' },
  LICENSE_EXPIRY_WARNING:   { sourceApp: 'ADMIN',         subjectKey: 'LICENSE_EXPIRY_WARNING', bodyKey: 'licenseExpiryWarningBody', notesKey: 'licenseExpiryWarningNotes' },
  PROVIDER_SUSPENDED:       { sourceApp: 'ADMIN',         subjectKey: 'PROVIDER_SUSPENDED',     bodyKey: 'providerSuspendedBody',notesKey: 'providerSuspendedNotes' },
  LAB_APPROVED:             { sourceApp: 'ADMIN',         subjectKey: 'LAB_APPROVED',           bodyKey: 'labStatusBody',        notesKey: null },
  LAB_SUSPENDED:            { sourceApp: 'ADMIN',         subjectKey: 'LAB_SUSPENDED',          bodyKey: 'labStatusBody',        notesKey: null },
  LAB_REACTIVATED:          { sourceApp: 'ADMIN',         subjectKey: 'LAB_REACTIVATED',        bodyKey: 'labStatusBody',        notesKey: null },
  KYC_APPROVED:             { sourceApp: 'ADMIN',         subjectKey: 'KYC_APPROVED',           bodyKey: 'kycStatusBody',        notesKey: null },
  KYC_REJECTED:             { sourceApp: 'ADMIN',         subjectKey: 'KYC_REJECTED',           bodyKey: 'kycStatusBody',        notesKey: 'kycRejectedNotes' },
  KYC_MORE_INFO_REQUESTED:  { sourceApp: 'ADMIN',         subjectKey: 'KYC_MORE_INFO_REQUESTED', bodyKey: 'kycStatusBody',       notesKey: 'kycMoreInfoNotes' },
  OUTBREAK_MODE_ACTIVATED:  { sourceApp: 'ADMIN',         subjectKey: 'OUTBREAK_MODE_ACTIVATED',   bodyKey: 'outbreakBody',     notesKey: null },
  OUTBREAK_MODE_DEACTIVATED:{ sourceApp: 'ADMIN',         subjectKey: 'OUTBREAK_MODE_DEACTIVATED', bodyKey: 'outbreakBody',     notesKey: null },
}

const DEFAULT_ENTRY: Entry = { sourceApp: 'SYSTEM', subjectKey: 'default', bodyKey: 'defaultBody', notesKey: null }

function extractNonPhiParams(payload: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const k of NON_PHI_PARAM_KEYS) {
    const v = payload[k]
    if (typeof v === 'string' || typeof v === 'number') out[k] = v
  }
  return out
}

export function buildNotificationContent(
  type: string,
  payload: Record<string, unknown>,
): NotificationContent {
  const entry = TYPE_CONTENT[type] ?? DEFAULT_ENTRY
  return {
    sourceApp: entry.sourceApp,
    subjectKey: entry.subjectKey,
    bodyKey: entry.bodyKey,
    bodyParams: extractNonPhiParams(payload ?? {}),
    notesKey: entry.notesKey,
  }
}
