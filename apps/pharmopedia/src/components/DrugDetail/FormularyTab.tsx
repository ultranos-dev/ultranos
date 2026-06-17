import { ScrollView, View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier3 } from '@ultranos/shared-types'
import { Pill } from 'lucide-react-native'
import { FontFamily, FontSize, LineHeight, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

type FormularyStatus = 'on_formulary' | 'off_formulary' | 'restricted'

const STATUS_LABEL_KEYS: Record<FormularyStatus, string> = {
  on_formulary:  'formulary.onFormulary',
  off_formulary: 'formulary.offFormulary',
  restricted:    'formulary.restricted',
}

export function FormularyTab({ entry }: { entry: DrugEntryTier3 }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  const statusStyle: Record<FormularyStatus, { bg: string; text: string }> = {
    on_formulary:  { bg: colors.successLight, text: colors.successDark },
    off_formulary: { bg: colors.dangerLight,  text: colors.dangerDark },
    restricted:    { bg: colors.warningLight,  text: colors.warningDark },
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>

      {/* Formulary status badge */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('formulary.status')}</Text>
        {entry.formularyStatus ? (
          <View style={[styles.statusBadge, { backgroundColor: statusStyle[entry.formularyStatus].bg }]}>
            <Text style={[styles.statusText, { color: statusStyle[entry.formularyStatus].text }]}>
              {t(STATUS_LABEL_KEYS[entry.formularyStatus])}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Dispensing notes (read-only) */}
      {entry.dispensingNotes ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('formulary.dispensingNotes')}</Text>
          <Text style={[styles.text, { color: colors.textPrimary }]}>{entry.dispensingNotes}</Text>
        </View>
      ) : null}

      {/* Therapeutic substitutes */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('formulary.substitutes')}</Text>
        {entry.substitutes.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
            <Pill size={48} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('formulary.noSubstitutes')}</Text>
          </View>
        ) : (
          entry.substitutes.map((atcCode) => (
            <Text key={atcCode} style={[styles.substituteCode, { color: colors.primary500 }]}>{atcCode}</Text>
          ))
        )}
      </View>

      {/* Recall alerts */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('formulary.recalls')}</Text>
        {entry.recallAlerts.length === 0 ? (
          <Text style={[styles.muted, { color: colors.textMuted }]}>{t('formulary.noRecalls')}</Text>
        ) : (
          entry.recallAlerts.map((alert) => (
            <View key={alert.recallId} style={[styles.recallCard, { backgroundColor: colors.warningLight, borderColor: colors.warning }]}>
              <Text style={[styles.recallDescription, { color: colors.textPrimary }]}>{alert.description}</Text>
              <Text style={[styles.recallMeta, { color: colors.textSecondary }]}>{alert.status} · {alert.initiationDate}</Text>
            </View>
          ))
        )}
      </View>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: Spacing[4] },
  section: { marginBottom: Spacing[4] },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sansBold,
    marginBottom: Spacing[2],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  text: { fontSize: FontSize.base, fontFamily: FontFamily.sans, lineHeight: LineHeight.normal },
  muted: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[8],
    gap: Spacing[3],
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.sansSemibold,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sans,
    textAlign: 'center',
  },
  statusBadge: { alignSelf: 'flex-start' as const, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderRadius: Radius.md },
  statusText: { fontSize: FontSize.sm, fontFamily: FontFamily.sansBold },
  substituteCode: { fontSize: FontSize.sm, fontFamily: FontFamily.sansMedium, marginBottom: Spacing[1] },
  recallCard: {
    padding: Spacing[3],
    marginBottom: Spacing[2],
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: undefined, // will be set inline
  },
  recallDescription: { fontSize: FontSize.sm, fontFamily: FontFamily.sansSemibold, marginBottom: Spacing[1] },
  recallMeta: { fontSize: FontSize.xs, fontFamily: FontFamily.sans },
})
