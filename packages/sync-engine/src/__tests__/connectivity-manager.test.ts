import { describe, it, expect, vi } from 'vitest'
import { ConnectivityManager } from '../connectivity-manager.js'

describe('ConnectivityManager', () => {
  it('is optimistically healthy when online with no samples yet', () => {
    const cm = new ConnectivityManager({ isOnline: () => true })
    expect(cm.getState()).toBe('healthy')
  })

  it('is offline when the platform reports offline, regardless of samples', () => {
    const cm = new ConnectivityManager({ isOnline: () => false })
    cm.recordResult({ ok: true, latencyMs: 10 })
    expect(cm.getState()).toBe('offline')
  })

  it('stays healthy on fast successful samples', () => {
    const cm = new ConnectivityManager({ isOnline: () => true, degradedLatencyMs: 2000 })
    cm.recordResult({ ok: true, latencyMs: 100 })
    cm.recordResult({ ok: true, latencyMs: 150 })
    expect(cm.getState()).toBe('healthy')
  })

  it('degrades when the smoothed failure rate crosses the threshold', () => {
    const cm = new ConnectivityManager({
      isOnline: () => true,
      failureAlpha: 1, // no smoothing — latest sample dominates for a deterministic test
      degradedFailureRate: 0.3,
    })
    cm.recordResult({ ok: false })
    expect(cm.getState()).toBe('degraded')
  })

  it('degrades when smoothed latency crosses the threshold', () => {
    const cm = new ConnectivityManager({
      isOnline: () => true,
      latencyAlpha: 1,
      degradedLatencyMs: 2000,
    })
    cm.recordResult({ ok: true, latencyMs: 5000 })
    expect(cm.getState()).toBe('degraded')
  })

  it('recovers to healthy after conditions improve', () => {
    const cm = new ConnectivityManager({
      isOnline: () => true,
      failureAlpha: 1,
      latencyAlpha: 1,
      degradedFailureRate: 0.3,
    })
    cm.recordResult({ ok: false })
    expect(cm.getState()).toBe('degraded')
    cm.recordResult({ ok: true, latencyMs: 100 })
    expect(cm.getState()).toBe('healthy')
  })

  it('notifies subscribers only on state change', () => {
    const cm = new ConnectivityManager({ isOnline: () => true, failureAlpha: 1, degradedFailureRate: 0.3 })
    const listener = vi.fn()
    cm.subscribe(listener)
    cm.recordResult({ ok: true, latencyMs: 100 }) // stays healthy — no emit
    cm.recordResult({ ok: false })                // healthy -> degraded — emit
    cm.recordResult({ ok: false })                // stays degraded — no emit
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith('degraded')
  })

  it('emits offline transition on setOnline(false) and back on setOnline(true)', () => {
    const online = { value: true }
    const cm = new ConnectivityManager({ isOnline: () => online.value })
    const listener = vi.fn()
    cm.subscribe(listener)
    online.value = false
    cm.setOnline(false)
    expect(cm.getState()).toBe('offline')
    online.value = true
    cm.setOnline(true)
    expect(cm.getState()).toBe('healthy')
    expect(listener).toHaveBeenCalledWith('offline')
    expect(listener).toHaveBeenCalledWith('healthy')
  })

  it('emits no timers or network calls (passive)', () => {
    // Guard: constructing and recording must not schedule timers.
    const spy = vi.spyOn(globalThis, 'setInterval')
    const cm = new ConnectivityManager({ isOnline: () => true })
    cm.recordResult({ ok: true, latencyMs: 100 })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
