'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import type { AIModelType } from '@ultranos/shared-types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface ModelEntry {
  modelId: string
  modelType: string
  currentVersion: string
  downloadUrl: string
  fileSize: number
  checksum: string
  releasedAt: string
  deltaFromVersion: string | null
}

interface ModelStats {
  modelId: string
  successRate: number | null
  started: number
  completed: number
  failed: number
  staleDegraded: number
}

const MODEL_TYPES = [
  'SOAP_MACRO_TEMPLATES',
  'DRUG_DB_OFFLINE',
  'TTS_FRAGMENT_BUNDLE',
  'ONNX_SOAP_MODEL',
] as const

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ModelTypeBadge({ type }: { type: string }) {
  const variantMap: Record<string, 'secondary' | 'destructive' | 'warning' | 'default'> = {
    SOAP_MACRO_TEMPLATES: 'secondary',
    DRUG_DB_OFFLINE: 'destructive',
    TTS_FRAGMENT_BUNDLE: 'default',
    ONNX_SOAP_MODEL: 'warning',
  }

  return (
    <Badge variant={variantMap[type] ?? 'secondary'}>
      {type.replace(/_/g, ' ')}
    </Badge>
  )
}

export default function AIModelsPage() {
  const t = useTranslations('aiModels')
  const [models, setModels] = useState<ModelEntry[]>([])
  const [stats, setStats] = useState<{ modelStats: ModelStats[]; totalStaleDeviceEvents: number; drugDbStalenessIncidents: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPublishForm, setShowPublishForm] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [manifestResult, statsResult] = await Promise.all([
        trpc.ai.getModelManifest.query(),
        trpc.ai.getModelUpdateStats.query(),
      ])

      setModels(manifestResult.models)
      setStats(statsResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorLoad'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <div className="flex flex-col gap-4">
        <div className="flex items-start justify-end">
          <Button onClick={() => setShowPublishForm(!showPublishForm)}>
            {showPublishForm ? t('cancelPublish') : t('publishNewVersion')}
          </Button>
        </div>

        {error && (
          <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-popover p-6 border border-border shadow-card">
              <p className="text-sm font-medium text-muted-foreground">{t('statsRegisteredModels')}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{models.length}</p>
            </div>
            <div className="rounded-2xl bg-popover p-6 border border-border shadow-card">
              <p className="text-sm font-medium text-muted-foreground">{t('statsStaleDeviceEvents')}</p>
              <p className={`text-2xl font-bold mt-1 ${stats.totalStaleDeviceEvents > 0 ? 'text-warning' : 'text-success'}`}>
                {stats.totalStaleDeviceEvents}
              </p>
            </div>
            <div className="rounded-2xl bg-popover p-6 border border-border shadow-card">
              <p className="text-sm font-medium text-muted-foreground">{t('statsDrugDbStaleness')}</p>
              <p className={`text-2xl font-bold mt-1 ${stats.drugDbStalenessIncidents > 0 ? 'text-destructive' : 'text-success'}`}>
                {stats.drugDbStalenessIncidents}
              </p>
            </div>
          </div>
        )}

        {/* Publish Form */}
        {showPublishForm && (
          <PublishModelForm
            onSuccess={() => {
              setShowPublishForm(false)
              fetchData()
            }}
          />
        )}

        {/* Model Registry Table */}
        <div>
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">{t('manifestTitle')}</h2>
          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-card">
                <tr>
                  <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('colModel')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('colType')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('colVersion')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('colSize')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('colReleased')}</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('colDeltaFrom')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-popover">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('loading')}</td>
                  </tr>
                ) : models.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">{t('noModels')}</td>
                  </tr>
                ) : (
                  models.map((model) => (
                    <tr key={`${model.modelId}-${model.currentVersion}`} className="hover:bg-primary/10 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{model.modelId}</td>
                      <td className="px-4 py-3 text-sm"><ModelTypeBadge type={model.modelType} /></td>
                      <td className="px-4 py-3 text-sm text-foreground font-mono">{model.currentVersion}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatBytes(model.fileSize)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(model.releasedAt)}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{model.deltaFromVersion ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Update Stats Table */}
        {stats && stats.modelStats.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">{t('updateStatsTitle')}</h2>
            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="min-w-full">
                <thead className="bg-card">
                  <tr>
                    <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('colModel')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('colSuccessRate')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('colStarted')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('colCompleted')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('colFailed')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('colStale')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-popover">
                  {stats.modelStats.map((s) => (
                    <tr key={s.modelId} className="hover:bg-primary/10 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{s.modelId}</td>
                      <td className="px-4 py-3 text-sm">
                        {s.successRate !== null ? (
                          <span className={s.successRate >= 90 ? 'text-success' : s.successRate >= 70 ? 'text-warning' : 'text-destructive'}>
                            {s.successRate}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{s.started}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{s.completed}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{s.failed}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{s.staleDegraded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
  )
}

function PublishModelForm({ onSuccess }: { onSuccess: () => void }) {
  const t = useTranslations('aiModels')
  const [formData, setFormData] = useState({
    modelId: '',
    modelType: 'SOAP_MACRO_TEMPLATES' as (typeof MODEL_TYPES)[number],
    version: '',
    downloadUrl: '',
    fileSize: '',
    checksum: '',
    deltaFromVersion: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setFormError(null)

    try {
      await trpc.ai.publishModelVersion.mutate({
        modelId: formData.modelId,
        modelType: formData.modelType as AIModelType,
        version: formData.version,
        downloadUrl: formData.downloadUrl,
        fileSize: parseInt(formData.fileSize, 10),
        checksum: formData.checksum,
        deltaFromVersion: formData.deltaFromVersion || null,
      })
      onSuccess()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t('publishError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-popover border border-border p-6 space-y-4 shadow-card">
      <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">{t('publishFormTitle')}</h2>

      {formError && (
        <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{formError}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">{t('publishModelId')}</label>
          <Input
            type="text"
            required
            value={formData.modelId}
            onChange={(e) => setFormData((p) => ({ ...p, modelId: e.target.value }))}
            placeholder={t('publishModelIdPlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">{t('publishModelType')}</label>
          <select
            value={formData.modelType}
            onChange={(e) => setFormData((p) => ({ ...p, modelType: e.target.value as (typeof MODEL_TYPES)[number] }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {MODEL_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">{t('publishVersion')}</label>
          <Input
            type="text"
            required
            value={formData.version}
            onChange={(e) => setFormData((p) => ({ ...p, version: e.target.value }))}
            placeholder={t('publishVersionPlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">{t('publishFileSize')}</label>
          <Input
            type="number"
            required
            min="1"
            value={formData.fileSize}
            onChange={(e) => setFormData((p) => ({ ...p, fileSize: e.target.value }))}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-muted-foreground mb-1">{t('publishDownloadUrl')}</label>
          <Input
            type="url"
            required
            value={formData.downloadUrl}
            onChange={(e) => setFormData((p) => ({ ...p, downloadUrl: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">{t('publishChecksum')}</label>
          <Input
            type="text"
            required
            pattern="[a-f0-9]{64}"
            value={formData.checksum}
            onChange={(e) => setFormData((p) => ({ ...p, checksum: e.target.value }))}
            className="font-mono"
            placeholder={t('publishChecksumPlaceholder')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-1">{t('publishDeltaFrom')}</label>
          <Input
            type="text"
            value={formData.deltaFromVersion}
            onChange={(e) => setFormData((p) => ({ ...p, deltaFromVersion: e.target.value }))}
            placeholder={t('publishDeltaFromPlaceholder')}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? t('publishing') : t('publishButton')}
        </Button>
      </div>
    </form>
  )
}
