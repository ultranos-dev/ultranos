'use client'

import { useTranslations } from 'next-intl'
import { FinancialSummaryCard } from './FinancialSummaryCard'
import { WastageCard } from './WastageCard'
import { ConsumptionChart } from './ConsumptionChart'
import { ControlledDiscrepancyCard } from './ControlledDiscrepancyCard'

export function ReportsPage() {
  const t = useTranslations('reports')
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>

      {/* Financial + Wastage side by side */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FinancialSummaryCard />
        <WastageCard />
      </div>

      {/* Consumption chart full width */}
      <ConsumptionChart />

      {/* Controlled discrepancies */}
      <ControlledDiscrepancyCard />
    </div>
  )
}
