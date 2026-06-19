import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { DrugEntryTier3 } from '@ultranos/shared-types'
import { FontFamily, FontSize, LineHeight, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

type FormularyStatus = 'on_formulary' | 'off_formulary' | 'restricted'

const STATUS_LABEL_KEYS: Record<FormularyStatus, string> = {
  on_formulary: 'formulary.onFormulary',
  off_formulary: 'formulary.offFormulary',
  restricted: 'formulary.restricted',
}

/**
 * Pharmacist/admin formulary content, rendered inside a collapsible section body
 * (no own scroll view). Only blocks with data render. Folds the former
 * FormularyTab: status badge, dispensing notes, substitutes, recall alerts.
 */
export function FormularySection({ entry }: { entry: DrugEntryTier3 }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  const statusStyle: Record<FormularyStatus, { bg: string; text: string }> = {
    on_formulary: { bg: colors.successLight, text: colors.successDark },
    off_formulary: { bg: colors.dangerLight, text: colors.dangerDark },
    restricted: { bg: colors.warningLight, text: colors.warningDark },
  }

  return (
    <View testID="formulary-section" style={styles.stack}>
      {entry.formularyStatus ? (
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('formulary.status')}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle[entry.formularyStatus].bg }]}>
            <Text style={[styles.statusText, { color: statusStyle[entry.formularyStatus].text }]}>
              {t(STATUS_LABEL_KEYS[entry.formularyStatus])}
            </Text>
          </View>
        </View>
      ) : null}

      {entry.dispensingNotes ? (
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('formulary.dispensingNotes')}</Text>
          <Text style={[styles.text, { color: colors.textPrimary }]}>{entry.dispensingNotes}</Text>
        </View>
      ) : null}

      {entry.substitutes?.length ? (
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('formulary.substitutes')}</Text>
          {entry.substitutes.map((atcCode) => (
            <Text key={atcCode} style={[styles.code, { color: colors.primary500 }]}>{atcCode}</Text>
          ))}
        </View>
      ) : null}

      {entry.recallAlerts?.length ? (
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('formulary.recalls')}</Text>
          {entry.recallAlerts.map((alert) => (
            <View key={alert.recallId} style={[styles.recallCard, { backgroundColor: colors.warningLight, borderColor: colors.warning }]}>
              <Text style={[styles.recallDesc, { color: colors.textPrimary }]}>{alert.description}</Text>
              <Text style={[styles.recallMeta, { color: colors.textSecondary }]}>{alert.status} · {alert.initiationDate}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { gap: Spacing[4] },
  block: { gap: Spacing[1] },
  label: { fontSize: FontSize.xs, fontFamily: FontFamily.sansBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  text: { fontSize: FontSize.base, fontFamily: FontFamily.sans, lineHeight: LineHeight.normal },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: Spacing[3], paddingVertical: Spacing[2], borderRadius: Radius.md },
  statusText: { fontSize: FontSize.sm, fontFamily: FontFamily.sansBold },
  code: { fontSize: FontSize.sm, fontFamily: FontFamily.sansMedium },
  recallCard: { padding: Spacing[3], borderRadius: Radius.md, borderWidth: 1 },
  recallDesc: { fontSize: FontSize.sm, fontFamily: FontFamily.sansSemibold, marginBottom: Spacing[1] },
  recallMeta: { fontSize: FontSize.xs, fontFamily: FontFamily.sans },
})
