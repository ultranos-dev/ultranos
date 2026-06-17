import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier2 } from '@ultranos/shared-types'
import { type Lang } from '@/store/lang-store'
import { resolveLocalized } from '@/lib/localized-text'
import { useThemeColors } from '@/hooks/useThemeColors'
import { SectionCard } from './SectionCard'
import { SeverityBadge } from './SeverityBadge'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'

export function ClinicalTab({ entry, lang }: { entry: DrugEntryTier2; lang: Lang }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const pk = entry.pharmacokinetics
  const adminNotes = resolveLocalized(entry.administrationNotes, lang)
  const hasPk = !!pk && (pk.halfLifeHours != null || pk.proteinBindingPct != null || !!pk.volumeOfDistribution || !!pk.metabolism || !!pk.excretion)

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {entry.contraindications.length > 0 && (
        <SectionCard title={t('drug.clinical.contraindications')} items={entry.contraindications} severity="danger" isRtl={false} />
      )}
      {entry.interactions && entry.interactions.length > 0 && (
        <SectionCard title={t('drug.clinical.interactions')} severity="warning">
          {entry.interactions.map((ix, i) => (
            <View key={i} style={styles.interactionRow}>
              <SeverityBadge severity={ix.severity} />
              <View style={styles.interactionTextWrap}>
                <Text style={[styles.interactionText, { color: colors.textPrimary }]}>
                  {ix.drugName}
                </Text>
                <Text style={[styles.interactionText, { color: colors.textPrimary }]}>
                  {ix.mechanism}
                </Text>
              </View>
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
        <SectionCard title={t('drug.clinical.adverseEvents')} items={entry.adverseEvents.map((e) => e.effect)} />
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
      {entry.pediatricDosing.length > 0 && (
        <SectionCard title={t('drug.clinical.pediatricDosing')}>
          {entry.pediatricDosing.map((d, i) => (
            <Text key={i} style={[styles.dosing, { color: colors.textPrimary }]}>
              {d.indication}: {d.pediatricDose} {d.frequency}{d.route ? ` (${d.route})` : ''}
            </Text>
          ))}
        </SectionCard>
      )}
      {hasPk && (
        <SectionCard title={t('drug.clinical.pharmacokinetics')}>
          {pk.halfLifeHours != null && <Text style={[styles.dosing, { color: colors.textPrimary }]}>{t('drug.clinical.halfLife')}: {pk.halfLifeHours} h</Text>}
          {pk.proteinBindingPct != null && <Text style={[styles.dosing, { color: colors.textPrimary }]}>{t('drug.clinical.proteinBinding')}: {pk.proteinBindingPct}%</Text>}
          {pk.volumeOfDistribution && <Text style={[styles.dosing, { color: colors.textPrimary }]}>{t('drug.clinical.volumeDistribution')}: {pk.volumeOfDistribution}</Text>}
          {pk.metabolism && <Text style={[styles.dosing, { color: colors.textPrimary }]}>{t('drug.clinical.metabolism')}: {pk.metabolism}</Text>}
          {pk.excretion && <Text style={[styles.dosing, { color: colors.textPrimary }]}>{t('drug.clinical.excretion')}: {pk.excretion}</Text>}
        </SectionCard>
      )}
      {adminNotes.text ? (
        <SectionCard title={t('drug.clinical.adminNotes')} text={adminNotes.text} isRtl={adminNotes.isLocalized} />
      ) : null}
      {entry.pregnancyCategory && (
        <SectionCard title={t('drug.clinical.pregnancyCategory')} text={`Category ${entry.pregnancyCategory}`} />
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
  interactionTextWrap: {
    flex: 1,
  },
  interactionText: {
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
