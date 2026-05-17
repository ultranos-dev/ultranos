import Redis from 'ioredis'

let client: Redis | null = null
let tlsRejected = false

/**
 * Returns a shared Redis client instance, or null if REDIS_URL is not configured.
 * Lazy-initializes on first call. Fail-open: callers must handle null gracefully.
 *
 * Production hardening (Story 23.0):
 * - TLS enforcement: refuses non-TLS connections in production
 * - Connection timeout: 5 seconds
 * - Exponential backoff reconnect: 100ms → max 30s, up to 10 retries
 * - Credential scrubbing on all log output
 */
export function getRedisClient(): Redis | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (tlsRejected) return null

  if (!client) {
    const isProduction = process.env.NODE_ENV === 'production'

    // TLS enforcement in production
    if (isProduction && !url.startsWith('rediss://')) {
      console.error(
        '[REDIS] REFUSED: Production requires TLS (rediss:// scheme). ' +
          'Current URL scheme is insecure. Set REDIS_URL to use rediss://',
      )
      tlsRejected = true
      return null
    }

    client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 5000,
      retryStrategy(times: number) {
        if (times > 10) return null // stop retrying after 10 attempts
        return Math.min(100 * Math.pow(2, times - 1), 30_000) // 100ms → 200ms → ... → max 30s
      },
    })

    client.on('error', (err) => {
      const msg = (err.message ?? 'unknown')
        .replace(/rediss?:\/\/[^\s]+/gi, 'redis://***')
      console.warn('[REDIS] Connection error:', msg)
    })

    client.connect()
      .then(() => {
        console.info('[REDIS] Connected successfully')
      })
      .catch((err) => {
        const msg = ((err as Error).message ?? 'unknown')
          .replace(/rediss?:\/\/[^\s]+/gi, 'redis://***')
        console.warn('[REDIS] Initial connection failed (fail-open):', msg)
      })
  }

  return client
}

/**
 * Health probe: runs PING against Redis with a 2-second timeout.
 * Returns true if Redis responds, false otherwise.
 */
export async function isRedisHealthy(): Promise<boolean> {
  const redis = getRedisClient()
  if (!redis) return false

  try {
    const result = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error('PING timeout')), 2000)
        timer.unref?.()
      }),
    ])
    return result === 'PONG'
  } catch {
    return false
  }
}

/**
 * Detailed health info for monitoring dashboards.
 * Returns connection status and latency in milliseconds.
 */
export async function getRedisInfo(): Promise<{
  connected: boolean
  latencyMs: number | null
}> {
  const redis = getRedisClient()
  if (!redis) return { connected: false, latencyMs: null }

  try {
    const start = performance.now()
    const result = await Promise.race([
      redis.ping(),
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error('PING timeout')), 2000)
        timer.unref?.()
      }),
    ])
    const latencyMs = Math.round((performance.now() - start) * 100) / 100

    return {
      connected: result === 'PONG',
      latencyMs,
    }
  } catch {
    return { connected: false, latencyMs: null }
  }
}

/** For testing: reset the cached client and TLS rejection state. */
export function _resetRedisClient(): void {
  if (client) {
    client.disconnect()
    client = null
  }
  tlsRejected = false
}
