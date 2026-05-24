'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { useAppointmentStore } from '@/stores/appointment-store'
import { DayScheduleView } from '@/components/appointments/DayScheduleView'
import { WeekScheduleView } from '@/components/appointments/WeekScheduleView'

export default function AppointmentsPage() {
  const t = useTranslations('appointments')
  const { viewMode, setViewMode } = useAppointmentStore()

  return (
    <main className="mx-auto max-w-3xl ps-4 pe-4 py-8">
      <header className="mb-8">
        <Link
          href="/"
          className="mb-4 inline-block text-sm font-semibold text-primary-500 hover:underline"
        >
          &larr; Back to Dashboard
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black tracking-tight text-neutral-900">
            {t('title')}
          </h1>

          {/* Day / Week toggle */}
          <div className="flex rounded-xl ring-[0.65px] ring-gray-400/40 overflow-hidden">
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
      </header>

      {viewMode === 'day' ? (
        <DayScheduleView />
      ) : (
        <WeekScheduleView />
      )}
    </main>
  )
}
