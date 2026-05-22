'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AuthGuard } from '@/components/AuthGuard'
import { SessionTimeoutWrapper } from '@/components/SessionTimeoutWrapper'
import { useAppointmentStore } from '@/stores/appointment-store'
import { DayScheduleView } from '@/components/appointments/DayScheduleView'
import { WeekScheduleView } from '@/components/appointments/WeekScheduleView'

export default function AppointmentsPage() {
  const t = useTranslations('appointments')
  const { viewMode, setViewMode } = useAppointmentStore()

  return (
    <AuthGuard>
      <SessionTimeoutWrapper>
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
              <div className="flex rounded-lg border border-neutral-300 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setViewMode('day')}
                  className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
                    viewMode === 'day'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  {t('dayView')}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('week')}
                  className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
                    viewMode === 'week'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  {t('weekView')}
                </button>
              </div>
            </div>
          </header>

          {viewMode === 'day' ? (
            <DayScheduleView />
          ) : (
            <WeekScheduleView />
          )}
        </main>
      </SessionTimeoutWrapper>
    </AuthGuard>
  )
}
