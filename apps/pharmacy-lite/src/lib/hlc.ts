import { HybridLogicalClock, serializeHlc } from '@ultranos/sync-engine'

/**
 * Shared HLC singleton for the Pharmacy PWA.
 * All modules must use this instance to ensure monotonic, causally ordered timestamps.
 * Node ID is RAM-only (never persisted to localStorage/sessionStorage).
 */
const nodeId = crypto.randomUUID()
const hlc = new HybridLogicalClock(nodeId)

export { hlc, serializeHlc }
