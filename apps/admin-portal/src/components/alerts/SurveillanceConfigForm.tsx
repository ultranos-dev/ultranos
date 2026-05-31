'use client'

import { useState, useEffect } from 'react'
import { trpc } from '@/lib/trpc'

const DEFAULT_THRESHOLDS = [
  { test_category: 'Malaria RDT', threshold_pct: 15 },
  { test_category: 'TB (Smear)', threshold_pct: 5 },
  { test_category: 'Hepatitis B', threshold_pct: 3 },
]

interface Lab {
  id: string
  name: string
  status: string
}

interface Threshold {
  test_category: string
  threshold_pct: number
}

interface Channels {
  in_app: true
  sms_phone?: string
  email?: string
}

interface SurveillanceConfigFormProps {
  onSaved?: () => void
}

export function SurveillanceConfigForm({ onSaved }: SurveillanceConfigFormProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // All org labs
  const [allLabs, setAllLabs] = useState<Lab[]>([])
  // Selected lab IDs
  const [selectedLabIds, setSelectedLabIds] = useState<Set<string>>(new Set())
  // Thresholds
  const [thresholds, setThresholds] = useState<Threshold[]>(DEFAULT_THRESHOLDS)
  // Channels
  const [channels, setChannels] = useState<Channels>({ in_app: true })
  const [smsEnabled, setSmsEnabled] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(false)

  // New category input
  const [newCategory, setNewCategory] = useState('')

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const [configResult, labsResult] = await Promise.all([
          trpc.admin.getSurveillanceConfig.query(),
          trpc.admin.listLabs.query({ page: 1, pageSize: 200 }),
        ])

        const labs = (labsResult as any).labs ?? []
        setAllLabs(labs.map((l: any) => ({ id: l.id, name: l.name, status: l.status })))

        if (configResult.config) {
          const cfg = configResult.config
          setSelectedLabIds(new Set(cfg.monitoredLabIds))
          setThresholds(cfg.thresholds.length > 0 ? cfg.thresholds : DEFAULT_THRESHOLDS)
          setChannels(cfg.channels)
          setSmsEnabled(!!cfg.channels.sms_phone)
          setEmailEnabled(!!cfg.channels.email)
        }
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load configuration')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function toggleLab(labId: string) {
    setSelectedLabIds((prev) => {
      const next = new Set(prev)
      if (next.has(labId)) next.delete(labId)
      else next.add(labId)
      return next
    })
  }

  function toggleAll() {
    if (selectedLabIds.size === allLabs.length) {
      setSelectedLabIds(new Set())
    } else {
      setSelectedLabIds(new Set(allLabs.map((l) => l.id)))
    }
  }

  function updateThreshold(index: number, field: 'test_category' | 'threshold_pct', value: string | number) {
    setThresholds((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    )
  }

  function removeThreshold(index: number) {
    setThresholds((prev) => prev.filter((_, i) => i !== index))
  }

  function addCategory() {
    const cat = newCategory.trim()
    if (!cat) return
    if (thresholds.some((t) => t.test_category === cat)) return
    setThresholds((prev) => [...prev, { test_category: cat, threshold_pct: 10 }])
    setNewCategory('')
  }

  async function handleSave() {
    setError(null)
    setSuccess(false)

    if (selectedLabIds.size === 0) {
      setError('At least one lab must be selected')
      return
    }
    if (thresholds.length === 0) {
      setError('At least one threshold must be configured')
      return
    }

    const invalidThreshold = thresholds.find(
      (t) => !t.test_category.trim() || t.threshold_pct < 0 || t.threshold_pct > 100,
    )
    if (invalidThreshold) {
      setError('All thresholds must have a category name and a percentage between 0-100')
      return
    }

    if (smsEnabled && !channels.sms_phone?.match(/^\+[1-9]\d{1,14}$/)) {
      setError('SMS phone number must be in E.164 format (e.g., +93701234567)')
      return
    }
    if (emailEnabled && !channels.email) {
      setError('Email address is required when email notifications are enabled')
      return
    }

    try {
      setSaving(true)
      await trpc.admin.updateSurveillanceConfig.mutate({
        monitoredLabIds: Array.from(selectedLabIds),
        thresholds,
        channels: {
          in_app: true as const,
          ...(smsEnabled && channels.sms_phone ? { sms_phone: channels.sms_phone } : {}),
          ...(emailEnabled && channels.email ? { email: channels.email } : {}),
        },
      })
      setSuccess(true)
      onSaved?.()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-text-secondary py-8 text-center">Loading configuration...</div>
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-2xl bg-danger-subtle border border-danger/20 p-3 text-sm text-danger">{error}</div>
      )}
      {success && (
        <div className="rounded-2xl bg-success-subtle border border-success/20 p-3 text-sm text-success">
          Configuration saved successfully.
        </div>
      )}

      {/* Section 1: Monitored Labs */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">Monitored Labs</h3>
          <button
            onClick={toggleAll}
            className="text-sm text-accent hover:underline"
          >
            {selectedLabIds.size === allLabs.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        <div className="mt-3 max-h-60 overflow-y-auto rounded-2xl border border-border divide-y divide-border">
          {allLabs.length === 0 ? (
            <p className="p-4 text-sm text-text-secondary">No labs found in your organization.</p>
          ) : (
            allLabs.map((lab) => (
              <label
                key={lab.id}
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent-subtle transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedLabIds.has(lab.id)}
                  onChange={() => toggleLab(lab.id)}
                  className="accent-accent h-4 w-4"
                />
                <span className="text-sm font-medium text-text-primary">{lab.name}</span>
                <span
                  className={`ms-auto inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    lab.status === 'ACTIVE'
                      ? 'bg-success-subtle text-success'
                      : 'bg-warning-subtle text-warning'
                  }`}
                >
                  {lab.status}
                </span>
              </label>
            ))
          )}
        </div>
      </section>

      {/* Section 2: Positivity Rate Thresholds */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary">Positivity Rate Thresholds</h3>
        <div className="mt-3 rounded-2xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black text-white">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Test Category</th>
                <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide">Threshold (%)</th>
                <th className="px-4 py-3 text-end font-medium text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface-raised">
              {thresholds.map((t, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={t.test_category}
                      onChange={(e) => updateThreshold(i, 'test_category', e.target.value)}
                      className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={t.threshold_pct}
                        onChange={(e) => updateThreshold(i, 'threshold_pct', Number(e.target.value))}
                        className="w-24 rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
                      />
                      <span className="text-text-secondary">%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-end">
                    <button
                      onClick={() => removeThreshold(i)}
                      className="text-sm text-danger hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="New test category name"
            className="flex-1 rounded-full border border-border px-4 py-2 text-sm focus:border-accent focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCategory()
              }
            }}
          />
          <button
            onClick={addCategory}
            disabled={!newCategory.trim()}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-accent-subtle disabled:opacity-50 transition-colors"
          >
            Add Category
          </button>
        </div>
      </section>

      {/* Section 3: Notification Channels */}
      <section>
        <h3 className="text-lg font-semibold text-text-primary">Notification Channels</h3>
        <div className="mt-3 space-y-4">
          {/* In-app — always on */}
          <div className="flex items-center gap-3 rounded-2xl border border-border p-4 bg-surface">
            <input type="checkbox" checked disabled className="accent-accent h-4 w-4" />
            <div>
              <p className="text-sm font-medium text-text-primary">In-App Notifications</p>
              <p className="text-xs text-text-secondary">Always enabled</p>
            </div>
          </div>

          {/* SMS */}
          <div className="rounded-2xl border border-border p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={smsEnabled}
                onChange={(e) => {
                  setSmsEnabled(e.target.checked)
                  if (!e.target.checked) {
                    setChannels((prev) => ({ ...prev, sms_phone: undefined }))
                  }
                }}
                className="accent-accent h-4 w-4"
              />
              <div>
                <p className="text-sm font-medium text-text-primary">SMS Notifications</p>
                <p className="text-xs text-text-secondary">Receive alerts via text message</p>
              </div>
            </label>
            {smsEnabled && (
              <input
                type="tel"
                value={channels.sms_phone ?? ''}
                onChange={(e) => setChannels((prev) => ({ ...prev, sms_phone: e.target.value }))}
                placeholder="+93701234567"
                className="mt-3 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            )}
          </div>

          {/* Email */}
          <div className="rounded-2xl border border-border p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => {
                  setEmailEnabled(e.target.checked)
                  if (!e.target.checked) {
                    setChannels((prev) => ({ ...prev, email: undefined }))
                  }
                }}
                className="accent-accent h-4 w-4"
              />
              <div>
                <p className="text-sm font-medium text-text-primary">Email Notifications</p>
                <p className="text-xs text-text-secondary">Receive alerts via email</p>
              </div>
            </label>
            {emailEnabled && (
              <input
                type="email"
                value={channels.email ?? ''}
                onChange={(e) => setChannels((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="officer@district.gov"
                className="mt-3 w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            )}
          </div>
        </div>
      </section>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-brand-lime px-8 py-2.5 text-sm font-semibold text-brand-lime-contrast disabled:opacity-50 hover:scale-[1.02] transition-transform duration-200"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  )
}
