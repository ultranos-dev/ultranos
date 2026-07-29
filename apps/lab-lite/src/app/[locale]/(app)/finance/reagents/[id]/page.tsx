'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { getReagentByReagentId } from '@/lib/db'
import { ReagentStatus } from '@/lib/db'
import type { ReagentInventoryEntry } from '@/lib/db'
import { ConsumptionLogForm } from '@/components/finance/ConsumptionLogForm'
import { ReagentDisposalForm } from '@/components/finance/ReagentDisposalForm'
import { ReagentRegistrationForm } from '@/components/finance/ReagentRegistrationForm'
import { Button } from '@/components/ui/Button'

type View = 'detail' | 'consume' | 'dispose' | 'edit'

export default function ReagentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const t = useTranslations('finance.reagent')
  const [reagent, setReagent] = useState<ReagentInventoryEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('detail')

  useEffect(() => {
    if (!id) return
    getReagentByReagentId(id)
      .then((r) => setReagent(r ?? null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </div>
    )
  }

  if (!reagent) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-red-700">{t('notFound')}</p>
        <Button variant="secondary" onClick={() => router.push('/finance/reagents')}>
          {t('backToList')}
        </Button>
      </div>
    )
  }

  const isActive = reagent.status === ReagentStatus.ACTIVE

  return (
    <div className="flex flex-col gap-4">
      {view === 'detail' && (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">{reagent.name}</h1>
            <Button
              variant="secondary"
              onClick={() => router.push('/finance/reagents')}
            >
              {t('backToList')}
            </Button>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">{t('detail.lot')}</dt>
            <dd>{reagent.lotNumber}</dd>
            <dt className="text-muted-foreground">{t('detail.status')}</dt>
            <dd>{reagent.status}</dd>
            <dt className="text-muted-foreground">{t('detail.openDate')}</dt>
            <dd>{reagent.openDate}</dd>
            <dt className="text-muted-foreground">{t('detail.expiryDate')}</dt>
            <dd>{reagent.expiryDate}</dd>
            <dt className="text-muted-foreground">{t('detail.expectedTests')}</dt>
            <dd>{reagent.expectedTests}</dd>
            <dt className="text-muted-foreground">{t('detail.testsPerformed')}</dt>
            <dd>{reagent.testsPerformed}</dd>
            <dt className="text-muted-foreground">{t('detail.costPerUnit')}</dt>
            <dd>{reagent.costPerUnit} AFN</dd>
          </dl>

          {isActive && (
            <div className="flex gap-3">
              <Button onClick={() => setView('consume')}>{t('logUsage')}</Button>
              <Button variant="secondary" onClick={() => setView('edit')}>
                {t('edit')}
              </Button>
              <Button variant="danger" onClick={() => setView('dispose')}>
                {t('markDisposed')}
              </Button>
            </div>
          )}
        </>
      )}

      {view === 'consume' && (
        <>
          <Button variant="secondary" onClick={() => setView('detail')}>
            ← {t('back')}
          </Button>
          <ConsumptionLogForm
            reagent={reagent}
            onSuccess={() => {
              getReagentByReagentId(reagent.reagentId).then((r) => {
                if (r) setReagent(r)
              })
              setView('detail')
            }}
          />
        </>
      )}

      {view === 'dispose' && (
        <>
          <Button variant="secondary" onClick={() => setView('detail')}>
            ← {t('back')}
          </Button>
          <ReagentDisposalForm
            reagent={reagent}
            onSuccess={() => setView('detail')}
          />
        </>
      )}

      {view === 'edit' && (
        <>
          <Button variant="secondary" onClick={() => setView('detail')}>
            ← {t('back')}
          </Button>
          <ReagentRegistrationForm
            editEntry={reagent}
            onSuccess={(reagentId) => {
              getReagentByReagentId(reagentId).then((r) => {
                if (r) setReagent(r)
              })
              setView('detail')
            }}
          />
        </>
      )}
    </div>
  )
}
