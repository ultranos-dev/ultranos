'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CircleCheck } from '@ultranos/ui-kit/icons'

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
      className="flex items-center justify-between rounded-lg bg-success/10 border border-success/30 px-4 py-3 text-sm text-success"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <CircleCheck size={20} className="shrink-0 text-success" aria-hidden="true" />
        <span className="font-medium">{t('uploadSuccess')}</span>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-success hover:bg-success/10 focus:outline-none focus:ring-2 focus:ring-success focus:ring-offset-1"
        aria-label={t('dismiss')}
      >
        {t('dismiss')}
      </button>
    </div>
  )
}
