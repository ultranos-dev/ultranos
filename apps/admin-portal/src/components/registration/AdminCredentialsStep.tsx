'use client'

import { useState } from 'react'

export interface AdminCredentialsData {
  adminName: string
  adminEmail: string
  adminPassword: string
  confirmPassword: string
}

interface AdminCredentialsStepProps {
  data: AdminCredentialsData
  onChange: (data: AdminCredentialsData) => void
  onNext: () => void
  onBack: () => void
}

function getPasswordStrength(password: string): { label: string; color: string; width: string } {
  if (password.length === 0) return { label: '', color: '', width: '0%' }
  let score = 0
  if (password.length >= 12) score++
  if (password.length >= 16) score++
  if (/[A-Z]/.test(password)) score++
  if (/[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 2) return { label: 'Weak', color: 'bg-red-500', width: '33%' }
  if (score <= 4) return { label: 'Fair', color: 'bg-amber-500', width: '66%' }
  return { label: 'Strong', color: 'bg-brand-lime', width: '100%' }
}

export function AdminCredentialsStep({ data, onChange, onNext, onBack }: AdminCredentialsStepProps) {
  const [errors, setErrors] = useState<Partial<Record<keyof AdminCredentialsData, string>>>({})

  const strength = getPasswordStrength(data.adminPassword)

  function validate(): boolean {
    const newErrors: Partial<Record<keyof AdminCredentialsData, string>> = {}

    if (!data.adminName.trim() || data.adminName.trim().length < 2) {
      newErrors.adminName = 'Full name must be at least 2 characters'
    }
    if (!data.adminEmail.trim()) {
      newErrors.adminEmail = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.adminEmail)) {
      newErrors.adminEmail = 'Please enter a valid email address'
    }
    if (data.adminPassword.length < 12) {
      newErrors.adminPassword = 'Password must be at least 12 characters'
    }
    if (data.adminPassword !== data.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
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
        <label htmlFor="adminName" className="mb-1 block text-sm font-medium text-text-muted">
          Full Name
        </label>
        <input
          id="adminName"
          type="text"

          value={data.adminName}
          onChange={(e) => onChange({ ...data, adminName: e.target.value })}
          className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
          placeholder="Dr. Ahmad Hassan"
        />
        {errors.adminName && (
          <p className="mt-1 text-xs text-red-600">{errors.adminName}</p>
        )}
      </div>

      <div>
        <label htmlFor="adminEmail" className="mb-1 block text-sm font-medium text-text-muted">
          Email
        </label>
        <input
          id="adminEmail"
          type="email"

          value={data.adminEmail}
          onChange={(e) => onChange({ ...data, adminEmail: e.target.value })}
          className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
          placeholder="admin@hospital.example"
          autoComplete="email"
        />
        {errors.adminEmail && (
          <p className="mt-1 text-xs text-red-600">{errors.adminEmail}</p>
        )}
      </div>

      <div>
        <label htmlFor="adminPassword" className="mb-1 block text-sm font-medium text-text-muted">
          Password
        </label>
        <input
          id="adminPassword"
          type="password"

          value={data.adminPassword}
          onChange={(e) => onChange({ ...data, adminPassword: e.target.value })}
          className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
          autoComplete="new-password"
          minLength={12}
        />
        {data.adminPassword.length > 0 && (
          <div className="mt-2">
            <div className="h-1.5 w-full rounded-full bg-neutral-200">
              <div
                className={`h-1.5 rounded-full transition-all ${strength.color}`}
                style={{ width: strength.width }}
              />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Strength: {strength.label}
            </p>
          </div>
        )}
        {errors.adminPassword && (
          <p className="mt-1 text-xs text-red-600">{errors.adminPassword}</p>
        )}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-text-muted">
          Confirm Password
        </label>
        <input
          id="confirmPassword"
          type="password"

          value={data.confirmPassword}
          onChange={(e) => onChange({ ...data, confirmPassword: e.target.value })}
          className="w-full rounded-xl border border-border px-4 py-2.5 text-sm focus:border-brand-lime focus:outline-none focus:ring-2 focus:ring-brand-lime/30"
          autoComplete="new-password"
        />
        {errors.confirmPassword && (
          <p className="mt-1 text-xs text-red-600">{errors.confirmPassword}</p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-full border border-black px-4 py-2 text-sm font-medium text-text-muted hover:scale-[1.02] transition-all"
        >
          Back
        </button>
        <button
          type="submit"
          className="flex-1 rounded-full bg-brand-lime px-4 py-2 text-sm font-semibold text-black hover:brightness-95 hover:scale-[1.02] transition-all"
        >
          Next
        </button>
      </div>
    </form>
  )
}
