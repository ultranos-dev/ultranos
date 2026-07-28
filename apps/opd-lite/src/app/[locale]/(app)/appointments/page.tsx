'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarPlus } from '@ultranos/ui-kit/icons'
import { useAppointmentStore } from '@/stores/appointment-store'
import { DayScheduleView } from '@/components/appointments/DayScheduleView'
import { WeekScheduleView } from '@/components/appointments/WeekScheduleView'
import { BookingModal } from '@/components/appointments/BookingModal'
import { Button } from '@/components/ui/Button'

export default function AppointmentsPage() {
  const t = useTranslations('appointments')
  const tNav = useTranslations('sidebar')
  const { viewMode, setViewMode } = useAppointmentStore()
  const [bookOpen, setBookOpen] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      {/* Page header: title (left) + book action & Day/Week toggle (right) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-foreground">{tNav('appointments')}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => setBookOpen(true)} className="gap-2">
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            {t('bookAppointment')}
          </Button>
          <div className="flex gap-1 rounded-full border border-border bg-card p-1 w-fit">
          <button
            type="button"
            onClick={() => setViewMode('day')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'day' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('dayView')}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              viewMode === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('weekView')}
          </button>
          </div>
        </div>
      </div>
      {viewMode === 'day' ? <DayScheduleView /> : <WeekScheduleView />}

      <BookingModal isOpen={bookOpen} onClose={() => setBookOpen(false)} />
    </div>
  )
}
