'use client'

/**
 * SurveillanceConfig — Story 50.3: Automated Disease Surveillance Alerts
 *
 * Settings panel to:
 *   1. Enable / disable individual reportable diseases
 *   2. Adjust spike threshold multiplier (default 2x)
 *   3. Adjust cluster threshold (cases) and window (hours)
 *
 * Visible to lab_manager only (enforced by parent LabSettingsView).
 * No PHI — operates on disease configs only.
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Shield } from '@ultranos/ui-kit/icons'
import type { ReportableDiseaseConfig } from '@/lib/surveillance-types'
import { getAllReportableDiseases, putReportableDisease } from '@/lib/db'
import { seedReportableDiseases } from '@/lib/surveillance-config'
import { reportSurveillanceAuditEvent } from '@/lib/audit-client'

export function SurveillanceConfig() {
  const t = useTranslations('surveillance')
  const [diseases, setDiseases] = useState<ReportableDiseaseConfig[]>([])
  const [loading, setLoading] = useState(true)
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    async function load() {
      try {
        // Ensure defaults are seeded before loading
        await seedReportableDiseases()
        const all = await getAllReportableDiseases()
        setDiseases(all)
      } catch {
        // Non-fatal — show empty list
      } finally {
        setLoading(false)
      }
    }
    void load()
    return () => {
      for (const timer of debounceTimers.current.values()) clearTimeout(timer)
    }
  }, [])

  const persistAndAudit = useCallback(async (updated: ReportableDiseaseConfig, field: string) => {
    await putReportableDisease(updated)
    reportSurveillanceAuditEvent({
      action: 'SURVEILLANCE_CONFIG_UPDATED',
      diseaseCode: updated.diseaseCode,
      fieldChanged: field,
    })
  }, [])

  async function handleToggle(diseaseCode: string) {
    const disease = diseases.find((d) => d.diseaseCode === diseaseCode)
    if (!disease) return
    const updated = { ...disease, isActive: !disease.isActive, updatedAt: new Date().toISOString() }
    setDiseases((prev) => prev.map((d) => (d.diseaseCode === diseaseCode ? updated : d)))
    await persistAndAudit(updated, 'isActive')
  }

  function handleFieldChange(
    diseaseCode: string,
    field: 'spikeThresholdMultiplier' | 'clusterThreshold' | 'clusterWindowHours',
    value: number,
  ) {
    const disease = diseases.find((d) => d.diseaseCode === diseaseCode)
    if (!disease) return
    if (isNaN(value) || value <= 0) return
    const updated = { ...disease, [field]: value, updatedAt: new Date().toISOString() }
    // Update UI immediately, debounce Dexie write to avoid mid-input persistence
    setDiseases((prev) => prev.map((d) => (d.diseaseCode === diseaseCode ? updated : d)))
    const timerKey = `${diseaseCode}_${field}`
    const existing = debounceTimers.current.get(timerKey)
    if (existing) clearTimeout(existing)
    debounceTimers.current.set(timerKey, setTimeout(() => {
      void persistAndAudit(updated, field)
      debounceTimers.current.delete(timerKey)
    }, 500))
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t('loading')}</p>
  }

  if (diseases.length === 0) {
    return <p className="text-sm text-muted-foreground">No reportable diseases configured.</p>
  }

  return (
    <div className="space-y-3" data-testid="surveillance-config">
      {diseases.map((disease) => (
        <div
          key={disease.diseaseCode}
          className={`rounded-lg border p-3 transition-colors ${
            disease.isActive
              ? 'border-blue-200 bg-blue-50/40'
              : 'border-border bg-muted/30 opacity-70'
          }`}
          data-testid={`disease-row-${disease.diseaseCode}`}
        >
          {/* Header row: name + active toggle */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-foreground truncate">
                {disease.diseaseLabel}
              </span>
              {disease.isIhrReportable && (
                <span
                  title={t('ihrReportable')}
                  className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 leading-none"
                >
                  IHR
                </span>
              )}
              <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
                {disease.diseaseCode}
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={disease.isActive}
              aria-label={`${t('activeToggle')} ${disease.diseaseLabel}`}
              data-testid={`disease-toggle-${disease.diseaseCode}`}
              onClick={() => void handleToggle(disease.diseaseCode)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                disease.isActive ? 'bg-blue-600' : 'bg-muted'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-card shadow transition-transform ${
                  disease.isActive ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Threshold fields — only shown when active */}
          {disease.isActive && (
            <div className="grid grid-cols-3 gap-2 mt-1">
              {/* Spike threshold multiplier */}
              <div className="flex flex-col gap-0.5">
                <label
                  htmlFor={`spike-threshold-${disease.diseaseCode}`}
                  className="text-[11px] text-muted-foreground"
                >
                  {t('spikeThreshold')}
                </label>
                <input
                  id={`spike-threshold-${disease.diseaseCode}`}
                  type="number"
                  min={1.1}
                  max={10}
                  step={0.1}
                  value={disease.spikeThresholdMultiplier}
                  data-testid={`spike-threshold-${disease.diseaseCode}`}
                  onChange={(e) =>
                    handleFieldChange(
                      disease.diseaseCode,
                      'spikeThresholdMultiplier',
                      parseFloat(e.target.value),
                    )
                  }
                  className="w-full rounded border border-border px-2 py-1 text-xs text-end"
                />
              </div>

              {/* Cluster threshold (cases) */}
              <div className="flex flex-col gap-0.5">
                <label
                  htmlFor={`cluster-threshold-${disease.diseaseCode}`}
                  className="text-[11px] text-muted-foreground"
                >
                  {t('clusterThreshold')}
                </label>
                <input
                  id={`cluster-threshold-${disease.diseaseCode}`}
                  type="number"
                  min={2}
                  max={50}
                  step={1}
                  value={disease.clusterThreshold}
                  data-testid={`cluster-threshold-${disease.diseaseCode}`}
                  onChange={(e) =>
                    handleFieldChange(
                      disease.diseaseCode,
                      'clusterThreshold',
                      parseInt(e.target.value, 10),
                    )
                  }
                  className="w-full rounded border border-border px-2 py-1 text-xs text-end"
                />
              </div>

              {/* Cluster window (hours) */}
              <div className="flex flex-col gap-0.5">
                <label
                  htmlFor={`cluster-window-${disease.diseaseCode}`}
                  className="text-[11px] text-muted-foreground"
                >
                  {t('clusterWindow')}
                </label>
                <input
                  id={`cluster-window-${disease.diseaseCode}`}
                  type="number"
                  min={1}
                  max={168}
                  step={1}
                  value={disease.clusterWindowHours}
                  data-testid={`cluster-window-${disease.diseaseCode}`}
                  onChange={(e) =>
                    handleFieldChange(
                      disease.diseaseCode,
                      'clusterWindowHours',
                      parseInt(e.target.value, 10),
                    )
                  }
                  className="w-full rounded border border-border px-2 py-1 text-xs text-end"
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Card wrapper for use inside LabSettingsView. Manager-only. */
export function SurveillanceConfigCard() {
  const t = useTranslations('surveillance')

  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid="surveillance-config-card"
    >
      <div className="flex items-center gap-2 mb-4">
        <Shield size={16} className="text-muted-foreground shrink-0" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">{t('reportableDiseases')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('configureThresholds')}</p>
        </div>
      </div>
      <SurveillanceConfig />
    </div>
  )
}
