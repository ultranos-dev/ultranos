'use client'

import { useState, type ReactElement } from 'react'
import { useTranslations } from 'next-intl'
import { useDashboardPrefsStore, type WidgetId } from '@/stores/dashboard-prefs-store'
import { DashboardCustomizePanel } from './DashboardCustomizePanel'

interface DashboardWidgetLayoutProps {
  children: ReactElement<{ 'data-widget-id'?: WidgetId }>[]
  roleWidgetIds: WidgetId[]
}

/**
 * Responsive grid layout for dashboard summary cards.
 * Supports user-customizable widget order and visibility.
 */
export function DashboardWidgetLayout({ children, roleWidgetIds }: DashboardWidgetLayoutProps) {
  const t = useTranslations('dashboard')
  const [isCustomizing, setIsCustomizing] = useState(false)
  const { widgetOrder } = useDashboardPrefsStore()

  // Build a map of widget ID → element
  const widgetMap = new Map<WidgetId, ReactElement>()
  for (const child of children) {
    const id = child.props['data-widget-id']
    if (id) widgetMap.set(id, child)
  }

  // Determine display order: user prefs → role defaults
  const displayOrder = widgetOrder ?? roleWidgetIds
  const visibleWidgets = displayOrder
    .filter((id) => widgetMap.has(id))
    .map((id) => widgetMap.get(id)!)

  return (
    <section aria-label={t('summaryCardsAria')} className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="sr-only">{t('summaryCardsAria')}</h2>
        <div />
        <button
          type="button"
          onClick={() => setIsCustomizing(!isCustomizing)}
          className="text-xs font-semibold text-neutral-400 hover:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded px-2 py-1"
          aria-label={t('customizeWidgets')}
        >
          {t('customizeWidgets')}
        </button>
      </div>

      {isCustomizing && (
        <div className="mb-4">
          <DashboardCustomizePanel
            roleWidgets={roleWidgetIds}
            onClose={() => setIsCustomizing(false)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleWidgets}
      </div>
    </section>
  )
}
