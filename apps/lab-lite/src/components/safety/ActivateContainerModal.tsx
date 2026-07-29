'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ContainerType } from '@/types/waste-tracking'
import { activateContainer } from '@/lib/safety/waste-tracking-service'
import { Button } from '@/components/ui/Button'

interface ActivateContainerModalProps {
  onClose: () => void
  onActivated: () => void
}

const CONTAINER_TYPES = [
  ContainerType.SHARPS,
  ContainerType.INFECTIOUS,
  ContainerType.CHEMICAL,
] as const

export function ActivateContainerModal({
  onClose,
  onActivated,
}: ActivateContainerModalProps) {
  const t = useTranslations('safety.waste')
  const [location, setLocation] = useState('')
  const [type, setType] = useState<ContainerType>(ContainerType.SHARPS)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!location.trim()) return

    setSubmitting(true)
    setError(null)
    try {
      await activateContainer({ location: location.trim(), type })
      onActivated()
    } catch {
      setError(t('activationError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activate-container-title"
    >
      <div className="mx-4 w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
        <h2
          id="activate-container-title"
          className="text-lg font-semibold mb-4"
        >
          {t('activateNew')}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="container-location"
              className="block text-sm font-medium text-foreground mb-1"
            >
              {t('location')}
            </label>
            <input
              id="container-location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('locationPlaceholder')}
              required
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              {t('containerType')}
            </label>
            <div className="flex gap-2">
              {CONTAINER_TYPES.map((ct) => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => setType(ct)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    type === ct
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {t(`type.${ct}`)}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={onClose}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={submitting || !location.trim()}
            >
              {submitting ? t('activating') : t('activate')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
