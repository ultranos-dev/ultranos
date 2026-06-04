'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
      <h3 className="text-lg font-semibold text-neutral-900">Register New Patient</h3>

      {error && (
        <div role="alert" className="rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="reg-name" className="mb-1 block text-xs font-medium text-neutral-600">
          Patient Name <span className="text-red-600">*</span>
        </label>
        <input
          id="reg-name"
          type="text"
          required
          value={form.nameGiven}
          onChange={(e) => setForm({ ...form, nameGiven: e.target.value })}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
          data-testid="reg-name-input"
        />
      </div>

      <div>
        <label htmlFor="reg-father" className="mb-1 block text-xs font-medium text-neutral-600">
          Father&apos;s Name
        </label>
        <input
          id="reg-father"
          type="text"
          value={form.nameFather ?? ''}
          onChange={(e) => setForm({ ...form, nameFather: e.target.value })}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="reg-gender" className="mb-1 block text-xs font-medium text-neutral-600">
            Gender <span className="text-red-600">*</span>
          </label>
          <select
            id="reg-gender"
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value as PatientRegistrationData['gender'] })}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div>
          <label htmlFor="reg-birth-year" className="mb-1 block text-xs font-medium text-neutral-600">
            Birth Year
          </label>
          <input
            id="reg-birth-year"
            type="number"
            min={1900}
            max={new Date().getFullYear()}
            value={form.birthYear ?? ''}
            onChange={(e) => setForm({ ...form, birthYear: e.target.value ? parseInt(e.target.value) : undefined })}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
          />
        </div>
      </div>

      <div>
        <label htmlFor="reg-phone" className="mb-1 block text-xs font-medium text-neutral-600">
          Phone Number
        </label>
        <input
          id="reg-phone"
          type="tel"
          value={form.phone ?? ''}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:border-primary-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
        />
      </div>

      {/* Allergies — CRITICAL per CLAUDE.md rule #4 */}
      <div>
        <label className="mb-1 block text-xs font-medium text-red-700">
          Known Allergies (enter each and press Add)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={allergyInput}
            onChange={(e) => setAllergyInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAllergy() } }}
            placeholder="e.g. Penicillin"
            className="flex-1 rounded-md border border-red-200 bg-red-50/30 px-3 py-2 text-sm focus-visible:border-red-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-300"
            data-testid="allergy-input"
          />
          <Button type="button" variant="outline" onClick={handleAddAllergy}>Add</Button>
        </div>
        {allergies.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {allergies.map((a) => (
              <span key={a} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                {a}
                <button
                  type="button"
                  onClick={() => setAllergies(allergies.filter((x) => x !== a))}
                  className="text-red-600 hover:text-red-900"
                  aria-label={`Remove ${a}`}
                >
                  &times;
                </button>
              </span>
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
