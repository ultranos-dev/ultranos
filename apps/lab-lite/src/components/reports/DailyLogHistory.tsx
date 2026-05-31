'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useDailyLogs } from '@/hooks/useDailyLogs'
import { shareDailyLog, triggerDownload } from '@/lib/share-file'
import { reportDailyLogAuditEvent } from '@/lib/audit-client'
import type { DailyActivityLog } from '@/lib/daily-log-types'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function thirtyDaysAgoISO(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
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
}

function LogEntry({ log, onViewImage }: LogEntryProps) {
  const t = useTranslations('dailyLog')
  const totalTests = log.testSummary.reduce((sum, s) => sum + s.totalPerformed, 0)

  return (
    <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900">{formatDate(log.logDate)}</p>
        <p className="text-xs text-neutral-500 mt-0.5">
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
              className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
            >
              {t('preview')}
            </button>
            <button
              onClick={async () => {
                if (!log.imageBlob) return
                const shared = await shareDailyLog(log.imageBlob, log.logDate)
                if (shared) {
                  reportDailyLogAuditEvent({ action: 'DAILY_LOG_SHARED', logId: log.id, logDate: log.logDate })
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
        className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold text-neutral-900">{formatDate(log.logDate)}</p>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 text-lg leading-none"
          >
            ✕
          </button>
        </div>
        {previewUrl && (
          <img
            src={previewUrl}
            alt={`Daily report for ${log.logDate}`}
            className="w-full rounded border border-neutral-100 mb-3"
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
            className="rounded-md border border-neutral-300 bg-neutral-100 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-200"
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
  const today = todayISO()
  const from = thirtyDaysAgoISO()

  const { logs, loading, error } = useDailyLogs({ from, to: today })
  const [selectedLog, setSelectedLog] = useState<DailyActivityLog | null>(null)

  if (loading) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm font-semibold text-neutral-700 mb-3">{t('history')}</p>
        <p className="text-sm text-neutral-400">Loading...</p>
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
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm font-semibold text-neutral-700 mb-3">
          {t('history')}
        </p>
        {logs.length === 0 ? (
          <p className="text-sm text-neutral-400">{t('noLogs')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {logs.map((log) => (
              <LogEntry
                key={log.id}
                log={log}
                onViewImage={setSelectedLog}
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
