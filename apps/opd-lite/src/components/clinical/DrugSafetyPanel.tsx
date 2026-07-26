'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { isTier2, hasList } from '@ultranos/drug-catalog-sync'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import { getMirrorDrugEntry } from '@/lib/drug-entry'

function isReproductiveAgeFemale(sex?: string, age?: number): boolean {
  return sex?.toLowerCase() === 'female' && typeof age === 'number' && age >= 13 && age <= 55
}

export function DrugSafetyPanel({
  atcCode, patientSex, patientAge,
}: { atcCode: string; patientSex?: string; patientAge?: number }) {
  const t = useTranslations('prescription')
  const [entry, setEntry] = useState<DrugEntry | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    void getMirrorDrugEntry(atcCode).then((e) => { if (!cancelled) { setEntry(e); setLoaded(true) } })
    return () => { cancelled = true }
  }, [atcCode])

  if (!loaded || !entry) return null // absent from mirror → render nothing (no implied-safe)

  const tier2 = isTier2(entry) ? entry : null
  const showPregnancy = isReproductiveAgeFemale(patientSex, patientAge)
  const pregText = tier2?.pregnancyClinical?.pregnancy || tier2?.pregnancyClinical?.lactation

  return (
    <div
      data-testid="drug-safety-panel"
      className="rounded-xl ring-[0.65px] ring-destructive/30 bg-destructive/5 p-4 space-y-2"
    >
      <h4 className="text-sm font-bold text-destructive">{t('drugSafetyTitle')}</h4>
      {tier2 && hasList(tier2.contraindications) ? (
        <div>
          <p className="text-xs font-semibold text-foreground">{t('contraindications')}</p>
          <ul className="mt-1 space-y-0.5">
            {tier2.contraindications.map((c) => (
              <li key={c} className="text-sm text-destructive">&bull; {c}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t('noContraindicationData')}</p>
      )}
      {showPregnancy && (
        <div data-testid="pregnancy-note" className="border-t border-border pt-2">
          <p className="text-xs font-semibold text-foreground">{t('pregnancyLactation')}</p>
          <p className="text-sm text-foreground">{pregText || t('noPregnancyData')}</p>
          <p className="mt-1 text-xs text-muted-foreground italic">
            {t('pregnancyApplicabilityNote')}
          </p>
        </div>
      )}
    </div>
  )
}
