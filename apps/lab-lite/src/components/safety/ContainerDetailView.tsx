'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { WasteContainer } from '@/types/waste-tracking'
import {
  ContainerStatus,
  FillLevel,
  DisposalMethod,
} from '@/types/waste-tracking'
import {
  updateFillLevel,
  disposeContainer,
} from '@/lib/safety/waste-tracking-service'
import { calculateAverageFillDays } from '@/lib/safety/waste-tracking-service'
import { Button } from '@/components/ui/Button'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { useEffect } from 'react'

const FILL_LEVELS = [
  { level: FillLevel.QUARTER, label: '25%' },
  { level: FillLevel.HALF, label: '50%' },
  { level: FillLevel.THREE_QUARTER, label: '75%' },
  { level: FillLevel.FULL, label: '100%' },
] as const

const DISPOSAL_METHODS = [
  DisposalMethod.AUTOCLAVE,
  DisposalMethod.INCINERATION,
  DisposalMethod.PICKUP,
  DisposalMethod.OTHER,
] as const

interface ContainerDetailViewProps {
  container: WasteContainer
  onBack: () => void
  onUpdated: () => void
}

export function ContainerDetailView({
  container,
  onBack,
  onUpdated,
}: ContainerDetailViewProps) {
  const t = useTranslations('safety.waste')
  const session = useAuthSessionStore((s) => s.session)
  const [avgFillDays, setAvgFillDays] = useState<number | null>(null)
  const [showDisposal, setShowDisposal] = useState(false)
  const [disposalMethod, setDisposalMethod] = useState<DisposalMethod>(
    DisposalMethod.PICKUP,
  )
  const [quantityEstimate, setQuantityEstimate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void calculateAverageFillDays(container.location, container.type).then(
      setAvgFillDays,
    )
  }, [container.location, container.type])

  const daysActive = Math.floor(
    (Date.now() - new Date(container.startDate).getTime()) /
      (1000 * 60 * 60 * 24),
  )

  async function handleFillUpdate(level: FillLevel) {
    if (submitting) return
    setSubmitting(true)
    try {
      const techId = session?.userId ?? 'unknown'
      await updateFillLevel(container.id, level, techId)

      if (level === FillLevel.FULL) {
        setShowDisposal(true)
      }
      onUpdated()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDispose() {
    if (submitting) return
    setSubmitting(true)
    try {
      await disposeContainer(container.id, {
        disposedBy: session?.userId ?? 'unknown',
        disposalMethod,
        quantityEstimate,
      })
      onUpdated()
    } finally {
      setSubmitting(false)
    }
  }

  const isActive = container.status === ContainerStatus.ACTIVE

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm text-primary-500 hover:underline"
      >
        &larr; {t('backToList')}
      </button>

      <div className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{container.location}</h2>
          <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">
            {t(`type.${container.type}`)}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-gray-500">{t('startDate')}</dt>
            <dd>{new Date(container.startDate).toLocaleDateString()}</dd>
          </div>
          <div>
            <dt className="text-gray-500">{t('daysActiveLabel')}</dt>
            <dd>{daysActive}</dd>
          </div>
          {avgFillDays !== null && (
            <div>
              <dt className="text-gray-500">{t('avgFillDays')}</dt>
              <dd>{avgFillDays}</dd>
            </div>
          )}
          <div>
            <dt className="text-gray-500">{t('status.label')}</dt>
            <dd>{t(`status.${container.status}`)}</dd>
          </div>
        </dl>
      </div>

      {/* Fill level update (active containers only) */}
      {isActive && !showDisposal && (
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium mb-3">{t('updateFillLevel')}</h3>
          <div className="grid grid-cols-4 gap-2">
            {FILL_LEVELS.map(({ level, label }) => (
              <button
                key={level}
                type="button"
                disabled={submitting}
                onClick={() => handleFillUpdate(level)}
                className={`rounded-lg border py-3 text-center text-sm font-semibold transition-colors ${
                  container.fillLevel === level
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                } disabled:opacity-50`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Disposal workflow */}
      {showDisposal && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-semibold text-red-800 mb-3">
            {t('disposeContainer')}
          </h3>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('disposalMethod')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DISPOSAL_METHODS.map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setDisposalMethod(method)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      disposalMethod === method
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {t(`disposal.${method}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="quantity-estimate"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                {t('quantityEstimate')}
              </label>
              <input
                id="quantity-estimate"
                type="text"
                value={quantityEstimate}
                onChange={(e) => setQuantityEstimate(e.target.value)}
                placeholder={t('quantityPlaceholder')}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setShowDisposal(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                fullWidth
                disabled={submitting || !quantityEstimate.trim()}
                onClick={handleDispose}
              >
                {submitting ? t('disposing') : t('confirmDispose')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Fill history timeline */}
      {container.fillHistory.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium mb-3">{t('fillHistory')}</h3>
          <ol className="flex flex-col gap-2">
            {[...container.fillHistory].reverse().map((entry, i) => (
              <li
                key={i}
                className="flex items-center justify-between text-sm border-b border-gray-100 pb-1 last:border-0"
              >
                <span className="font-medium">
                  {t(`fillLevel.${entry.level}`)}
                </span>
                <span className="text-gray-500">
                  {new Date(entry.recordedAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
