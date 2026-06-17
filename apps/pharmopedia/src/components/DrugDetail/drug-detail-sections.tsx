import { type ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { resolveLocalized } from '@/lib/localized-text'
import type { Lang } from '@/store/lang-store'
import { SectionCard } from './SectionCard'
import { MediaSection } from './MediaSection'
import { PricingTab } from './PricingTab'
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

export function buildDrugSections({ entry, lang, t, isClinical, isPharmacist }: Args): DrugSection[] {
  const sections: DrugSection[] = []
  const resolve = (f: DrugLocalizedText | undefined) => resolveLocalized(f, lang)
  const resolveList = (fs: DrugLocalizedText[] | undefined) => {
    const items = (fs ?? []).map(resolve).filter((r) => r.text)
    return { texts: items.map((r) => r.text), isRtl: items.length > 0 && items.every((r) => r.isLocalized) }
  }

  const summary = resolve(entry.summaryPlain)
  if (summary.text) sections.push({ id: 'summary', title: t('drug.overview.summary'), defaultOpen: true,
    body: <SectionCard title="" text={summary.text} isRtl={summary.isLocalized} /> })

  const usedFor = resolveList(entry.usedFor)
  if (usedFor.texts.length) sections.push({ id: 'usedFor', title: t('drug.overview.usedFor'), defaultOpen: true,
    body: <SectionCard title="" items={usedFor.texts} isRtl={usedFor.isRtl} /> })

  const sideEffects = resolveList(entry.commonSideEffects)
  if (sideEffects.texts.length) sections.push({ id: 'sideEffects', title: t('drug.overview.sideEffects'), defaultOpen: false,
    body: <SectionCard title="" items={sideEffects.texts} isRtl={sideEffects.isRtl} /> })

  const pregnancy = resolve(entry.pregnancySummaryPlain)
  if (pregnancy.text) sections.push({ id: 'pregnancy', title: t('drug.overview.pregnancy'), defaultOpen: false,
    body: <SectionCard title="" text={pregnancy.text} isRtl={pregnancy.isLocalized} severity="info" /> })

  const storage = resolve(entry.storageInstructions)
  if (storage.text) sections.push({ id: 'storage', title: t('drug.overview.storage'), defaultOpen: false,
    body: <SectionCard title="" text={storage.text} isRtl={storage.isLocalized} /> })

  const brandNames = (entry.brandNames ?? []).filter(Boolean)
  const doseForms = (entry.doseForms ?? []).filter(Boolean)
  if (brandNames.length || doseForms.length) sections.push({
    id: 'formsBrands', title: t('drug.overview.brandNames'), defaultOpen: false,
    body: (
      <View style={styles.stack}>
        {brandNames.length ? <SectionCard title={t('drug.overview.brandNames')} text={brandNames.join(', ')} isRtl={false} /> : null}
        {doseForms.length ? <SectionCard title={t('drug.overview.doseForms')} text={doseForms.join(', ')} isRtl={false} /> : null}
      </View>
    ),
  })

  const images = (entry as DrugEntryTier1).images ?? []
  if (images.length) sections.push({ id: 'photos', title: t('drug.photos.title'), defaultOpen: false,
    body: <MediaSection images={images} /> })

  sections.push({ id: 'pricing', title: t('drug.tabs.pricing'), defaultOpen: false,
    body: <PricingTab atcCode={entry.atcCode} /> })

  if (isClinical) {
    const e2 = entry as DrugEntryTier2
    const adminNotes = resolve(e2.administrationNotes)
    sections.push({ id: 'clinical', title: t('drug.tabs.clinical'), defaultOpen: false,
      body: (
        <View style={styles.stack}>
          {e2.mechanismOfAction ? <SectionCard title={t('drug.clinical.mechanism')} text={e2.mechanismOfAction} /> : null}
          {e2.indicationsClinical?.length ? <SectionCard title={t('drug.clinical.indications')} items={e2.indicationsClinical} /> : null}
          {e2.adverseEvents?.length ? <SectionCard title={t('drug.clinical.adverseEvents')} items={e2.adverseEvents.map((a) => a.effect)} /> : null}
          {e2.renalAdjustment ? <SectionCard title={t('drug.clinical.renalAdjustment')} text={e2.renalAdjustment} /> : null}
          {adminNotes.text ? <SectionCard title={t('drug.clinical.adminNotes')} text={adminNotes.text} isRtl={adminNotes.isLocalized} /> : null}
        </View>
      ) })
  }

  if (isPharmacist) {
    const e3 = entry as DrugEntryTier3
    const lines: string[] = []
    if (e3.formularyStatus) lines.push(e3.formularyStatus)
    if (e3.dispensingNotes) lines.push(e3.dispensingNotes)
    if (lines.length) sections.push({ id: 'dispensing', title: t('drug.sections.dispensing'), defaultOpen: false,
      body: <SectionCard title="" items={lines} /> })
  }

  return sections
}

const styles = StyleSheet.create({
  stack: { gap: Spacing[3] },
})
