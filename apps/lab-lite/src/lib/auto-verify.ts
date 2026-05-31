/**
 * Story 42.5 — Auto-Verification Rules Engine
 * Task 3: Evaluates whether a lab result qualifies for automatic authorization.
 *
 * Runs synchronously on the client — no network calls.
 * All data needed (flags, QC status, tech role) is available locally.
 *
 * SAFETY NOTE: Auto-verification is a convenience optimization, not a safety
 * shortcut. If ANY criterion fails, the result goes to the manual queue.
 * The system always defaults to the safest path (manual review).
 */
import type {
  AbnormalityFlag,
  AutoVerifyEvaluation,
  QcStatus,
} from '../types/authorization'
import { LabRole } from '@ultranos/shared-types'

/** Roles that are eligible to have their results auto-verified. */
const AUTO_VERIFY_ELIGIBLE_ROLES: readonly string[] = [
  LabRole.SENIOR_TECH,
  LabRole.SUPERVISOR,
  LabRole.LAB_MANAGER,
]

/** Critical flags — hard block. Auto-verification NEVER applies. */
const CRITICAL_FLAGS: readonly AbnormalityFlag[] = ['LL', 'HH']

/**
 * Evaluate whether a lab result qualifies for auto-verification.
 *
 * @param abnormalityFlags - Flags computed from the result observations
 * @param qcStatus - QC status of the instrument at time of entry
 * @param role - Lab role of the technician who entered the result
 * @returns AutoVerifyEvaluation with eligible flag, reason, and per-criterion results
 */
export function evaluateAutoVerification(
  abnormalityFlags: AbnormalityFlag[],
  qcStatus: QcStatus,
  role: string,
): AutoVerifyEvaluation {
  const noCriticalValues = !abnormalityFlags.some((f) =>
    CRITICAL_FLAGS.includes(f as AbnormalityFlag),
  )
  const noAbnormalFlags = abnormalityFlags.length === 0
  const qcPassing = qcStatus === 'passing'
  const roleEligible = AUTO_VERIFY_ELIGIBLE_ROLES.includes(role)

  const criteria = {
    noCriticalValues,
    noAbnormalFlags,
    qcPassing,
    roleEligible,
  }

  // Critical values are a hard block — checked first, before other criteria.
  // This check must NEVER be bypassed regardless of other conditions.
  if (!noCriticalValues) {
    return {
      eligible: false,
      reason: 'CRITICAL_VALUE_PRESENT',
      criteria,
    }
  }

  const eligible = noAbnormalFlags && qcPassing && roleEligible

  return {
    eligible,
    reason: eligible ? 'ALL_CRITERIA_MET' : 'CRITERIA_NOT_MET',
    criteria,
  }
}
