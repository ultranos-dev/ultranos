import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ChevronLeft } from '@ultranos/ui-kit/icons'
import { DataBudgetDashboard } from '@/components/settings/DataBudgetDashboard'

export default function DataBudgetPage() {
  const t = useTranslations('dataBudget')

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/settings"
          className="text-neutral-400 hover:text-neutral-600 rtl:-scale-x-100"
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">{t('usageTitle')}</h1>
      </div>
      <DataBudgetDashboard />
    </div>
  )
}
