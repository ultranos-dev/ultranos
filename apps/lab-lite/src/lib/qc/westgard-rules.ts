/**
 * Westgard Multi-Rule QC Engine — Story 43.6
 *
 * Pure functions implementing the Westgard multi-rule statistical QC system.
 * All functions are stateless and take arrays of observed values plus
 * manufacturer-specified mean and SD targets (from the control lot insert).
 *
 * IMPORTANT: SD values come from the manufacturer's control lot insert,
 * NOT calculated from the lab's own run data (see story Dev Notes pitfall #1).
 *
 * Rule cascade order (most critical first):
 *   1-3s → 2-2s → R-4s → 1-2s → 4-1s → 10x → TREND_5
 */

import type { WestgardRuleResult } from './types'

/**
 * 1-2s Warning Rule
 * Triggered when the MOST RECENT value exceeds mean ± 2SD.
 * Interpretation: investigate — may indicate a shift or random error beginning.
 * Action: WARNING — monitor next run.
 */
export function check1_2s(values: number[], mean: number, sd: number): WestgardRuleResult {
  if (values.length === 0) {
    return { violated: false, rule: '1_2S', message: '', severity: 'WARNING', consecutiveCount: 0 }
  }
  const latest = values[values.length - 1]
  const violated = Math.abs(latest - mean) > 2 * sd
  return {
    violated,
    rule: '1_2S',
    message: violated
      ? `Warning: latest value (${latest.toFixed(2)}) exceeds ±2SD limit (${(mean - 2 * sd).toFixed(2)}–${(mean + 2 * sd).toFixed(2)}). Investigate before next run.`
      : '',
    severity: 'WARNING',
    consecutiveCount: violated ? 1 : 0,
  }
}

/**
 * 1-3s Rejection Rule
 * Triggered when the MOST RECENT value exceeds mean ± 3SD.
 * Interpretation: random or systematic error. Reject the run.
 * Action: REJECT — stop testing, investigate and recalibrate.
 */
export function check1_3s(values: number[], mean: number, sd: number): WestgardRuleResult {
  if (values.length === 0) {
    return { violated: false, rule: '1_3S', message: '', severity: 'REJECT', consecutiveCount: 0 }
  }
  const latest = values[values.length - 1]
  const violated = Math.abs(latest - mean) > 3 * sd
  return {
    violated,
    rule: '1_3S',
    message: violated
      ? `REJECT: latest value (${latest.toFixed(2)}) exceeds ±3SD limit. Random or systematic error detected. Stop testing and recalibrate.`
      : '',
    severity: 'REJECT',
    consecutiveCount: violated ? 1 : 0,
  }
}

/**
 * 2-2s Rejection Rule
 * Triggered when 2 consecutive values BOTH exceed 2SD on the SAME SIDE of the mean.
 * Interpretation: systematic error (shift in one direction).
 * Action: REJECT — recalibrate.
 */
export function check2_2s(values: number[], mean: number, sd: number): WestgardRuleResult {
  const noViolation: WestgardRuleResult = {
    violated: false,
    rule: '2_2S',
    message: '',
    severity: 'REJECT',
    consecutiveCount: 0,
  }
  if (values.length < 2) return noViolation

  const last2 = values.slice(-2)
  const [v1, v2] = last2
  // Both > +2SD
  const bothHigh = v1 > mean + 2 * sd && v2 > mean + 2 * sd
  // Both < -2SD
  const bothLow = v1 < mean - 2 * sd && v2 < mean - 2 * sd
  const violated = bothHigh || bothLow
  const direction = bothHigh ? 'high' : 'low'
  return {
    violated,
    rule: '2_2S',
    message: violated
      ? `REJECT: 2 consecutive values exceeded 2SD on the ${direction} side. Systematic error detected. Recalibrate.`
      : '',
    severity: 'REJECT',
    consecutiveCount: violated ? 2 : 0,
  }
}

/**
 * R-4s Rejection Rule
 * Triggered when the RANGE between 2 consecutive values exceeds 4SD.
 * Interpretation: random error (excessive scatter between consecutive runs).
 * Action: REJECT — investigate instrument/reagent.
 */
export function checkR_4s(values: number[], mean: number, sd: number): WestgardRuleResult {
  const noViolation: WestgardRuleResult = {
    violated: false,
    rule: 'R_4S',
    message: '',
    severity: 'REJECT',
    consecutiveCount: 0,
  }
  if (values.length < 2) return noViolation

  const last2 = values.slice(-2)
  const range = Math.abs(last2[1] - last2[0])
  const violated = range > 4 * sd
  return {
    violated,
    rule: 'R_4S',
    message: violated
      ? `REJECT: Range between last 2 values (${range.toFixed(2)}) exceeds 4SD (${(4 * sd).toFixed(2)}). Random error detected. Investigate instrument.`
      : '',
    severity: 'REJECT',
    consecutiveCount: violated ? 2 : 0,
  }
}

/**
 * 4-1s Warning Rule
 * Triggered when 4 consecutive values are ALL on the SAME SIDE of the mean
 * AND all exceed 1SD from the mean.
 * Interpretation: systematic shift (calibration drift).
 * Action: WARNING — monitor; consider recalibration.
 */
export function check4_1s(values: number[], mean: number, sd: number): WestgardRuleResult {
  const noViolation: WestgardRuleResult = {
    violated: false,
    rule: '4_1S',
    message: '',
    severity: 'WARNING',
    consecutiveCount: 0,
  }
  if (values.length < 4) return noViolation

  const last4 = values.slice(-4)
  const allHigh = last4.every((v) => v > mean + sd)
  const allLow = last4.every((v) => v < mean - sd)
  const violated = allHigh || allLow
  const direction = allHigh ? 'high' : 'low'
  return {
    violated,
    rule: '4_1S',
    message: violated
      ? `Warning: 4 consecutive values exceeded 1SD on the ${direction} side. Systematic shift detected. Monitor and consider recalibration.`
      : '',
    severity: 'WARNING',
    consecutiveCount: violated ? 4 : 0,
  }
}

/**
 * 10x Warning Rule
 * Triggered when 10 consecutive values are ALL on the SAME SIDE of the mean
 * (above or below — does not need to exceed any SD threshold).
 * Interpretation: systematic bias (long-term drift).
 * Action: WARNING — recalibrate.
 *
 * NOTE: If fewer than 10 QC runs exist for this analyte/instrument, this rule
 * is SKIPPED (not flagged as insufficient data — see story pitfall #6).
 */
export function check10x(values: number[], mean: number): WestgardRuleResult {
  const noViolation: WestgardRuleResult = {
    violated: false,
    rule: '10X',
    message: '',
    severity: 'WARNING',
    consecutiveCount: 0,
  }
  // Skip rule if fewer than 10 values (pitfall #6: do not flag insufficient data)
  if (values.length < 10) return noViolation

  const last10 = values.slice(-10)
  const allAbove = last10.every((v) => v > mean)
  const allBelow = last10.every((v) => v < mean)
  const violated = allAbove || allBelow
  const direction = allAbove ? 'above' : 'below'
  return {
    violated,
    rule: '10X',
    message: violated
      ? `Warning: 10 consecutive values are all ${direction} the mean. Systematic bias detected. Recalibrate.`
      : '',
    severity: 'WARNING',
    consecutiveCount: violated ? 10 : 0,
  }
}

/**
 * Run ALL Westgard rules against a set of observed values in the standard cascade order.
 * Returns only the rules that are violated.
 * Rules are checked most-critical first (REJECT rules before WARNING rules).
 *
 * @param values - Array of observed QC values, ordered oldest → newest
 * @param mean   - Manufacturer target mean from control lot insert
 * @param sd     - Manufacturer target SD from control lot insert
 */
export function runAllWestgardRules(
  values: number[],
  mean: number,
  sd: number,
): WestgardRuleResult[] {
  const results: WestgardRuleResult[] = [
    check1_3s(values, mean, sd),
    check2_2s(values, mean, sd),
    checkR_4s(values, mean, sd),
    check1_2s(values, mean, sd),
    check4_1s(values, mean, sd),
    check10x(values, mean),
  ]
  return results.filter((r) => r.violated)
}
