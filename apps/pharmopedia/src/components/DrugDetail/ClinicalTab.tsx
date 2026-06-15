import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier2 } from '@ultranos/shared-types'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { ThemeColors } from '@ultranos/ui-kit/tokens.native'

export function ClinicalTab({ entry }: { entry: DrugEntryTier2 }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {entry.mechanismOfAction && (
        <Section title={t('drug.clinical.mechanism')} text={entry.mechanismOfAction} colors={colors} />
      )}
      {entry.indicationsClinical.length > 0 && (
        <Section title={t('drug.clinical.indications')} items={entry.indicationsClinical} colors={colors} />
      )}
      {entry.contraindications.length > 0 && (
        <Section title={t('drug.clinical.contraindications')} items={entry.contraindications} colors={colors} />
      )}
      {entry.adverseEvents.length > 0 && (
        <Section title={t('drug.clinical.adverseEvents')} items={entry.adverseEvents.map(e => e.effect)} colors={colors} />
      )}
      {entry.adultDosing.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('drug.clinical.adultDosing')}</Text>
          {entry.adultDosing.map((d, i) => (
            <Text key={i} style={[styles.dosing, { color: colors.textPrimary }]}>
              {d.indication}: {d.adultDose} {d.frequency}{d.route ? ` (${d.route})` : ''}
            </Text>
          ))}
        </View>
      )}
      {entry.pregnancyCategory && (
        <Section title={t('drug.clinical.pregnancyCategory')} text={`Category ${entry.pregnancyCategory}`} colors={colors} />
      )}
      {entry.renalAdjustment && (
        <Section title={t('drug.clinical.renalAdjustment')} text={entry.renalAdjustment} colors={colors} />
      )}
    </ScrollView>
  )
}

function Section({ title, text, items, colors }: { title: string; text?: string; items?: string[]; colors: ThemeColors }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      {text && <Text style={[styles.text, { color: colors.textPrimary }]}>{text}</Text>}
      {items?.map((item, i) => <Text key={i} style={[styles.text, { color: colors.textPrimary }]}>• {item}</Text>)}
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  text: { fontSize: 15, lineHeight: 22 },
  dosing: { fontSize: 15, lineHeight: 22, marginBottom: 4 },
})
