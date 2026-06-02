'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'

type PrescribingAnomalyLevel = 'HIGH_ONLY' | 'ALL' | 'OFF'

interface NotificationPrefs {
  kycSlaBreach: boolean
  licenseExpiry60d: boolean
  licenseExpiry30d: boolean
  licenseExpiry7d: boolean
  prescribingAnomaly: PrescribingAnomalyLevel
  auditChainIntegrity: boolean
  trialExpiry7d: boolean
  trialExpiry3d: boolean
  trialExpiry1d: boolean
}

const DEFAULT_PREFS: NotificationPrefs = {
  kycSlaBreach: true,
  licenseExpiry60d: true,
  licenseExpiry30d: true,
  licenseExpiry7d: true,
  prescribingAnomaly: 'HIGH_ONLY',
  auditChainIntegrity: true,
  trialExpiry7d: true,
  trialExpiry3d: true,
  trialExpiry1d: true,
}

export function NotificationPreferences({ email }: { email?: string }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await trpc.admin.getNotificationPreferences.query()
        setPrefs({ ...DEFAULT_PREFS, ...data })
      } catch {
        // Use defaults on failure
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await trpc.admin.updateNotificationPreferences.mutate({ preferences: prefs })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('Failed to save notification preferences.')
    } finally {
      setSaving(false)
    }
  }

  function updatePref<K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) {
    setPrefs((prev) => ({ ...prev, [key]: value }))
    setSuccess(false)
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading preferences...</p>
  }

  return (
    <div className="space-y-6">
      {/* KYC SLA breach alerts */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">KYC SLA breach alerts</p>
          <p className="text-xs text-muted-foreground">Get notified when KYC reviews exceed SLA deadlines.</p>
        </div>
        <ToggleSwitch checked={prefs.kycSlaBreach} onChange={(v) => updatePref('kycSlaBreach', v)} />
      </div>

      {/* License expiry warnings */}
      <div>
        <p className="text-sm font-medium text-foreground">License expiry warnings</p>
        <p className="text-xs text-muted-foreground mb-2">Choose when to receive license expiry reminders.</p>
        <div className="flex flex-wrap gap-4">
          <CheckboxItem label="60 days before" checked={prefs.licenseExpiry60d} onChange={(v) => updatePref('licenseExpiry60d', v)} />
          <CheckboxItem label="30 days before" checked={prefs.licenseExpiry30d} onChange={(v) => updatePref('licenseExpiry30d', v)} />
          <CheckboxItem label="7 days before" checked={prefs.licenseExpiry7d} onChange={(v) => updatePref('licenseExpiry7d', v)} />
        </div>
      </div>

      {/* Prescribing anomaly alerts */}
      <div>
        <p className="text-sm font-medium text-foreground">Prescribing anomaly alerts</p>
        <p className="text-xs text-muted-foreground mb-2">Control the severity level of prescribing anomaly notifications.</p>
        <div className="flex flex-wrap gap-4">
          {(['HIGH_ONLY', 'ALL', 'OFF'] as const).map((level) => (
            <label key={level} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="prescribingAnomaly"
                value={level}
                checked={prefs.prescribingAnomaly === level}
                onChange={() => updatePref('prescribingAnomaly', level)}
                className="accent-accent"
              />
              <span className="text-sm text-foreground">
                {level === 'HIGH_ONLY' ? 'High only' : level === 'ALL' ? 'All' : 'Off'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Audit chain integrity failure */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Audit chain integrity failure</p>
          <p className="text-xs text-muted-foreground">Alert when audit log hash chain integrity checks fail.</p>
        </div>
        <ToggleSwitch checked={prefs.auditChainIntegrity} onChange={(v) => updatePref('auditChainIntegrity', v)} />
      </div>

      {/* Trial expiry reminders */}
      <div>
        <p className="text-sm font-medium text-foreground">Trial expiry reminders</p>
        <p className="text-xs text-muted-foreground mb-2">Choose when to receive trial expiry reminders.</p>
        <div className="flex flex-wrap gap-4">
          <CheckboxItem label="7 days before" checked={prefs.trialExpiry7d} onChange={(v) => updatePref('trialExpiry7d', v)} />
          <CheckboxItem label="3 days before" checked={prefs.trialExpiry3d} onChange={(v) => updatePref('trialExpiry3d', v)} />
          <CheckboxItem label="1 day before" checked={prefs.trialExpiry1d} onChange={(v) => updatePref('trialExpiry1d', v)} />
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div role="status" className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          Preferences saved successfully.
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="rounded-full bg-brand-lime text-foreground font-semibold px-6 py-2.5 hover:scale-[1.02] transition-transform duration-200 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>

      <p className="text-xs text-muted-foreground">
        Notifications are sent to your account email{email ? ` (${email})` : ''}. To change it, update in My Account.
      </p>
    </div>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
        checked ? 'bg-primary' : 'bg-border'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

function CheckboxItem({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-accent rounded"
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  )
}
