'use client'

import { useTranslations } from 'next-intl'
import { useAppointmentStore } from '@/stores/appointment-store'
import { DayScheduleView } from '@/components/appointments/DayScheduleView'
import { WeekScheduleView } from '@/components/appointments/WeekScheduleView'

export default function AppointmentsPage() {
  const t = useTranslations('appointments')
  const { viewMode, setViewMode } = useAppointmentStore()

  return (
    <div className="flex flex-col gap-4">
      {/* Day / Week toggle */}
      <div className="flex justify-end">
        <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          <button
            onClick={() => setViewMode('day')}
            className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('dayView')}
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('weekView')}
          </button>
        </div>
      </div>
      {viewMode === 'day' ? <DayScheduleView /> : <WeekScheduleView />}
    </div>
  )
}
