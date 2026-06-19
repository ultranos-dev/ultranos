import { type ReactNode } from 'react'
import { View, StyleSheet } from 'react-native'
import { Spacing } from '@ultranos/ui-kit/tokens.native'
import { resolveLocalized } from '@/lib/localized-text'
import type { Lang } from '@/store/lang-store'
import { SectionCard } from './SectionCard'
import { MediaSection } from './MediaSection'
import { PricingTab } from './PricingTab'
import { FormularySection } from './FormularySection'
import type { DrugEntryTier1, DrugEntryTier2, DrugEntryTier3, DrugLocalizedText } from '@ultranos/shared-types'

export interface DrugSection {
  id: string
  title: string
  defaultOpen: boolean
  body: ReactNode
}

interface Args {
  entry: DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3
  lang: Lang
  t: (k: string) => string
  isClinical: boolean
  isPharmacist: boolean
}

/**
 * Build the ordered, render-if-present section descriptors for the drug detail
 * page. Role-aware:
 *  - patient/public → plain-language sections
 *  - clinical/pharmacist → Medscape-style monograph sections
 * Both render in the same flush card-list visual (via CollapsibleSection).
 * Safety-critical content is NOT here — it lives in the pinned SafetyZone.
 */
export function buildDrugSections({ entry, lang, t, isClinical, isPharmacist }: Args): DrugSection[] {
  const sections: DrugSection[] = []
  const resolve = (f: DrugLocalizedText | undefined) => resolveLocalized(f, lang)
  const resolveList = (fs: DrugLocalizedText[] | undefined) => {
    const items = (fs ?? []).map(resolve).filter((r) => r.text)
    return { texts: items.map((r) => r.text), isRtl: items.length > 0 && items.every((r) => r.isLocalized) }
  }
  const stack = (cards: ReactNode[]) => <View style={styles.stack}>{cards}</View>

  const summary = resolve(entry.summaryPlain)
  const warnings = resolve(entry.warningsSummaryPlain)
  const pregnancy = resolve(entry.pregnancySummaryPlain)
  const storage = resolve(entry.storageInstructions)
  const usedFor = resolveList(entry.usedFor)
  const sideEffects = resolveList(entry.commonSideEffects)
  const brandNames = (entry.brandNames ?? []).filter(Boolean)
  const doseForms = (entry.doseForms ?? []).filter(Boolean)
  const images = (entry as DrugEntryTier1).images ?? []

  if (!isClinical) {
    // ── Patient / public — plain language ──────────────────────────────────
    if (summary.text) sections.push({ id: 'about', title: t('drug.sections.about'), defaultOpen: true,
      body: <SectionCard title="" text={summary.text} isRtl={summary.isLocalized} /> })
    if (usedFor.texts.length) sections.push({ id: 'usedFor', title: t('drug.overview.usedFor'), defaultOpen: true,
      body: <SectionCard title="" items={usedFor.texts} isRtl={usedFor.isRtl} /> })
    if (warnings.text) sections.push({ id: 'warnings', title: t('drug.overview.warnings'), defaultOpen: false,
      body: <SectionCard title="" text={warnings.text} isRtl={warnings.isLocalized} severity="warning" /> })
    if (sideEffects.texts.length) sections.push({ id: 'sideEffects', title: t('drug.overview.sideEffects'), defaultOpen: false,
      body: <SectionCard title="" items={sideEffects.texts} isRtl={sideEffects.isRtl} /> })
    if (pregnancy.text) sections.push({ id: 'pregnancy', title: t('drug.overview.pregnancy'), defaultOpen: false,
      body: <SectionCard title="" text={pregnancy.text} isRtl={pregnancy.isLocalized} severity="info" /> })
    if (storage.text) sections.push({ id: 'storage', title: t('drug.overview.storage'), defaultOpen: false,
      body: <SectionCard title="" text={storage.text} isRtl={storage.isLocalized} /> })
    if (brandNames.length || doseForms.length) sections.push({ id: 'formsBrands', title: t('drug.overview.brandNames'), defaultOpen: false,
      body: stack([
        brandNames.length ? <SectionCard key="b" title={t('drug.overview.brandNames')} text={brandNames.join(', ')} isRtl={false} /> : null,
        doseForms.length ? <SectionCard key="d" title={t('drug.overview.doseForms')} text={doseForms.join(', ')} isRtl={false} /> : null,
      ]) })
  } else {
    // ── Clinical / pharmacist — Medscape-style monograph ───────────────────
    const e2 = entry as DrugEntryTier2
    const adminNotes = resolve(e2.administrationNotes)
    const fmtDose = (indication: string, dose: string | undefined, frequency: string, route?: string) =>
      `${indication}: ${dose ?? ''} ${frequency}${route ? ` (${route})` : ''}`.replace(/\s+/g, ' ').trim()
    const adultDosing = (e2.adultDosing ?? []).map((d) => fmtDose(d.indication, d.adultDose, d.frequency, d.route))
    const pediatricDosing = (e2.pediatricDosing ?? []).map((d) => fmtDose(d.indication, d.pediatricDose, d.frequency, d.route))

    // Dosage & Indications
    const dosageCards: ReactNode[] = []
    if (e2.indicationsClinical?.length) dosageCards.push(<SectionCard key="ind" title={t('drug.clinical.indications')} items={e2.indicationsClinical} />)
    if (adultDosing.length) dosageCards.push(<SectionCard key="adult" title={t('drug.clinical.adultDosing')} items={adultDosing} />)
    if (pediatricDosing.length) dosageCards.push(<SectionCard key="ped" title={t('drug.clinical.pediatricDosing')} items={pediatricDosing} />)
    if (e2.renalAdjustment) dosageCards.push(<SectionCard key="renal" title={t('drug.clinical.renalAdjustment')} text={e2.renalAdjustment} />)
    if (dosageCards.length) sections.push({ id: 'dosageIndications', title: t('drug.sections.dosageIndications'), defaultOpen: true, body: stack(dosageCards) })

    // Interactions (full list, all severities)
    if (e2.interactions?.length) {
      const items = e2.interactions.map((i) => `${i.severity}: ${i.drugName} — ${i.mechanism}`)
      sections.push({ id: 'interactions', title: t('drug.clinical.interactions'), defaultOpen: false, body: <SectionCard title="" items={items} /> })
    }

    // Adverse Effects (clinical adverse events + common side effects)
    const adverse = [...(e2.adverseEvents ?? []).map((a) => a.effect), ...sideEffects.texts]
    if (adverse.length) sections.push({ id: 'adverseEffects', title: t('drug.sections.adverseEffects'), defaultOpen: false,
      body: <SectionCard title="" items={adverse} /> })

    // Warnings (full text)
    if (warnings.text) sections.push({ id: 'warnings', title: t('drug.overview.warnings'), defaultOpen: false,
      body: <SectionCard title="" text={warnings.text} isRtl={warnings.isLocalized} severity="warning" /> })

    // Pregnancy (plain summary + PLLR clinical subsections)
    const pregCards: ReactNode[] = []
    if (pregnancy.text) pregCards.push(<SectionCard key="ps" title={t('drug.overview.pregnancy')} text={pregnancy.text} isRtl={pregnancy.isLocalized} severity="info" />)
    const pc = e2.pregnancyClinical
    if (pc?.pregnancy) pregCards.push(<SectionCard key="pc-preg" title="" text={pc.pregnancy} />)
    if (pc?.lactation) pregCards.push(<SectionCard key="pc-lact" title={t('drug.clinical.lactation')} text={pc.lactation} />)
    if (pc?.reproductivePotential) pregCards.push(<SectionCard key="pc-repro" title={t('drug.clinical.reproductivePotential')} text={pc.reproductivePotential} />)
    if (pc?.legacyCategory) pregCards.push(<SectionCard key="pc-cat" title={t('drug.clinical.pregnancyCategory')} text={pc.legacyCategory} />)
    if (pregCards.length) sections.push({ id: 'pregnancy', title: t('drug.overview.pregnancy'), defaultOpen: false, body: stack(pregCards) })

    // Pharmacology (mechanism + pharmacokinetics)
    const pk = e2.pharmacokinetics
    const pkLines: string[] = []
    if (pk) {
      if (pk.halfLifeHours != null) pkLines.push(`${t('drug.clinical.halfLife')}: ${pk.halfLifeHours} h`)
      if (pk.proteinBindingPct != null) pkLines.push(`${t('drug.clinical.proteinBinding')}: ${pk.proteinBindingPct}%`)
      if (pk.volumeOfDistribution) pkLines.push(`${t('drug.clinical.volumeDistribution')}: ${pk.volumeOfDistribution}`)
      if (pk.metabolism) pkLines.push(`${t('drug.clinical.metabolism')}: ${pk.metabolism}`)
      if (pk.excretion) pkLines.push(`${t('drug.clinical.excretion')}: ${pk.excretion}`)
    }
    const pharmCards: ReactNode[] = []
    if (e2.mechanismOfAction) pharmCards.push(<SectionCard key="moa" title={t('drug.clinical.mechanism')} text={e2.mechanismOfAction} />)
    if (pkLines.length) pharmCards.push(<SectionCard key="pk" title={t('drug.clinical.pharmacokinetics')} items={pkLines} />)
    if (pharmCards.length) sections.push({ id: 'pharmacology', title: t('drug.sections.pharmacology'), defaultOpen: false, body: stack(pharmCards) })

    // Administration (admin notes + storage + dose forms)
    const adminCards: ReactNode[] = []
    if (adminNotes.text) adminCards.push(<SectionCard key="an" title={t('drug.clinical.adminNotes')} text={adminNotes.text} isRtl={adminNotes.isLocalized} />)
    if (storage.text) adminCards.push(<SectionCard key="st" title={t('drug.overview.storage')} text={storage.text} isRtl={storage.isLocalized} />)
    if (doseForms.length) adminCards.push(<SectionCard key="df" title={t('drug.overview.doseForms')} text={doseForms.join(', ')} isRtl={false} />)
    if (adminCards.length) sections.push({ id: 'administration', title: t('drug.sections.administration'), defaultOpen: false, body: stack(adminCards) })

    // Formulary (pharmacist/admin only)
    if (isPharmacist) {
      const e3 = entry as DrugEntryTier3
      const hasFormulary = !!(e3.formularyStatus || e3.dispensingNotes || e3.substitutes?.length || e3.recallAlerts?.length)
      if (hasFormulary) sections.push({ id: 'formulary', title: t('drug.sections.formulary'), defaultOpen: false,
        body: <FormularySection entry={e3} /> })
    }
  }

  // ── Common to all roles — photos + pricing ───────────────────────────────
  if (images.length) sections.push({ id: 'photos', title: t('drug.photos.title'), defaultOpen: false,
    body: <MediaSection images={images} /> })
  sections.push({ id: 'pricing', title: t('drug.sections.pricing'), defaultOpen: false,
    body: <PricingTab atcCode={entry.atcCode} /> })

  return sections
}

const styles = StyleSheet.create({
  stack: { gap: Spacing[3] },
})
