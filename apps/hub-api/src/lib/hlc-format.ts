import { z } from 'zod'
import { isSerializedHlc } from '@ultranos/sync-engine'

/**
 * Hub-side HLC-format validation (Story 60.1, AC #3).
 *
 * Every sync-relevant write from a spoke should stamp `hlcTimestamp` with a
 * serialized Hybrid Logical Clock ("<15d>:<5d>:<node>"), never a wall-clock ISO
 * string. The Hub uses this stamp to order events across offline devices; a
 * mis-formatted stamp mis-parses and can silently reorder or drop a write.
 *
 * Enforcement is STAGED via the `HLC_FORMAT_MODE` env var:
 *   - `log-only` (DEFAULT): accept the value, but count + log violations so we
 *     can watch the fleet drain legacy wall-clock stamps. NEVER rejects — legacy
 *     queued entries stamped before this story must still sync end-to-end.
 *   - `enforce`: reject a mis-formatted stamp with a validation error. Only flip
 *     this once telemetry shows spokes ship clean stamps AND legacy entries have
 *     drained (one release of log-only minimum).
 *
 * No PHI: the stamp is a clock value + opaque node id, never patient data.
 */

export type HlcFormatMode = 'log-only' | 'enforce'

export function getHlcFormatMode(): HlcFormatMode {
  return process.env.HLC_FORMAT_MODE === 'enforce' ? 'enforce' : 'log-only'
}

/**
 * Process-lifetime counter of malformed `hlcTimestamp` values seen in log-only
 * mode, keyed by resource type. Read by ops/telemetry; reset only on restart.
 * Kept intentionally tiny (a Map of small ints) — safe to hold in memory.
 */
const violationCounts = new Map<string, number>()

/** Snapshot the current malformed-HLC counters (for a metrics endpoint/test). */
export function getHlcViolationCounts(): Record<string, number> {
  return Object.fromEntries(violationCounts)
}

/** Test/ops helper: clear the counters. */
export function resetHlcViolationCounts(): void {
  violationCounts.clear()
}

function recordViolation(context: string): void {
  violationCounts.set(context, (violationCounts.get(context) ?? 0) + 1)
  // No PHI — context is a resource type / endpoint label, value is the count.
  console.warn(
    `[hlc-format] malformed hlcTimestamp in "${context}" ` +
      `(count=${violationCounts.get(context)}, mode=${getHlcFormatMode()}). ` +
      'Expected serialized HLC "<15d>:<5d>:<node>".',
  )
}

/**
 * A Zod string schema for `hlcTimestamp` that enforces a non-empty value and
 * layers staged HLC-format validation on top. `context` labels the counter /
 * log line (e.g. the resource type or endpoint name).
 *
 * - Always requires a non-empty string (preserves the prior `.min(1)` contract).
 * - In `log-only`: passes malformed values through, incrementing telemetry.
 * - In `enforce`: fails validation for malformed values.
 */
export function hlcTimestampSchema(context: string): z.ZodType<string> {
  return z.string().min(1).superRefine((value, ctx) => {
    if (isSerializedHlc(value)) return
    if (getHlcFormatMode() === 'enforce') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'hlcTimestamp is not a serialized HLC ("<15d>:<5d>:<node>"). ' +
          'Stamp it with serializeHlc(hlc.now()) on the spoke.',
      })
      return
    }
    // log-only: accept, but count the violation for fleet telemetry.
    recordViolation(context)
  })
}
