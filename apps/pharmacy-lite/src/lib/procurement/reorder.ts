/**
 * Suggested reorder quantity: an explicit per-item reorderQuantity if set, else
 * top up to maxStock, else cover the reorderPoint gap. Clamped ≥ 0, then raised to
 * the supplier's minimum order quantity (moq). Integer units, pure.
 */
export function computeSuggestedQty(
  item: { reorderQuantity?: number; maxStock?: number; reorderPoint: number },
  onHand: number,
  moq?: number,
): number {
  const base =
    item.reorderQuantity != null ? item.reorderQuantity
    : item.maxStock != null ? item.maxStock - onHand
    : item.reorderPoint - onHand
  return Math.max(base, moq ?? 0, 0)
}
