'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import {
  getTestTimeEstimates,
  putTestTimeEstimate,
  resetTestTimeEstimates,
  type TestTimeEstimate,
} from '@/lib/db'

export function TestTimeConfigPanel() {
  const t = useTranslations('scheduler.config')
  const [estimates, setEstimates] = useState<TestTimeEstimate[]>([])
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const all = await getTestTimeEstimates()
    setEstimates(all)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleUpdate = useCallback(
    async (
      loincCode: string,
      field: 'estimatedMinutes' | 'batchSize' | 'requiresPower',
      value: number | boolean,
    ) => {
      const est = estimates.find((e) => e.loincCode === loincCode)
      if (!est) return

      const updated = {
        ...est,
        [field]: value,
        updatedAt: new Date().toISOString(),
      }

      // Guard batch size
      if (field === 'batchSize' && typeof value === 'number') {
        updated.batchSize = Math.max(1, value)
      }

      await putTestTimeEstimate(updated)
      setSuccessMsg(t('saved'))
      await load()
      setTimeout(() => setSuccessMsg(null), 2000)
    },
    [estimates, t, load],
  )

  const handleReset = useCallback(async () => {
    if (!window.confirm(t('resetConfirm'))) return
    await resetTestTimeEstimates()
    setSuccessMsg(t('reset'))
    await load()
    setTimeout(() => setSuccessMsg(null), 2000)
  }, [t, load])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">{t('title')}</h2>
        <Button variant="outline" onClick={handleReset}>
          {t('resetDefaults')}
        </Button>
      </div>

      {successMsg && (
        <p className="text-sm text-green-700" role="status">{successMsg}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-start">
              <th className="py-2 pe-3 text-start font-medium text-neutral-600">
                {t('testName')}
              </th>
              <th className="py-2 pe-3 text-start font-medium text-neutral-600">
                {t('estimatedMinutes')}
              </th>
              <th className="py-2 pe-3 text-start font-medium text-neutral-600">
                {t('requiresPower')}
              </th>
              <th className="py-2 text-start font-medium text-neutral-600">
                {t('batchSize')}
              </th>
            </tr>
          </thead>
          <tbody>
            {estimates.map((est) => (
              <tr key={est.loincCode} className="border-b border-neutral-100">
                <td className="py-2 pe-3 text-neutral-900">{est.displayName}</td>
                <td className="py-2 pe-3">
                  <input
                    type="number"
                    min={1}
                    value={est.estimatedMinutes}
                    onChange={(e) =>
                      handleUpdate(est.loincCode, 'estimatedMinutes', Number(e.target.value))
                    }
                    className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                </td>
                <td className="py-2 pe-3">
                  <input
                    type="checkbox"
                    checked={est.requiresPower}
                    onChange={(e) =>
                      handleUpdate(est.loincCode, 'requiresPower', e.target.checked)
                    }
                    className="h-4 w-4 rounded border-neutral-300"
                  />
                </td>
                <td className="py-2">
                  <input
                    type="number"
                    min={1}
                    value={est.batchSize}
                    onChange={(e) =>
                      handleUpdate(est.loincCode, 'batchSize', Number(e.target.value))
                    }
                    className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
