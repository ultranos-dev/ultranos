'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { FhirAppointmentZod, AppointmentStatus } from '@ultranos/shared-types'

interface PatientSummaryPopupProps {
  appointment: FhirAppointmentZod
  onClose: () => void
  onStatusChange: (id: string, status: AppointmentStatus) => Promise<void>
  allergyStatus?: 'present' | 'none' | 'unknown'
  patientAge?: number | null
}

const STATUS_OPTIONS: AppointmentStatus[] = [
  'arrived',
  'fulfilled',
  'cancelled',
  'noshow',
]

export function PatientSummaryPopup({
  appointment,
  onClose,
  onStatusChange,
  allergyStatus = 'unknown',
  patientAge,
}: PatientSummaryPopupProps) {
  const t = useTranslations('appointments')
  const locale = useLocale()
  const router = useRouter()
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)

  const patientName =
    appointment.participant?.[0]?.actor?.display ?? '—'
  const patientRef =
    appointment.participant?.[0]?.actor?.reference ?? ''
  const patientId = patientRef.replace('Patient/', '')
  const serviceType =
    appointment.serviceType?.[0]?.code ?? '—'

  const handleStartEncounter = () => {
    router.push(`/${locale}/patient/${patientId}`)
    onClose()
  }

  const handleStatusSelect = async (status: AppointmentStatus) => {
    await onStatusChange(appointment.id, status)
    setShowStatusDropdown(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-bold text-neutral-900">
            {patientName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            aria-label="Close"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Patient info */}
        <div className="space-y-2 text-sm">
          {patientAge !== null && patientAge !== undefined && (
            <div className="flex justify-between">
              <span className="text-neutral-500">Age</span>
              <span className="font-medium text-neutral-900">
                {patientAge}
              </span>
            </div>
          )}

          {/* Safety Rule 4: Allergy data gets highest display prominence */}
          <div className="flex justify-between">
            <span className="text-neutral-500">Allergies</span>
            <span
              className={`font-semibold ${
                allergyStatus === 'present'
                  ? 'text-red-600'
                  : 'text-neutral-900'
              }`}
            >
              {allergyStatus === 'present'
                ? '⚠ Present'
                : allergyStatus === 'none'
                  ? 'None'
                  : 'Unknown'}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-neutral-500">{t('type')}</span>
            <span className="font-medium text-neutral-900">
              {serviceType}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={handleStartEncounter}
            className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
          >
            {t('startEncounter')}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              {t('changeStatus')}
            </button>

            {showStatusDropdown && (
              <div className="absolute end-0 top-full z-10 mt-1 w-40 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
                {STATUS_OPTIONS.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => handleStatusSelect(status)}
                    className="block w-full px-4 py-2 text-start text-sm text-neutral-700 hover:bg-neutral-100"
                  >
                    {status === 'arrived' && t('checkedIn')}
                    {status === 'fulfilled' && t('completed')}
                    {status === 'cancelled' && t('cancelled')}
                    {status === 'noshow' && t('noShow')}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
