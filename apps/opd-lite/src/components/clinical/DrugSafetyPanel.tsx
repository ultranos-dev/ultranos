'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { isTier2, hasList } from '@ultranos/drug-catalog-sync'
import type { DrugEntry } from '@ultranos/drug-catalog-sync'
import { getMirrorDrugEntry } from '@/lib/drug-entry'
import { ROUTE_OPTIONS } from '@/lib/prescription-config'

function isReproductiveAgeFemale(sex?: string, age?: number): boolean {
  return sex?.toLowerCase() === 'female' && typeof age === 'number' && age >= 13 && age <= 55
}

function routeLabel(route?: string): string | undefined {
  if (!route) return undefined
  return ROUTE_OPTIONS.find((r) => r.code === route)?.display ?? route
}

export interface DrugSafetyPanelProps {
  atcCode: string
  patientSex?: string
  patientAge?: number
  /** Selected-presentation identity, sourced from the prescription form. */
  display?: string
  strength?: string
  form?: string
  route?: string
  brandName?: string
  manufacturer?: string
}

/**
 * Inline "selected medication" detail card shown once a drug is chosen: product
 * identity, safety (contraindications + pregnancy, kept prominent/red), and key
 * monograph highlights (indications, dosing). Renders nothing when the drug is
 * absent from the on-device mirror — never an implied-safe empty state.
 */
export function DrugSafetyPanel({
  atcCode, patientSex, patientAge, display, strength, form, route, brandName, manufacturer,
}: DrugSafetyPanelProps) {
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

  const identityMeta = [strength, form, routeLabel(route)].filter(Boolean).join(' · ')
  const brandLine = brandName
    ? manufacturer ? `${brandName} (${manufacturer})` : brandName
    : undefined

  return (
    <div
      data-testid="drug-safety-panel"
      className="rounded-xl ring-[0.65px] ring-border/50 bg-card p-4 space-y-3"
    >
      {/* Product identity — what exactly is being prescribed. */}
      <div data-testid="drug-identity" className="space-y-0.5">
        <p className="text-sm font-bold text-foreground">
          {display ?? entry.innName}
          {identityMeta && <span className="ms-2 font-semibold text-primary">{identityMeta}</span>}
        </p>
        {brandLine && <p className="text-xs text-muted-foreground">{brandLine}</p>}
      </div>

      {/* Safety — contraindications stay prominent in red (never implied-safe). */}
      <div className="rounded-lg ring-[0.65px] ring-destructive/30 bg-destructive/5 p-3 space-y-2">
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

      {/* Monograph highlights — indications and dosing at a glance (tier-2 only). */}
      {tier2 && (
        <div className="space-y-2">
          {hasList(tier2.indicationsClinical) && (
            <div>
              <p className="text-xs font-semibold text-foreground">{t('indicationsClinical')}</p>
              <p className="text-sm text-foreground">{tier2.indicationsClinical.join('; ')}</p>
            </div>
          )}
          {hasList(tier2.adultDosing) && (
            <div>
              <p className="text-xs font-semibold text-foreground">{t('adultDosing')}</p>
              <ul className="mt-1 space-y-0.5">
                {tier2.adultDosing.map((d, i) => (
                  <li key={i} className="text-sm text-foreground">{d.indication}: {d.adultDose ?? d.frequency}</li>
                ))}
              </ul>
            </div>
          )}
          {hasList(tier2.pediatricDosing) && (
            <div>
              <p className="text-xs font-semibold text-foreground">{t('pediatricDosing')}</p>
              <ul className="mt-1 space-y-0.5">
                {tier2.pediatricDosing.map((d, i) => (
                  <li key={i} className="text-sm text-foreground">{d.indication}: {d.pediatricDose ?? d.frequency}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
