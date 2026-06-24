import { View, Text, StyleSheet } from 'react-native'
import type { DrugBrandWithPresentations, DrugBrandPresentation } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { Card } from '@ultranos/ui-kit/native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  brands: DrugBrandWithPresentations[]
  lang: Lang
  t: (key: string) => string
}

/** One line summarising a presentation: strength · form · pack · price. */
function presentationLine(p: DrugBrandPresentation): string {
  const pack = p.packSize != null
    ? `${p.packSize}${p.packUnit ? ` ${p.packUnit}` : ''}`
    : p.volume
  const price = p.referencePrice != null
    ? `${p.referencePrice}${p.currency ? ` ${p.currency}` : ''}`
    : undefined
  return [p.strength, p.doseForm, pack, price].filter(Boolean).join(' · ')
}

/**
 * Branded medications for a drug — each trade name with manufacturer and its
 * marketed presentations. Rendered inside the drug-detail "Brands" section.
 */
export function BrandsSection({ brands, lang, t }: Props) {
  const colors = useThemeColors()
  const isRtl = isRtlLang(lang)
  const align = { textAlign: isRtl ? ('right' as const) : ('left' as const) }
  const brandLocal = (b: DrugBrandWithPresentations) =>
    lang !== 'en' ? (b.brandNameLocal as Record<string, string>)?.[lang] : undefined

  return (
    <View style={styles.list}>
      {brands.map((b) => {
        const local = brandLocal(b)
        return (
          <Card key={b.id} square testID={`brand-row-${b.id}`}>
            <View style={[styles.body, { backgroundColor: colors.surface }]}>
              <View style={[styles.headerRow, isRtl && styles.rtlRow]}>
                <Text testID="brand-name" style={[styles.brandName, { color: colors.textPrimary }, align, local ? styles.arabic : undefined]} numberOfLines={1}>
                  {local || b.brandName}
                </Text>
                {b.rxStatus === 'rx' || b.rxStatus === 'otc' ? (
                  <Text style={[styles.rxChip, { backgroundColor: colors.primary50, color: colors.primary700 }]}>
                    {t(b.rxStatus === 'rx' ? 'drug.brands.rx' : 'drug.brands.otc')}
                  </Text>
                ) : null}
              </View>
              {b.manufacturer ? (
                <Text testID="brand-manufacturer" style={[styles.manufacturer, { color: colors.textSecondary }, align]}>
                  {`${t('drug.brands.manufacturer')}: ${b.manufacturer}`}
                </Text>
              ) : null}
              {b.presentations.map((p) => (
                <Text
                  key={p.id}
                  testID={`presentation-${p.id}`}
                  style={[styles.presentation, { color: colors.textMuted, writingDirection: 'ltr' }, align]}
                  numberOfLines={2}
                >
                  {presentationLine(p)}
                </Text>
              ))}
            </View>
          </Card>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: Spacing[2], paddingHorizontal: Spacing[4] },
  body: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], gap: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing[2] },
  rtlRow: { flexDirection: 'row-reverse' },
  brandName: { flex: 1, fontSize: FontSize.base, fontFamily: FontFamily.sansSemibold },
  arabic: { fontFamily: FontFamily.arabic, writingDirection: 'rtl' },
  rxChip: {
    fontSize: FontSize.xs, fontFamily: FontFamily.sansSemibold,
    borderRadius: Radius.full, paddingHorizontal: Spacing[2], paddingVertical: 2, overflow: 'hidden',
  },
  manufacturer: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  presentation: { fontSize: FontSize.sm, fontFamily: FontFamily.sans, marginTop: 1 },
})
