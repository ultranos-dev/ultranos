'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type {
  TemperatureLocation,
  TemperatureReading,
  TemperatureExcursion,
} from '@/types/temperature-monitoring'
import { TemperatureSource, ExcursionSeverity } from '@/types/temperature-monitoring'
import {
  getTemperatureLocations,
  getReadingsByLocation,
  getActiveExcursions,
  getOngoingExcursionForLocation,
} from '@/lib/db'
import { isBleAvailable } from '@/lib/safety/ble-temperature'
import { isPromptDue } from '@/lib/safety/temperature-prompts'
import { getExcursionDuration } from '@/lib/safety/temperature-service'
import { Button } from '@/components/ui/Button'
import { LogTemperatureModal } from './LogTemperatureModal'
import { TemperatureTrendChart } from './TemperatureTrendChart'

type StatusColor = 'green' | 'amber' | 'red'

interface LocationCardData {
  location: TemperatureLocation
  latestReading: TemperatureReading | null
  status: StatusColor
  excursion: TemperatureExcursion | null
  promptDue: boolean
}

export function TemperatureDashboard() {
  const t = useTranslations('safety.temperature')
  const [cards, setCards] = useState<LocationCardData[]>([])
  const [loading, setLoading] = useState(true)
  const [logModalLocation, setLogModalLocation] = useState<TemperatureLocation | null>(null)
  const [chartLocation, setChartLocation] = useState<TemperatureLocation | null>(null)
  const bleAvailable = isBleAvailable()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const locations = await getTemperatureLocations()
      const cardData: LocationCardData[] = []

      for (const loc of locations) {
        const readings = await getReadingsByLocation(loc.id)
        const latestReading = readings.length > 0 ? readings[0] : null
        const excursion = await getOngoingExcursionForLocation(loc.id)
        const promptDue = await isPromptDue(loc.id)

        let status: StatusColor = 'green'
        if (excursion) {
          status = excursion.severity === ExcursionSeverity.WARNING ? 'amber' : 'red'
        } else if (latestReading) {
          const temp = latestReading.temperatureCelsius
          if (temp < loc.minTemp || temp > loc.maxTemp) {
            status = 'red'
          } else if (
            temp < loc.minTemp + 1 ||
            temp > loc.maxTemp - 1
          ) {
            status = 'amber'
          }
        }

        cardData.push({ location: loc, latestReading, status, excursion, promptDue })
      }

      setCards(cardData)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const statusIndicatorClasses: Record<StatusColor, string> = {
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  }

  const statusBorderClasses: Record<StatusColor, string> = {
    green: 'border-green-200',
    amber: 'border-amber-200',
    red: 'border-red-300',
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 rounded-lg bg-muted" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-foreground mb-6">
        {t('dashboardTitle')}
      </h1>

      {/* Active excursion banners */}
      {cards
        .filter((c) => c.excursion)
        .map((card) => (
          <div
            key={card.excursion!.id}
            className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4"
            role="alert"
          >
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-red-500 animate-pulse" />
              <span className="font-semibold text-red-800">
                {t('excursionAlert')}
              </span>
            </div>
            <p className="mt-1 text-sm text-red-700">
              {card.location.name} — {t('peakTemp')}: {card.excursion!.peakTemperature}°C,{' '}
              {t('duration')}: {getExcursionDuration(card.excursion!)} {t('minutes')}
            </p>
          </div>
        ))}

      {/* Location cards */}
      {cards.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t('noLocations')}</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <div
              key={card.location.id}
              className={`rounded-lg border bg-card p-4 ${statusBorderClasses[card.status]}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {card.location.name}
                </h3>
                <span
                  className={`inline-block h-3 w-3 rounded-full ${statusIndicatorClasses[card.status]}`}
                  aria-label={t(`status.${card.status}`)}
                />
              </div>

              {/* Current temperature */}
              <div className="text-center mb-3">
                {card.latestReading ? (
                  <>
                    <span className="text-3xl font-bold text-foreground">
                      {card.latestReading.temperatureCelsius}
                    </span>
                    <span className="text-lg text-muted-foreground">°C</span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">{t('noReadings')}</span>
                )}
              </div>

              {/* Meta info */}
              <dl className="space-y-1 text-xs text-muted-foreground mb-3">
                {card.latestReading && (
                  <>
                    <div className="flex justify-between">
                      <dt>{t('lastReading')}</dt>
                      <dd>{new Date(card.latestReading.timestamp).toLocaleTimeString()}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt>{t('source')}</dt>
                      <dd>
                        {card.latestReading.source === TemperatureSource.BLE_SENSOR
                          ? t('bleSensor')
                          : t('manual')}
                      </dd>
                    </div>
                  </>
                )}
                <div className="flex justify-between">
                  <dt>{t('range')}</dt>
                  <dd>
                    {card.location.minTemp}–{card.location.maxTemp}°C
                  </dd>
                </div>
              </dl>

              {/* Overdue prompt indicator */}
              {card.promptDue && (
                <div className="mb-3 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                  {t('readingOverdue')}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 text-xs"
                  onClick={() => setLogModalLocation(card.location)}
                >
                  {t('logReading')}
                </Button>
                <Button
                  variant="ghost"
                  className="text-xs"
                  onClick={() => setChartLocation(card.location)}
                >
                  {t('trend')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Log temperature modal */}
      {logModalLocation && (
        <LogTemperatureModal
          location={logModalLocation}
          onClose={() => setLogModalLocation(null)}
          onSaved={() => {
            setLogModalLocation(null)
            void loadData()
          }}
        />
      )}

      {/* Trend chart panel */}
      {chartLocation && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-foreground">
              {chartLocation.name} — {t('trendTitle')}
            </h2>
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => setChartLocation(null)}
            >
              {t('close')}
            </Button>
          </div>
          <TemperatureTrendChart location={chartLocation} />
        </div>
      )}
    </div>
  )
}
