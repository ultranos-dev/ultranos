/**
 * Hybrid Logical Clock (HLC) for offline-first sync timestamping.
 *
 * Combines a physical wall clock with a logical counter to produce
 * monotonically increasing timestamps even when wall clocks are skewed
 * across devices. Based on the HLC algorithm by Kulkarni et al.
 *
 * Timestamp format: "{wallMs}:{counter}:{nodeId}"
 */
/** Maximum counter value before overflow — 5-digit serialization ceiling. */
const MAX_COUNTER = 99999

export class HybridLogicalClock {
  private wallMs: number
  private counter: number
  private readonly nodeId: string

  constructor(nodeId: string, now?: () => number) {
    this.nodeId = nodeId
    this.wallMs = 0
    this.counter = 0
    this._now = now ?? (() => Date.now())
  }

  private readonly _now: () => number

  /**
   * Generate a new HLC timestamp for a local event.
   * Guarantees the returned timestamp is strictly greater than any
   * previously issued timestamp from this clock.
   */
  now(): HlcTimestamp {
    const physicalTime = this._now()

    if (physicalTime > this.wallMs) {
      this.wallMs = physicalTime
      this.counter = 0
    } else {
      this.counter++
    }

    if (this.counter > MAX_COUNTER) {
      throw new Error(
        `HLC counter overflow (>${MAX_COUNTER}). Too many events at the same wall clock time.`,
      )
    }

    return this.timestamp()
  }

  /**
   * Receive a remote HLC timestamp and merge it with the local clock.
   * The resulting clock state is guaranteed to be >= both the local
   * state and the remote timestamp.
   */
  receive(remote: HlcTimestamp): HlcTimestamp {
    const physicalTime = this._now()
    const remoteWallMs = remote.wallMs

    if (physicalTime > this.wallMs && physicalTime > remoteWallMs) {
      this.wallMs = physicalTime
      this.counter = 0
    } else if (remoteWallMs > this.wallMs) {
      this.wallMs = remoteWallMs
      this.counter = remote.counter + 1
    } else if (this.wallMs > remoteWallMs) {
      this.counter++
    } else {
      // wallMs are equal
      this.counter = Math.max(this.counter, remote.counter) + 1
    }

    if (this.counter > MAX_COUNTER) {
      throw new Error(
        `HLC counter overflow (>${MAX_COUNTER}). Too many events at the same wall clock time.`,
      )
    }

    return this.timestamp()
  }

  /**
   * Serialize the current clock state to a comparable string.
   * String comparison of two serialized timestamps preserves causal order.
   */
  private timestamp(): HlcTimestamp {
    return {
      wallMs: this.wallMs,
      counter: this.counter,
      nodeId: this.nodeId,
    }
  }

  /** Get the node ID this clock was created with. */
  getNodeId(): string {
    return this.nodeId
  }
}

export interface HlcTimestamp {
  wallMs: number
  counter: number
  nodeId: string
}

/**
 * Serialize an HLC timestamp to a lexicographically sortable string.
 * Format: zero-padded wallMs (15 digits) + ":" + zero-padded counter (5 digits) + ":" + nodeId
 */
export function serializeHlc(ts: HlcTimestamp): string {
  const wall = ts.wallMs.toString().padStart(15, '0')
  const cnt = ts.counter.toString().padStart(5, '0')
  return `${wall}:${cnt}:${ts.nodeId}`
}

/**
 * Deserialize a string back into an HLC timestamp.
 */
export function deserializeHlc(s: string): HlcTimestamp {
  const parts = s.split(':')
  if (parts.length < 3) {
    throw new Error(`Invalid HLC string: "${s}"`)
  }
  const wallMs = parseInt(parts[0]!, 10)
  const counter = parseInt(parts[1]!, 10)
  if (Number.isNaN(wallMs) || Number.isNaN(counter)) {
    throw new Error(`Invalid HLC string: non-numeric wallMs or counter in "${s}"`)
  }
  return {
    wallMs,
    counter,
    nodeId: parts.slice(2).join(':'),
  }
}

/**
 * Compare two HLC timestamps. Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareHlc(a: HlcTimestamp, b: HlcTimestamp): number {
  if (a.wallMs !== b.wallMs) return a.wallMs - b.wallMs
  if (a.counter !== b.counter) return a.counter - b.counter
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0
}
