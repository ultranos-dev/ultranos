'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useAppointments } from '@/hooks/useAppointments'
import { useAppointmentStore } from '@/stores/appointment-store'
import { PatientSummaryPopup } from './PatientSummaryPopup'
import type {
  FhirAppointmentZod,
  AppointmentServiceType,
} from '@ultranos/shared-types'

function minutesElapsed(isoTimestamp: string): number {
  const created = new Date(isoTimestamp).getTime()
  const now = Date.now()
  return Math.max(0, Math.floor((now - created) / 60_000))
}

const STATUS_BADGE_COLORS: Record<string, string> = {
  booked: 'bg-blue-100 text-blue-800',
  arrived: 'bg-amber-100 text-amber-800',
  fulfilled: 'bg-neutral-200 text-neutral-700',
  cancelled: 'bg-red-100 text-red-800',
  noshow: 'bg-red-100 text-red-800',
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
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-neutral-900">
          {t('walkInQueue')}
        </h3>
        <button
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors"
        >
          {t('addWalkIn')}
        </button>
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-3">
          <input
            type="text"
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder={t('selectPatient')}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />

          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="walkInType"
                value="walk-in"
                checked={walkInType === 'walk-in'}
                onChange={() => setWalkInType('walk-in')}
                className="text-primary-600"
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
                className="text-red-600"
              />
              {t('urgent')}
            </label>
          </div>

          <button
            type="button"
            onClick={handleAddWalkIn}
            disabled={!patientSearch.trim() || submitting}
            className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('addWalkIn')}
          </button>
        </div>
      )}

      {/* Walk-in list */}
      {walkIns.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('noWalkIns')}</p>
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
              <button
                key={walkIn.id}
                type="button"
                onClick={() => setSelectedAppointment(walkIn)}
                className="w-full rounded-lg border border-purple-200 bg-purple-50 p-3 text-start hover:bg-purple-100 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-purple-200 text-xs font-bold text-purple-800">
                      {t('queueNumber', {
                        number:
                          walkIn._ultranos.queuePosition ?? 0,
                      })}
                    </span>
                    <span className="text-sm font-semibold text-neutral-900">
                      {walkIn.participant?.[0]?.actor?.display ??
                        '\u2014'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isUrgent && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                        {t('urgent')}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_BADGE_COLORS[status] ??
                        'bg-neutral-100 text-neutral-700'
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

                <p className="mt-1 text-xs text-neutral-500">
                  {t('waitTime', { minutes: waitMinutes })}
                </p>
              </button>
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
