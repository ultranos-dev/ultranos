'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { registerPatientLocally, type PatientRegistrationData } from '@/lib/patient-register'
import type { LocalPatient } from '@/lib/db'

interface PatientRegistrationFormProps {
  prefillName?: string
  onRegistered: (patient: LocalPatient) => void
  onCancel: () => void
}

export function PatientRegistrationForm({
  prefillName,
  onRegistered,
  onCancel,
}: PatientRegistrationFormProps) {
  const [form, setForm] = useState<PatientRegistrationData>({
    nameGiven: prefillName ?? '',
    gender: 'unknown',
  })
  const [allergyInput, setAllergyInput] = useState('')
  const [allergies, setAllergies] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddAllergy = () => {
    const trimmed = allergyInput.trim()
    if (trimmed && !allergies.includes(trimmed)) {
      setAllergies([...allergies, trimmed])
      setAllergyInput('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nameGiven.trim()) return

    setSaving(true)
    setError(null)
    try {
      const patient = await registerPatientLocally({
        ...form,
        allergies: allergies.length > 0 ? allergies : undefined,
      })
      onRegistered(patient)
    } catch {
      setError('Failed to register patient. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="patient-registration-form">
      <h3 className="text-lg font-semibold text-foreground">Register New Patient</h3>

      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="reg-name" className="mb-1 block text-xs font-medium text-muted-foreground">
          Patient Name <span className="text-destructive">*</span>
        </label>
        <input
          id="reg-name"
          type="text"
          required
          value={form.nameGiven}
          onChange={(e) => setForm({ ...form, nameGiven: e.target.value })}
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
          data-testid="reg-name-input"
        />
      </div>

      <div>
        <label htmlFor="reg-father" className="mb-1 block text-xs font-medium text-muted-foreground">
          Father&apos;s Name
        </label>
        <input
          id="reg-father"
          type="text"
          value={form.nameFather ?? ''}
          onChange={(e) => setForm({ ...form, nameFather: e.target.value })}
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="reg-gender" className="mb-1 block text-xs font-medium text-muted-foreground">
            Gender <span className="text-destructive">*</span>
          </label>
          <select
            id="reg-gender"
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value as PatientRegistrationData['gender'] })}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div>
          <label htmlFor="reg-birth-year" className="mb-1 block text-xs font-medium text-muted-foreground">
            Birth Year
          </label>
          <input
            id="reg-birth-year"
            type="number"
            min={1900}
            max={new Date().getFullYear()}
            value={form.birthYear ?? ''}
            onChange={(e) => setForm({ ...form, birthYear: e.target.value ? parseInt(e.target.value) : undefined })}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="reg-phone" className="mb-1 block text-xs font-medium text-muted-foreground">
          Phone Number
        </label>
        <input
          id="reg-phone"
          type="tel"
          value={form.phone ?? ''}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
        />
      </div>

      {/* Allergies — CRITICAL per CLAUDE.md rule #4 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-destructive">
          Known Allergies (enter each and press Add)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={allergyInput}
            onChange={(e) => setAllergyInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAllergy() } }}
            placeholder="e.g. Penicillin"
            className="flex-1 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm focus-visible:border-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive/30"
            data-testid="allergy-input"
          />
          <Button type="button" variant="outline" onClick={handleAddAllergy}>Add</Button>
        </div>
        {allergies.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {allergies.map((a) => (
              <Badge key={a} variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 font-bold gap-1">
                {a}
                <button
                  type="button"
                  onClick={() => setAllergies(allergies.filter((x) => x !== a))}
                  className="text-destructive hover:text-destructive/80"
                  aria-label={`Remove ${a}`}
                >
                  &times;
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="default" className="w-full" disabled={!form.nameGiven.trim() || saving}>
          {saving ? 'Registering...' : 'Register Patient'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
