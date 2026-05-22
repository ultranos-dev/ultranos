'use client'

import { useTranslations } from 'next-intl'

export function ControlledSubstancesView() {
  const t = useTranslations('controlled')

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
        {t('title')}
      </h1>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">
          <thead className="bg-neutral-50 dark:bg-neutral-800">
            <tr>
              <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {t('date')}
              </th>
              <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {t('patient')}
              </th>
              <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {t('medication')}
              </th>
              <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {t('schedule')}
              </th>
              <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {t('prescriber')}
              </th>
              <th scope="col" className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {t('status')}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={6} className="px-4 py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                {t('noRecords')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
