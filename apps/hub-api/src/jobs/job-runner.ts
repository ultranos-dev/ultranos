/**
 * Shared job execution wrapper — Story 62.2 (M-HUB-12).
 *
 * The cron bodies were fire-and-forget: a single transient failure (Redis blip,
 * Supabase timeout) meant the day's license-expiry / anomaly-detection /
 * audit-chain job simply logged an error and was lost until the next daily run.
 * This wrapper adds:
 *   - retry with exponential backoff for transient failures, and
 *   - a dead-letter/alert path (P1 infra alert via sendAlert) when all retries
 *     are exhausted, so an operator is paged instead of silently losing a run.
 *
 * The wrapper is safe for idempotent jobs (all current jobs are idempotent /
 * re-runnable), so a retry never double-applies effects.
 */
import { sendAlert } from '@/lib/alert-notifier'

export interface RetryOptions {
  /** Total attempts (including the first). Default 3. */
  maxAttempts?: number
  /** Base backoff in ms; attempt N waits baseDelayMs * 2^(N-1). Default 1000. */
  baseDelayMs?: number
  /** Cap on any single backoff wait. Default 30_000. */
  maxDelayMs?: number
}

const DEFAULTS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Run a job function with retry+backoff. On final failure, fires a P1 infra
 * alert (dead-letter path) and rethrows so the caller's cron handler still
 * observes the failure. `jobName` is used in logs/alerts — never include PHI.
 */
export async function runJobWithRetry<T>(
  jobName: string,
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = { ...DEFAULTS, ...options }

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const message = err instanceof Error ? err.message : 'unknown error'
      if (attempt < maxAttempts) {
        const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
        console.warn(
          `[CRON] Job "${jobName}" attempt ${attempt}/${maxAttempts} failed: ${message} — retrying in ${delay}ms`,
        )
        await sleep(delay)
      } else {
        console.error(
          `[CRON] Job "${jobName}" failed after ${maxAttempts} attempts: ${message} — dead-lettering`,
        )
      }
    }
  }

  // Dead-letter / alert path — all retries exhausted.
  const finalMessage = lastError instanceof Error ? lastError.message : 'unknown error'
  await sendAlert({
    severity: 'P1',
    title: `Cron job failed: ${jobName}`,
    description: `Job "${jobName}" failed all ${maxAttempts} attempts. Last error: ${finalMessage}`,
    metric: `cron.${jobName}.failure`,
    currentValue: maxAttempts,
    threshold: maxAttempts,
    timestamp: new Date().toISOString(),
  })

  throw lastError instanceof Error ? lastError : new Error(finalMessage)
}
