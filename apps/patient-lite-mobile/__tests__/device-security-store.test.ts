/**
 * Tests for device-security-store.ts — Zustand store for device integrity state.
 *
 * Story 21.5: Verifies store state management for device integrity checks.
 */
import { useDeviceSecurityStore } from '@/stores/device-security-store'

describe('useDeviceSecurityStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useDeviceSecurityStore.setState({
      checked: false,
      isCompromised: false,
      reasons: [],
      checkedAt: null,
    })
  })

  it('starts with unchecked state', () => {
    const state = useDeviceSecurityStore.getState()

    expect(state.checked).toBe(false)
    expect(state.isCompromised).toBe(false)
    expect(state.reasons).toEqual([])
    expect(state.checkedAt).toBeNull()
  })

  it('updates state when clean result is set', () => {
    useDeviceSecurityStore.getState().setResult({
      isCompromised: false,
      reasons: [],
    })

    const state = useDeviceSecurityStore.getState()
    expect(state.checked).toBe(true)
    expect(state.isCompromised).toBe(false)
    expect(state.reasons).toEqual([])
    expect(state.checkedAt).not.toBeNull()
  })

  it('updates state when compromised result is set', () => {
    useDeviceSecurityStore.getState().setResult({
      isCompromised: true,
      reasons: ['rooted', 'debug-mode'],
    })

    const state = useDeviceSecurityStore.getState()
    expect(state.checked).toBe(true)
    expect(state.isCompromised).toBe(true)
    expect(state.reasons).toEqual(['rooted', 'debug-mode'])
    expect(state.checkedAt).not.toBeNull()
  })

  it('never downgrades isCompromised from true to false (monotonic)', () => {
    // First check: compromised
    useDeviceSecurityStore.getState().setResult({
      isCompromised: true,
      reasons: ['rooted'],
    })
    expect(useDeviceSecurityStore.getState().isCompromised).toBe(true)

    // Second check: clean — should NOT downgrade
    useDeviceSecurityStore.getState().setResult({
      isCompromised: false,
      reasons: [],
    })
    expect(useDeviceSecurityStore.getState().isCompromised).toBe(true)
    expect(useDeviceSecurityStore.getState().reasons).toEqual(['rooted'])
  })

  it('records checkedAt as ISO timestamp', () => {
    const before = new Date().toISOString()

    useDeviceSecurityStore.getState().setResult({
      isCompromised: false,
      reasons: [],
    })

    const { checkedAt } = useDeviceSecurityStore.getState()
    expect(checkedAt).not.toBeNull()
    expect(checkedAt! >= before).toBe(true)
  })
})
