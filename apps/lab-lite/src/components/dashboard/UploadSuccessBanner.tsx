'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

export function UploadSuccessBanner() {
  const t = useTranslations('dashboard')
  const searchParams = useSearchParams()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (searchParams.get('uploaded') === 'true') {
      setVisible(true)
      // Clean up the URL without triggering a navigation
      const url = new URL(window.location.href)
      url.searchParams.delete('uploaded')
      window.history.replaceState({}, '', url.toString())
    }
  }, [searchParams])

  if (!visible) return null

  return (
    <div
      className="flex items-center justify-between rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <svg className="h-5 w-5 shrink-0 text-green-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
            clipRule="evenodd"
          />
        </svg>
        <span className="font-medium">{t('uploadSuccess')}</span>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
        aria-label={t('dismiss')}
      >
        {t('dismiss')}
      </button>
    </div>
  )
}
