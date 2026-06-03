'use client'

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/* ─── Static config: which controls to render per module ─── */

interface ToggleControl {
  type: 'toggle'
  key: string
  label: string
  description?: string
  defaultValue: boolean
}

interface NumberControl {
  type: 'number'
  key: string
  label: string
  description?: string
  min: number
  max: number
  defaultValue: number
}

interface DropdownControl {
  type: 'dropdown'
  key: string
  label: string
  description?: string
  options: { value: string; label: string }[]
  defaultValue: string
}

interface MultiCheckboxControl {
  type: 'multi-checkbox'
  key: string
  label: string
  description?: string
  options: { value: string; label: string }[]
  defaultValue: string[]
}

type ControlDef = ToggleControl | NumberControl | DropdownControl | MultiCheckboxControl

const MODULE_CONTROLS: Record<string, ControlDef[]> = {
  OPD_LITE: [
    {
      type: 'multi-checkbox',
      key: 'consultationLanguages',
      label: 'Consultation Languages',
      description: 'Languages available for consultation notes.',
      options: [
        { value: 'en', label: 'English' },
        { value: 'ar', label: 'Arabic' },
        { value: 'fa', label: 'Farsi' },
        { value: 'ps', label: 'Pashto' },
        { value: 'ur', label: 'Urdu' },
      ],
      defaultValue: ['en'],
    },
    {
      type: 'dropdown',
      key: 'defaultSoapTemplate',
      label: 'Default SOAP Template',
      description: 'Template used for new SOAP notes.',
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'brief', label: 'Brief' },
        { value: 'detailed', label: 'Detailed' },
      ],
      defaultValue: 'standard',
    },
    {
      type: 'toggle',
      key: 'aiAssistedNotes',
      label: 'AI-Assisted Notes',
      description: 'Enable AI suggestions when composing clinical notes.',
      defaultValue: false,
    },
  ],
  PHARMACY_LITE: [
    {
      type: 'toggle',
      key: 'requireSignatureOnDispense',
      label: 'Require Signature on Dispense',
      description: 'Require patient signature before completing dispense.',
      defaultValue: true,
    },
    {
      type: 'toggle',
      key: 'allowPartialDispense',
      label: 'Allow Partial Dispense',
      description: 'Allow dispensing a partial quantity of a prescription.',
      defaultValue: false,
    },
    {
      type: 'toggle',
      key: 'controlledSubstanceDoubleVerify',
      label: 'Controlled Substance Double Verify',
      description: 'Require a second pharmacist to verify controlled substance dispenses.',
      defaultValue: true,
    },
  ],
  LAB_LITE: [
    {
      type: 'toggle',
      key: 'autoNotifyProviderOnResult',
      label: 'Auto-Notify Provider on Result',
      description: 'Automatically notify the ordering provider when lab results are ready.',
      defaultValue: true,
    },
    {
      type: 'number',
      key: 'resultRetentionDays',
      label: 'Result Retention (days)',
      description: 'Number of days to retain lab results before archival.',
      min: 30,
      max: 3650,
      defaultValue: 365,
    },
  ],
}

/* ─── Component ─── */

interface ModuleSettingsCardProps {
  moduleCode: string
  moduleName: string
}

export function ModuleSettingsCard({ moduleCode, moduleName }: ModuleSettingsCardProps) {
  const controls = MODULE_CONTROLS[moduleCode]
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const result = await trpc.admin.getModuleSettings.query({ moduleCode })
        // Merge defaults with fetched settings
        const defaults: Record<string, unknown> = {}
        if (controls) {
          for (const ctrl of controls) {
            defaults[ctrl.key] = ctrl.defaultValue
          }
        }
        setSettings({ ...defaults, ...(result as Record<string, unknown>) })
      } catch {
        // Use defaults on failure
        const defaults: Record<string, unknown> = {}
        if (controls) {
          for (const ctrl of controls) {
            defaults[ctrl.key] = ctrl.defaultValue
          }
        }
        setSettings(defaults)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [moduleCode])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      await trpc.admin.updateModuleSettings.mutate({ moduleCode, settings })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError(`Failed to save ${moduleName} settings.`)
    } finally {
      setSaving(false)
    }
  }

  function updateSetting(key: string, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setSuccess(false)
  }

  if (!controls || controls.length === 0) {
    return (
      <div className="rounded-2xl border border-border p-4">
        <p className="text-sm font-medium text-foreground">{moduleName}</p>
        <p className="text-xs text-muted-foreground mt-1">No configurable settings for this module.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border p-4">
        <p className="text-sm text-muted-foreground">Loading {moduleName} settings...</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border p-4 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">{moduleName}</h3>

      {controls.map((ctrl) => {
        switch (ctrl.type) {
          case 'toggle':
            return (
              <div key={ctrl.key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{ctrl.label}</p>
                  {ctrl.description && <p className="text-xs text-muted-foreground">{ctrl.description}</p>}
                </div>
                <ToggleSwitch
                  checked={Boolean(settings[ctrl.key])}
                  onChange={(v) => updateSetting(ctrl.key, v)}
                />
              </div>
            )

          case 'number':
            return (
              <div key={ctrl.key}>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">{ctrl.label}</span>
                  <Input
                    type="number"
                    min={ctrl.min}
                    max={ctrl.max}
                    value={Number(settings[ctrl.key]) || ctrl.defaultValue}
                    onChange={(e) => updateSetting(ctrl.key, Number(e.target.value))}
                    className="mt-1"
                  />
                </label>
                {ctrl.description && <p className="mt-1 text-xs text-muted-foreground">{ctrl.description}</p>}
              </div>
            )

          case 'dropdown':
            return (
              <div key={ctrl.key}>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">{ctrl.label}</span>
                  <select
                    value={String(settings[ctrl.key] ?? ctrl.defaultValue)}
                    onChange={(e) => updateSetting(ctrl.key, e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-border px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {ctrl.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                {ctrl.description && <p className="mt-1 text-xs text-muted-foreground">{ctrl.description}</p>}
              </div>
            )

          case 'multi-checkbox':
            return (
              <div key={ctrl.key}>
                <p className="text-xs font-medium text-muted-foreground">{ctrl.label}</p>
                {ctrl.description && <p className="text-xs text-muted-foreground mb-1">{ctrl.description}</p>}
                <div className="flex flex-wrap gap-3 mt-1">
                  {ctrl.options.map((opt) => {
                    const current = (settings[ctrl.key] as string[]) ?? ctrl.defaultValue
                    const checked = current.includes(opt.value)
                    return (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const updated = checked
                              ? current.filter((v) => v !== opt.value)
                              : [...current, opt.value]
                            updateSetting(ctrl.key, updated)
                          }}
                          className="accent-accent rounded"
                        />
                        <span className="text-sm text-foreground">{opt.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            )

          default:
            return null
        }
      })}

      {error && (
        <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div role="status" className="rounded-2xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
          {moduleName} settings saved successfully.
        </div>
      )}

      <Button
        type="button"
        onClick={handleSave}
        disabled={saving}
      >
        {saving ? 'Saving...' : `Save ${moduleName} Settings`}
      </Button>
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
