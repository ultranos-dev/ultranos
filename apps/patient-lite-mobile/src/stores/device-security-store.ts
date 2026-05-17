/**
 * Device Security Store — Zustand store for device integrity state.
 *
 * Story 21.5: Stores the result of root/jailbreak detection so
 * components can gate clinical features on compromised devices.
 */
import { create } from 'zustand'
import type { DeviceIntegrityResult } from '@/lib/device-security'

interface DeviceSecurityState {
  /** Whether the integrity check has completed */
  checked: boolean
  /** Whether the device is compromised (rooted, jailbroken, emulator, etc.) */
  isCompromised: boolean
  /** Reasons for compromise detection */
  reasons: string[]
  /** ISO timestamp of when the check was performed */
  checkedAt: string | null
  /** Set the integrity check result */
  setResult: (result: DeviceIntegrityResult) => void
}

export const useDeviceSecurityStore = create<DeviceSecurityState>((set) => ({
  checked: false,
  isCompromised: false,
  reasons: [],
  checkedAt: null,
  setResult: (result) =>
    set({
      checked: true,
      isCompromised: result.isCompromised,
      reasons: result.reasons,
      checkedAt: new Date().toISOString(),
    }),
}))
