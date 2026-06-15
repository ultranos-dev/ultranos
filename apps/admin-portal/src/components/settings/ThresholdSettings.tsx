'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ThresholdData {
  kycReviewSlaDays: number
  controlledSubstanceDailyLimit: number
  drugFrequencyThresholdPct: number
  licenseExpiryWarningDays: number[]
}

const DEFAULTS: ThresholdData = {
  kycReviewSlaDays: 7,
  controlledSubstanceDailyLimit: 10,
  drugFrequencyThresholdPct: 20,
  licenseExpiryWarningDays: [60, 30, 7],
}

export function ThresholdSettings() {
  const [data, setData] = useState<ThresholdData>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const result = await trpc.admin.getOrgThresholds.query()
        setData({ ...DEFAULTS, ...result })
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
      await trpc.admin.updateOrgThresholds.mutate(data)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('Failed to save thresholds.')
    } finally {
      setSaving(false)
    }
  }

  function updateField<K extends keyof ThresholdData>(key: K, value: ThresholdData[K]) {
    setData((prev) => ({ ...prev, [key]: value }))
    setSuccess(false)
  }

  function updateWarningBand(index: number, value: number) {
    const updated = [...data.licenseExpiryWarningDays]
    updated[index] = value
    updateField('licenseExpiryWarningDays', updated)
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading thresholds...</p>
  }

  return (
    <div className="space-y-4">
      {/* KYC Review SLA */}
      <div>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">KYC Review SLA (days)</span>
          <Input
            type="number"
            min={1}
            max={30}
            value={data.kycReviewSlaDays}
            onChange={(e) => updateField('kycReviewSlaDays', Number(e.target.value))}
            className="mt-1"
          />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">Days before a pending KYC submission is flagged as SLA-breached</p>
      </div>

      {/* Controlled Substance Daily Limit */}
      <div>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Controlled Substance Daily Limit</span>
          <Input
            type="number"
            min={1}
            max={100}
            value={data.controlledSubstanceDailyLimit}
            onChange={(e) => updateField('controlledSubstanceDailyLimit', Number(e.target.value))}
            className="mt-1"
          />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">Prescriptions per day per provider before triggering anomaly alert</p>
      </div>

      {/* Drug Frequency Threshold */}
      <div>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Drug Frequency Threshold (%)</span>
          <Input
            type="number"
            min={1}
            max={100}
            value={data.drugFrequencyThresholdPct}
            onChange={(e) => updateField('drugFrequencyThresholdPct', Number(e.target.value))}
            className="mt-1"
          />
        </label>
        <p className="mt-1 text-xs text-muted-foreground">Percentage of patients receiving same drug in 7 days before alert</p>
      </div>

      {/* License Expiry Warning Bands */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">License Expiry Warning Bands</p>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-warning">Yellow (days)</span>
            <Input
              type="number"
              min={1}
              max={365}
              value={data.licenseExpiryWarningDays[0] ?? 60}
              onChange={(e) => updateWarningBand(0, Number(e.target.value))}
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-orange-500">Orange (days)</span>
            <Input
              type="number"
              min={1}
              max={365}
              value={data.licenseExpiryWarningDays[1] ?? 30}
              onChange={(e) => updateWarningBand(1, Number(e.target.value))}
              className="mt-1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-destructive">Red (days)</span>
            <Input
              type="number"
              min={1}
              max={365}
              value={data.licenseExpiryWarningDays[2] ?? 7}
              onChange={(e) => updateWarningBand(2, Number(e.target.value))}
              className="mt-1"
            />
          </label>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div role="status" className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          Thresholds saved successfully.
        </div>
      )}

      <Button
        type="button"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Thresholds'}
      </Button>
    </div>
  )
}
