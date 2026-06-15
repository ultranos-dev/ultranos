import { ScrollView, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier1 } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'
import { SectionCard } from './SectionCard'
import { Spacing } from '@ultranos/ui-kit/tokens.native'

function localText(field: Record<string, string | undefined>, lang: Lang): string {
  return field[lang] ?? field.en ?? ''
}

export function OverviewTab({ entry, lang }: { entry: DrugEntryTier1; lang: Lang }) {
  const { t } = useTranslation()
  const isRtl = isRtlLang(lang)

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {entry.summaryPlain && localText(entry.summaryPlain, lang) ? (
        <SectionCard title={t('drug.overview.summary')} text={localText(entry.summaryPlain, lang)} isRtl={isRtl} />
      ) : null}
      {entry.usedFor.length > 0 && (
        <SectionCard title={t('drug.overview.usedFor')} items={entry.usedFor.map((f) => localText(f, lang)).filter(Boolean)} isRtl={isRtl} />
      )}
      {entry.commonSideEffects.length > 0 && (
        <SectionCard title={t('drug.overview.sideEffects')} items={entry.commonSideEffects.map((f) => localText(f, lang)).filter(Boolean)} isRtl={isRtl} />
      )}
      {localText(entry.whenToSeekHelp, lang) ? (
        <SectionCard title={t('drug.overview.seekHelp')} text={localText(entry.whenToSeekHelp, lang)} isRtl={isRtl} severity="warning" />
      ) : null}
      {localText(entry.storageInstructions, lang) ? (
        <SectionCard title={t('drug.overview.storage')} text={localText(entry.storageInstructions, lang)} isRtl={isRtl} />
      ) : null}
      {localText(entry.pregnancySummaryPlain, lang) ? (
        <SectionCard title={t('drug.overview.pregnancy')} text={localText(entry.pregnancySummaryPlain, lang)} isRtl={isRtl} severity="info" />
      ) : null}
      {localText(entry.warningsSummaryPlain, lang) ? (
        <SectionCard title={t('drug.overview.warnings')} text={localText(entry.warningsSummaryPlain, lang)} isRtl={isRtl} severity="warning" />
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
})
