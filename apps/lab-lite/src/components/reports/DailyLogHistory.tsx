'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useDailyLogs } from '@/hooks/useDailyLogs'
import { shareDailyLog, triggerDownload } from '@/lib/share-file'
import { saveDailyLog } from '@/lib/db'
import { reportDailyLogAuditEvent } from '@/lib/audit-client'
import type { DailyActivityLog } from '@/lib/daily-log-types'

/** Returns the local date as YYYY-MM-DD (not UTC). */
function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function thirtyDaysAgoISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDate(isoDate: string): string {
  try {
    return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return isoDate
  }
}

interface LogEntryProps {
  log: DailyActivityLog
  onViewImage: (log: DailyActivityLog) => void
  onStatusChange: () => void
}

function LogEntry({ log, onViewImage, onStatusChange }: LogEntryProps) {
  const t = useTranslations('dailyLog')
  const totalTests = log.testSummary.reduce((sum, s) => sum + s.totalPerformed, 0)

  // Thumbnail URL for the log image
  const [thumbUrl] = useState(() =>
    log.imageBlob ? URL.createObjectURL(log.imageBlob) : null
  )

  useEffect(() => {
    return () => { if (thumbUrl) URL.revokeObjectURL(thumbUrl) }
  }, [thumbUrl])

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
      {thumbUrl && (
        <img
          src={thumbUrl}
          alt=""
          className="h-12 w-12 rounded border border-border/50 object-cover flex-shrink-0 me-3"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{formatDate(log.logDate)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {totalTests} tests · {log.workflowMetrics.completionRate.toFixed(0)}% complete
          {log.status === 'shared' && (
            <span className="ml-2 text-green-600">✓ {t('share')}</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 ml-3">
        {log.imageBlob && (
          <>
            <button
              onClick={() => onViewImage(log)}
              className="rounded border border-border px-2 py-1 text-xs text-foreground hover:bg-muted/30"
            >
              {t('preview')}
            </button>
            <button
              onClick={async () => {
                if (!log.imageBlob) return
                const result = await shareDailyLog(log.imageBlob, log.logDate)
                if (result === 'shared') {
                  await saveDailyLog({ ...log, status: 'shared' })
                  reportDailyLogAuditEvent({ action: 'DAILY_LOG_SHARED', logId: log.id, logDate: log.logDate })
                  onStatusChange()
                } else if (result === 'downloaded') {
                  reportDailyLogAuditEvent({ action: 'DAILY_LOG_DOWNLOADED', logId: log.id, logDate: log.logDate })
                }
              }}
              className="rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700"
            >
              {t('share')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

interface ImageModalProps {
  log: DailyActivityLog
  onClose: () => void
}

function ImageModal({ log, onClose }: ImageModalProps) {
  const t = useTranslations('dailyLog')
  const [previewUrl] = useState(() =>
    log.imageBlob ? URL.createObjectURL(log.imageBlob) : null
  )

  // Revoke object URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleShare = useCallback(async () => {
    if (!log.imageBlob) return
    const shared = await shareDailyLog(log.imageBlob, log.logDate)
    if (shared) {
      reportDailyLogAuditEvent({ action: 'DAILY_LOG_SHARED', logId: log.id, logDate: log.logDate })
    }
  }, [log])

  const handleDownload = useCallback(() => {
    if (!log.imageBlob) return
    triggerDownload(log.imageBlob, `lab-daily-report-${log.logDate}.png`)
    reportDailyLogAuditEvent({ action: 'DAILY_LOG_DOWNLOADED', logId: log.id, logDate: log.logDate })
  }, [log])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold text-foreground">{formatDate(log.logDate)}</p>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-muted-foreground text-lg leading-none"
          >
            ✕
          </button>
        </div>
        {previewUrl && (
          <img
            src={previewUrl}
            alt={`Daily report for ${log.logDate}`}
            className="w-full rounded border border-border/50 mb-3"
          />
        )}
        <div className="flex gap-2">
          <button
            onClick={handleShare}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700"
          >
            {t('share')}
          </button>
          <button
            onClick={handleDownload}
            className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted"
          >
            {t('download')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DailyLogHistory() {
  const t = useTranslations('dailyLog')
  // Recalculate dates on each render so they stay fresh past midnight (P12)
  const today = todayISO()
  const from = thirtyDaysAgoISO()

  const { logs, loading, error, reload } = useDailyLogs({ from, to: today })
  const [selectedLog, setSelectedLog] = useState<DailyActivityLog | null>(null)

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground mb-3">{t('history')}</p>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground mb-3">
          {t('history')}
        </p>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noLogs')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {logs.map((log) => (
              <LogEntry
                key={log.id}
                log={log}
                onViewImage={setSelectedLog}
                onStatusChange={reload}
              />
            ))}
          </div>
        )}
      </div>

      {selectedLog && (
        <ImageModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </>
  )
}
