import { ScrollView, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier1, DrugLocalizedText } from '@ultranos/shared-types'
import { type Lang } from '@/store/lang-store'
import { resolveLocalized } from '@/lib/localized-text'
import { SectionCard } from './SectionCard'
import { Spacing } from '@ultranos/ui-kit/tokens.native'

export function OverviewTab({ entry, lang }: { entry: DrugEntryTier1; lang: Lang }) {
  const { t } = useTranslation()

  const resolve = (field: DrugLocalizedText | undefined) => resolveLocalized(field, lang)
  // For list fields, treat the section as RTL only when every shown item is
  // genuinely localized — a single English fallback would otherwise reorder.
  const resolveList = (fields: DrugLocalizedText[] | undefined) => {
    const items = (fields ?? []).map(resolve).filter((r) => r.text)
    return { texts: items.map((r) => r.text), isRtl: items.length > 0 && items.every((r) => r.isLocalized) }
  }

  const summary = resolve(entry.summaryPlain)
  const seekHelp = resolve(entry.whenToSeekHelp)
  const storage = resolve(entry.storageInstructions)
  const pregnancy = resolve(entry.pregnancySummaryPlain)
  const warnings = resolve(entry.warningsSummaryPlain)
  const usedFor = resolveList(entry.usedFor)
  const sideEffects = resolveList(entry.commonSideEffects)

  // Plain-language fields are not populated for every drug; always surface the
  // basic reference info (brand names, dose forms) so the tab is never empty.
  // Brand names and dose forms are always Latin → isRtl={false}.
  const brandNames = (entry.brandNames ?? []).filter(Boolean)
  const doseForms = (entry.doseForms ?? []).filter(Boolean)

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {summary.text ? (
        <SectionCard title={t('drug.overview.summary')} text={summary.text} isRtl={summary.isLocalized} />
      ) : null}
      {brandNames.length > 0 && (
        <SectionCard title={t('drug.overview.brandNames')} text={brandNames.join(', ')} isRtl={false} />
      )}
      {doseForms.length > 0 && (
        <SectionCard title={t('drug.overview.doseForms')} text={doseForms.join(', ')} isRtl={false} />
      )}
      {usedFor.texts.length > 0 && (
        <SectionCard title={t('drug.overview.usedFor')} items={usedFor.texts} isRtl={usedFor.isRtl} />
      )}
      {sideEffects.texts.length > 0 && (
        <SectionCard title={t('drug.overview.sideEffects')} items={sideEffects.texts} isRtl={sideEffects.isRtl} />
      )}
      {seekHelp.text ? (
        <SectionCard title={t('drug.overview.seekHelp')} text={seekHelp.text} isRtl={seekHelp.isLocalized} severity="warning" />
      ) : null}
      {storage.text ? (
        <SectionCard title={t('drug.overview.storage')} text={storage.text} isRtl={storage.isLocalized} />
      ) : null}
      {pregnancy.text ? (
        <SectionCard title={t('drug.overview.pregnancy')} text={pregnancy.text} isRtl={pregnancy.isLocalized} severity="info" />
      ) : null}
      {warnings.text ? (
        <SectionCard title={t('drug.overview.warnings')} text={warnings.text} isRtl={warnings.isLocalized} severity="warning" />
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
})
