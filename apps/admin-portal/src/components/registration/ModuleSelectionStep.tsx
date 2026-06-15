'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export interface ModuleOption {
  code: string
  name: string
  description: string
}

const AVAILABLE_MODULES: ModuleOption[] = [
  {
    code: 'OPD_LITE',
    name: 'OPD Lite',
    description: 'Outpatient clinical workflows — SOAP notes, prescriptions, patient encounters',
  },
  {
    code: 'PHARMACY_LITE',
    name: 'Pharmacy Lite',
    description: 'Medication dispensing, stock management, and prescription verification',
  },
  {
    code: 'LAB_LITE',
    name: 'Lab Lite',
    description: 'Lab result entry, patient verification, and diagnostic report delivery',
  },
]

interface ModuleSelectionStepProps {
  selectedModules: string[]
  onChange: (modules: string[]) => void
  onSubmit: () => void
  onBack: () => void
  loading: boolean
}

export function ModuleSelectionStep({
  selectedModules,
  onChange,
  onSubmit,
  onBack,
  loading,
}: ModuleSelectionStepProps) {
  const [error, setError] = useState<string | null>(null)

  function toggleModule(code: string) {
    if (selectedModules.includes(code)) {
      onChange(selectedModules.filter((m) => m !== code))
    } else {
      onChange([...selectedModules, code])
    }
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedModules.length === 0) {
      setError('Please select at least one module to continue')
      return
    }
    onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select the modules your organization needs. You can add or remove modules later from the Subscription Dashboard.
      </p>

      <div className="space-y-3">
        {AVAILABLE_MODULES.map((mod) => {
          const isSelected = selectedModules.includes(mod.code)
          return (
            <label
              key={mod.code}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors duration-200 ${
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleModule(mod.code)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
              />
              <div>
                <span className="text-sm font-medium text-foreground">{mod.name}</span>
                <p className="mt-0.5 text-xs text-muted-foreground">{mod.description}</p>
              </div>
            </label>
          )
        })}
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      )}

      <p className="text-xs text-muted-foreground">
        All modules include a 30-day free trial. No payment required during trial.
      </p>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onBack}
          disabled={loading}
        >
          Back
        </Button>
        <Button
          type="submit"
          className="flex-1"
          disabled={loading}
        >
          {loading ? 'Creating account\u2026' : 'Complete Registration'}
        </Button>
      </div>
    </form>
  )
}
