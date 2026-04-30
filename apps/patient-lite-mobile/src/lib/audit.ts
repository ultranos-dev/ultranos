/**
 * Client-side PHI access audit service for Health Passport.
 *
 * Queues audit events in memory for later sync to Hub.
 * Follows the same pattern as opd-lite's audit services.
 *
 * CLAUDE.md Rule #6: "Every read, write, or access to patient data
 * must emit a structured audit event. No exceptions."
 *
 * NOTE: Uses opaque IDs only — never log PHI content.
 */

export interface AuditEntry {
  id: string
  timestamp: string
  action: 'PHI_READ' | 'PHI_WRITE' | 'PHI_DELETE' | 'PHI_DISPLAY' | 'PHI_UNMASK'
  resourceType: string
  resourceId: string
  patientId: string
  outcome: 'success' | 'failure'
  metadata?: Record<string, string>
}

const auditQueue: AuditEntry[] = []

export function emitAuditEvent(
  input: Omit<AuditEntry, 'id' | 'timestamp'>,
): void {
  auditQueue.push({
    ...input,
    id: generateId(),
    timestamp: new Date().toISOString(),
  })
}

export function getAuditQueue(): readonly AuditEntry[] {
  return auditQueue
}

export function clearAuditQueue(): void {
  auditQueue.length = 0
}

function generateId(): string {
  // crypto.randomUUID available in React Native 0.76+ and modern browsers
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}
