'use client'

import { useTranslations } from 'next-intl'
import type { SyncQueueEntry as SyncQueueEntryType } from '@/lib/db'
import { Button } from '@/components/ui/button'

const STALE_THRESHOLD_MS = 2 * 60 * 1000 // 2 minutes

const FHIR_REF_PATTERN = /^[A-Za-z]+\/[A-Za-z0-9._-]+$/

function extractPatientRef(payload: string): string {
  try {
    const parsed = JSON.parse(payload)
    const ref = parsed.patientRef
    if (typeof ref === 'string' && FHIR_REF_PATTERN.test(ref)) return ref
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

function isStale(entry: SyncQueueEntryType): boolean {
  if (entry.status !== 'in-flight') return false
  if (!entry.lastAttemptAt) return false
  return Date.now() - new Date(entry.lastAttemptAt).getTime() > STALE_THRESHOLD_MS
}

interface SyncQueueEntryProps {
  entry: SyncQueueEntryType
  onRetry?: (entry: SyncQueueEntryType) => void
  onReset?: (entry: SyncQueueEntryType) => void
  retrying?: boolean
}

export function SyncQueueEntry({ entry, onRetry, onReset, retrying }: SyncQueueEntryProps) {
  const t = useTranslations('sync')
  const tTime = useTranslations('time')

  function formatRelativeTime(isoDate: string): string {
    const diff = Date.now() - new Date(isoDate).getTime()
    const minutes = Math.floor(diff / 60_000)
    if (minutes < 1) return tTime('justNow')
    if (minutes < 60) return tTime('minutesAgo', { minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return tTime('hoursAgo', { hours })
    const days = Math.floor(hours / 24)
    return tTime('daysAgo', { days })
  }

  function getGenericErrorMessage(e: SyncQueueEntryType): string {
    if (e.status !== 'failed') return ''
    if (e.retryCount >= 5) return t('serverError')
    if (e.retryCount >= 2) return t('networkError')
    return t('syncFailed')
  }

  const patientRef = extractPatientRef(entry.payload)
  const unknownRef = t('unknownRef')
  const displayRef = patientRef === 'unknown' ? unknownRef : patientRef
  const errorMessage = getGenericErrorMessage(entry)
  const stale = isStale(entry)

  return (
    <div
      data-testid={`sync-entry-${entry.id}`}
      className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {entry.resourceType}
          </span>
          {entry.retryCount > 0 && (
            <span className="inline-flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-destructive/10 text-xs font-bold text-destructive">
              {entry.retryCount > 9 ? '9+' : entry.retryCount}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {formatRelativeTime(entry.createdAt)}
        </span>
      </div>

      <span className="text-xs text-muted-foreground font-mono">{displayRef}</span>

      {errorMessage && (
        <span className="text-xs text-destructive">{errorMessage}</span>
      )}

      <div className="flex items-center gap-2 mt-1">
        {entry.status === 'failed' && onRetry && (
          <Button
            variant="default"
            type="button"
            aria-label={t('retryNowAriaLabel')}
            disabled={retrying}
            onClick={() => onRetry(entry)}
          >
            {t('retryNow')}
          </Button>
        )}
        {stale && onReset && (
          <Button
            variant="outline"
            className="border-warning text-warning hover:bg-warning/10"
            type="button"
            aria-label={t('staleResetAriaLabel')}
            onClick={() => onReset(entry)}
          >
            {t('staleReset')}
          </Button>
        )}
      </div>
    </div>
  )
}
