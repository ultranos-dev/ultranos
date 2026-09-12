/**
 * A PO requires approval only when a positive threshold is configured and the
 * PO total meets or exceeds it. threshold ≤ 0 → approval is off. Integer minor units.
 */
export function requiresApproval(totalCost: number, threshold: number): boolean {
  return threshold > 0 && totalCost >= threshold
}
