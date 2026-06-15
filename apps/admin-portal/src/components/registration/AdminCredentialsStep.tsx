'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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

  if (score <= 2) return { label: 'Weak', color: 'bg-destructive', width: '33%' }
  if (score <= 4) return { label: 'Fair', color: 'bg-warning', width: '66%' }
  return { label: 'Strong', color: 'bg-primary', width: '100%' }
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
        <Label htmlFor="adminName" className="mb-1 text-muted-foreground">
          Full Name
        </Label>
        <Input
          id="adminName"
          type="text"
          value={data.adminName}
          onChange={(e) => onChange({ ...data, adminName: e.target.value })}
          placeholder="Dr. Ahmad Hassan"
        />
        {errors.adminName && (
          <p className="mt-1 text-xs text-destructive">{errors.adminName}</p>
        )}
      </div>

      <div>
        <Label htmlFor="adminEmail" className="mb-1 text-muted-foreground">
          Email
        </Label>
        <Input
          id="adminEmail"
          type="email"
          value={data.adminEmail}
          onChange={(e) => onChange({ ...data, adminEmail: e.target.value })}
          placeholder="admin@hospital.example"
          autoComplete="email"
        />
        {errors.adminEmail && (
          <p className="mt-1 text-xs text-destructive">{errors.adminEmail}</p>
        )}
      </div>

      <div>
        <Label htmlFor="adminPassword" className="mb-1 text-muted-foreground">
          Password
        </Label>
        <Input
          id="adminPassword"
          type="password"
          value={data.adminPassword}
          onChange={(e) => onChange({ ...data, adminPassword: e.target.value })}
          autoComplete="new-password"
          minLength={12}
        />
        {data.adminPassword.length > 0 && (
          <div className="mt-2">
            <div className="h-1.5 w-full rounded-full bg-neutral-200">
              <div
                className={`h-1.5 rounded-full transition-colors duration-200 ${strength.color}`}
                style={{ width: strength.width }}
              />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Strength: {strength.label}
            </p>
          </div>
        )}
        {errors.adminPassword && (
          <p className="mt-1 text-xs text-destructive">{errors.adminPassword}</p>
        )}
      </div>

      <div>
        <Label htmlFor="confirmPassword" className="mb-1 text-muted-foreground">
          Confirm Password
        </Label>
        <Input
          id="confirmPassword"
          type="password"
          value={data.confirmPassword}
          onChange={(e) => onChange({ ...data, confirmPassword: e.target.value })}
          autoComplete="new-password"
        />
        {errors.confirmPassword && (
          <p className="mt-1 text-xs text-destructive">{errors.confirmPassword}</p>
        )}
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onBack}
        >
          Back
        </Button>
        <Button type="submit" className="flex-1">
          Next
        </Button>
      </div>
    </form>
  )
}
