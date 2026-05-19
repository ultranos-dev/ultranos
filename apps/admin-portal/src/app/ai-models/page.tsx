'use client'

import { useEffect, useState, useCallback } from 'react'
import { trpc } from '@/lib/trpc'

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
    SOAP_MACRO_TEMPLATES: 'bg-neutral-100 text-neutral-600',
    DRUG_DB_OFFLINE: 'bg-red-100 text-red-800',
    TTS_FRAGMENT_BUNDLE: 'bg-purple-100 text-purple-800',
    ONNX_SOAP_MODEL: 'bg-amber-100 text-amber-800',
  }

  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${colorMap[type] ?? 'bg-neutral-100 text-neutral-600'}`}>
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
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-black">AI Models</h1>
          <div className="wavy-divider mt-2" />
          <p className="mt-4 text-text-muted">Manage offline model bundles distributed to spoke devices.</p>
        </div>
        <button
          onClick={() => setShowPublishForm(!showPublishForm)}
          className="rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 hover:scale-[1.02] transition-all"
        >
          {showPublishForm ? 'Cancel' : 'Publish New Version'}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-3xl bg-white p-5 border border-border">
            <p className="text-sm font-medium text-text-muted">Registered Models</p>
            <p className="text-2xl font-bold text-black mt-1">{models.length}</p>
          </div>
          <div className="rounded-3xl bg-white p-5 border border-border">
            <p className="text-sm font-medium text-text-muted">Stale Device Events (30d)</p>
            <p className={`text-2xl font-bold mt-1 ${stats.totalStaleDeviceEvents > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {stats.totalStaleDeviceEvents}
            </p>
          </div>
          <div className="rounded-3xl bg-white p-5 border border-border">
            <p className="text-sm font-medium text-text-muted">Drug DB Staleness Incidents</p>
            <p className={`text-2xl font-bold mt-1 ${stats.drugDbStalenessIncidents > 0 ? 'text-red-600' : 'text-green-600'}`}>
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
        <h2 className="text-sm font-semibold text-black uppercase tracking-wide mb-3">Model Manifest</h2>
        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-black">
              <tr>
                <th className="px-4 py-3 text-start text-xs font-medium text-white uppercase tracking-wider">Model</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-white uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-white uppercase tracking-wider">Version</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-white uppercase tracking-wider">Size</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-white uppercase tracking-wider">Released</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-white uppercase tracking-wider">Delta From</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">Loading...</td>
                </tr>
              ) : models.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">No models registered yet.</td>
                </tr>
              ) : (
                models.map((model) => (
                  <tr key={`${model.modelId}-${model.currentVersion}`} className="hover:bg-brand-lime/5 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-black">{model.modelId}</td>
                    <td className="px-4 py-3 text-sm"><ModelTypeBadge type={model.modelType} /></td>
                    <td className="px-4 py-3 text-sm text-black font-mono">{model.currentVersion}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">{formatBytes(model.fileSize)}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">{formatDate(model.releasedAt)}</td>
                    <td className="px-4 py-3 text-sm text-text-muted font-mono">{model.deltaFromVersion ?? '—'}</td>
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
          <h2 className="text-sm font-semibold text-black uppercase tracking-wide mb-3">Update Statistics (Last 30 Days)</h2>
          <div className="rounded-2xl border border-border overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-black">
                <tr>
                  <th className="px-4 py-3 text-start text-xs font-medium text-white uppercase tracking-wider">Model</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-white uppercase tracking-wider">Success Rate</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-white uppercase tracking-wider">Started</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-white uppercase tracking-wider">Completed</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-white uppercase tracking-wider">Failed</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-white uppercase tracking-wider">Stale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {stats.modelStats.map((s) => (
                  <tr key={s.modelId} className="hover:bg-brand-lime/5 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-black">{s.modelId}</td>
                    <td className="px-4 py-3 text-sm">
                      {s.successRate !== null ? (
                        <span className={s.successRate >= 90 ? 'text-green-600' : s.successRate >= 70 ? 'text-amber-600' : 'text-red-600'}>
                          {s.successRate}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-muted">{s.started}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">{s.completed}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">{s.failed}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">{s.staleDegraded}</td>
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
    <form onSubmit={handleSubmit} className="rounded-3xl bg-white border border-border p-6 space-y-4">
      <h2 className="text-sm font-semibold text-black uppercase tracking-wide">Publish New Model Version</h2>

      {formError && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{formError}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">Model ID</label>
          <input
            type="text"
            required
            value={formData.modelId}
            onChange={(e) => setFormData((p) => ({ ...p, modelId: e.target.value }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
            placeholder="e.g., soap-macros"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">Model Type</label>
          <select
            value={formData.modelType}
            onChange={(e) => setFormData((p) => ({ ...p, modelType: e.target.value as (typeof MODEL_TYPES)[number] }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
          >
            {MODEL_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">Version</label>
          <input
            type="text"
            required
            value={formData.version}
            onChange={(e) => setFormData((p) => ({ ...p, version: e.target.value }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
            placeholder="e.g., 2.1.0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">File Size (bytes)</label>
          <input
            type="number"
            required
            min="1"
            value={formData.fileSize}
            onChange={(e) => setFormData((p) => ({ ...p, fileSize: e.target.value }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-text-muted mb-1">Download URL</label>
          <input
            type="url"
            required
            value={formData.downloadUrl}
            onChange={(e) => setFormData((p) => ({ ...p, downloadUrl: e.target.value }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">SHA-256 Checksum</label>
          <input
            type="text"
            required
            pattern="[a-f0-9]{64}"
            value={formData.checksum}
            onChange={(e) => setFormData((p) => ({ ...p, checksum: e.target.value }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-mono focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
            placeholder="64-character hex string"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-muted mb-1">Delta From Version (optional)</label>
          <input
            type="text"
            value={formData.deltaFromVersion}
            onChange={(e) => setFormData((p) => ({ ...p, deltaFromVersion: e.target.value }))}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
            placeholder="e.g., 2.0.0"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-brand-lime text-black font-semibold px-6 py-2.5 hover:brightness-95 hover:scale-[1.02] transition-all disabled:opacity-50"
        >
          {submitting ? 'Publishing...' : 'Publish'}
        </button>
      </div>
    </form>
  )
}
