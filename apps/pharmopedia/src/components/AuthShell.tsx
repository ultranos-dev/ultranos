import { type ReactNode } from 'react'
import { View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Pill, ChevronLeft } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { LanguageChips } from '@/components/LanguageChips'

interface Props {
  title: string
  subtitle?: string
  onBack?: () => void
  children: ReactNode
}

export function AuthShell({ title, subtitle, onBack, children }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const rtl = isRtlLang(useLangStore((s) => s.lang))
  const align = { textAlign: rtl ? ('right' as const) : ('left' as const) }
  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.surface }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={[styles.header, rtl && styles.headerRtl]}>
          {onBack ? (
            <Pressable testID="auth-back" onPress={onBack} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8} style={styles.back}>
              <ChevronLeft size={22} color={colors.textPrimary} style={rtl ? styles.flip : undefined} />
            </Pressable>
          ) : null}
          <View style={[styles.chip, { backgroundColor: colors.primary500 }]}><Pill size={16} color={colors.white} /></View>
          <Text style={[styles.wordmark, { color: colors.textPrimary }]}>Pharmopedia</Text>
        </View>
        <LanguageChips />
        <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Text style={[styles.title, { color: colors.textPrimary }, align, rtl && styles.arabic]}>{title}</Text>
            {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }, align, rtl && styles.arabic]}>{subtitle}</Text> : null}
            <View style={styles.body}>{children}</View>
          </View>
        </ScrollView>
        <Text style={[styles.footer, { color: colors.textMuted }]}>{t('common.poweredBy')}</Text>
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: Spacing[6] },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingTop: Spacing[2] },
  headerRtl: { flexDirection: 'row-reverse' },
  back: { padding: Spacing[1] },
  flip: { transform: [{ scaleX: -1 }] },
  chip: { width: 32, height: 32, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontFamily: FontFamily.headingBold, fontSize: FontSize.base },
  center: { flexGrow: 1, justifyContent: 'center' },
  content: { width: '100%', maxWidth: 360, alignSelf: 'center', gap: Spacing[3] },
  title: { fontFamily: FontFamily.headingBold, fontSize: FontSize['2xl'] },
  subtitle: { fontFamily: FontFamily.sans, fontSize: FontSize.sm },
  arabic: { fontFamily: FontFamily.arabic },
  body: { gap: Spacing[3], marginTop: Spacing[2] },
  footer: { fontFamily: FontFamily.sans, fontSize: FontSize.xs, textAlign: 'center', paddingVertical: Spacing[3] },
})
