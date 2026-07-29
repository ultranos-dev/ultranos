'use client'

import { useTranslations } from 'next-intl'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ArrowLeft, Wrench, Info } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import type { EquipmentDetail } from '@/lib/rag-service'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EquipmentDrillDownProps {
  details: EquipmentDetail[]
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: EquipmentDetail['status'] }) {
  const t = useTranslations()
  if (status === 'IN_SERVICE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 border border-green-200">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />
        {t('rag.status.inService')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700 border border-red-200">
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
      {t('rag.status.outOfService')}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EquipmentDrillDown({ details, onBack }: EquipmentDrillDownProps) {
  const t = useTranslations()

  // Sort: OUT_OF_SERVICE first
  const sorted = [...details].sort((a, b) => {
    if (a.status === 'OUT_OF_SERVICE' && b.status !== 'OUT_OF_SERVICE') return -1
    if (a.status !== 'OUT_OF_SERVICE' && b.status === 'OUT_OF_SERVICE') return 1
    return 0
  })

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
          {t('rag.drillDown.equipmentTitle')}
        </h2>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {t('rag.drillDown.noInstruments')}
        </p>
      ) : (
        <ul className="divide-y divide-border/50 rounded-lg border border-border overflow-hidden">
          {sorted.map((instrument) => (
            <li
              key={instrument.instrumentId}
              className={`px-4 py-3 ${
                instrument.status === 'OUT_OF_SERVICE' ? 'bg-red-50/40' : 'bg-card'
              }`}
            >
              <div className="flex items-start gap-3">
                <Wrench
                  size={16}
                  className={
                    instrument.status === 'OUT_OF_SERVICE'
                      ? 'text-red-500 mt-0.5 shrink-0'
                      : 'text-muted-foreground mt-0.5 shrink-0'
                  }
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {instrument.name}
                  </p>
                  {instrument.status === 'OUT_OF_SERVICE' && instrument.outOfServiceReason && (
                    <p className="text-xs text-red-600 mt-0.5">
                      {instrument.outOfServiceReason}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('rag.drillDown.updatedAt', { time: formatTime(instrument.updatedAt) })}
                  </p>
                </div>
                <StatusBadge status={instrument.status} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Action hint — informational only */}
      <div className="flex items-start gap-2 rounded-md bg-primary/10 border border-primary px-3 py-2.5 text-xs text-primary">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{t('rag.drillDown.scheduleMaintenanceHint')}</span>
      </div>
    </div>
  )
}
