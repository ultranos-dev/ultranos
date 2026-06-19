import { View, Text, StyleSheet } from 'react-native'
import { AlertTriangle } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { resolveLocalized } from '@/lib/localized-text'
import type { Lang } from '@/store/lang-store'
import type { DrugEntryTier1, DrugEntryTier2, DrugInteraction } from '@ultranos/shared-types'

export function SafetyZone({ entry, lang, isClinical }: { entry: DrugEntryTier1; lang: Lang; isClinical: boolean }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  // Critical subset only — the urgent "act now" items that must never be collapsible.
  // The longer warnings prose (warningsSummaryPlain) lives in a collapsible Warnings section.
  const seekHelp = resolveLocalized(entry.whenToSeekHelp, lang)

  const clinical = isClinical ? (entry as DrugEntryTier2) : undefined
  const severityOrder: Record<string, number> = { CONTRAINDICATED: 0, MAJOR: 1 }
  const blocking: DrugInteraction[] = (clinical?.interactions ?? [])
    .filter((i) => i.severity === 'CONTRAINDICATED' || i.severity === 'MAJOR')
    .slice()
    .sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9))
  const contraindications = clinical?.contraindications ?? []

  const hasAny = seekHelp.text || blocking.length > 0 || contraindications.length > 0
  if (!hasAny) return null

  return (
    <View testID="safety-zone" accessibilityRole="alert" style={styles.wrapper}>
      {seekHelp.text ? (
        <Row color={colors.warningDark} bg={colors.warningLight} title={t('drug.overview.seekHelp')} lines={[seekHelp.text]} rtl={seekHelp.isLocalized} />
      ) : null}
      {blocking.length > 0 ? (
        <Row color={colors.dangerDark} bg={colors.dangerLight} title={t('drug.clinical.interactions')} lines={blocking.map((i) => `${i.drugName}: ${i.mechanism}`)} />
      ) : null}
      {contraindications.length > 0 ? (
        <Row color={colors.dangerDark} bg={colors.dangerLight} title={t('drug.clinical.contraindications')} lines={contraindications} />
      ) : null}
    </View>
  )
}

function Row({ color, bg, title, lines, rtl }: { color: string; bg: string; title: string; lines: string[]; rtl?: boolean }) {
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <AlertTriangle size={18} color={color} />
      <View style={styles.textContainer}>
        <Text style={[styles.title, { color }]}>{title}</Text>
        {lines.map((line, i) => (
          <Text
            key={i}
            style={[styles.detail, { color }, rtl ? { fontFamily: FontFamily.arabic, writingDirection: 'rtl', textAlign: 'right' } : { writingDirection: 'ltr' }]}
          >
            {line}
          </Text>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { marginHorizontal: Spacing[4], marginTop: Spacing[2], marginBottom: Spacing[3], gap: Spacing[2] },
  banner: { flexDirection: 'row', alignItems: 'flex-start', padding: Spacing[3], gap: Spacing[2], borderRadius: Radius.md },
  textContainer: { flex: 1 },
  title: { fontSize: FontSize.sm, fontFamily: FontFamily.sansBold, marginBottom: Spacing[1] },
  detail: { fontSize: FontSize.xs, fontFamily: FontFamily.sans, lineHeight: 18 },
})
