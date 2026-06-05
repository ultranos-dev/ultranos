'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '@/lib/db'
import type { SupervisedProcedure } from '@/lib/supervised-procedure-types'

interface LogSupervisedProcedureProps {
  technicianId: string
  supervisorId: string
  onLogged?: (procedure: SupervisedProcedure) => void
  onCancel?: () => void
}

/** Common LOINC procedure codes used in lab settings. */
const COMMON_PROCEDURES = [
  { code: '58410-2', name: 'CBC with differential' },
  { code: '2093-3', name: 'Cholesterol total' },
  { code: '14743-9', name: 'Blood glucose fasting' },
  { code: '14749-6', name: 'Glucose [Moles/volume] in Serum or Plasma' },
  { code: '718-7', name: 'Hemoglobin' },
  { code: '4544-3', name: 'Hematocrit' },
  { code: '3094-0', name: 'Urea nitrogen (BUN)' },
  { code: '2160-0', name: 'Creatinine' },
  { code: '10334-1', name: 'Sputum microscopy for AFB' },
  { code: '637-9', name: 'Malaria rapid diagnostic test' },
]

export function LogSupervisedProcedure({
  technicianId,
  supervisorId,
  onLogged,
  onCancel,
}: LogSupervisedProcedureProps) {
  const t = useTranslations('certification')
  const [procedureCode, setProcedureCode] = useState('')
  const [procedureName, setProcedureName] = useState('')
  const [customProcedure, setCustomProcedure] = useState(false)
  const [notes, setNotes] = useState('')
  const [performedAt, setPerformedAt] = useState(
    new Date().toISOString().slice(0, 16), // YYYY-MM-DDTHH:mm
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleProcedureSelect(code: string) {
    if (code === '__custom__') {
      setCustomProcedure(true)
      setProcedureCode('')
      setProcedureName('')
    } else {
      setCustomProcedure(false)
      const found = COMMON_PROCEDURES.find((p) => p.code === code)
      setProcedureCode(code)
      setProcedureName(found?.name ?? '')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!procedureCode.trim() || !procedureName.trim()) return

    setSaving(true)
    setError(null)
    try {
      const db = getDb()
      const procedure: SupervisedProcedure = {
        id: uuidv4(),
        technicianId,
        supervisorId,
        procedureRef: procedureCode.trim(),
        procedureName: procedureName.trim(),
        performedAt: new Date(performedAt).toISOString(),
        supervisorNotes: notes.trim() || undefined,
        syncStatus: 'pending',
      }
      await db.supervised_procedures.put(procedure)
      onLogged?.(procedure)
    } catch {
      setError(t('logError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('procedure')}
        </label>
        <select
          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-card dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          onChange={(e) => handleProcedureSelect(e.target.value)}
          defaultValue=""
        >
          <option value="" disabled>{t('selectProcedure')}</option>
          {COMMON_PROCEDURES.map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
          <option value="__custom__">{t('customProcedure')}</option>
        </select>
      </div>

      {customProcedure && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('loincCode')}
            </label>
            <input
              type="text"
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-card dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. 58410-2"
              value={procedureCode}
              onChange={(e) => setProcedureCode(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('procedureName')}
            </label>
            <input
              type="text"
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-card dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('procedureNamePlaceholder')}
              value={procedureName}
              onChange={(e) => setProcedureName(e.target.value)}
              required
            />
          </div>
        </>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('performedAt')}
        </label>
        <input
          type="datetime-local"
          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-card dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={performedAt}
          onChange={(e) => setPerformedAt(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('supervisorNotes')} <span className="text-gray-400">({t('optional')})</span>
        </label>
        <textarea
          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-card dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('supervisorNotesPlaceholder')}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex gap-3 justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {t('cancel')}
          </button>
        )}
        <button
          type="submit"
          disabled={saving || !procedureCode || !procedureName}
          className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? t('logging') : t('logProcedure')}
        </button>
      </div>
    </form>
  )
}
