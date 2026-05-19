'use client'

import { useState } from 'react'

const COUNTRY_OPTIONS = [
  { code: 'IQ', name: 'Iraq' },
  { code: 'AF', name: 'Afghanistan' },
  { code: 'UZ', name: 'Uzbekistan' },
  { code: 'TJ', name: 'Tajikistan' },
  { code: 'KZ', name: 'Kazakhstan' },
  { code: 'KG', name: 'Kyrgyzstan' },
  { code: 'TM', name: 'Turkmenistan' },
  { code: 'SY', name: 'Syria' },
  { code: 'JO', name: 'Jordan' },
  { code: 'LB', name: 'Lebanon' },
  { code: 'PS', name: 'Palestine' },
  { code: 'YE', name: 'Yemen' },
  { code: 'EG', name: 'Egypt' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'PK', name: 'Pakistan' },
]

export interface OrgDetailsData {
  orgName: string
  countryCode: string
  billingEmail: string
}

interface OrgDetailsStepProps {
  data: OrgDetailsData
  onChange: (data: OrgDetailsData) => void
  onNext: () => void
}

export function OrgDetailsStep({ data, onChange, onNext }: OrgDetailsStepProps) {
  const [errors, setErrors] = useState<Partial<Record<keyof OrgDetailsData, string>>>({})

  function validate(): boolean {
    const newErrors: Partial<Record<keyof OrgDetailsData, string>> = {}

    if (!data.orgName.trim() || data.orgName.trim().length < 2) {
      newErrors.orgName = 'Organization name must be at least 2 characters'
    }
    if (!data.countryCode) {
      newErrors.countryCode = 'Please select a country'
    }
    if (!data.billingEmail.trim()) {
      newErrors.billingEmail = 'Billing email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.billingEmail)) {
      newErrors.billingEmail = 'Please enter a valid email address'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (validate()) {
      onNext()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="orgName" className="mb-1 block text-sm font-medium text-text-muted">
          Organization Name
        </label>
        <input
          id="orgName"
          type="text"

          value={data.orgName}
          onChange={(e) => onChange({ ...data, orgName: e.target.value })}
          className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
          placeholder="Al-Noor Medical Center"
        />
        {errors.orgName && (
          <p className="mt-1 text-xs text-red-600">{errors.orgName}</p>
        )}
      </div>

      <div>
        <label htmlFor="countryCode" className="mb-1 block text-sm font-medium text-text-muted">
          Country
        </label>
        <select
          id="countryCode"

          value={data.countryCode}
          onChange={(e) => onChange({ ...data, countryCode: e.target.value })}
          className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
        >
          <option value="">Select a country</option>
          {COUNTRY_OPTIONS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.countryCode && (
          <p className="mt-1 text-xs text-red-600">{errors.countryCode}</p>
        )}
      </div>

      <div>
        <label htmlFor="billingEmail" className="mb-1 block text-sm font-medium text-text-muted">
          Billing Email
        </label>
        <input
          id="billingEmail"
          type="email"

          value={data.billingEmail}
          onChange={(e) => onChange({ ...data, billingEmail: e.target.value })}
          className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
          placeholder="billing@hospital.example"
        />
        {errors.billingEmail && (
          <p className="mt-1 text-xs text-red-600">{errors.billingEmail}</p>
        )}
      </div>

      <button
        type="submit"
        className="w-full rounded-full bg-brand-lime px-4 py-2 text-sm font-semibold text-black hover:brightness-95 hover:scale-[1.02] transition-all"
      >
        Next
      </button>
    </form>
  )
}
