/**
 * Story 11.7 Task 1: Icon Vocabulary for Patient Lite Mobile
 *
 * Defines the complete icon mapping for the low-literacy icon-first UI.
 * Uses emoji as cross-platform accessible icons (consistent with TimelineIcon.tsx).
 *
 * All icons are:
 * - Culturally neutral (no gestures, no culture-specific symbols)
 * - NOT mirrored in RTL (medical icons are directionally neutral per CLAUDE.md)
 * - Minimum 32px for tab navigation, 48px for action buttons
 */

/** Navigation icon categories for the bottom tab bar */
export type NavIconKey = 'home' | 'prescriptions' | 'allergies' | 'history' | 'consent' | 'notifications' | 'qrIdentity' | 'settings' | 'language' | 'audio'

interface IconEntry {
  /** Emoji character used as the icon */
  emoji: string
  /** i18n translation key for accessibility label */
  labelKey: string
}

/**
 * Primary navigation icon vocabulary.
 * Each icon is universally understood and does not require text to convey meaning.
 */
export const NAV_ICONS: Record<NavIconKey, IconEntry> = {
  home: { emoji: '🏠', labelKey: 'nav.passport' },
  prescriptions: { emoji: '💊', labelKey: 'icons.pill' },
  allergies: { emoji: '⚠️', labelKey: 'icons.warningTriangle' },
  history: { emoji: '📋', labelKey: 'icons.clipboard' },
  consent: { emoji: '🛡️', labelKey: 'icons.shield' },
  notifications: { emoji: '🔔', labelKey: 'notifications.bellAccessibility' },
  qrIdentity: { emoji: '📱', labelKey: 'icons.qrCode' },
  settings: { emoji: '⚙️', labelKey: 'icons.settings' },
  language: { emoji: '🌐', labelKey: 'icons.language' },
  audio: { emoji: '🔊', labelKey: 'icons.audio' },
}

/** Health card variant types for color-coded display */
export type HealthCardVariant = 'allergy' | 'medication' | 'consent'

interface HealthCardStyle {
  emoji: string
  labelKey: string
  backgroundColor: string
  borderColor: string
  iconColor: string
}

/**
 * Color-coded health card styles (AC #4).
 * Color is NOT the only differentiator — icon + color + position all contribute.
 */
export const HEALTH_CARD_STYLES: Record<HealthCardVariant, HealthCardStyle> = {
  allergy: {
    emoji: '⚠️',
    labelKey: 'icons.warningTriangle',
    backgroundColor: '#FEE2E2',
    borderColor: '#FECACA',
    iconColor: '#DC2626',
  },
  medication: {
    emoji: '💊',
    labelKey: 'icons.pill',
    backgroundColor: '#DBEAFE',
    borderColor: '#BFDBFE',
    iconColor: '#2563EB',
  },
  consent: {
    emoji: '🛡️',
    labelKey: 'icons.shield',
    backgroundColor: '#D1FAE5',
    borderColor: '#A7F3D0',
    iconColor: '#059669',
  },
}

/**
 * Tab definitions for the bottom tab navigator.
 * Order determines display order (left to right in LTR, right to left in RTL).
 */
export type TabKey = 'passport' | 'timeline' | 'privacy' | 'notifications'

interface TabDefinition {
  key: TabKey
  icon: NavIconKey
  labelKey: string
}

export const TAB_DEFINITIONS: TabDefinition[] = [
  { key: 'passport', icon: 'home', labelKey: 'nav.passport' },
  { key: 'timeline', icon: 'history', labelKey: 'nav.timeline' },
  { key: 'privacy', icon: 'consent', labelKey: 'nav.privacy' },
  { key: 'notifications', icon: 'notifications', labelKey: 'nav.notifications' },
]
