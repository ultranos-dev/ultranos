'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogDescription, ModalHeader, DialogTrigger } from '@ultranos/ui-kit/components/ui/dialog'
import { Info } from '@ultranos/ui-kit/icons'
import { isTier2 } from '@ultranos/drug-catalog-sync'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import { getMirrorDrugEntry, getBrandsWithPresentationsForAtc, type BrandWithPresentations } from '@/lib/drug-entry'

/** Human-readable one-line summary of a presentation: strength · form · pack · price. */
function presentationSummary(p: {
  strength?: string; doseForm?: string; packSize?: number; packUnit?: string
  referencePrice?: number; currency?: string
}): string {
  const pack = p.packSize ? `${p.packSize}${p.packUnit ? ` ${p.packUnit}` : ''}` : undefined
  const price = typeof p.referencePrice === 'number'
    ? `${p.currency ? `${p.currency} ` : ''}${p.referencePrice}`
    : undefined
  return [p.strength, p.doseForm, pack, price].filter(Boolean).join(' · ')
}

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
  const [brands, setBrands] = useState<BrandWithPresentations[]>([])
  const [loaded, setLoaded] = useState(false)

  function onOpenChange(open: boolean) {
    if (open && !loaded) {
      void Promise.all([
        getMirrorDrugEntry(atcCode),
        getBrandsWithPresentationsForAtc(atcCode),
      ]).then(([e, b]) => { setEntry(e); setBrands(b); setLoaded(true) })
    }
  }

  const t2 = entry && isTier2(entry) ? entry : null

  return (
    <Dialog onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button type="button" data-testid="monograph-trigger" className="text-sm font-medium text-primary underline underline-offset-2">
          <Info size={14} aria-hidden className="inline-block me-1" />{t('drugInfoTrigger')}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto" hideClose>
        <ModalHeader title={label} tone="primary" dialog inset />
        <DialogDescription className="sr-only">{t('drugInfoTrigger')}</DialogDescription>
        <div className="mt-4 space-y-4">
          {!loaded && <p className="text-sm text-muted-foreground">{t('monographLoading')}</p>}
          {loaded && !entry && <p className="text-sm text-muted-foreground">{t('limitedDataAvailable')}</p>}
          {loaded && entry && (
            <>
              {entry.images && entry.images.length > 0 && (
                <Section title={t('productImages')}>
                  <div className="flex flex-wrap gap-2">
                    {entry.images.map((img, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={img.url}
                        alt={img.caption ?? label}
                        className="h-16 w-16 rounded-lg object-cover ring-[0.65px] ring-border/50"
                      />
                    ))}
                  </div>
                </Section>
              )}
              {brands.length > 0 && (
                <Section title={t('brands')}>
                  <ul className="space-y-2">
                    {brands.map((b) => (
                      <li key={b.brandName}>
                        <p className="font-semibold text-foreground">
                          {b.brandName}{b.manufacturer ? ` (${b.manufacturer})` : ''}
                        </p>
                        {b.presentations.length > 0 && (
                          <ul className="mt-0.5 space-y-0.5 ps-3">
                            {b.presentations.map((p) => (
                              <li key={p.id} className="text-xs text-muted-foreground">{presentationSummary(p)}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {entry.storageInstructions?.en && (
                <Section title={t('storage')}>{entry.storageInstructions.en}</Section>
              )}
            </>
          )}
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
              <Section title={t('pharmacokinetics')}>
                {(() => {
                  const pk = t2.pharmacokinetics
                  const rows = [
                    pk?.halfLife ? t('halfLife', { value: pk.halfLife }) : null,
                    pk?.proteinBinding ? `${t('proteinBinding')}: ${pk.proteinBinding}` : null,
                    pk?.metabolism ? `${t('metabolism')}: ${pk.metabolism}` : null,
                    pk?.excretion ? `${t('excretion')}: ${pk.excretion}` : null,
                  ].filter(Boolean) as string[]
                  return rows.length ? rows.map((r, i) => <p key={i}>{r}</p>) : <NoData />
                })()}
              </Section>
            </>
          )}
          {loaded && entry && !t2 && <p className="text-sm text-muted-foreground">{t('clinicalDetailUnavailable')}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
