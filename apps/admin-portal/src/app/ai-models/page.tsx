'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'
import { TopHeader } from '@/components/TopHeader'

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
  const colorMap: Record<string, string> = {
    SOAP_MACRO_TEMPLATES: 'bg-surface text-text-secondary',
    DRUG_DB_OFFLINE: 'bg-danger-subtle text-danger',
    TTS_FRAGMENT_BUNDLE: 'bg-purple-100 text-purple-800',
    ONNX_SOAP_MODEL: 'bg-warning-subtle text-warning',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[type] ?? 'bg-surface text-text-secondary'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  )
}

export default function AIModelsPage() {
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
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <>
      <TopHeader title="AI Models" description="Manage offline model bundles distributed to spoke devices." />
      <div className="mx-auto max-w-7xl px-8 py-6 space-y-6">
        <div className="flex items-start justify-end">
          <button
            onClick={() => setShowPublishForm(!showPublishForm)}
            className="rounded-full bg-accent text-text-primary font-semibold px-6 py-2.5 hover:scale-[1.02] transition-transform duration-200"
          >
            {showPublishForm ? 'Cancel' : 'Publish New Version'}
          </button>
        </div>

        {error && (
          <div className="rounded-2xl bg-danger-subtle border border-danger/20 p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-surface-raised p-6 border border-border shadow-card">
              <p className="text-sm font-medium text-text-secondary">Registered Models</p>
              <p className="text-2xl font-bold text-text-primary mt-1">{models.length}</p>
            </div>
            <div className="rounded-2xl bg-surface-raised p-6 border border-border shadow-card">
              <p className="text-sm font-medium text-text-secondary">Stale Device Events (30d)</p>
              <p className={`text-2xl font-bold mt-1 ${stats.totalStaleDeviceEvents > 0 ? 'text-warning' : 'text-success'}`}>
                {stats.totalStaleDeviceEvents}
              </p>
            </div>
            <div className="rounded-2xl bg-surface-raised p-6 border border-border shadow-card">
              <p className="text-sm font-medium text-text-secondary">Drug DB Staleness Incidents</p>
              <p className={`text-2xl font-bold mt-1 ${stats.drugDbStalenessIncidents > 0 ? 'text-danger' : 'text-success'}`}>
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
          <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Model Manifest</h2>
          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-surface">
                <tr>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary uppercase tracking-wide">Model</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary uppercase tracking-wide">Version</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary uppercase tracking-wide">Size</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary uppercase tracking-wide">Released</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary uppercase tracking-wide">Delta From</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface-raised">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-secondary">Loading...</td>
                  </tr>
                ) : models.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-secondary">No models registered yet.</td>
                  </tr>
                ) : (
                  models.map((model) => (
                    <tr key={`${model.modelId}-${model.currentVersion}`} className="hover:bg-accent-subtle transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">{model.modelId}</td>
                      <td className="px-4 py-3 text-sm"><ModelTypeBadge type={model.modelType} /></td>
                      <td className="px-4 py-3 text-sm text-text-primary font-mono">{model.currentVersion}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{formatBytes(model.fileSize)}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(model.releasedAt)}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary font-mono">{model.deltaFromVersion ?? '—'}</td>
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
            <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide mb-3">Update Statistics (Last 30 Days)</h2>
            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="min-w-full">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary uppercase tracking-wide">Model</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary uppercase tracking-wide">Success Rate</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary uppercase tracking-wide">Started</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary uppercase tracking-wide">Completed</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary uppercase tracking-wide">Failed</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary uppercase tracking-wide">Stale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface-raised">
                  {stats.modelStats.map((s) => (
                    <tr key={s.modelId} className="hover:bg-accent-subtle transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">{s.modelId}</td>
                      <td className="px-4 py-3 text-sm">
                        {s.successRate !== null ? (
                          <span className={s.successRate >= 90 ? 'text-success' : s.successRate >= 70 ? 'text-warning' : 'text-danger'}>
                            {s.successRate}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{s.started}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{s.completed}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{s.failed}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{s.staleDegraded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function PublishModelForm({ onSuccess }: { onSuccess: () => void }) {
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
        modelType: formData.modelType,
        version: formData.version,
        downloadUrl: formData.downloadUrl,
        fileSize: parseInt(formData.fileSize, 10),
        checksum: formData.checksum,
        deltaFromVersion: formData.deltaFromVersion || null,
      })
      onSuccess()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to publish')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-surface-raised border border-border p-6 space-y-4 shadow-card">
      <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wide">Publish New Model Version</h2>

      {formError && (
        <div className="rounded-2xl bg-danger-subtle border border-danger/20 p-3 text-sm text-danger">{formError}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Model ID</label>
          <input
            type="text"
            required
            value={formData.modelId}
            onChange={(e) => setFormData((p) => ({ ...p, modelId: e.target.value }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="e.g., soap-macros"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Model Type</label>
          <select
            value={formData.modelType}
            onChange={(e) => setFormData((p) => ({ ...p, modelType: e.target.value as (typeof MODEL_TYPES)[number] }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            {MODEL_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Version</label>
          <input
            type="text"
            required
            value={formData.version}
            onChange={(e) => setFormData((p) => ({ ...p, version: e.target.value }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="e.g., 2.1.0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">File Size (bytes)</label>
          <input
            type="number"
            required
            min="1"
            value={formData.fileSize}
            onChange={(e) => setFormData((p) => ({ ...p, fileSize: e.target.value }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-text-secondary mb-1">Download URL</label>
          <input
            type="url"
            required
            value={formData.downloadUrl}
            onChange={(e) => setFormData((p) => ({ ...p, downloadUrl: e.target.value }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">SHA-256 Checksum</label>
          <input
            type="text"
            required
            pattern="[a-f0-9]{64}"
            value={formData.checksum}
            onChange={(e) => setFormData((p) => ({ ...p, checksum: e.target.value }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-mono focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="64-character hex string"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Delta From Version (optional)</label>
          <input
            type="text"
            value={formData.deltaFromVersion}
            onChange={(e) => setFormData((p) => ({ ...p, deltaFromVersion: e.target.value }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            placeholder="e.g., 2.0.0"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-accent text-text-primary font-semibold px-6 py-2.5 hover:scale-[1.02] transition-transform duration-200 disabled:opacity-50"
        >
          {submitting ? 'Publishing...' : 'Publish'}
        </button>
      </div>
    </form>
  )
}
