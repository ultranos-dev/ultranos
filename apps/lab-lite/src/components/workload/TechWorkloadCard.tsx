'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { TechWorkload } from '@/lib/workload-service'

// ---------------------------------------------------------------------------
// Load level colour helpers
// ---------------------------------------------------------------------------

function loadLevelBorderClass(level: TechWorkload['loadLevel']): string {
  switch (level) {
    case 'RED':    return 'border-red-400 bg-red-50/30'
    case 'AMBER':  return 'border-amber-400 bg-amber-50/20'
    case 'GREEN':  return 'border-green-300 bg-card'
  }
}

function loadLevelBadgeClass(level: TechWorkload['loadLevel']): string {
  switch (level) {
    case 'RED':    return 'bg-red-100 text-red-700'
    case 'AMBER':  return 'bg-amber-100 text-amber-700'
    case 'GREEN':  return 'bg-green-100 text-green-700'
  }
}

function loadLevelLabel(level: TechWorkload['loadLevel'], t: ReturnType<typeof useTranslations<'workload'>>): string {
  switch (level) {
    case 'RED':    return t('overloaded')
    case 'AMBER':  return t('elevated')
    case 'GREEN':  return t('normal')
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricPill({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  return (
    <div className={`rounded px-2 py-1 text-center ${colorClass}`} aria-label={`${label}: ${value}`}>
      <p className="text-lg font-bold leading-tight">{value}</p>
      <p className="text-xs font-medium leading-tight" aria-hidden="true">{label}</p>
    </div>
  )
}

function EtaDisplay({ eta, t }: { eta: Date | null; t: ReturnType<typeof useTranslations<'workload'>> }) {
  if (!eta) return null
  const now = Date.now()
  const diffMs = eta.getTime() - now
  if (diffMs <= 0) return <span className="text-xs text-muted-foreground">{t('etaOverdue')}</span>
  const diffMin = Math.round(diffMs / 60_000)
  const hours = Math.floor(diffMin / 60)
  const mins = diffMin % 60
  const display = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  return (
    <span className="text-xs text-muted-foreground">
      {t('estimatedCompletion')}: <span className="font-medium text-foreground">{display}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TechWorkloadCardProps {
  workload: TechWorkload
  /** Opaque display label for the tech (e.g. "Tech #3" or practitioner name). No PHI. */
  techLabel: string
  /** Role badge text (e.g. "Lab Tech", "Senior Tech"). */
  roleBadge: string
  /** Whether drag-and-drop is active (LAB_MANAGER only). */
  dragEnabled?: boolean
  /** Called when a sample is dropped onto this card. */
  onSampleDropped?: (sampleId: string, fromTechId: string) => void
  /** Render the unavailability toggle (slot for UnavailabilityToggle component). */
  unavailabilityToggle?: React.ReactNode
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TechWorkloadCard({
  workload,
  techLabel,
  roleBadge,
  dragEnabled = false,
  onSampleDropped,
  unavailabilityToggle,
}: TechWorkloadCardProps) {
  const t = useTranslations('workload')

  // Drag-over visual state
  const [isDragOver, setIsDragOver] = useState(false)

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (!dragEnabled) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // Ignore drag-leave events fired when pointer moves over a child element
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setIsDragOver(false)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    if (!dragEnabled) return
    e.preventDefault()
    setIsDragOver(false)
    const data = e.dataTransfer.getData('application/ultranos-sample')
    if (!data) return
    try {
      const { sampleId, fromTechId } = JSON.parse(data) as { sampleId: string; fromTechId: string }
      if (fromTechId === workload.techId) return  // same tech — no-op
      onSampleDropped?.(sampleId, fromTechId)
    } catch {
      // Malformed drag data — ignore
    }
  }

  const borderClass = workload.isUnavailable
    ? 'border-amber-400 bg-amber-50/10'
    : loadLevelBorderClass(workload.loadLevel)

  const dropTargetClass = isDragOver && dragEnabled
    ? 'ring-2 ring-primary ring-offset-1'
    : ''

  return (
    <div
      className={`rounded-lg border-2 p-4 transition-colors ${borderClass} ${dropTargetClass} relative`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role={dragEnabled ? 'region' : undefined}
      aria-label={`${techLabel} ${t('workloadCard')}`}
    >
      {/* Unavailable overlay */}
      {workload.isUnavailable && (
        <div className="absolute inset-x-0 top-0 flex items-center justify-between rounded-t-lg bg-amber-100 px-3 py-1">
          <span className="text-xs font-semibold text-amber-800" role="status">
            {t('unavailable')}
            {workload.availabilityReason ? ` — ${workload.availabilityReason}` : ''}
          </span>
          <span className="text-xs text-amber-700">{t('needsRedistribution')}</span>
        </div>
      )}

      {/* Header */}
      <div className={`flex items-start justify-between ${workload.isUnavailable ? 'mt-6' : ''}`}>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{techLabel}</h3>
          <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {roleBadge}
          </span>
        </div>
        <div className="ms-2 shrink-0">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${loadLevelBadgeClass(workload.loadLevel)}`}>
            {loadLevelLabel(workload.loadLevel, t)}
          </span>
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MetricPill
          label={t('pending')}
          value={workload.pendingCount}
          colorClass="bg-amber-50 text-amber-700"
        />
        <MetricPill
          label={t('inProgress')}
          value={workload.inProgressCount}
          colorClass="bg-primary/10 text-primary"
        />
        <MetricPill
          label={t('completedToday')}
          value={workload.completedCount}
          colorClass="bg-green-50 text-green-700"
        />
      </div>

      {/* ETA */}
      <div className="mt-2">
        <EtaDisplay eta={workload.estimatedCompletionAt} t={t} />
      </div>

      {/* Unavailability toggle (injected by parent) */}
      {unavailabilityToggle && (
        <div className="mt-3 border-t border-border/50 pt-2">
          {unavailabilityToggle}
        </div>
      )}

      {/* Sample list (expandable) */}
      {workload.sampleIds.length > 0 && (
        <SampleList
          sampleIds={workload.sampleIds}
          techId={workload.techId}
          dragEnabled={dragEnabled}
          t={t}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SampleList — individual draggable sample items
// ---------------------------------------------------------------------------

function SampleList({
  sampleIds,
  techId,
  dragEnabled,
  t,
}: {
  sampleIds: string[]
  techId: string
  dragEnabled: boolean
  t: ReturnType<typeof useTranslations<'workload'>>
}) {
  const PREVIEW_COUNT = 3
  const [expanded, setExpanded] = useState(false)
  const hasMore = sampleIds.length > PREVIEW_COUNT
  const visible = expanded ? sampleIds : sampleIds.slice(0, PREVIEW_COUNT)

  return (
    <div className="mt-3 border-t border-border/50 pt-2">
      <ul className="max-h-32 space-y-1 overflow-y-auto">
        {visible.map((sampleId) => (
          <SampleItem
            key={sampleId}
            sampleId={sampleId}
            techId={techId}
            dragEnabled={dragEnabled}
          />
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          className="mt-1 text-xs text-muted-foreground hover:text-muted-foreground"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? t('hideSamples') : t('showSamples', { count: sampleIds.length - PREVIEW_COUNT })}
        </button>
      )}
    </div>
  )
}

function SampleItem({
  sampleId,
  techId,
  dragEnabled,
}: {
  sampleId: string
  techId: string
  dragEnabled: boolean
}) {
  function handleDragStart(e: React.DragEvent<HTMLLIElement>) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(
      'application/ultranos-sample',
      JSON.stringify({ sampleId, fromTechId: techId }),
    )
  }

  return (
    <li
      className={`flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground ${
        dragEnabled ? 'cursor-grab bg-muted/30 hover:bg-muted active:cursor-grabbing' : 'bg-muted/30'
      }`}
      draggable={dragEnabled}
      onDragStart={dragEnabled ? handleDragStart : undefined}
      title={dragEnabled ? 'Drag to reassign' : undefined}
    >
      <span className="font-mono">{sampleId.slice(-8)}</span>
    </li>
  )
}

