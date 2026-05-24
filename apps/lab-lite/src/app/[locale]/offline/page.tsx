'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'

export default function OfflinePage() {
  const t = useTranslations('offline')

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="mb-6 text-neutral-700">
          {t('message')}
        </p>
        <Button
          variant="primary"
          onClick={() => window.location.reload()}
        >
          {t('tryAgain')}
        </Button>
      </div>
    </div>
  )
}
