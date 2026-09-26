'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, Trash2, AlertCircle } from '@ultranos/ui-kit/icons'
import { Input } from '@ultranos/ui-kit/components/ui/input'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/Card'

export type AllergyCriticality = 'low' | 'high' | 'unable-to-assess'

export interface AllergyEntry {
  substanceText: string
  criticality?: AllergyCriticality
}

interface AllergiesSectionProps {
  noKnownAllergies: boolean
  allergies: AllergyEntry[]
  onNoKnownAllergiesChange: (value: boolean) => void
  onAllergiesChange: (allergies: AllergyEntry[]) => void
}

const CRITICALITY_OPTIONS: { value: AllergyCriticality; labelKey: string }[] = [
  { value: 'unable-to-assess', labelKey: 'allergyCriticalityUnknown' },
  { value: 'low',              labelKey: 'allergyCriticalityLow' },
  { value: 'high',             labelKey: 'allergyCriticalityHigh' },
]

/**
 * Registration-time allergy capture (Safety Rule #4/#5). Lightweight: a
 * "No known allergies" affirmation OR a list of free-text substances with a
 * coarse criticality. Recorded unconfirmed / unable-to-assess until a clinician
 * verifies. Rendered with a destructive-tinted header for safety prominence and
 * never collapsed.
 */
export function AllergiesSection({
  noKnownAllergies,
  allergies,
  onNoKnownAllergiesChange,
  onAllergiesChange,
}: AllergiesSectionProps) {
  const t = useTranslations('registration')
  const [keys, setKeys] = useState<string[]>(() => allergies.map(() => crypto.randomUUID()))

  function addAllergy() {
    if (allergies.length >= 20) return
    onNoKnownAllergiesChange(false)
    onAllergiesChange([...allergies, { substanceText: '', criticality: 'unable-to-assess' }])
    setKeys((prev) => [...prev, crypto.randomUUID()])
  }

  function removeAllergy(index: number) {
    onAllergiesChange(allergies.filter((_, i) => i !== index))
    setKeys((prev) => prev.filter((_, i) => i !== index))
  }

  function updateAllergy(index: number, patch: Partial<AllergyEntry>) {
    onAllergiesChange(allergies.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  }

  function toggleNoKnown(checked: boolean) {
    onNoKnownAllergiesChange(checked)
    if (checked) {
      onAllergiesChange([])
      setKeys([])
    }
  }

  return (
    <Card as="fieldset">
      <legend className="flex items-center gap-2 text-base font-bold text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t('allergiesSection')}
      </legend>

      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('allergiesHelp')}</p>

        {/* No known allergies affirmation */}
        <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={noKnownAllergies}
            onChange={(e) => toggleNoKnown(e.target.checked)}
            className="h-5 w-5 rounded border-border text-primary focus:ring-ring"
          />
          <span className="text-sm font-medium text-foreground">
            {t('noKnownAllergies')}
          </span>
        </label>

        {allergies.map((allergy, index) => (
          <div
            key={keys[index] ?? index}
            className="rounded-xl bg-destructive/5 p-4 space-y-3 ring-[0.65px] ring-destructive/20"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {t('allergyN', { n: index + 1 })}
              </p>
              <Button
                variant="icon"
                type="button"
                onClick={() => removeAllergy(index)}
                aria-label={t('removeAllergy')}
              >
                <Trash2 size={16} />
              </Button>
            </div>

            {/* Substance */}
            <div>
              <label
                htmlFor={`allergy-substance-${index}`}
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('allergySubstance')}
                <span className="text-destructive ms-0.5" aria-hidden="true">*</span>
              </label>
              <Input
                id={`allergy-substance-${index}`}
                type="text"
                dir="auto"
                maxLength={200}
                className="min-h-[44px]"
                placeholder={t('allergySubstancePlaceholder')}
                value={allergy.substanceText}
                onChange={(e) => updateAllergy(index, { substanceText: e.target.value })}
              />
            </div>

            {/* Criticality */}
            <div>
              <label
                htmlFor={`allergy-criticality-${index}`}
                className="mb-1 block text-sm font-semibold text-foreground"
              >
                {t('allergyCriticality')}
              </label>
              <select
                id={`allergy-criticality-${index}`}
                value={allergy.criticality ?? 'unable-to-assess'}
                onChange={(e) => updateAllergy(index, { criticality: e.target.value as AllergyCriticality })}
                className="w-full min-h-[44px] rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {CRITICALITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}

        {allergies.length < 20 && (
          <Button type="button" variant="outline" onClick={addAllergy} className="gap-1.5">
            <Plus size={16} />
            {t('addAllergy')}
          </Button>
        )}
      </div>
    </Card>
  )
}
