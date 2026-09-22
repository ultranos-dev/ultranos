'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ChevronLeft } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { DataBudgetDashboard } from '@/components/settings/DataBudgetDashboard'

export default function DataBudgetPage() {
  const t = useTranslations('dataBudget')
  const router = useRouter()

  return (
    <div className="flex flex-col gap-4">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit px-0 gap-1"
        onClick={() => router.push('/settings')}
        aria-label={t('backToSettings')}
      >
        <DirectionalIcon category="navigation">
          <ChevronLeft size={16} />
        </DirectionalIcon>
        {t('backToSettings')}
      </Button>
      <h1 className="text-2xl font-semibold text-foreground">{t('usageTitle')}</h1>
      <DataBudgetDashboard />
    </div>
  )
}
