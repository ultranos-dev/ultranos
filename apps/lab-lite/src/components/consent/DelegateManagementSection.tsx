'use client'

import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getDelegatesByPatient, type FamilyDelegate, type DelegateRelationship } from '@/lib/db'
import { DelegateRegistration } from './DelegateRegistration'
import { RevokeDelegateDialog } from './RevokeDelegateDialog'

interface DelegateManagementSectionProps {
  patientRef: string
}

/** Map DB relationship value to i18n key */
const REL_I18N: Record<DelegateRelationship, string> = {
  'spouse':    'spouse',
  'parent':    'parent',
  'child':     'child',
  'sibling':   'sibling',
  'grandchild':'grandchild',
  'in-law':    'inLaw',
  'other':     'other',
}

/**
 * Displays active family delegates for a patient and provides controls to:
 * - Register a new delegate (opens DelegateRegistration)
 * - Revoke an existing active delegate (opens RevokeDelegateDialog)
 *
 * Suitable for embedding in patient profile/detail views (Task 3.1 & 3.3).
 */
export function DelegateManagementSection({ patientRef }: DelegateManagementSectionProps) {
  const t = useTranslations('delegates')

  const [delegates, setDelegates] = useState<FamilyDelegate[]>([])
  const [loading, setLoading] = useState(true)
  const [showRegister, setShowRegister] = useState(false)
  const [revoking, setRevoking] = useState<FamilyDelegate | null>(null)

  const loadDelegates = useCallback(async () => {
    setLoading(true)
    const all = await getDelegatesByPatient(patientRef)
    setDelegates(all)
    setLoading(false)
  }, [patientRef])

  useEffect(() => {
    void loadDelegates()
  }, [loadDelegates])

  const activeDelegates = delegates.filter((d) => d.status === 'active')

  return (
    <section aria-labelledby="delegates-section-title" className="mt-6">
      <div className="flex items-center justify-between">
        <h3 id="delegates-section-title" className="text-base font-semibold text-foreground dark:text-foreground">
          {t('sectionTitle')}
        </h3>
        <button
          type="button"
          onClick={() => setShowRegister(true)}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {t('addDelegate')}
        </button>
      </div>

      {loading ? (
        <div className="mt-4 text-sm text-muted-foreground" aria-busy="true">…</div>
      ) : activeDelegates.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground dark:text-muted-foreground">
          {t('noActiveDelegates')}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {activeDelegates.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3 dark:border-border"
            >
              <div className="text-sm">
                <span className="font-medium text-foreground dark:text-foreground">
                  {t(`relationship.${REL_I18N[d.delegateRelationship] ?? 'other'}`)}
                </span>
                <span className="ms-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  {t('activeLabel')}
                </span>
                <p className="text-muted-foreground dark:text-muted-foreground">
                  {new Date(d.registeredAt).toLocaleDateString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRevoking(d)}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {t('revokeDelegate')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {showRegister && (
        <div className="mt-4">
          <DelegateRegistration
            patientRef={patientRef}
            onRegistered={async () => {
              setShowRegister(false)
              await loadDelegates()
            }}
            onCancel={() => setShowRegister(false)}
          />
        </div>
      )}

      {revoking != null && (
        <RevokeDelegateDialog
          delegateId={revoking.id!}
          patientRef={patientRef}
          delegateRelationship={revoking.delegateRelationship}
          onRevoked={async () => {
            setRevoking(null)
            await loadDelegates()
          }}
          onCancel={() => setRevoking(null)}
        />
      )}
    </section>
  )
}
