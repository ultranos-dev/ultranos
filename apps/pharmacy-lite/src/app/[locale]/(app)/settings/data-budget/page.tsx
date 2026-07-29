'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { DirectionalIcon } from '@ultranos/ui-kit'
import { ChevronLeft } from '@ultranos/ui-kit/icons'
import { Button } from '@ultranos/ui-kit/components/ui/button'
import { DataBudgetDashboard } from '@/components/settings/DataBudgetDashboard'

export default function DataBudgetPage() {
  const t = useTranslations('dataBudget')

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" size="sm" className="w-fit px-0">
        <Link href="/settings" aria-label={t('backToSettings')}>
          <DirectionalIcon category="navigation">
            <ChevronLeft size={20} />
          </DirectionalIcon>
          {t('backToSettings')}
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold text-foreground">{t('usageTitle')}</h1>
      <DataBudgetDashboard />
    </div>
  )
}
