'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@ultranos/ui-kit/components/ui/sheet'
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

const NoData = () => <p className="text-xs text-muted-foreground italic">No data on file.</p>

export function DrugMonographSheet({ atcCode, label }: { atcCode: string; label: string }) {
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
        <button type="button" data-testid="monograph-trigger" className="text-sm font-medium text-primary-700 underline underline-offset-2">
          ⓘ Drug info
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{label}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {!loaded && <p className="text-sm text-muted-foreground">Loading…</p>}
          {loaded && !entry && <p className="text-sm text-muted-foreground">Limited data available for this drug.</p>}
          {t2 && (
            <>
              <Section title="Mechanism of action">{t2.mechanismOfAction || <NoData />}</Section>
              <Section title="Indications">{t2.indicationsClinical.length ? t2.indicationsClinical.join('; ') : <NoData />}</Section>
              <Section title="Contraindications">
                {t2.contraindications.length ? (
                  <ul className="space-y-0.5">{t2.contraindications.map((c) => <li key={c}>&bull; {c}</li>)}</ul>
                ) : <NoData />}
              </Section>
              <Section title="Adult dosing">{t2.adultDosing.length ? t2.adultDosing.map((d, i) => <p key={i}>{d.indication}: {d.adultDose ?? d.frequency}</p>) : <NoData />}</Section>
              <Section title="Pediatric dosing">{t2.pediatricDosing.length ? t2.pediatricDosing.map((d, i) => <p key={i}>{d.indication}: {d.pediatricDose ?? d.frequency}</p>) : <NoData />}</Section>
              <Section title="Pregnancy / lactation">{t2.pregnancyClinical?.pregnancy || t2.pregnancyClinical?.lactation || <NoData />}</Section>
              <Section title="Adverse effects">{t2.adverseEvents.length ? t2.adverseEvents.map((a) => a.effect).join(', ') : <NoData />}</Section>
              <Section title="Pharmacokinetics">{t2.pharmacokinetics?.halfLife ? `Half-life: ${t2.pharmacokinetics.halfLife}` : <NoData />}</Section>
            </>
          )}
          {loaded && entry && !t2 && <p className="text-sm text-muted-foreground">Clinical detail not available at your access level.</p>}
        </div>
      </SheetContent>
    </Sheet>
  )
}
