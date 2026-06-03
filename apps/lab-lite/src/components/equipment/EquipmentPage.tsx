'use client'

/**
 * Story 51.4 — Equipment Page
 * Tabbed layout: "Queue" (all techs) + "Instruments" (manager only).
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { LabRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { InstrumentQueueView } from './InstrumentQueueView'
import { InstrumentRegistryPanel } from './InstrumentRegistryPanel'

type Tab = 'queue' | 'instruments'

export function EquipmentPage() {
  const t = useTranslations('equipment')
  const session = useAuthSessionStore((s) => s.session)
  const isManager = session?.labRole === LabRole.LAB_MANAGER

  const [activeTab, setActiveTab] = useState<Tab>('queue')

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      <h1 className="text-xl font-bold text-gray-900">{t('equipmentTitle') ?? 'Equipment'}</h1>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'queue'
              ? 'border-b-2 border-primary-500 text-primary-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          data-testid="tab-queue"
        >
          {t('queue')}
        </button>
        {isManager && (
          <button
            onClick={() => setActiveTab('instruments')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'instruments'
                ? 'border-b-2 border-primary-500 text-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            data-testid="tab-instruments"
          >
            {t('instruments')}
          </button>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'queue' && <InstrumentQueueView />}
      {activeTab === 'instruments' && isManager && <InstrumentRegistryPanel />}
    </div>
  )
}
