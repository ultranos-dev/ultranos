'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { X, Upload, FileText } from '@ultranos/ui-kit/icons'
import { importSendOutResult } from '@/lib/sendout-service'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import type { SendOut, ReferenceLab } from '@/types/reference-lab'
import { getDb } from '@/lib/db'

interface ResultImportModalProps {
  sendOut: SendOut
  onClose: () => void
  onSuccess: () => void
}

type ImportMode = 'manual' | 'file'

export function ResultImportModal({ sendOut, onClose, onSuccess }: ResultImportModalProps) {
  const t = useTranslations('sendout')
  const session = useAuthSessionStore((s) => s.session)
  const [mode, setMode] = useState<ImportMode>('manual')
  const [manualValue, setManualValue] = useState('')
  const [manualUnit, setManualUnit] = useState('')
  const [manualFlag, setManualFlag] = useState<'normal' | 'high' | 'low' | 'critical'>('normal')
  const [fileContent, setFileContent] = useState<Record<string, unknown> | null>(null)
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [labName, setLabName] = useState<string>('')

  // Load lab name for attribution display (H10 — proper useEffect with cleanup)
  useEffect(() => {
    let mounted = true
    getDb().reference_labs.get(sendOut.referenceLabId).then((lab) => {
      if (lab && mounted) setLabName(`${lab.name}, Accreditation #${lab.accreditationNumber}`)
    }).catch(() => {})
    return () => { mounted = false }
  }, [sendOut.referenceLabId])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    try {
      const text = await file.text()
      if (file.name.endsWith('.json')) {
        setFileContent(JSON.parse(text) as Record<string, unknown>)
      } else if (file.name.endsWith('.csv')) {
        // Parse simple CSV: first row = headers, second row = values
        const [headerLine, valueLine] = text.split('\n')
        const headers = headerLine?.split(',').map((h) => h.trim()) ?? []
        const values = valueLine?.split(',').map((v) => v.trim()) ?? []
        const parsed: Record<string, string> = {}
        headers.forEach((h, i) => { if (h) parsed[h] = values[i] ?? '' })
        setFileContent(parsed)
      } else {
        setError(t('importFileTypeError'))
        return
      }
      setError(null)
    } catch {
      setError(t('importFileParseError'))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.userId) return
    setLoading(true)
    setError(null)
    try {
      const resultData: Record<string, unknown> =
        mode === 'file' && fileContent
          ? fileContent
          : {
              value: manualValue,
              unit: manualUnit,
              interpretation: manualFlag,
            }

      await importSendOutResult(sendOut.id, resultData, session.userId)
      onSuccess()
    } catch {
      setError(t('importSubmitError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-import-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 id="result-import-title" className="text-base font-semibold text-foreground">
            {t('importModalTitle')}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('importCloseAriaLabel')} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Attribution (non-editable) */}
          <div className="rounded-md bg-primary/10 border border-primary px-3 py-2 text-sm">
            <p className="text-xs text-primary font-medium mb-0.5">{t('importAttributionLabel')}</p>
            <p className="text-primary font-medium">{t('importAttributionPerformedAt', { lab: labName || '…' })}</p>
          </div>

          {/* Mode selector */}
          <div className="flex rounded-md border border-border overflow-hidden" role="group" aria-label={t('importModeGroupAriaLabel')}>
            {(['manual', 'file'] as ImportMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${
                  mode === m
                    ? 'bg-primary text-white'
                    : 'bg-card text-muted-foreground hover:bg-muted/30'
                }`}
              >
                {m === 'manual' ? t('importModeManual') : t('importModeFile')}
              </button>
            ))}
          </div>

          {/* Manual entry */}
          {mode === 'manual' && (
            <div className="space-y-3">
              <div>
                <label htmlFor="result-value" className="block text-sm font-medium text-foreground mb-1">
                  {t('importResultValueLabel')} <span aria-hidden="true" className="text-red-500">*</span>
                </label>
                <input
                  id="result-value"
                  type="text"
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  required
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder={t('importResultValuePlaceholder')}
                />
              </div>
              <div>
                <label htmlFor="result-unit" className="block text-sm font-medium text-foreground mb-1">{t('importResultUnitLabel')}</label>
                <input
                  id="result-unit"
                  type="text"
                  value={manualUnit}
                  onChange={(e) => setManualUnit(e.target.value)}
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder={t('importResultUnitPlaceholder')}
                />
              </div>
              <div>
                <label htmlFor="result-flag" className="block text-sm font-medium text-foreground mb-1">{t('importResultFlagLabel')}</label>
                <select
                  id="result-flag"
                  value={manualFlag}
                  onChange={(e) => setManualFlag(e.target.value as typeof manualFlag)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-ring focus:outline-none"
                >
                  <option value="normal">{t('importFlagNormal')}</option>
                  <option value="high">{t('importFlagHigh')}</option>
                  <option value="low">{t('importFlagLow')}</option>
                  <option value="critical">{t('importFlagCritical')}</option>
                </select>
              </div>
            </div>
          )}

          {/* File import */}
          {mode === 'file' && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('importFileLabel')}
              </label>
              <label
                htmlFor="result-file-input"
                className="flex cursor-pointer flex-col items-center rounded-md border-2 border-dashed border-border px-4 py-6 text-center hover:border-primary"
              >
                <Upload size={24} className="mb-2 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {fileName || t('importFilePlaceholder')}
                </span>
                <input
                  id="result-file-input"
                  type="file"
                  accept=".csv,.json"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>
              {fileContent && (
                <div className="mt-2 rounded-md bg-muted/30 border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <FileText size={12} /> {t('importPreviewLabel')}
                  </p>
                  <pre className="text-xs text-foreground overflow-auto max-h-24">
                    {JSON.stringify(fileContent, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/30">
              {t('importCancelButton')}
            </button>
            <button
              type="submit"
              disabled={loading || (mode === 'file' && !fileContent) || (mode === 'manual' && !manualValue)}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? t('importSubmittingButton') : t('importSubmitButton')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
