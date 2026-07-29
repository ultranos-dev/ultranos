'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { WasteContainer, WasteAlert } from '@/types/waste-tracking'
import { ContainerStatus, FillLevel } from '@/types/waste-tracking'
import { getAllContainers } from '@/lib/db'
import { checkWasteAlerts } from '@/lib/safety/waste-alerts'
import { Button } from '@/components/ui/Button'

const FILL_PERCENT: Record<FillLevel, number> = {
  [FillLevel.QUARTER]: 25,
  [FillLevel.HALF]: 50,
  [FillLevel.THREE_QUARTER]: 75,
  [FillLevel.FULL]: 100,
}

const STATUS_COLORS: Record<ContainerStatus, string> = {
  [ContainerStatus.ACTIVE]: 'bg-green-100 text-green-800',
  [ContainerStatus.FULL]: 'bg-red-100 text-red-800',
  [ContainerStatus.DISPOSED]: 'bg-muted text-muted-foreground',
}

interface WasteContainerListProps {
  onActivateNew: () => void
  onSelectContainer: (container: WasteContainer) => void
}

export function WasteContainerList({
  onActivateNew,
  onSelectContainer,
}: WasteContainerListProps) {
  const t = useTranslations('safety.waste')
  const [containers, setContainers] = useState<WasteContainer[]>([])
  const [alerts, setAlerts] = useState<WasteAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [allContainers, wasteAlerts] = await Promise.all([
        getAllContainers(),
        checkWasteAlerts(),
      ])
      setContainers(allContainers)
      setAlerts(wasteAlerts)
      setLoading(false)
    }
    void load()
  }, [])

  const alertMap = useMemo(() => {
    const map = new Map<string, WasteAlert>()
    for (const alert of alerts) {
      const existing = map.get(alert.containerId)
      if (!existing || alert.severity === 'URGENT') {
        map.set(alert.containerId, alert)
      }
    }
    return map
  }, [alerts])

  // Active first, then recently disposed
  const sorted = useMemo(
    () =>
      [...containers].sort((a, b) => {
        if (a.status === ContainerStatus.ACTIVE && b.status !== ContainerStatus.ACTIVE) return -1
        if (a.status !== ContainerStatus.ACTIVE && b.status === ContainerStatus.ACTIVE) return 1
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
      }),
    [containers],
  )

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg bg-muted"
            aria-busy="true"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <Button variant="primary" onClick={onActivateNew}>
          {t('activateNew')}
        </Button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((container) => {
            const alert = alertMap.get(container.id)
            const daysActive = Math.floor(
              (Date.now() - new Date(container.startDate).getTime()) /
                (1000 * 60 * 60 * 24),
            )
            const fillPct = FILL_PERCENT[container.fillLevel]

            return (
              <li key={container.id}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-border p-4 text-start hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary-300 transition-colors"
                  onClick={() => onSelectContainer(container)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{container.location}</span>
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary">
                        {t(`type.${container.type}`)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {alert && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                            alert.severity === 'URGENT'
                              ? 'bg-red-500 text-white'
                              : 'bg-amber-400 text-amber-900'
                          }`}
                        >
                          {alert.severity}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[container.status]}`}
                      >
                        {t(`status.${container.status}`)}
                      </span>
                    </div>
                  </div>

                  {container.status !== ContainerStatus.DISPOSED && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{t('fillLevel')}: {fillPct}%</span>
                        <span>
                          {t('daysActive', { days: daysActive })}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            fillPct >= 75
                              ? 'bg-red-500'
                              : fillPct >= 50
                                ? 'bg-amber-400'
                                : 'bg-green-500'
                          }`}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </div>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
