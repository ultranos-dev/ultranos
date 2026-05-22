'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

type Tab = 'pending' | 'resolved'

export function UnverifiedDispensesView() {
  const t = useTranslations('unverified')
  const [activeTab, setActiveTab] = useState<Tab>('pending')

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
        {t('title')}
      </h1>

      {/* Tab switcher */}
      <div className="mt-4 flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === 'pending'}
          onClick={() => setActiveTab('pending')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'pending'
              ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
              : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          {t('pending')}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'resolved'}
          onClick={() => setActiveTab('resolved')}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'resolved'
              ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
              : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          {t('resolved')}
        </button>
      </div>

      {/* Empty state for both tabs */}
      <div className="mt-6 rounded-lg border border-neutral-200 px-4 py-12 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
        {t('noRecords')}
      </div>
    </div>
  )
}
