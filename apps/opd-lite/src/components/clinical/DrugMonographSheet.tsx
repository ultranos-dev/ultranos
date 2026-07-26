'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@ultranos/ui-kit/components/ui/sheet'
import { Info } from '@ultranos/ui-kit/icons'
import { isTier2 } from '@ultranos/drug-catalog-sync'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import { getMirrorDrugEntry } from '@/lib/drug-entry'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h4 className="text-sm font-bold text-foreground">{title}</h4>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  )
}

export function DrugMonographSheet({ atcCode, label }: { atcCode: string; label: string }) {
  const t = useTranslations('prescription')
  const NoData = () => <p className="text-xs text-muted-foreground italic">{t('noDataOnFile')}</p>
  const [entry, setEntry] = useState<DrugEntry | null>(null)
  const [loaded, setLoaded] = useState(false)

  function onOpenChange(open: boolean) {
    if (open && !loaded) {
      void getMirrorDrugEntry(atcCode).then((e) => { setEntry(e); setLoaded(true) })
    }
  }

  const t2 = entry && isTier2(entry) ? entry : null

  return (
    <Sheet onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button type="button" data-testid="monograph-trigger" className="text-sm font-medium text-primary underline underline-offset-2">
          <Info size={14} aria-hidden className="inline-block me-1" />{t('drugInfoTrigger')}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{label}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {!loaded && <p className="text-sm text-muted-foreground">{t('monographLoading')}</p>}
          {loaded && !entry && <p className="text-sm text-muted-foreground">{t('limitedDataAvailable')}</p>}
          {t2 && (
            <>
              <Section title={t('mechanismOfAction')}>{t2.mechanismOfAction || <NoData />}</Section>
              <Section title={t('indicationsClinical')}>{t2.indicationsClinical.length ? t2.indicationsClinical.join('; ') : <NoData />}</Section>
              <Section title={t('contraindications')}>
                {t2.contraindications.length ? (
                  <ul className="space-y-0.5">{t2.contraindications.map((c) => <li key={c}>&bull; {c}</li>)}</ul>
                ) : <NoData />}
              </Section>
              <Section title={t('adultDosing')}>{t2.adultDosing.length ? t2.adultDosing.map((d, i) => <p key={i}>{d.indication}: {d.adultDose ?? d.frequency}</p>) : <NoData />}</Section>
              <Section title={t('pediatricDosing')}>{t2.pediatricDosing.length ? t2.pediatricDosing.map((d, i) => <p key={i}>{d.indication}: {d.pediatricDose ?? d.frequency}</p>) : <NoData />}</Section>
              <Section title={t('pregnancyLactation')}>{t2.pregnancyClinical?.pregnancy || t2.pregnancyClinical?.lactation || <NoData />}</Section>
              <Section title={t('adverseEffects')}>{t2.adverseEvents.length ? t2.adverseEvents.map((a) => a.effect).join(', ') : <NoData />}</Section>
              <Section title={t('pharmacokinetics')}>{t2.pharmacokinetics?.halfLife ? t('halfLife', { value: t2.pharmacokinetics.halfLife }) : <NoData />}</Section>
            </>
          )}
          {loaded && entry && !t2 && <p className="text-sm text-muted-foreground">{t('clinicalDetailUnavailable')}</p>}
        </div>
      </SheetContent>
    </Sheet>
  )
}
