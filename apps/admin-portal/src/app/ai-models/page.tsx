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
    SOAP_MACRO_TEMPLATES: 'bg-blue-100 text-blue-800',
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">AI Models</h1>
        <button
          onClick={() => setShowPublishForm(!showPublishForm)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 transition-colors"
        >
          {showPublishForm ? 'Cancel' : 'Publish New Version'}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-neutral-200 p-4">
            <p className="text-sm text-neutral-500">Registered Models</p>
            <p className="text-2xl font-bold text-neutral-900">{models.length}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-4">
            <p className="text-sm text-neutral-500">Stale Device Events (30d)</p>
            <p className={`text-2xl font-bold ${stats.totalStaleDeviceEvents > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {stats.totalStaleDeviceEvents}
            </p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-4">
            <p className="text-sm text-neutral-500">Drug DB Staleness Incidents</p>
            <p className={`text-2xl font-bold ${stats.drugDbStalenessIncidents > 0 ? 'text-red-600' : 'text-green-600'}`}>
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
      <div className="rounded-lg border border-neutral-200 overflow-hidden">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-start text-xs font-medium text-neutral-500 uppercase tracking-wider">Model</th>
              <th className="px-4 py-3 text-start text-xs font-medium text-neutral-500 uppercase tracking-wider">Type</th>
              <th className="px-4 py-3 text-start text-xs font-medium text-neutral-500 uppercase tracking-wider">Version</th>
              <th className="px-4 py-3 text-start text-xs font-medium text-neutral-500 uppercase tracking-wider">Size</th>
              <th className="px-4 py-3 text-start text-xs font-medium text-neutral-500 uppercase tracking-wider">Released</th>
              <th className="px-4 py-3 text-start text-xs font-medium text-neutral-500 uppercase tracking-wider">Delta From</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-neutral-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-neutral-500">Loading...</td>
              </tr>
            ) : models.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-neutral-500">No models registered yet.</td>
              </tr>
            ) : (
              models.map((model) => (
                <tr key={`${model.modelId}-${model.currentVersion}`} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm font-medium text-neutral-900">{model.modelId}</td>
                  <td className="px-4 py-3 text-sm"><ModelTypeBadge type={model.modelType} /></td>
                  <td className="px-4 py-3 text-sm text-neutral-700 font-mono">{model.currentVersion}</td>
                  <td className="px-4 py-3 text-sm text-neutral-500">{formatBytes(model.fileSize)}</td>
                  <td className="px-4 py-3 text-sm text-neutral-500">{formatDate(model.releasedAt)}</td>
                  <td className="px-4 py-3 text-sm text-neutral-500 font-mono">{model.deltaFromVersion ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Update Stats Table */}
      {stats && stats.modelStats.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-neutral-900">Update Statistics (Last 30 days)</h2>
          <div className="rounded-lg border border-neutral-200 overflow-hidden">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-4 py-3 text-start text-xs font-medium text-neutral-500 uppercase">Model</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-neutral-500 uppercase">Success Rate</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-neutral-500 uppercase">Started</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-neutral-500 uppercase">Completed</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-neutral-500 uppercase">Failed</th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-neutral-500 uppercase">Stale</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-neutral-200">
                {stats.modelStats.map((s) => (
                  <tr key={s.modelId}>
                    <td className="px-4 py-3 text-sm font-medium text-neutral-900">{s.modelId}</td>
                    <td className="px-4 py-3 text-sm">
                      {s.successRate !== null ? (
                        <span className={s.successRate >= 90 ? 'text-green-600' : s.successRate >= 70 ? 'text-amber-600' : 'text-red-600'}>
                          {s.successRate}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{s.started}</td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{s.completed}</td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{s.failed}</td>
                    <td className="px-4 py-3 text-sm text-neutral-500">{s.staleDegraded}</td>
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
    <form onSubmit={handleSubmit} className="rounded-lg border border-neutral-200 p-6 space-y-4 bg-neutral-50">
      <h2 className="text-lg font-semibold text-neutral-900">Publish New Model Version</h2>

      {formError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{formError}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Model ID</label>
          <input
            type="text"
            required
            value={formData.modelId}
            onChange={(e) => setFormData((p) => ({ ...p, modelId: e.target.value }))}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            placeholder="e.g., soap-macros"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Model Type</label>
          <select
            value={formData.modelType}
            onChange={(e) => setFormData((p) => ({ ...p, modelType: e.target.value as (typeof MODEL_TYPES)[number] }))}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            {MODEL_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Version</label>
          <input
            type="text"
            required
            value={formData.version}
            onChange={(e) => setFormData((p) => ({ ...p, version: e.target.value }))}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            placeholder="e.g., 2.1.0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">File Size (bytes)</label>
          <input
            type="number"
            required
            min="1"
            value={formData.fileSize}
            onChange={(e) => setFormData((p) => ({ ...p, fileSize: e.target.value }))}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-neutral-700 mb-1">Download URL</label>
          <input
            type="url"
            required
            value={formData.downloadUrl}
            onChange={(e) => setFormData((p) => ({ ...p, downloadUrl: e.target.value }))}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">SHA-256 Checksum</label>
          <input
            type="text"
            required
            pattern="[a-f0-9]{64}"
            value={formData.checksum}
            onChange={(e) => setFormData((p) => ({ ...p, checksum: e.target.value }))}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono"
            placeholder="64-character hex string"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Delta From Version (optional)</label>
          <input
            type="text"
            value={formData.deltaFromVersion}
            onChange={(e) => setFormData((p) => ({ ...p, deltaFromVersion: e.target.value }))}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            placeholder="e.g., 2.0.0"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Publishing...' : 'Publish'}
        </button>
      </div>
    </form>
  )
}
