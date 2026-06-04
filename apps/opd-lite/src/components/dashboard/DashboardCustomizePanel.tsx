'use client'

import { useState } from 'react'
import { X } from '@ultranos/ui-kit/icons'
import { Button } from '@/components/ui/Button'
import { useTranslations } from 'next-intl'
import { useDashboardPrefsStore, type WidgetId } from '@/stores/dashboard-prefs-store'

const ALL_WIDGETS: WidgetId[] = [
  'todayEncounters',
  'pendingLabResults',
  'unresolvedConflicts',
  'queueDepth',
  'avgWaitTime',
]

interface DashboardCustomizePanelProps {
  roleWidgets: WidgetId[]
  onClose: () => void
}

export function DashboardCustomizePanel({ roleWidgets, onClose }: DashboardCustomizePanelProps) {
  const t = useTranslations('dashboard')
  const { widgetOrder, setWidgetOrder, resetToDefaults } = useDashboardPrefsStore()
  const [localOrder, setLocalOrder] = useState<WidgetId[]>(widgetOrder ?? roleWidgets)

  const widgetLabels: Record<WidgetId, string> = {
    todayEncounters: t('todayEncounters'),
    pendingLabResults: t('pendingLabResults'),
    unresolvedConflicts: t('unresolvedConflicts'),
    queueDepth: t('queueDepth'),
    avgWaitTime: t('avgWaitTime'),
  }

  function toggleWidget(id: WidgetId) {
    setLocalOrder((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    )
  }

  function moveUp(id: WidgetId) {
    setLocalOrder((prev) => {
      const idx = prev.indexOf(id)
      if (idx <= 0) return prev
      const next = [...prev]
      ;[next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!]
      return next
    })
  }

  function moveDown(id: WidgetId) {
    setLocalOrder((prev) => {
      const idx = prev.indexOf(id)
      if (idx === -1 || idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1]!, next[idx]!]
      return next
    })
  }

  function handleSave() {
    setWidgetOrder(localOrder)
    onClose()
  }

  function handleReset() {
    resetToDefaults()
    setLocalOrder(roleWidgets)
  }

  return (
    <div
      className="rounded-xl bg-background/70 backdrop-blur-md p-5 ring-[0.65px] ring-gray-400/40 shadow-lg"
      role="dialog"
      aria-label={t('customizeWidgets')}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-black text-foreground uppercase tracking-wide">
          {t('customizeWidgets')}
        </h3>
        <Button
          variant="icon"
          type="button"
          onClick={onClose}
          aria-label={t('closeCustomize')}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <ul className="space-y-2">
        {ALL_WIDGETS.filter((w) => roleWidgets.includes(w)).map((id) => {
          const isVisible = localOrder.includes(id)
          const idx = localOrder.indexOf(id)
          return (
            <li key={id} className="flex items-center gap-2 rounded-lg border border-neutral-100 px-3 py-2">
              <input
                type="checkbox"
                checked={isVisible}
                onChange={() => toggleWidget(id)}
                className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
                aria-label={widgetLabels[id]}
              />
              <span className="flex-1 text-sm font-semibold text-foreground">
                {widgetLabels[id]}
              </span>
              {isVisible && (
                <div className="flex gap-1">
                  <Button
                    variant="icon"
                    type="button"
                    className="p-1"
                    onClick={() => moveUp(id)}
                    disabled={idx === 0}
                    aria-label={`Move ${widgetLabels[id]} up`}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="icon"
                    type="button"
                    className="p-1"
                    onClick={() => moveDown(id)}
                    disabled={idx === localOrder.length - 1}
                    aria-label={`Move ${widgetLabels[id]} down`}
                  >
                    ↓
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={handleReset}
          className="text-sm text-muted-foreground"
        >
          {t('resetDefaults')}
        </Button>
        <Button
          variant="primary"
          type="button"
          onClick={handleSave}
        >
          {t('saveLayout')}
        </Button>
      </div>
    </div>
  )
}
