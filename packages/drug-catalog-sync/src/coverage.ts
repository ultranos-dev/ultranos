import type {
  DrugEntryTier2,
  DrugEntryTier3,
  DrugLocalizedText,
} from '@ultranos/shared-types'
import type { DrugEntry } from './client.js'

export type FieldPresence = 'present' | 'absent'

function someNonEmptyString(obj: Record<string, unknown>): boolean {
  return Object.values(obj).some((v) => typeof v === 'string' && v.trim().length > 0)
}

/** True when a localized text field carries a non-empty value in any language. */
export function hasText(field?: DrugLocalizedText): boolean {
  if (!field) return false
  return someNonEmptyString(field as unknown as Record<string, unknown>)
}

export function hasList<T>(arr?: T[]): boolean {
  return Array.isArray(arr) && arr.length > 0
}

export function hasValue(v?: string | number | null): boolean {
  if (typeof v === 'number') return Number.isFinite(v)
  return typeof v === 'string' && v.trim().length > 0
}

/** Narrows to the clinical tier (sentinel: `interactions` is Tier-2+). */
export function isTier2(entry: DrugEntry): entry is DrugEntryTier2 {
  return 'interactions' in entry
}

/** Narrows to the pharmacist tier (sentinel: `recallAlerts` is Tier-3 only). */
export function isTier3(entry: DrugEntry): entry is DrugEntryTier3 {
  return 'recallAlerts' in entry
}

/** Generic present/absent classifier for arrays, localized objects, and scalars. */
export function presence(value: unknown): FieldPresence {
  if (Array.isArray(value)) return value.length > 0 ? 'present' : 'absent'
  if (value && typeof value === 'object') {
    return someNonEmptyString(value as Record<string, unknown>) ? 'present' : 'absent'
  }
  return hasValue(value as string | number | null | undefined) ? 'present' : 'absent'
}
