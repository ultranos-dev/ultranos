import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier2 } from '@ultranos/shared-types'

export function ClinicalTab({ entry }: { entry: DrugEntryTier2 }) {
  const { t } = useTranslation()

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {entry.mechanismOfAction && (
        <Section title={t('drug.clinical.mechanism')} text={entry.mechanismOfAction} />
      )}
      {entry.indicationsClinical.length > 0 && (
        <Section title={t('drug.clinical.indications')} items={entry.indicationsClinical} />
      )}
      {entry.contraindications.length > 0 && (
        <Section title={t('drug.clinical.contraindications')} items={entry.contraindications} />
      )}
      {entry.adverseEvents.length > 0 && (
        <Section title={t('drug.clinical.adverseEvents')} items={entry.adverseEvents.map(e => e.effect)} />
      )}
      {entry.adultDosing.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('drug.clinical.adultDosing')}</Text>
          {entry.adultDosing.map((d, i) => (
            <Text key={i} style={styles.dosing}>
              {d.indication}: {d.adultDose} {d.frequency}{d.route ? ` (${d.route})` : ''}
            </Text>
          ))}
        </View>
      )}
      {entry.pregnancyCategory && (
        <Section title={t('drug.clinical.pregnancyCategory')} text={`Category ${entry.pregnancyCategory}`} />
      )}
      {entry.renalAdjustment && (
        <Section title={t('drug.clinical.renalAdjustment')} text={entry.renalAdjustment} />
      )}
    </ScrollView>
  )
}

function Section({ title, text, items }: { title: string; text?: string; items?: string[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {text && <Text style={styles.text}>{text}</Text>}
      {items?.map((item, i) => <Text key={i} style={styles.text}>• {item}</Text>)}
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  text: { fontSize: 15, color: '#111827', lineHeight: 22 },
  dosing: { fontSize: 15, color: '#111827', lineHeight: 22, marginBottom: 4 },
})
