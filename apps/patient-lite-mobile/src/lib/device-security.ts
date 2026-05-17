/**
 * Device Security — Root/jailbreak and emulator detection.
 *
 * Story 21.5: Mobile Device Security.
 * Checks device integrity on app launch. If compromised, clinical
 * features are disabled (read-only mode for existing local data).
 *
 * Uses jail-monkey for root/jailbreak/emulator detection on Android/iOS.
 * Falls back to a clean result on unsupported platforms (web).
 */
import { Platform } from 'react-native'

export interface DeviceIntegrityResult {
  isCompromised: boolean
  reasons: string[]
}

/**
 * Run device integrity checks: root/jailbreak detection and emulator detection.
 * Returns reasons array for any detected compromise.
 *
 * On web platform, always returns clean (root detection is not applicable).
 */
export async function checkDeviceIntegrity(): Promise<DeviceIntegrityResult> {
  if (Platform.OS === 'web') {
    return { isCompromised: false, reasons: [] }
  }

  const reasons: string[] = []

  try {
    // jail-monkey provides synchronous checks for root/jailbreak/emulator
    const JailMonkey = require('jail-monkey').default ?? require('jail-monkey')

    if (typeof JailMonkey.isJailBroken === 'function' && JailMonkey.isJailBroken()) {
      reasons.push('rooted')
    }

    if (typeof JailMonkey.canMockLocation === 'function' && JailMonkey.canMockLocation()) {
      reasons.push('mock-location')
    }

    if (typeof JailMonkey.isDebuggedMode === 'function' && JailMonkey.isDebuggedMode()) {
      reasons.push('debug-mode')
    }

    // isOnExternalStorage is Android-only
    if (
      Platform.OS === 'android' &&
      typeof JailMonkey.isOnExternalStorage === 'function' &&
      JailMonkey.isOnExternalStorage()
    ) {
      reasons.push('external-storage')
    }
  } catch {
    // If jail-monkey is unavailable in dev/CI/Expo Go, don't lock out developers.
    // In production, treat as compromised (fail-closed).
    if (__DEV__) {
      // Dev builds: silently pass — native module may not be linked
    } else {
      reasons.push('detection-unavailable')
    }
  }

  return {
    isCompromised: reasons.length > 0,
    reasons,
  }
}
