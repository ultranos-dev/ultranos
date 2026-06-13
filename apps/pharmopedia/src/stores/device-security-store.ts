/**
 * Device Security Store — Pharmopedia.
 * Copied from apps/patient-lite-mobile/src/stores/device-security-store.ts.
 *
 * Stores device integrity state. hub-fetch blocks write operations until
 * `checked` is true. The root layout (_layout.tsx) must call setResult()
 * on app startup to unblock writes.
 */
import { create } from 'zustand'

export interface DeviceIntegrityResult {
  isCompromised: boolean
  reasons: string[]
}

interface DeviceSecurityState {
  checked: boolean
  isCompromised: boolean
  reasons: string[]
  checkedAt: string | null
  setResult: (result: DeviceIntegrityResult) => void
}

export const useDeviceSecurityStore = create<DeviceSecurityState>((set) => ({
  checked: false,
  isCompromised: false,
  reasons: [],
  checkedAt: null,
  setResult: (result) =>
    set((state) => ({
      checked: true,
      isCompromised: state.isCompromised || result.isCompromised,
      reasons: state.isCompromised ? state.reasons : result.reasons,
      checkedAt: new Date().toISOString(),
    })),
}))
