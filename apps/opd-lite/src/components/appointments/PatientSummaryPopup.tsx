'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { X } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
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
      <div className="mx-4 w-full max-w-sm rounded-xl bg-background p-6 shadow-xl">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-bold text-foreground">
            {patientName}
          </h3>
          <Button
            variant="icon"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Patient info */}
        <div className="space-y-2 text-sm">
          {patientAge !== null && patientAge !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Age</span>
              <span className="font-medium text-foreground">
                {patientAge}
              </span>
            </div>
          )}

          {/* Safety Rule 4: Allergy data gets highest display prominence */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Allergies</span>
            <span
              className={`font-semibold ${
                allergyStatus === 'present'
                  ? 'text-red-600'
                  : 'text-foreground'
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
            <span className="text-muted-foreground">{t('type')}</span>
            <span className="font-medium text-foreground">
              {serviceType}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          <Button
            variant="primary"
            type="button"
            onClick={handleStartEncounter}
            className="flex-1"
          >
            {t('startEncounter')}
          </Button>

          <div className="relative">
            <Button
              variant="outline"
              type="button"
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            >
              {t('changeStatus')}
            </Button>

            {showStatusDropdown && (
              <div className="absolute end-0 top-full z-10 mt-1 w-40 rounded-xl ring-[0.65px] ring-gray-400/40 bg-background py-1 shadow-lg">
                {STATUS_OPTIONS.map((status) => (
                  <Button
                    key={status}
                    variant="ghost"
                    type="button"
                    onClick={() => handleStatusSelect(status)}
                    className="block w-full px-4 py-2 text-start text-sm text-foreground hover:bg-muted"
                  >
                    {status === 'arrived' && t('checkedIn')}
                    {status === 'fulfilled' && t('completed')}
                    {status === 'cancelled' && t('cancelled')}
                    {status === 'noshow' && t('noShow')}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
