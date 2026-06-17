import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Updates from 'expo-updates'
import { AlertTriangle } from 'lucide-react-native'
import { Colors, FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  /** If true, renders compact inline fallback instead of full-screen */
  inline?: boolean
}

export function CrashFallback({ inline }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  if (inline) {
    return (
      <View style={[styles.inlineContainer, { backgroundColor: colors.surfaceSubtle }]}>
        <AlertTriangle size={24} color={colors.textMuted} />
        <Text style={[styles.inlineText, { color: colors.textMuted }]}>
          {t('common.tabError')}
        </Text>
      </View>
    )
  }

  return (
    <View style={[styles.fullContainer, { backgroundColor: colors.surface }]}>
      <AlertTriangle size={48} color={colors.textMuted} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {t('common.somethingWentWrong')}
      </Text>
      <Pressable
        style={[styles.button, { backgroundColor: colors.primary500 }]}
        onPress={() => {
          try { void Updates.reloadAsync() } catch { /* Expo Go fallback */ }
        }}
        accessibilityRole="button"
        accessibilityLabel={t('common.reload')}
      >
        <Text style={styles.buttonText}>{t('common.reload')}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  fullContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[8],
    gap: Spacing[4],
  },
  title: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.sansSemibold,
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: Spacing[6],
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    marginTop: Spacing[2],
  },
  buttonText: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sansSemibold,
    color: Colors.white,
  },
  inlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[8],
    gap: Spacing[3],
    borderRadius: Radius.md,
    margin: Spacing[4],
  },
  inlineText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sans,
    textAlign: 'center',
  },
})
