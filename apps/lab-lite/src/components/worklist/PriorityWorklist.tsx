'use client'

import { useRef, useState } from 'react'
import { ClipboardList } from '@ultranos/ui-kit/icons'
import type { PrioritizedSample } from '@/lib/prioritization-engine'
import { WorklistItem } from './WorklistItem'

interface PriorityWorklistProps {
  samples: PrioritizedSample[]
  loading: boolean
  error: string | null
  onReorder: (sampleId: string, newPosition: number) => Promise<void>
  onResetOverride: (sampleId: string) => Promise<void>
}

/**
 * Drag-and-drop priority worklist container.
 *
 * Features:
 * - Drag-and-drop reorder (HTML5 + touch support for tablets)
 * - Visual drag feedback: source item gets opacity-50, drop target shows insertion line
 * - Batch group indicators (same test type adjacent grouping)
 * - RTL-compatible throughout (logical CSS only)
 *
 * No PHI displayed beyond first name + age per CLAUDE.md Rule #7.
 */
export function PriorityWorklist({
  samples,
  loading,
  error,
  onReorder,
  onResetOverride,
}: PriorityWorklistProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)

  // Touch drag state
  const touchDragIndexRef = useRef<number | null>(null)
  const touchStartYRef = useRef<number>(0)

  // ---------------------------------------------------------------------------
  // HTML5 drag handlers
  // ---------------------------------------------------------------------------

  function handleDragStart(index: number) {
    setDragIndex(index)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    setDropTargetIndex(index)
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null)
      setDropTargetIndex(null)
      return
    }
    const sample = samples[dragIndex]
    if (sample) {
      void onReorder(sample.sampleId, targetIndex)
    }
    setDragIndex(null)
    setDropTargetIndex(null)
  }

  function handleDragEnd() {
    setDragIndex(null)
    setDropTargetIndex(null)
  }

  // ---------------------------------------------------------------------------
  // Touch drag handlers (tablet support)
  // ---------------------------------------------------------------------------

  function handleTouchStart(e: React.TouchEvent, index: number) {
    touchDragIndexRef.current = index
    touchStartYRef.current = e.touches[0]?.clientY ?? 0
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const sourceIndex = touchDragIndexRef.current
    if (sourceIndex === null) return

    const touch = e.changedTouches[0]
    if (!touch) return

    // Hit-test: find which row the finger landed on
    const elements = document.elementsFromPoint(touch.clientX, touch.clientY)
    const targetEl = elements.find((el) => el.hasAttribute('data-worklist-index'))
    const targetAttr = targetEl?.getAttribute('data-worklist-index')
    const targetIndex = targetAttr !== undefined && targetAttr !== null
      ? parseInt(targetAttr, 10)
      : null

    if (targetIndex !== null && targetIndex !== sourceIndex) {
      const sample = samples[sourceIndex]
      if (sample) {
        void onReorder(sample.sampleId, targetIndex)
      }
    }

    touchDragIndexRef.current = null
  }

  // ---------------------------------------------------------------------------
  // Batch group detection
  // ---------------------------------------------------------------------------

  function isBatchGrouped(index: number): { isInBatch: boolean; isBatchStart: boolean } {
    if (index === 0) return { isInBatch: false, isBatchStart: false }
    const prev = samples[index - 1]
    const curr = samples[index]
    if (!prev || !curr) return { isInBatch: false, isBatchStart: false }

    const sameGroup = prev.batchGroup === curr.batchGroup
    if (!sameGroup) return { isInBatch: false, isBatchStart: false }

    // Check if the item before prev also had the same group (then we're mid-batch)
    const prevPrev = samples[index - 2]
    const isBatchStart = !prevPrev || prevPrev.batchGroup !== curr.batchGroup

    return { isInBatch: true, isBatchStart }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading worklist">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg bg-muted"
            aria-hidden="true"
          />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
        {error}
      </div>
    )
  }

  if (samples.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/30 px-6 py-12 text-center">
        <ClipboardList size={40} className="mb-3 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-muted-foreground">No samples in queue</p>
        <p className="mt-1 text-xs text-muted-foreground">Received samples will appear here automatically.</p>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col gap-2"
      role="list"
      aria-label="Priority worklist"
      onDragEnd={handleDragEnd}
      onTouchEnd={handleTouchEnd}
    >
      {samples.map((sample, index) => {
        const { isInBatch, isBatchStart } = isBatchGrouped(index)
        const isDropTarget = dropTargetIndex === index && dragIndex !== index

        return (
          <div key={sample.sampleId} className="relative" data-worklist-index={index}>
            {/* Blue insertion line above drop target */}
            {isDropTarget && (
              <div className="absolute -top-1 inset-x-0 h-0.5 rounded bg-blue-500" aria-hidden="true" />
            )}
            <WorklistItem
              sample={sample}
              rank={index + 1}
              index={index}
              isInBatch={isInBatch}
              isBatchStart={isBatchStart}
              isDragging={dragIndex === index}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onTouchStart={handleTouchStart}
              onResetOverride={onResetOverride}
            />
          </div>
        )
      })}
    </div>
  )
}
