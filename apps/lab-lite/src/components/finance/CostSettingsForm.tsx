'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { Button } from '@/components/ui/Button'
import { LOINC_CATEGORIES } from '@/lib/loinc-categories'
import {
  getLabOverheadConfig,
  putLabOverheadConfig,
  getAllTestCostConfigs,
  putTestCostConfigs,
  type LabOverheadConfig,
  type TestCostConfig,
} from '@/lib/db'
import { calculateOverheadAllocations } from '@/lib/cost-calculator'

const formatAFN = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

interface OverheadFields {
  monthlyRent: string
  monthlyUtilities: string
  monthlyEquipmentDepreciation: string
  monthlyMiscOverhead: string
  staffCount: string
  avgMonthlySalary: string
  avgTestsPerShift: string
  shiftsPerMonth: string
}

interface PerTestRow {
  testCode: string
  testName: string
  reagentCostPerTest: string
  consumableCost: string
  currentPrice: string
  laborOverride: string
  overheadOverride: string
}

const EMPTY_OVERHEAD: OverheadFields = {
  monthlyRent: '',
  monthlyUtilities: '',
  monthlyEquipmentDepreciation: '',
  monthlyMiscOverhead: '',
  staffCount: '',
  avgMonthlySalary: '',
  avgTestsPerShift: '',
  shiftsPerMonth: '',
}

function parseNum(val: string): number {
  const n = parseFloat(val)
  return isNaN(n) ? 0 : n
}

export function CostSettingsForm() {
  const t = useTranslations('finance.cost.settings')
  const session = useAuthSessionStore((s) => s.session)

  const [overhead, setOverhead] = useState<OverheadFields>(EMPTY_OVERHEAD)
  const [rows, setRows] = useState<PerTestRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  // Role gate — only LAB_MANAGER may access
  const isManager = session?.labRole === LabRole.LAB_MANAGER

  // Load existing config from Dexie on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      const [existingOverhead, existingConfigs] = await Promise.all([
        getLabOverheadConfig(),
        getAllTestCostConfigs(),
      ])

      if (cancelled) return

      if (existingOverhead) {
        setOverhead({
          monthlyRent: String(existingOverhead.monthlyRent),
          monthlyUtilities: String(existingOverhead.monthlyUtilities),
          monthlyEquipmentDepreciation: String(existingOverhead.monthlyEquipmentDepreciation),
          monthlyMiscOverhead: String(existingOverhead.monthlyMiscOverhead),
          staffCount: String(existingOverhead.staffCount),
          avgMonthlySalary: String(existingOverhead.avgMonthlySalary),
          avgTestsPerShift: String(existingOverhead.avgTestsPerShift),
          shiftsPerMonth: String(existingOverhead.shiftsPerMonth),
        })
      }

      // Build per-test rows from LOINC categories, merging existing config data
      const configByCode = new Map(existingConfigs.map((c) => [c.testCode, c]))
      const initialRows: PerTestRow[] = LOINC_CATEGORIES.map((cat) => {
        const existing = configByCode.get(cat.code)
        return {
          testCode: cat.code,
          testName: cat.label,
          reagentCostPerTest: existing ? String(existing.reagentCostPerTest) : '',
          consumableCost: existing ? String(existing.consumableCost) : '',
          currentPrice: existing ? String(existing.currentPrice) : '',
          laborOverride: existing ? String(existing.laborAllocation) : '',
          overheadOverride: existing ? String(existing.overheadAllocation) : '',
        }
      })
      setRows(initialRows)
      setIsLoaded(true)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  // Derived overhead calculations
  const overheadCalc = calculateOverheadAllocations({
    id: 'lab-overhead',
    monthlyRent: parseNum(overhead.monthlyRent),
    monthlyUtilities: parseNum(overhead.monthlyUtilities),
    monthlyEquipmentDepreciation: parseNum(overhead.monthlyEquipmentDepreciation),
    monthlyMiscOverhead: parseNum(overhead.monthlyMiscOverhead),
    staffCount: parseNum(overhead.staffCount),
    avgMonthlySalary: parseNum(overhead.avgMonthlySalary),
    avgTestsPerShift: parseNum(overhead.avgTestsPerShift),
    shiftsPerMonth: parseNum(overhead.shiftsPerMonth),
    lastUpdated: '',
  })

  const handleOverheadChange = useCallback(
    (field: keyof OverheadFields, value: string) => {
      setOverhead((prev) => ({ ...prev, [field]: value }))
      setSaveSuccess(false)
    },
    [],
  )

  const handleRowChange = useCallback(
    (index: number, field: keyof Omit<PerTestRow, 'testCode' | 'testName'>, value: string) => {
      setRows((prev) =>
        prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
      )
      setSaveSuccess(false)
    },
    [],
  )

  const validate = useCallback((): string[] => {
    const errs: string[] = []
    const overheadNums = [
      parseNum(overhead.monthlyRent),
      parseNum(overhead.monthlyUtilities),
      parseNum(overhead.monthlyEquipmentDepreciation),
      parseNum(overhead.monthlyMiscOverhead),
      parseNum(overhead.staffCount),
      parseNum(overhead.avgMonthlySalary),
      parseNum(overhead.avgTestsPerShift),
      parseNum(overhead.shiftsPerMonth),
    ]
    if (overheadNums.some((n) => n < 0)) {
      errs.push(t('validationNonNegative'))
    }
    for (const row of rows) {
      const costs = [
        parseNum(row.reagentCostPerTest),
        parseNum(row.consumableCost),
        parseNum(row.laborOverride),
        parseNum(row.overheadOverride),
      ]
      if (costs.some((n) => n < 0)) {
        errs.push(t('validationNonNegative'))
        break
      }
      if (row.currentPrice !== '' && parseNum(row.currentPrice) <= 0) {
        errs.push(t('validationPricePositive'))
        break
      }
    }
    return [...new Set(errs)]
  }, [overhead, rows, t])

  const handleSave = useCallback(async () => {
    const errs = validate()
    if (errs.length > 0) {
      setErrors(errs)
      return
    }
    setErrors([])
    setSaving(true)

    const now = new Date().toISOString()
    const practitionerId = session?.practitionerId ?? 'unknown'

    const overheadConfig: LabOverheadConfig = {
      id: 'lab-overhead',
      monthlyRent: parseNum(overhead.monthlyRent),
      monthlyUtilities: parseNum(overhead.monthlyUtilities),
      monthlyEquipmentDepreciation: parseNum(overhead.monthlyEquipmentDepreciation),
      monthlyMiscOverhead: parseNum(overhead.monthlyMiscOverhead),
      staffCount: parseNum(overhead.staffCount),
      avgMonthlySalary: parseNum(overhead.avgMonthlySalary),
      avgTestsPerShift: parseNum(overhead.avgTestsPerShift),
      shiftsPerMonth: parseNum(overhead.shiftsPerMonth),
      lastUpdated: now,
    }

    const configs: Omit<TestCostConfig, 'id'>[] = rows.map((row) => ({
      testCode: row.testCode,
      testName: row.testName,
      reagentCostPerTest: parseNum(row.reagentCostPerTest),
      consumableCost: parseNum(row.consumableCost),
      currentPrice: parseNum(row.currentPrice),
      // Use override if provided, otherwise fall back to auto-calculated value
      laborAllocation:
        row.laborOverride !== '' ? parseNum(row.laborOverride) : overheadCalc.laborCostPerTest,
      overheadAllocation:
        row.overheadOverride !== '' ? parseNum(row.overheadOverride) : overheadCalc.overheadPerTest,
      lastUpdated: now,
      updatedBy: practitionerId,
    }))

    try {
      await putLabOverheadConfig(overheadConfig)
      await putTestCostConfigs(configs)
      setSaveSuccess(true)
    } finally {
      setSaving(false)
    }
  }, [overhead, rows, overheadCalc, session, validate])

  if (!isManager) {
    return (
      <div className="p-6 text-sm text-red-600" role="alert">
        Access restricted to Lab Managers.
      </div>
    )
  }

  if (!isLoaded) {
    return <div className="p-6 text-sm text-gray-500">Loading...</div>
  }

  return (
    <div className="max-w-4xl space-y-8 p-6">
      <h1 className="text-xl font-semibold">{t('title')}</h1>

      {/* Section 1 — Overhead & Labor */}
      <section aria-labelledby="overhead-section-heading" className="rounded-lg border border-gray-200 p-5 space-y-4">
        <h2 id="overhead-section-heading" className="text-base font-medium">
          {t('overheadSection')}
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(
            [
              ['monthlyRent', overhead.monthlyRent],
              ['monthlyUtilities', overhead.monthlyUtilities],
              ['monthlyEquipmentDepreciation', overhead.monthlyEquipmentDepreciation],
              ['monthlyMiscOverhead', overhead.monthlyMiscOverhead],
              ['staffCount', overhead.staffCount],
              ['avgMonthlySalary', overhead.avgMonthlySalary],
              ['avgTestsPerShift', overhead.avgTestsPerShift],
              ['shiftsPerMonth', overhead.shiftsPerMonth],
            ] as [keyof OverheadFields, string][]
          ).map(([field, value]) => (
            <div key={field}>
              <label htmlFor={`overhead-${field}`} className="block text-sm font-medium text-gray-700 mb-1">
                {t(field)}
              </label>
              <input
                id={`overhead-${field}`}
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={(e) => handleOverheadChange(field, e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>

        {overheadCalc.divisionGuardTriggered ? (
          <p className="text-sm text-amber-600" role="alert">
            {t('divisionGuardWarning')}
          </p>
        ) : (
          <div className="flex gap-6 text-sm text-gray-600">
            <span>
              {t('laborCostPerTestLabel')}: <strong>AFN {formatAFN(overheadCalc.laborCostPerTest)}</strong>
            </span>
            <span>
              {t('overheadPerTestLabel')}: <strong>AFN {formatAFN(overheadCalc.overheadPerTest)}</strong>
            </span>
          </div>
        )}
      </section>

      {/* Section 2 — Per-Test Cost Inputs */}
      <section aria-labelledby="per-test-section-heading">
        <h2 id="per-test-section-heading" className="text-base font-medium mb-3">
          {t('perTestSection')}
        </h2>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-start font-medium text-gray-700">
                  Test
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium text-gray-700">
                  {t('reagentCost')}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium text-gray-700">
                  {t('consumableCost')}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium text-gray-700">
                  {t('currentPrice')}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium text-gray-700">
                  {t('laborOverride')}
                </th>
                <th scope="col" className="px-4 py-3 text-start font-medium text-gray-700">
                  {t('overheadOverride')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, i) => (
                <tr key={row.testCode} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900 whitespace-nowrap">
                    {row.testName}
                  </td>
                  {(
                    [
                      ['reagentCostPerTest', row.reagentCostPerTest],
                      ['consumableCost', row.consumableCost],
                      ['currentPrice', row.currentPrice],
                      ['laborOverride', row.laborOverride],
                      ['overheadOverride', row.overheadOverride],
                    ] as [keyof Omit<PerTestRow, 'testCode' | 'testName'>, string][]
                  ).map(([field, value]) => (
                    <td key={field} className="px-4 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={value}
                        placeholder={
                          field === 'laborOverride'
                            ? formatAFN(overheadCalc.laborCostPerTest)
                            : field === 'overheadOverride'
                            ? formatAFN(overheadCalc.overheadPerTest)
                            : '0.00'
                        }
                        onChange={(e) =>
                          handleRowChange(i, field, e.target.value)
                        }
                        aria-label={`${row.testName} ${t(field as Parameters<typeof t>[0])}`}
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Errors */}
      {errors.length > 0 && (
        <ul className="space-y-1" role="alert" aria-live="polite">
          {errors.map((err) => (
            <li key={err} className="text-sm text-red-600">
              {err}
            </li>
          ))}
        </ul>
      )}

      {/* Success */}
      {saveSuccess && (
        <p className="text-sm text-green-600" role="status" aria-live="polite">
          {t('saveSuccess')}
        </p>
      )}

      <Button onClick={() => void handleSave()} disabled={saving}>
        {saving ? t('saving') : t('save')}
      </Button>
    </div>
  )
}
