'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Users } from '@ultranos/ui-kit/icons'
import { EmptyState } from '@ultranos/ui-kit/components/ui/empty-state'
import { Button } from '@/components/ui/Button'
import { useAppointments } from '@/hooks/useAppointments'
import { useAppointmentStore } from '@/stores/appointment-store'
import { PatientSummaryPopup } from './PatientSummaryPopup'
import { STATUS_BADGE_COLORS } from '@/lib/appointment-colors'
import type {
  FhirAppointmentZod,
  AppointmentServiceType,
} from '@ultranos/shared-types'

function minutesElapsed(isoTimestamp: string): number {
  const created = new Date(isoTimestamp).getTime()
  const now = Date.now()
  return Math.max(0, Math.floor((now - created) / 60_000))
}

export function WalkInQueue() {
  const t = useTranslations('appointments')
  const { selectedDate } = useAppointmentStore()
  const { appointments, addWalkIn, updateStatus } =
    useAppointments(selectedDate)

  const [selectedAppointment, setSelectedAppointment] =
    useState<FhirAppointmentZod | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [patientSearch, setPatientSearch] = useState('')
  const [walkInType, setWalkInType] =
    useState<AppointmentServiceType>('walk-in')
  const [submitting, setSubmitting] = useState(false)

  const walkIns = useMemo(
    () =>
      appointments
        .filter((a) => a._ultranos.walkIn)
        .sort(
          (a, b) =>
            (a._ultranos.queuePosition ?? 0) -
            (b._ultranos.queuePosition ?? 0),
        ),
    [appointments],
  )

  const handleAddWalkIn = async () => {
    const name = patientSearch.trim()
    if (!name) return

    setSubmitting(true)
    try {
      // Use name as both ref and display for offline-first;
      // real patient lookup would resolve a proper ID
      await addWalkIn(crypto.randomUUID(), name, walkInType)
      setPatientSearch('')
      setWalkInType('walk-in')
      setShowAddForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-xl ring-[0.65px] ring-border/50 bg-background p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-foreground">
          {t('walkInQueue')}
        </h3>
        <Button
          variant="primary"
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {t('addWalkIn')}
        </Button>
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <div className="mb-4 rounded-xl ring-[0.65px] ring-border/50 bg-muted p-3 space-y-3">
          <input
            type="text"
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder={t('selectPatient')}
            className="w-full rounded-xl border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
          />

          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="walkInType"
                value="walk-in"
                checked={walkInType === 'walk-in'}
                onChange={() => setWalkInType('walk-in')}
                className="text-primary"
              />
              {t('walkIn')}
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="walkInType"
                value="urgent"
                checked={walkInType === 'urgent'}
                onChange={() => setWalkInType('urgent')}
                className="text-destructive"
              />
              {t('urgent')}
            </label>
          </div>

          <Button
            variant="primary"
            type="button"
            onClick={handleAddWalkIn}
            disabled={!patientSearch.trim() || submitting}
          >
            {t('addWalkIn')}
          </Button>
        </div>
      )}

      {/* Walk-in list */}
      {walkIns.length === 0 ? (
        <div className="flex min-h-[12rem] items-center justify-center">
          <EmptyState icon={Users} title={t('noWalkIns')} />
        </div>
      ) : (
        <div className="space-y-2">
          {walkIns.map((walkIn) => {
            const isUrgent =
              walkIn.serviceType?.[0]?.code === 'urgent'
            const waitMinutes = minutesElapsed(
              walkIn._ultranos.createdAt,
            )
            const status = walkIn.status

            return (
              <Button
                key={walkIn.id}
                variant="ghost"
                type="button"
                onClick={() => setSelectedAppointment(walkIn)}
                className="w-full rounded-xl border border-border bg-muted/50 p-3 text-start hover:bg-muted"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
                      {t('queueNumber', {
                        number:
                          walkIn._ultranos.queuePosition ?? 0,
                      })}
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {walkIn.participant?.[0]?.actor?.display ??
                        '\u2014'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isUrgent && (
                      <span className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-semibold text-destructive">
                        {t('urgent')}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_BADGE_COLORS[status] ??
                        'bg-muted text-foreground'
                      }`}
                    >
                      {status === 'booked' && t('booked')}
                      {status === 'arrived' && t('checkedIn')}
                      {status === 'fulfilled' && t('completed')}
                      {status === 'cancelled' && t('cancelled')}
                      {status === 'noshow' && t('noShow')}
                    </span>
                  </div>
                </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  {t('waitTime', { minutes: waitMinutes })}
                </p>
              </Button>
            )
          })}
        </div>
      )}

      {/* Patient summary popup */}
      {selectedAppointment && (
        <PatientSummaryPopup
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onStatusChange={updateStatus}
        />
      )}
    </div>
  )
}
