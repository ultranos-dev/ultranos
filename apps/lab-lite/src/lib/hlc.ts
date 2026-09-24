import { HybridLogicalClock, serializeHlc, type HlcState } from '@ultranos/sync-engine'

/**
 * Shared HLC singleton for the Lab PWA.
 * All modules must use this instance to ensure monotonic, causally ordered timestamps.
 *
 * Persistence (Story 60.1, AC #4): the node id and last-issued clock state are
 * persisted to localStorage so that after a restart on a device whose wall clock
 * moved BACKWARDS, the clock seeds from max(persisted, now) and stays monotonic.
 * This state is strictly non-PHI (a millisecond count, a small counter, and an
 * opaque device node UUID) — the PHI localStorage ban does not apply.
 */

const NODE_ID_KEY = 'ultranos_hlc_node_id'
const HLC_STATE_KEY = 'ultranos_hlc_state'

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function getOrCreateNodeId(store: Storage | null): string {
  const existing = store?.getItem(NODE_ID_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  try {
    store?.setItem(NODE_ID_KEY, created)
  } catch {
    // RAM-only node id still works within this session.
  }
  return created
}

function loadPersistedState(store: Storage | null, nodeId: string): HlcState | null {
  const raw = store?.getItem(HLC_STATE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<HlcState>
    if (
      typeof parsed.wallMs === 'number' &&
      typeof parsed.counter === 'number' &&
      parsed.nodeId === nodeId
    ) {
      return { wallMs: parsed.wallMs, counter: parsed.counter, nodeId: parsed.nodeId }
    }
  } catch {
    // Corrupt/legacy state — ignore.
  }
  return null
}

const store = safeLocalStorage()
const nodeId = getOrCreateNodeId(store)
const hlc = new HybridLogicalClock(nodeId)
hlc.seedFrom(loadPersistedState(store, nodeId))

function persistState(): void {
  try {
    store?.setItem(HLC_STATE_KEY, JSON.stringify(hlc.getState()))
  } catch {
    // Best effort.
  }
}

/**
 * Canonical HLC stamp for a local sync event. Use this everywhere a
 * `hlcTimestamp` is produced — never `new Date().toISOString()` or `Date.now()`.
 */
function hlcNow(): string {
  const ts = serializeHlc(hlc.now())
  persistState()
  return ts
}

export { hlc, hlcNow, serializeHlc }
