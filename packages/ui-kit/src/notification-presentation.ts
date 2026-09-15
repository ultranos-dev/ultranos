import type { LucideIcon } from 'lucide-react'
import { FlaskConical, Pill, Stethoscope, Shield, Bell } from './icons.js'

export type SourceApp = 'LAB_LITE' | 'PHARMACY_LITE' | 'OPD_LITE' | 'ADMIN' | 'SYSTEM'

const ICONS: Record<SourceApp, LucideIcon> = {
  LAB_LITE: FlaskConical,
  PHARMACY_LITE: Pill,
  OPD_LITE: Stethoscope,
  ADMIN: Shield,
  SYSTEM: Bell,
}

const TYPE_TO_APP: Record<string, SourceApp> = {
  LAB_RESULT_AVAILABLE: 'LAB_LITE',
  LAB_RESULT_ESCALATION: 'LAB_LITE',
  ORDER_RECEIVED: 'LAB_LITE',
  PRESCRIPTION_READY: 'PHARMACY_LITE',
  PRESCRIPTION_DISPENSED: 'PHARMACY_LITE',
  DISPENSE_REVIEW_RESOLVED: 'PHARMACY_LITE',
  GUARDIAN_LINKED: 'OPD_LITE',
  GUARDIAN_UNLINKED: 'OPD_LITE',
  CONSENT_CHANGE: 'OPD_LITE',
  ALLERGY_UPDATE: 'OPD_LITE',
  SYNC_CONFLICT: 'SYSTEM',
  LICENSE_EXPIRED: 'ADMIN',
  LICENSE_EXPIRY_WARNING: 'ADMIN',
  PROVIDER_SUSPENDED: 'ADMIN',
  LAB_APPROVED: 'ADMIN',
  LAB_SUSPENDED: 'ADMIN',
  LAB_REACTIVATED: 'ADMIN',
  KYC_APPROVED: 'ADMIN',
  KYC_REJECTED: 'ADMIN',
  KYC_MORE_INFO_REQUESTED: 'ADMIN',
  OUTBREAK_MODE_ACTIVATED: 'ADMIN',
  OUTBREAK_MODE_DEACTIVATED: 'ADMIN',
}

function normalize(app: SourceApp | string | null | undefined): SourceApp {
  return app && (app as string) in ICONS ? (app as SourceApp) : 'SYSTEM'
}

export function sourceAppIcon(app: SourceApp | string | null | undefined): LucideIcon {
  return ICONS[normalize(app)]
}

export function sourceAppNameKey(app: SourceApp | string | null | undefined): string {
  return `sourceApp.${normalize(app)}`
}

export function deriveSourceApp(type: string): SourceApp {
  return TYPE_TO_APP[type] ?? 'SYSTEM'
}
