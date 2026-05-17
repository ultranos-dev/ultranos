import { randomUUID } from 'crypto'
import { getRedisClient } from './redis'

const LOCK_PREFIX = 'cron-lock:'

/** Lua script: delete key only if its value matches (compare-and-delete). */
const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`

/**
 * Acquire a distributed lock for a cron job using Redis SET NX EX.
 * Prevents duplicate cron runs across multiple instances.
 *
 * Fail-open: if Redis is unavailable, returns true (better to run twice than not at all).
 * Returns the lock token (UUID) on success, or null if lock is held by another instance.
 * Returns 'fail-open' when Redis is unavailable (callers should not attempt release).
 *
 * @param jobName - Unique job identifier (e.g., 'license-expiry', 'anomaly-detection')
 * @param ttlSeconds - Lock expiry in seconds (should be 2x expected job duration)
 * @returns lock token string on acquire, 'fail-open' if Redis unavailable, null if lock held
 */
export async function acquireCronLock(
  jobName: string,
  ttlSeconds: number,
): Promise<string | null> {
  const redis = getRedisClient()
  if (!redis) {
    console.warn(`[CRON-LOCK] Redis unavailable, allowing execution for job: ${jobName}`)
    return 'fail-open'
  }

  try {
    const key = `${LOCK_PREFIX}${jobName}`
    const token = randomUUID()
    const result = await redis.set(key, token, 'EX', ttlSeconds, 'NX')
    return result === 'OK' ? token : null
  } catch (err) {
    const msg = ((err as Error).message ?? 'unknown').replace(/rediss?:\/\/[^\s]+/gi, 'redis://***')
    console.warn(`[CRON-LOCK] Redis error acquiring lock for ${jobName}, allowing execution:`, msg)
    return 'fail-open'
  }
}

/**
 * Release a distributed lock for a cron job.
 * Uses a Lua compare-and-delete script to ensure only the lock owner can release.
 *
 * @param jobName - The job identifier used when acquiring the lock
 * @param token - The lock token returned by acquireCronLock. Pass null/'fail-open' to skip.
 */
export async function releaseCronLock(jobName: string, token: string | null): Promise<void> {
  if (!token || token === 'fail-open') return

  const redis = getRedisClient()
  if (!redis) return

  try {
    const key = `${LOCK_PREFIX}${jobName}`
    await redis.eval(RELEASE_SCRIPT, 1, key, token)
  } catch (err) {
    const msg = ((err as Error).message ?? 'unknown').replace(/rediss?:\/\/[^\s]+/gi, 'redis://***')
    console.warn(`[CRON-LOCK] Redis error releasing lock for ${jobName}:`, msg)
  }
}
