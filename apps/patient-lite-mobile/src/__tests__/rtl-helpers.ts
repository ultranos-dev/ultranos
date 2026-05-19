/**
 * RTL test helper for React Native components.
 *
 * Provides a wrapper that simulates RTL mode by forcing I18nManager
 * state, useful for snapshot testing components in both directions.
 */
import { I18nManager } from 'react-native'

/**
 * Forces RTL mode on I18nManager for the duration of a test.
 * Call in beforeEach/afterEach to toggle between LTR and RTL.
 */
export function forceRTL(enabled: boolean): void {
  I18nManager.forceRTL(enabled)
  // In test environment, also set isRTL directly since forceRTL
  // may not take immediate effect without app reload
  Object.defineProperty(I18nManager, 'isRTL', {
    get: () => enabled,
    configurable: true,
  })
}

/**
 * Restores I18nManager to LTR mode.
 */
export function resetToLTR(): void {
  forceRTL(false)
}
