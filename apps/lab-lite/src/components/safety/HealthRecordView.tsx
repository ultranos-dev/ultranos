'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import type { EmployeeHealthRecord, ScreeningReminder } from '@/types/employee-health'
import { VaccinationStatus, TbScreeningResult, HepBImmunityStatus } from '@/types/employee-health'
import { getHealthRecord } from '@/lib/safety/health-record-service'
import { getScreeningReminders } from '@/lib/safety/screening-reminders'
import { getReminderState } from '@/lib/safety/screening-reminders'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { canAccessHealthRecord } from '@/lib/safety/health-record-access'
import { HealthRecordEditModal } from './HealthRecordEditModal'
import { Button } from '@/components/ui/Button'

interface HealthRecordViewProps {
  practitionerId: string
  practitionerName?: string
  onBack?: () => void
}

const STATUS_COLORS: Record<VaccinationStatus, string> = {
  [VaccinationStatus.COMPLETE]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  [VaccinationStatus.INCOMPLETE]: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  [VaccinationStatus.NOT_STARTED]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  [VaccinationStatus.UNKNOWN]: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
}

export function HealthRecordView({
  practitionerId,
  practitionerName,
  onBack,
}: HealthRecordViewProps) {
  const t = useTranslations('safety.health')
  const session = useAuthSessionStore((s) => s.session)
  const [record, setRecord] = useState<EmployeeHealthRecord | null>(null)
  const [reminders, setReminders] = useState<ScreeningReminder[]>([])
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const loadRecord = useCallback(async () => {
    if (!session) return
    if (!canAccessHealthRecord(session.practitionerId, session.labRole, practitionerId)) {
      setAccessDenied(true)
      setLoading(false)
      return
    }
    try {
      const [rec, rem] = await Promise.all([
        getHealthRecord(practitionerId),
        getScreeningReminders(practitionerId),
      ])
      setRecord(rec)
      setReminders(rem)
    } catch {
      setAccessDenied(true)
    } finally {
      setLoading(false)
    }
  }, [session, practitionerId])

  useEffect(() => {
    void loadRecord()
  }, [loadRecord])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8" role="status" aria-busy="true">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="p-6 text-center">
        {onBack && (
          <Button onClick={onBack} className="mb-4">
            {t('back')}
          </Button>
        )}
        <p className="text-red-600 font-medium">{t('accessDenied')}</p>
      </div>
    )
  }

  if (!record) {
    return (
      <div className="p-6 text-center">
        {onBack && (
          <Button onClick={onBack} className="mb-4">
            {t('back')}
          </Button>
        )}
        <p className="text-gray-500">{t('noRecord')}</p>
      </div>
    )
  }

  const handleEditClose = () => {
    setEditOpen(false)
    void loadRecord()
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button onClick={onBack} aria-label={t('back')}>
              ←
            </Button>
          )}
          <h2 className="text-xl font-semibold">
            {practitionerName
              ? t('recordTitle', { name: practitionerName })
              : t('myRecord')}
          </h2>
        </div>
        <Button onClick={() => setEditOpen(true)}>{t('edit')}</Button>
      </div>

      {/* Screening Reminders */}
      {reminders.length > 0 && (
        <section aria-label={t('reminders')}>
          <h3 className="text-lg font-medium mb-3">{t('reminders')}</h3>
          <div className="space-y-2">
            {reminders.map((r) => {
              const state = getReminderState(r.daysUntilDue)
              const color =
                state === 'OVERDUE'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : state === 'DUE'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
              return (
                <div
                  key={r.screeningType}
                  className={`rounded-lg border p-3 ${color}`}
                  role="alert"
                >
                  <p className="font-medium">{r.screeningType}</p>
                  <p className="text-sm">{r.message}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Vaccination Status Cards */}
      <section aria-label={t('vaccinations')}>
        <h3 className="text-lg font-medium mb-3">{t('vaccinations')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Hepatitis B */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">{t('hepB')}</h4>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[record.hepBStatus]}`}>
                {t(`status.${record.hepBStatus}`)}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              {t('doses')}: {record.hepBDoses}
            </p>
            {record.hepBTiterDate && (
              <p className="text-sm text-gray-600">
                {t('titerDate')}: {record.hepBTiterDate}
              </p>
            )}
            <p className="text-sm text-gray-600">
              {t('immunity')}: {t(`immunityStatus.${record.hepBTiterResult}`)}
            </p>
          </div>

          {/* Tetanus */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">{t('tetanus')}</h4>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[record.tetanusStatus]}`}>
                {t(`status.${record.tetanusStatus}`)}
              </span>
            </div>
            {record.tetanusDate && (
              <p className="text-sm text-gray-600">
                {t('lastDose')}: {record.tetanusDate}
              </p>
            )}
          </div>

          {/* COVID */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">{t('covid')}</h4>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[record.covidStatus]}`}>
                {t(`status.${record.covidStatus}`)}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              {t('doses')}: {record.covidDoses}
            </p>
            {record.covidDate && (
              <p className="text-sm text-gray-600">
                {t('lastDose')}: {record.covidDate}
              </p>
            )}
          </div>

          {/* TB Screening */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">{t('tbScreening')}</h4>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                record.tbScreeningResult === TbScreeningResult.NEGATIVE
                  ? 'bg-green-100 text-green-800'
                  : record.tbScreeningResult === TbScreeningResult.POSITIVE
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
              }`}>
                {t(`tbResult.${record.tbScreeningResult}`)}
              </span>
            </div>
            {record.tbScreeningDate && (
              <p className="text-sm text-gray-600">
                {t('lastScreening')}: {record.tbScreeningDate}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* TB Screening History */}
      {record.tbScreeningHistory.length > 0 && (
        <section aria-label={t('tbHistory')}>
          <h3 className="text-lg font-medium mb-3">{t('tbHistory')}</h3>
          <div className="space-y-2">
            {record.tbScreeningHistory.map((entry, i) => (
              <div
                key={`${entry.date}-${i}`}
                className="flex items-center justify-between border-s-4 border-gray-300 ps-3 py-1"
              >
                <span className="text-sm">{entry.date}</span>
                <span className={`text-sm font-medium ${
                  entry.result === TbScreeningResult.NEGATIVE
                    ? 'text-green-700'
                    : entry.result === TbScreeningResult.POSITIVE
                      ? 'text-red-700'
                      : 'text-gray-700'
                }`}>
                  {t(`tbResult.${entry.result}`)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Exposure History */}
      {record.exposureHistory.length > 0 && (
        <section aria-label={t('exposureHistory')}>
          <h3 className="text-lg font-medium mb-3">{t('exposureHistory')}</h3>
          <div className="space-y-3">
            {record.exposureHistory.map((entry) => (
              <div
                key={entry.id}
                className="border-s-4 border-amber-400 ps-3 py-2 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{entry.date}</span>
                  <span className="text-xs text-gray-500">{entry.type}</span>
                </div>
                <p className="text-sm text-gray-600">
                  {t('pepTaken')}: {entry.pepTaken ? t('yes') : t('no')}
                </p>
                <p className="text-sm text-gray-600">
                  {t('outcome')}: {entry.outcome}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Notes */}
      {record.notes && (
        <section>
          <h3 className="text-lg font-medium mb-2">{t('notes')}</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.notes}</p>
        </section>
      )}

      {/* Metadata */}
      <div className="text-xs text-gray-400 pt-4 border-t">
        <p>{t('lastUpdated')}: {record.lastUpdated}</p>
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <HealthRecordEditModal
          record={record}
          practitionerId={practitionerId}
          onClose={handleEditClose}
        />
      )}
    </div>
  )
}
