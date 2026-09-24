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

/**
 * Default maximum clock drift tolerated by {@link HybridLogicalClock.receive}.
 * A remote timestamp whose physical wall time is more than this far ahead of
 * local physical time is rejected/flagged rather than adopted, so a single
 * future-clocked device cannot poison every peer's clock. 5 minutes matches the
 * JWT access-token skew tolerance used elsewhere in the platform.
 */
export const DEFAULT_MAX_DRIFT_MS = 5 * 60 * 1000

/** Options accepted when constructing a {@link HybridLogicalClock}. */
export interface HlcOptions {
  /** Injectable physical-time source (defaults to Date.now). Test seam. */
  now?: () => number
  /**
   * Maximum tolerated forward drift (ms) of a received remote timestamp over
   * local physical time. Defaults to {@link DEFAULT_MAX_DRIFT_MS}.
   */
  maxDriftMs?: number
}

/** Serializable snapshot of a clock's last-issued state (non-PHI). */
export interface HlcState {
  wallMs: number
  counter: number
  nodeId: string
}

/** Outcome of {@link HybridLogicalClock.receive} when drift-checking is relevant. */
export interface HlcReceiveResult {
  /** The merged local timestamp (unchanged from the remote-rejected local state on rejection). */
  timestamp: HlcTimestamp
  /**
   * True when the remote timestamp was rejected because its physical wall time
   * exceeded local physical time by more than maxDriftMs. When rejected, the
   * local clock still advances (as if a purely local event occurred) so it stays
   * monotonic, but it does NOT adopt the remote (poisoned) wall time.
   */
  driftRejected: boolean
  /** Observed forward drift in ms (remoteWallMs - localPhysicalTime), for telemetry. */
  driftMs: number
}

export class HybridLogicalClock {
  private wallMs: number
  private counter: number
  private readonly nodeId: string
  private readonly maxDriftMs: number

  constructor(nodeId: string, now?: () => number)
  constructor(nodeId: string, options?: HlcOptions)
  constructor(nodeId: string, nowOrOptions?: (() => number) | HlcOptions) {
    this.nodeId = nodeId
    this.wallMs = 0
    this.counter = 0
    if (typeof nowOrOptions === 'function') {
      this._now = nowOrOptions
      this.maxDriftMs = DEFAULT_MAX_DRIFT_MS
    } else {
      this._now = nowOrOptions?.now ?? (() => Date.now())
      this.maxDriftMs = nowOrOptions?.maxDriftMs ?? DEFAULT_MAX_DRIFT_MS
    }
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
   *
   * Drift bound: if the remote physical wall time is more than {@link maxDriftMs}
   * ahead of local physical time, the remote is treated as a clock-skew attack /
   * misconfigured peer and is NOT adopted. The local clock still advances so it
   * stays monotonic, but it never inherits the poisoned future wall time. This
   * prevents one future-clocked device from dragging every peer forward.
   */
  receive(remote: HlcTimestamp): HlcTimestamp {
    return this.receiveWithResult(remote).timestamp
  }

  /**
   * Like {@link receive} but returns the drift-rejection outcome for telemetry.
   * Callers that only need the merged timestamp can use {@link receive}.
   */
  receiveWithResult(remote: HlcTimestamp): HlcReceiveResult {
    const physicalTime = this._now()
    const remoteWallMs = remote.wallMs
    const driftMs = remoteWallMs - physicalTime

    if (driftMs > this.maxDriftMs) {
      // Remote is implausibly far in the future — do not adopt its wall time.
      // Advance locally instead so we remain strictly monotonic without poisoning.
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
      return { timestamp: this.timestamp(), driftRejected: true, driftMs }
    }

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

    return { timestamp: this.timestamp(), driftRejected: false, driftMs }
  }

  /**
   * Seed this clock from persisted state captured before a restart, so that a
   * device whose wall clock has moved BACKWARDS since last run still issues
   * strictly-increasing timestamps. The clock resumes from max(persisted, now):
   * if physical time is now ahead of the persisted wall time we take it fresh
   * (counter 0); otherwise we resume the persisted wall time and step the
   * counter past the persisted counter so the very next now() is strictly
   * greater than anything previously issued.
   *
   * Only state whose nodeId matches this clock is honoured (a persisted state
   * from a different node is ignored — its counter is not ours to continue).
   */
  seedFrom(persisted: HlcState | null | undefined): void {
    if (!persisted || persisted.nodeId !== this.nodeId) return
    const physicalTime = this._now()
    if (physicalTime > persisted.wallMs && physicalTime > this.wallMs) {
      this.wallMs = physicalTime
      this.counter = 0
    } else if (persisted.wallMs > this.wallMs) {
      this.wallMs = persisted.wallMs
      this.counter = persisted.counter + 1
    } else if (this.wallMs === persisted.wallMs) {
      this.counter = Math.max(this.counter, persisted.counter + 1)
    }
    if (this.counter > MAX_COUNTER) {
      // Extremely unlikely (persisted at the counter ceiling); roll into the
      // next millisecond so we never start already-overflowed.
      this.wallMs += 1
      this.counter = 0
    }
  }

  /** Snapshot the last-issued clock state for persistence (non-PHI). */
  getState(): HlcState {
    return { wallMs: this.wallMs, counter: this.counter, nodeId: this.nodeId }
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

/**
 * Regex for a serialized HLC string: "<15-digit wallMs>:<5-digit counter>:<nodeId>".
 * Shared canonical source for spoke enqueue guards and Hub-side format
 * validation (Story 60.1). The nodeId segment is unconstrained (it may itself
 * contain colons — deserializeHlc joins the tail back together).
 */
export const SERIALIZED_HLC_RE = /^\d{15}:\d{5}:.+/

/** True when `s` is a well-formed serialized HLC string. */
export function isSerializedHlc(s: string): boolean {
  return SERIALIZED_HLC_RE.test(s)
}

/**
 * Canonical convenience: issue a new HLC from `clock` and return its serialized
 * string in one call. Equivalent to `serializeHlc(clock.now())`. Per-app
 * singletons expose their own `hlcNow()` bound to the app's shared clock so
 * call sites read `hlcNow()` instead of repeating `serializeHlc(hlc.now())`.
 */
export function hlcNow(clock: HybridLogicalClock): string {
  return serializeHlc(clock.now())
}
