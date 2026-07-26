'use client'

import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ultranos/ui-kit/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@ultranos/ui-kit/components/ui/dropdown-menu'
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

  const patientName =
    appointment.participant?.[0]?.actor?.display ?? '·'
  const patientRef =
    appointment.participant?.[0]?.actor?.reference ?? ''
  const patientId = patientRef.replace('Patient/', '')
  const serviceType =
    appointment.serviceType?.[0]?.code ?? '·'

  const handleStartEncounter = () => {
    router.push(`/${locale}/patient/${patientId}`)
    onClose()
  }

  const handleStatusSelect = async (status: AppointmentStatus) => {
    await onStatusChange(appointment.id, status)
    onClose()
  }

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-sm">
        {/* Header */}
        <DialogHeader className="mb-4">
          <DialogTitle className="text-lg font-semibold text-foreground">
            {patientName}
          </DialogTitle>
        </DialogHeader>

        {/* Patient info */}
        <div className="space-y-2 text-sm">
          {patientAge !== null && patientAge !== undefined && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('age')}</span>
              <span className="font-medium text-foreground">
                {patientAge}
              </span>
            </div>
          )}

          {/* Safety Rule 4: Allergy data gets highest display prominence */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('allergies')}</span>
            <span
              className={`font-semibold ${
                allergyStatus === 'present'
                  ? 'text-destructive'
                  : 'text-foreground'
              }`}
            >
              {allergyStatus === 'present' ? (
                <>
                  <AlertTriangle className="inline-block h-3.5 w-3.5 me-1 align-[-2px]" aria-hidden="true" />
                  {t('allergyPresent')}
                </>
              ) : allergyStatus === 'none' ? (
                t('allergyNone')
              ) : (
                t('allergyUnknown')
              )}
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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                type="button"
              >
                {t('changeStatus')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {STATUS_OPTIONS.map((status) => (
                <DropdownMenuItem
                  key={status}
                  onSelect={() => { void handleStatusSelect(status) }}
                >
                  {status === 'arrived' && t('checkedIn')}
                  {status === 'fulfilled' && t('completed')}
                  {status === 'cancelled' && t('cancelled')}
                  {status === 'noshow' && t('noShow')}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DialogContent>
    </Dialog>
  )
}
