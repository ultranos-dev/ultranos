import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier2 } from '@ultranos/shared-types'
import { useThemeColors } from '@/hooks/useThemeColors'
import { SectionCard } from './SectionCard'
import { SeverityBadge } from './SeverityBadge'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'

export function ClinicalTab({ entry }: { entry: DrugEntryTier2 }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {entry.contraindications.length > 0 && (
        <SectionCard
          title={t('drug.clinical.contraindications')}
          items={entry.contraindications}
          severity="danger"
        />
      )}
      {entry.interactions && entry.interactions.length > 0 && (
        <SectionCard title={t('drug.clinical.interactions')} severity="warning">
          {entry.interactions.map((ix, i) => (
            <View key={i} style={styles.interactionRow}>
              <SeverityBadge severity={ix.severity} />
              <Text style={[styles.interactionText, { color: colors.textPrimary }]}>
                {ix.drugName}: {ix.description}
              </Text>
            </View>
          ))}
        </SectionCard>
      )}
      {entry.mechanismOfAction && (
        <SectionCard title={t('drug.clinical.mechanism')} text={entry.mechanismOfAction} />
      )}
      {entry.indicationsClinical.length > 0 && (
        <SectionCard title={t('drug.clinical.indications')} items={entry.indicationsClinical} />
      )}
      {entry.adverseEvents.length > 0 && (
        <SectionCard
          title={t('drug.clinical.adverseEvents')}
          items={entry.adverseEvents.map((e) => e.effect)}
        />
      )}
      {entry.adultDosing.length > 0 && (
        <SectionCard title={t('drug.clinical.adultDosing')}>
          {entry.adultDosing.map((d, i) => (
            <Text key={i} style={[styles.dosing, { color: colors.textPrimary }]}>
              {d.indication}: {d.adultDose} {d.frequency}{d.route ? ` (${d.route})` : ''}
            </Text>
          ))}
        </SectionCard>
      )}
      {entry.pregnancyCategory && (
        <SectionCard
          title={t('drug.clinical.pregnancyCategory')}
          text={`Category ${entry.pregnancyCategory}`}
        />
      )}
      {entry.renalAdjustment && (
        <SectionCard title={t('drug.clinical.renalAdjustment')} text={entry.renalAdjustment} />
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
  interactionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[2],
    marginBottom: Spacing[2],
  },
  interactionText: {
    flex: 1,
    fontSize: FontSize.base,
    fontFamily: FontFamily.sans,
    lineHeight: 22,
  },
  dosing: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sans,
    lineHeight: 22,
    marginBottom: Spacing[1],
  },
})
