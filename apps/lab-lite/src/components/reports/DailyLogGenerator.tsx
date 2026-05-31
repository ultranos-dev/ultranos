'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { aggregateDailyData } from '@/lib/daily-log-aggregator'
import { renderDailyLogImage, computeLogHash } from '@/lib/daily-log-image'
import { shareDailyLog, triggerDownload } from '@/lib/share-file'
import { saveDailyLog, getDailyLogSettings } from '@/lib/db'
import { reportDailyLogAuditEvent } from '@/lib/audit-client'
import { DailyLogHistory } from './DailyLogHistory'
import type { DailyActivityLog } from '@/lib/daily-log-types'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function generateUUID(): string {
  return crypto.randomUUID()
}

type GeneratorState = 'idle' | 'generating' | 'done' | 'error'

export function DailyLogGenerator() {
  const t = useTranslations('dailyLog')
  const locale = useLocale()
  const session = useAuthSessionStore((s) => s.session)

  const [date, setDate] = useState<string>(todayISO())
  const [state, setState] = useState<GeneratorState>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [currentLog, setCurrentLog] = useState<DailyActivityLog | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [shareResult, setShareResult] = useState<'success' | 'cancelled' | 'downloaded' | null>(null)
  const [hasLimitedData, setHasLimitedData] = useState(false)

  const previewRef = useRef<HTMLImageElement>(null)

  const clearPreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
  }, [previewUrl])

  const handleGenerate = useCallback(async () => {
    clearPreview()
    setState('generating')
    setErrorMsg('')
    setShareResult(null)
    setCurrentLog(null)

    try {
      const settings = await getDailyLogSettings()
      const practitionerId = session?.practitionerId ?? 'unknown'
      const facilityName = settings.facilityName || 'Lab Lite'

      // Aggregate data
      const partial = await aggregateDailyData(date, practitionerId, facilityName)

      // Detect sparse data
      const sparse = partial.testSummary.length === 0 && partial.workflowMetrics.samplesReceived === 0
      setHasLimitedData(sparse)

      // Compute hash before rendering
      const hash = await computeLogHash(partial)

      const log: DailyActivityLog = {
        ...partial,
        id: generateUUID(),
        imageHash: hash,
        status: 'generated',
      }

      // Render image
      const imageBlob = await renderDailyLogImage(log, { locale })
      log.imageBlob = imageBlob

      // Save to Dexie
      await saveDailyLog(log)

      // Emit audit event
      reportDailyLogAuditEvent({ action: 'DAILY_LOG_GENERATED', logId: log.id, logDate: log.logDate })

      // Build preview URL
      const url = URL.createObjectURL(imageBlob)
      setPreviewUrl(url)
      setCurrentLog(log)
      setState('done')
    } catch (err) {
      setState('error')
      setErrorMsg(err instanceof Error ? err.message : 'Generation failed')
    }
  }, [date, locale, session, clearPreview])

  const handleShare = useCallback(async () => {
    if (!currentLog?.imageBlob) return
    const shared = await shareDailyLog(currentLog.imageBlob, currentLog.logDate)
    if (shared) {
      const updated: DailyActivityLog = { ...currentLog, status: 'shared' }
      await saveDailyLog(updated)
      setCurrentLog(updated)
      reportDailyLogAuditEvent({ action: 'DAILY_LOG_SHARED', logId: currentLog.id, logDate: currentLog.logDate })
      setShareResult('success')
    } else {
      setShareResult('cancelled')
    }
  }, [currentLog])

  const handleDownload = useCallback(async () => {
    if (!currentLog?.imageBlob) return
    triggerDownload(currentLog.imageBlob, `lab-daily-report-${currentLog.logDate}.png`)
    reportDailyLogAuditEvent({ action: 'DAILY_LOG_DOWNLOADED', logId: currentLog.id, logDate: currentLog.logDate })
    setShareResult('downloaded')
  }, [currentLog])

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold text-neutral-900 mb-6">{t('title')}</h1>

      {/* Date selector + Generate */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4 mb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor="log-date"
              className="block text-sm font-medium text-neutral-700 mb-1"
            >
              {t('selectDate')}
            </label>
            <input
              id="log-date"
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={state === 'generating'}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {state === 'generating' ? t('generating') : t('generateDaily')}
          </button>
        </div>
      </div>

      {/* Error message */}
      {state === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 mb-4 text-sm text-red-700">
          {errorMsg || 'An error occurred during generation.'}
        </div>
      )}

      {/* Limited data warning */}
      {hasLimitedData && state === 'done' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4 text-sm text-amber-700">
          {t('limitedData')}
        </div>
      )}

      {/* Image preview */}
      {previewUrl && state === 'done' && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 mb-4">
          <p className="text-sm font-medium text-neutral-700 mb-3">{t('preview')}</p>
          <img
            ref={previewRef}
            src={previewUrl}
            alt={`Daily report for ${date}`}
            className="w-full rounded border border-neutral-100"
          />

          {/* Action buttons */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleShare}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
            >
              {t('share')}
            </button>
            <button
              onClick={handleDownload}
              className="rounded-md bg-neutral-100 border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-200"
            >
              {t('download')}
            </button>
            <button
              onClick={handleGenerate}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              {t('regenerate')}
            </button>
          </div>

          {/* Share result feedback */}
          {shareResult === 'success' && (
            <p className="mt-2 text-sm text-green-600">{t('shareSuccess')}</p>
          )}
          {shareResult === 'cancelled' && (
            <p className="mt-2 text-sm text-neutral-500">Share cancelled.</p>
          )}
          {shareResult === 'downloaded' && (
            <p className="mt-2 text-sm text-blue-600">{t('downloading')}</p>
          )}
        </div>
      )}

      {/* History section */}
      <DailyLogHistory />
    </div>
  )
}
