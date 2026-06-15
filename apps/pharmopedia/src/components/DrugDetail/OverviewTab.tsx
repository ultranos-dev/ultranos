import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier1 } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'

function localText(field: Record<string, string | undefined>, lang: Lang): string {
  return field[lang] ?? field.en ?? ''
}

export function OverviewTab({ entry, lang }: { entry: DrugEntryTier1; lang: Lang }) {
  const { t } = useTranslation()
  const isRtl = isRtlLang(lang)

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {entry.summaryPlain && localText(entry.summaryPlain, lang) ? (
        <Section title={t('drug.overview.summary')} text={localText(entry.summaryPlain, lang)} isRtl={isRtl} />
      ) : null}
      {entry.usedFor.length > 0 && (
        <Section title={t('drug.overview.usedFor')} items={entry.usedFor.map(f => localText(f, lang)).filter(Boolean)} isRtl={isRtl} />
      )}
      {entry.commonSideEffects.length > 0 && (
        <Section title={t('drug.overview.sideEffects')} items={entry.commonSideEffects.map(f => localText(f, lang)).filter(Boolean)} isRtl={isRtl} />
      )}
      {localText(entry.whenToSeekHelp, lang) ? (
        <Section title={t('drug.overview.seekHelp')} text={localText(entry.whenToSeekHelp, lang)} isRtl={isRtl} />
      ) : null}
      {localText(entry.storageInstructions, lang) ? (
        <Section title={t('drug.overview.storage')} text={localText(entry.storageInstructions, lang)} isRtl={isRtl} />
      ) : null}
      {localText(entry.pregnancySummaryPlain, lang) ? (
        <Section title={t('drug.overview.pregnancy')} text={localText(entry.pregnancySummaryPlain, lang)} isRtl={isRtl} />
      ) : null}
      {localText(entry.warningsSummaryPlain, lang) ? (
        <Section title={t('drug.overview.warnings')} text={localText(entry.warningsSummaryPlain, lang)} isRtl={isRtl} />
      ) : null}
    </ScrollView>
  )
}

function Section({ title, text, items, isRtl }: { title: string; text?: string; items?: string[]; isRtl: boolean }) {
  const contentStyle = isRtl ? styles.rtlText : undefined
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {text && <Text style={[styles.sectionText, contentStyle]}>{text}</Text>}
      {items?.map((item, i) => <Text key={i} style={[styles.item, contentStyle]}>• {item}</Text>)}
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionText: { fontSize: 15, color: '#111827', lineHeight: 22 },
  item: { fontSize: 15, color: '#111827', lineHeight: 22 },
  rtlText: { fontFamily: 'NotoNaskhArabic', textAlign: 'right' },
})
