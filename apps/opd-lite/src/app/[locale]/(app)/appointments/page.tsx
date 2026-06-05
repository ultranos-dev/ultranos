'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { useAppointmentStore } from '@/stores/appointment-store'
import { DayScheduleView } from '@/components/appointments/DayScheduleView'
import { WeekScheduleView } from '@/components/appointments/WeekScheduleView'

export default function AppointmentsPage() {
  const t = useTranslations('appointments')
  const { viewMode, setViewMode } = useAppointmentStore()

  return (
    <div className="mx-auto max-w-7xl px-8 py-6">
      {/* Day / Week toggle */}
      <div className="flex justify-end px-6 pb-4">
        <div className="flex overflow-hidden rounded-xl ring-[0.65px] ring-border/50">
          <Button
            variant={viewMode === 'day' ? 'primary' : 'secondary'}
            onClick={() => setViewMode('day')}
          >
            {t('dayView')}
          </Button>
          <Button
            variant={viewMode === 'week' ? 'primary' : 'secondary'}
            onClick={() => setViewMode('week')}
          >
            {t('weekView')}
          </Button>
        </div>
      </div>
      <div className="px-6 pb-6">
        {viewMode === 'day' ? <DayScheduleView /> : <WeekScheduleView />}
      </div>
    </div>
  )
}
