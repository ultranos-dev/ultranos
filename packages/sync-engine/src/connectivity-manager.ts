/**
 * Passive connectivity classifier for adaptive sync.
 *
 * Emits NO timers and makes NO network calls of its own. State is derived only
 * from (a) the outcomes/latency of syncs the app already performs and (b) the
 * platform online flag. This keeps it cheap on metered, low-resource networks.
 */

export type ConnectivityState = 'offline' | 'degraded' | 'healthy'

export interface ConnectivitySample {
  ok: boolean
  latencyMs?: number
}

export interface ConnectivityManagerConfig {
  /** EWMA smoothing for latency (0..1]; 1 = latest sample only. Default 0.3. */
  latencyAlpha?: number
  /** EWMA smoothing for failure rate (0..1]; 1 = latest sample only. Default 0.3. */
  failureAlpha?: number
  /** Smoothed latency (ms) at/above which an online link is 'degraded'. Default 2000. */
  degradedLatencyMs?: number
  /** Smoothed failure rate (0..1) at/above which an online link is 'degraded'. Default 0.3. */
  degradedFailureRate?: number
  /** Reads the platform online flag. Default: navigator.onLine (true when unavailable). */
  isOnline?: () => boolean
}

const defaultIsOnline = (): boolean =>
  typeof navigator === 'undefined' ? true : navigator.onLine

export class ConnectivityManager {
  private readonly latencyAlpha: number
  private readonly failureAlpha: number
  private readonly degradedLatencyMs: number
  private readonly degradedFailureRate: number
  private readonly isOnline: () => boolean

  private ewmaLatency: number | null = null
  private ewmaFailure = 0
  private hasSample = false
  private lastState: ConnectivityState
  private readonly listeners = new Set<(s: ConnectivityState) => void>()

  constructor(config: ConnectivityManagerConfig = {}) {
    this.latencyAlpha = config.latencyAlpha ?? 0.3
    this.failureAlpha = config.failureAlpha ?? 0.3
    this.degradedLatencyMs = config.degradedLatencyMs ?? 2000
    this.degradedFailureRate = config.degradedFailureRate ?? 0.3
    this.isOnline = config.isOnline ?? defaultIsOnline
    this.lastState = this.compute()
  }

  getState(): ConnectivityState {
    return this.compute()
  }

  recordResult(sample: ConnectivitySample): void {
    this.hasSample = true
    const failed = sample.ok ? 0 : 1
    this.ewmaFailure = this.failureAlpha * failed + (1 - this.failureAlpha) * this.ewmaFailure
    if (typeof sample.latencyMs === 'number') {
      this.ewmaLatency =
        this.ewmaLatency === null
          ? sample.latencyMs
          : this.latencyAlpha * sample.latencyMs + (1 - this.latencyAlpha) * this.ewmaLatency
    }
    this.emitIfChanged()
  }

  setOnline(_online: boolean): void {
    // The flag itself is read via isOnline(); this just triggers re-evaluation
    // so callers can bridge 'online'/'offline' DOM events into a state emit.
    this.emitIfChanged()
  }

  subscribe(listener: (state: ConnectivityState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private compute(): ConnectivityState {
    if (!this.isOnline()) return 'offline'
    if (!this.hasSample) return 'healthy' // optimistic until first real sync corrects it
    const latencyBad = this.ewmaLatency !== null && this.ewmaLatency >= this.degradedLatencyMs
    const failureBad = this.ewmaFailure >= this.degradedFailureRate
    return latencyBad || failureBad ? 'degraded' : 'healthy'
  }

  private emitIfChanged(): void {
    const next = this.compute()
    if (next === this.lastState) return
    this.lastState = next
    for (const l of this.listeners) l(next)
  }
}
