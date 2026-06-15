'use client'

import { useTranslations } from 'next-intl'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ArrowLeft, Info } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import type { PersonnelDetail } from '@/lib/rag-service'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PersonnelDrillDownProps {
  details: PersonnelDetail[]
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Display the last 8 characters of a techId as an opaque identifier. */
function techDisplay(techId: string): string {
  return techId.length > 8 ? `…${techId.slice(-8)}` : techId
}

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: PersonnelDetail['status'] }) {
  const t = useTranslations()
  if (status === 'ON_SHIFT') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 border border-green-200">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
        {t('rag.status.onShift')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground border border-border">
      <span className="h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
      {t('rag.status.ended')}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PersonnelDrillDown({ details, onBack }: PersonnelDrillDownProps) {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          className="!p-1.5 shrink-0"
          onClick={onBack}
          aria-label={t('rag.drillDown.back')}
        >
          <DirectionalIcon category="navigation">
            <ArrowLeft size={18} aria-hidden="true" />
          </DirectionalIcon>
        </Button>
        <h2 className="text-base font-semibold text-foreground">
          {t('rag.drillDown.personnelTitle')}
        </h2>
      </div>

      {/* List */}
      {details.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {t('rag.drillDown.noShiftData')}
        </p>
      ) : (
        <ul className="divide-y divide-border/50 rounded-lg border border-border overflow-hidden">
          {details.map((tech) => (
            <li
              key={tech.techId}
              className="flex items-center gap-3 px-4 py-3 bg-card"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-medium text-foreground truncate">
                  {techDisplay(tech.techId)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {tech.status === 'ON_SHIFT'
                    ? t('rag.drillDown.shiftStarted', { time: formatTime(tech.startedAt) })
                    : t('rag.drillDown.shiftEnded', { time: formatTime(tech.endedAt) })}
                </p>
              </div>
              <StatusBadge status={tech.status} />
            </li>
          ))}
        </ul>
      )}

      {/* Action hint — informational only */}
      <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2.5 text-xs text-blue-700">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{t('rag.drillDown.contactAbsentHint')}</span>
      </div>
    </div>
  )
}
