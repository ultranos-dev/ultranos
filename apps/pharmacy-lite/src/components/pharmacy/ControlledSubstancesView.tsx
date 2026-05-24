'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useTranslations } from 'next-intl'
import { db } from '@/lib/db'
import type { LocalMedicationDispense } from '@/lib/medication-dispense'

/**
 * TODO: Controlled substance filtering requires a `controlledSubstanceSchedule`
 * field (e.g. "Schedule II", "Schedule III") to be added to the
 * MedicationDispenseUltranosExtSchema in packages/shared-types. Until then,
 * this view displays ALL dispenses from the local Dexie store and the
 * Schedule column shows "---".
 */

const PAGE_SIZE = 20

interface DateRangeFilter {
  dateFrom: string
  dateTo: string
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '---'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function extractMedicationDisplay(dispense: LocalMedicationDispense): string {
  const codings = dispense.medicationCodeableConcept?.coding ?? []
  if (codings.length > 0) {
    return codings.map((c) => c.display ?? c.code ?? '?').join(', ')
  }
  return dispense.medicationCodeableConcept?.text ?? '---'
}

function extractPrescriberRef(dispense: LocalMedicationDispense): string {
  const rxRefs = dispense.authorizingPrescription
  if (rxRefs && rxRefs.length > 0) {
    return rxRefs[0]?.reference ?? '---'
  }
  return '---'
}

function statusLabel(
  status: string,
  t: ReturnType<typeof useTranslations>,
): string {
  switch (status) {
    case 'completed':
      return t('dispensed')
    case 'entered-in-error':
      return t('flagged')
    case 'on-hold':
    case 'in-progress':
      return t('underReview')
    default:
      return status
  }
}

export function ControlledSubstancesView() {
  const t = useTranslations('controlled')

  const [dispenses, setDispenses] = useState<LocalMedicationDispense[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<DateRangeFilter>({
    dateFrom: '',
    dateTo: '',
  })

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let query = db.dispenses.orderBy('meta.lastUpdated')

      // Apply date range filter using indexed meta.lastUpdated
      if (filters.dateFrom && filters.dateTo) {
        const from = new Date(filters.dateFrom)
        from.setHours(0, 0, 0, 0)
        const to = new Date(filters.dateTo)
        to.setHours(23, 59, 59, 999)
        query = db.dispenses
          .where('meta.lastUpdated')
          .between(from.toISOString(), to.toISOString(), true, true)
      } else if (filters.dateFrom) {
        const from = new Date(filters.dateFrom)
        from.setHours(0, 0, 0, 0)
        query = db.dispenses
          .where('meta.lastUpdated')
          .aboveOrEqual(from.toISOString())
      } else if (filters.dateTo) {
        const to = new Date(filters.dateTo)
        to.setHours(23, 59, 59, 999)
        query = db.dispenses
          .where('meta.lastUpdated')
          .belowOrEqual(to.toISOString())
      }

      const all = await query.reverse().toArray()
      setTotalCount(all.length)

      const offset = (page - 1) * PAGE_SIZE
      setDispenses(all.slice(offset, offset + PAGE_SIZE))
    } catch {
      setError(t('error'))
    } finally {
      setLoading(false)
    }
  }, [filters, page, t])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleDateFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
    setPage(1)
  }

  const handleDateToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
    setPage(1)
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900">
        {t('title')}
      </h1>

      {/* Date range filter */}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="cs-date-from"
            className="block text-xs font-medium text-neutral-500"
          >
            {t('dateFrom')}
          </label>
          <input
            id="cs-date-from"
            type="date"
            value={filters.dateFrom}
            onChange={handleDateFromChange}
            className="mt-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="cs-date-to"
            className="block text-xs font-medium text-neutral-500"
          >
            {t('dateTo')}
          </label>
          <input
            id="cs-date-to"
            type="date"
            value={filters.dateTo}
            onChange={handleDateToChange}
            className="mt-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="mt-6 py-12 text-center text-sm text-neutral-500">
          {t('loading')}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="mt-6 py-12 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && dispenses.length === 0 && (
        <div className="mt-6 rounded-lg border border-neutral-200 px-4 py-12 text-center text-sm text-neutral-500">
          {t('noRecords')}
        </div>
      )}

      {/* Table */}
      {!loading && !error && dispenses.length > 0 && (
        <>
          <div className="mt-2 text-xs text-neutral-500">
            {t('records', { count: totalCount })}
          </div>

          <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-200">
            <table className="min-w-full divide-y divide-neutral-200">
              <thead className="bg-neutral-50">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                  >
                    {t('date')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                  >
                    {t('patient')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                  >
                    {t('medication')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                    title={t('scheduleNote')}
                  >
                    {t('schedule')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                  >
                    {t('prescriber')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500"
                  >
                    {t('status')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {dispenses.map((d) => (
                  <tr
                    key={d.id}
                    className="hover:bg-neutral-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-700">
                      {formatDateTime(d.meta?.lastUpdated)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-700">
                      {d.subject.reference}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-700">
                      {extractMedicationDisplay(d)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-400">
                      {/* controlledSubstanceSchedule not in schema yet */}
                      ---
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-neutral-700">
                      {extractPrescriberRef(d)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <span
                        className={
                          d.status === 'completed'
                            ? 'text-green-700'
                            : d.status === 'entered-in-error'
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }
                      >
                        {statusLabel(d.status, t)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-4">
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                {t('previous')}
              </Button>
              <span className="text-sm text-neutral-600">
                {t('page')} {page} {t('of')} {totalPages}
              </span>
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t('next')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
