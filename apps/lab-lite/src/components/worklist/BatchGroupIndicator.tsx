interface BatchGroupIndicatorProps {
  /** Whether this item is part of a batch group with the item above it. */
  isInBatch: boolean
  /** Whether this is the first item of a new batch group. */
  isBatchStart: boolean
}

/**
 * Visual grouping indicator for batched same-type tests.
 * Renders a subtle left border stripe when items are grouped.
 * RTL-compatible: uses border-inline-start.
 */
export function BatchGroupIndicator({ isInBatch, isBatchStart }: BatchGroupIndicatorProps) {
  if (!isInBatch) return null

  return (
    <div
      className={`absolute inset-y-0 start-0 w-1 rounded-ss-sm rounded-es-sm ${
        isBatchStart ? 'bg-indigo-400' : 'bg-indigo-200'
      }`}
      aria-hidden="true"
    />
  )
}
