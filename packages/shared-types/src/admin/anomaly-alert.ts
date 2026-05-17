/**
 * Prescribing Anomaly Alert types — Story 22.6.
 *
 * Used by the anomaly detection engine and admin portal alert queue.
 */

export enum AnomalyType {
  CONTROLLED_SUBSTANCE_VOLUME = 'CONTROLLED_SUBSTANCE_VOLUME',
  DRUG_FREQUENCY = 'DRUG_FREQUENCY',
}

export enum AlertSeverity {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
}

export enum AlertStatus {
  UNREVIEWED = 'UNREVIEWED',
  ESCALATED = 'ESCALATED',
  DISMISSED = 'DISMISSED',
  SUSPENDED = 'SUSPENDED',
}

export enum AlertReviewAction {
  DISMISS = 'DISMISS',
  ESCALATE = 'ESCALATE',
  SUSPEND_PROVIDER = 'SUSPEND_PROVIDER',
}

export interface AnomalyAlert {
  id: string
  practitionerId: string
  practitionerName: string
  anomalyType: AnomalyType
  threshold: number
  actualValue: number
  dateRangeStart: string
  dateRangeEnd: string
  severity: AlertSeverity
  status: AlertStatus
  createdAt: string
  reviewedBy?: string
  reviewedAt?: string
  reviewAction?: AlertReviewAction
  reviewReason?: string
}
