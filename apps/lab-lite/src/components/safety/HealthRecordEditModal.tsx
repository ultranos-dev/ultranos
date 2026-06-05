'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { EmployeeHealthRecord } from '@/types/employee-health'
import {
  VaccinationStatus,
  TbScreeningResult,
  HepBImmunityStatus,
} from '@/types/employee-health'
import { updateHealthRecord, createHealthRecord } from '@/lib/safety/health-record-service'
import { Button } from '@/components/ui/Button'

interface HealthRecordEditModalProps {
  record: EmployeeHealthRecord | null
  practitionerId: string
  onClose: () => void
}

export function HealthRecordEditModal({
  record,
  practitionerId,
  onClose,
}: HealthRecordEditModalProps) {
  const t = useTranslations('safety.health')
  const isNew = !record

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [hepBStatus, setHepBStatus] = useState(record?.hepBStatus ?? VaccinationStatus.UNKNOWN)
  const [hepBDoses, setHepBDoses] = useState(record?.hepBDoses ?? 0)
  const [hepBTiterDate, setHepBTiterDate] = useState(record?.hepBTiterDate ?? '')
  const [hepBTiterResult, setHepBTiterResult] = useState(record?.hepBTiterResult ?? HepBImmunityStatus.UNKNOWN)
  const [tetanusDate, setTetanusDate] = useState(record?.tetanusDate ?? '')
  const [tetanusStatus, setTetanusStatus] = useState(record?.tetanusStatus ?? VaccinationStatus.UNKNOWN)
  const [covidDate, setCovidDate] = useState(record?.covidDate ?? '')
  const [covidStatus, setCovidStatus] = useState(record?.covidStatus ?? VaccinationStatus.UNKNOWN)
  const [covidDoses, setCovidDoses] = useState(record?.covidDoses ?? 0)
  const [tbScreeningDate, setTbScreeningDate] = useState(record?.tbScreeningDate ?? '')
  const [tbScreeningResult, setTbScreeningResult] = useState(record?.tbScreeningResult ?? TbScreeningResult.NOT_DONE)
  const [notes, setNotes] = useState(record?.notes ?? '')

  function validate(): string | null {
    const today = new Date().toISOString().split('T')[0]
    if (hepBTiterDate && hepBTiterDate > today) return t('validation.futureDate')
    if (tetanusDate && tetanusDate > today) return t('validation.futureDate')
    if (covidDate && covidDate > today) return t('validation.futureDate')
    if (tbScreeningDate && tbScreeningDate > today) return t('validation.futureDate')
    if (hepBDoses < 0 || covidDoses < 0) return t('validation.negativeDoses')
    if (!Number.isInteger(hepBDoses) || !Number.isInteger(covidDoses)) return t('validation.integerDoses')
    return null
  }

  async function handleSave() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)

    const updates: Partial<EmployeeHealthRecord> = {
      hepBStatus,
      hepBDoses,
      hepBTiterDate: hepBTiterDate || null,
      hepBTiterResult,
      tetanusDate: tetanusDate || null,
      tetanusStatus,
      covidDate: covidDate || null,
      covidStatus,
      covidDoses,
      tbScreeningDate: tbScreeningDate || null,
      tbScreeningResult,
      notes,
    }

    // If TB screening date changed and is new, append to history
    if (
      tbScreeningDate &&
      tbScreeningDate !== record?.tbScreeningDate &&
      tbScreeningResult !== TbScreeningResult.NOT_DONE
    ) {
      updates.tbScreeningHistory = [
        ...(record?.tbScreeningHistory ?? []),
        { date: tbScreeningDate, result: tbScreeningResult },
      ]
    }

    try {
      if (isNew) {
        await createHealthRecord(practitionerId, updates)
      } else {
        await updateHealthRecord(practitionerId, updates)
      }
      onClose()
    } catch (err) {
      setError(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={isNew ? t('createRecord') : t('editRecord')}
    >
      <div className="bg-card dark:bg-gray-900 rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            {isNew ? t('createRecord') : t('editRecord')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
            aria-label={t('close')}
          >
            ×
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm" role="alert">
            {error}
          </div>
        )}

        {/* Hepatitis B Section */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-medium">{t('hepB')}</legend>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('statusLabel')}</span>
              <select
                value={hepBStatus}
                onChange={(e) => setHepBStatus(e.target.value as VaccinationStatus)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              >
                {Object.values(VaccinationStatus).map((s) => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('doses')}</span>
              <input
                type="number"
                min={0}
                step={1}
                value={hepBDoses}
                onChange={(e) => setHepBDoses(parseInt(e.target.value) || 0)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('titerDate')}</span>
              <input
                type="date"
                value={hepBTiterDate}
                onChange={(e) => setHepBTiterDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('titerResult')}</span>
              <select
                value={hepBTiterResult}
                onChange={(e) => setHepBTiterResult(e.target.value as HepBImmunityStatus)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              >
                {Object.values(HepBImmunityStatus).map((s) => (
                  <option key={s} value={s}>{t(`immunityStatus.${s}`)}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        {/* Tetanus Section */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-medium">{t('tetanus')}</legend>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('lastDose')}</span>
              <input
                type="date"
                value={tetanusDate}
                onChange={(e) => setTetanusDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('statusLabel')}</span>
              <select
                value={tetanusStatus}
                onChange={(e) => setTetanusStatus(e.target.value as VaccinationStatus)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              >
                {Object.values(VaccinationStatus).map((s) => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        {/* COVID Section */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-medium">{t('covid')}</legend>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('lastDose')}</span>
              <input
                type="date"
                value={covidDate}
                onChange={(e) => setCovidDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('statusLabel')}</span>
              <select
                value={covidStatus}
                onChange={(e) => setCovidStatus(e.target.value as VaccinationStatus)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              >
                {Object.values(VaccinationStatus).map((s) => (
                  <option key={s} value={s}>{t(`status.${s}`)}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('doses')}</span>
              <input
                type="number"
                min={0}
                step={1}
                value={covidDoses}
                onChange={(e) => setCovidDoses(parseInt(e.target.value) || 0)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              />
            </label>
          </div>
        </fieldset>

        {/* TB Screening Section */}
        <fieldset className="space-y-3">
          <legend className="text-lg font-medium">{t('tbScreening')}</legend>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('screeningDate')}</span>
              <input
                type="date"
                value={tbScreeningDate}
                onChange={(e) => setTbScreeningDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">{t('result')}</span>
              <select
                value={tbScreeningResult}
                onChange={(e) => setTbScreeningResult(e.target.value as TbScreeningResult)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              >
                {Object.values(TbScreeningResult).map((s) => (
                  <option key={s} value={s}>{t(`tbResult.${s}`)}</option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        {/* Notes */}
        <label className="block">
          <span className="text-sm font-medium text-gray-700">{t('notes')}</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          />
        </label>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
