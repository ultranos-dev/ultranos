import { describe, it, expect, beforeEach, vi } from 'vitest'

const store: Record<string, string> = {}
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (k: string) => store[k] ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => { store[k] = v }),
}))

import {
  useDismissedAlertsStore,
  isAlertHidden,
  DEFAULT_POLICY_DAYS,
} from '@/store/dismissed-alerts-store'

const KEY = 'pharmopedia.dismissed-alerts'
const DAY = 86_400_000

describe('isAlertHidden', () => {
  const now = 1_000_000_000_000

  it('shows alerts that were never dismissed', () => {
    expect(isAlertHidden(undefined, 30, now)).toBe(false)
  })

  it('hides forever when policy is never (null)', () => {
    const longAgo = new Date(now - 999 * DAY).toISOString()
    expect(isAlertHidden(longAgo, null, now)).toBe(true)
  })

  it('hides while inside the reappear window', () => {
    const tenDaysAgo = new Date(now - 10 * DAY).toISOString()
    expect(isAlertHidden(tenDaysAgo, 30, now)).toBe(true)
  })

  it('re-shows once the reappear window has elapsed', () => {
    const fortyDaysAgo = new Date(now - 40 * DAY).toISOString()
    expect(isAlertHidden(fortyDaysAgo, 30, now)).toBe(false)
  })

  it('treats a malformed timestamp as visible', () => {
    expect(isAlertHidden('not-a-date', 30, now)).toBe(false)
  })
})

describe('dismissed-alerts-store', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    useDismissedAlertsStore.setState({ policyDays: DEFAULT_POLICY_DAYS, dismissed: {}, initialized: false })
  })

  it('defaults to a 30-day reappear policy', () => {
    expect(useDismissedAlertsStore.getState().policyDays).toBe(30)
  })

  it('records a dismissal with a timestamp and persists it', async () => {
    await useDismissedAlertsStore.getState().dismiss('A12AA04')
    const { dismissed } = useDismissedAlertsStore.getState()
    expect(typeof dismissed['A12AA04']).toBe('string')
    expect(JSON.parse(store[KEY] ?? '{}').dismissed['A12AA04']).toBe(dismissed['A12AA04'])
  })

  it('updates and persists the reappear policy', async () => {
    await useDismissedAlertsStore.getState().setPolicy(90)
    expect(useDismissedAlertsStore.getState().policyDays).toBe(90)
    expect(JSON.parse(store[KEY] ?? '{}').policyDays).toBe(90)
  })

  it('supports a never (null) policy', async () => {
    await useDismissedAlertsStore.getState().setPolicy(null)
    expect(useDismissedAlertsStore.getState().policyDays).toBeNull()
    expect(JSON.parse(store[KEY] ?? '{}').policyDays).toBeNull()
  })

  it('init loads persisted state and ignores invalid policy values', async () => {
    store[KEY] = JSON.stringify({ policyDays: 999, dismissed: { X: '2026-01-01T00:00:00.000Z', Y: 5 } })
    await useDismissedAlertsStore.getState().init()
    const state = useDismissedAlertsStore.getState()
    expect(state.policyDays).toBe(DEFAULT_POLICY_DAYS) // 999 is not a valid option
    expect(state.dismissed).toEqual({ X: '2026-01-01T00:00:00.000Z' }) // non-string dropped
  })
})
