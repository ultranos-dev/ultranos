import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

const STORAGE_KEY = 'pharmopedia.dismissed-alerts'

/** Selectable "re-show after N days" intervals offered in Profile. */
export const REAPPEAR_OPTIONS = [15, 30, 60, 90] as const
/** Default policy: dismissed alerts re-surface after 30 days. */
export const DEFAULT_POLICY_DAYS = 30

const VALID_POLICIES: ReadonlySet<number> = new Set(REAPPEAR_OPTIONS)
const DAY_MS = 86_400_000

/** Days until a dismissed alert reappears, or `null` to never re-show it. */
export type ReappearPolicy = number | null

/**
 * Whether a dismissed alert should currently be hidden.
 * Pure (now passed in) so it is trivially testable.
 *   - not dismissed            → visible
 *   - policy = never (null)    → hidden forever
 *   - elapsed < policy days    → hidden
 *   - elapsed ≥ policy days    → visible again
 */
export function isAlertHidden(
  dismissedAtISO: string | undefined,
  policyDays: ReappearPolicy,
  nowMs: number,
): boolean {
  if (!dismissedAtISO) return false
  if (policyDays === null) return true
  const dismissedMs = Date.parse(dismissedAtISO)
  if (Number.isNaN(dismissedMs)) return false
  return (nowMs - dismissedMs) / DAY_MS < policyDays
}

interface Persisted {
  policyDays: ReappearPolicy
  dismissed: Record<string, string> // atcCode → ISO timestamp of dismissal
}

interface DismissedAlertsState extends Persisted {
  initialized: boolean
  init: () => Promise<void>
  setPolicy: (days: ReappearPolicy) => Promise<void>
  dismiss: (atcCode: string) => Promise<void>
}

function sanitize(raw: unknown): Persisted {
  const fallback: Persisted = { policyDays: DEFAULT_POLICY_DAYS, dismissed: {} }
  if (!raw || typeof raw !== 'object') return fallback
  const obj = raw as Record<string, unknown>
  const policyDays: ReappearPolicy =
    obj.policyDays === null ? null : typeof obj.policyDays === 'number' && VALID_POLICIES.has(obj.policyDays) ? obj.policyDays : DEFAULT_POLICY_DAYS
  const dismissed: Record<string, string> = {}
  if (obj.dismissed && typeof obj.dismissed === 'object') {
    for (const [k, v] of Object.entries(obj.dismissed as Record<string, unknown>)) {
      if (typeof v === 'string') dismissed[k] = v
    }
  }
  return { policyDays, dismissed }
}

async function persist(state: Persisted): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // SecureStore write failed — in-memory state is still updated.
  }
}

export const useDismissedAlertsStore = create<DismissedAlertsState>((set, get) => ({
  policyDays: DEFAULT_POLICY_DAYS,
  dismissed: {},
  initialized: false,

  async init() {
    if (get().initialized) return
    let loaded: Persisted = { policyDays: DEFAULT_POLICY_DAYS, dismissed: {} }
    try {
      const saved = await SecureStore.getItemAsync(STORAGE_KEY)
      if (saved) loaded = sanitize(JSON.parse(saved))
    } catch {
      // SecureStore/parse failure — start with defaults.
    }
    set({ ...loaded, initialized: true })
  },

  async setPolicy(days: ReappearPolicy) {
    const next: Persisted = { policyDays: days, dismissed: get().dismissed }
    set({ policyDays: days })
    await persist(next)
  },

  async dismiss(atcCode: string) {
    const dismissed = { ...get().dismissed, [atcCode]: new Date().toISOString() }
    set({ dismissed })
    await persist({ policyDays: get().policyDays, dismissed })
  },
}))
