/**
 * Story 11.7 Task 5: Visual Language Gateway (AC #6).
 *
 * First-launch language selection:
 * - Full-screen with centered content
 * - Three buttons stacked vertically, each minimum 80px tall
 * - English in 24px Inter Bold
 * - Arabic in 28px Noto Sans Arabic Bold
 * - Dari in 28px Noto Sans Arabic Bold
 * - Audio greeting plays on button tap (from Story 11.5)
 * - Selection advances to next step — no "confirm" button needed
 */

import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '@/theme/ThemeProvider'
import { consumerBorderRadius } from '@/theme/consumer'
import type { SupportedLocale } from '@/i18n'

interface LanguageEntry {
  code: SupportedLocale
  nativeLabel: string
  fontSize: number
  fontFamily?: string
  /** Small visual cue character to differentiate script families */
  scriptHint: string
}

const LANGUAGES: LanguageEntry[] = [
  { code: 'en', nativeLabel: 'English', fontSize: 24, scriptHint: 'Aa' },
  { code: 'ar', nativeLabel: 'العربية', fontSize: 28, fontFamily: 'NotoSansArabic-Bold', scriptHint: 'ع' },
  { code: 'prs', nativeLabel: 'دری', fontSize: 28, fontFamily: 'NotoSansArabic-Bold', scriptHint: 'د' },
]

interface VisualLanguageGatewayProps {
  onSelect: (locale: SupportedLocale) => void
  disabled?: boolean
}

export function VisualLanguageGateway({ onSelect, disabled }: VisualLanguageGatewayProps) {
  const { colors } = useTheme()

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]} testID="visual-language-gateway">
      {/* Globe icon as universal "language" symbol */}
      <Text style={styles.globeIcon}>🌐</Text>

      <View style={styles.buttonList}>
        {LANGUAGES.map((lang) => (
          <Pressable
            key={lang.code}
            onPress={() => onSelect(lang.code)}
            disabled={disabled}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.primary[200] },
              pressed && { backgroundColor: colors.primary[50], borderColor: colors.primary[400] },
              disabled && styles.buttonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={lang.nativeLabel}
            testID={`language-button-${lang.code}`}
          >
            <Text style={[styles.scriptHint, { color: colors.textMuted }]} testID={`script-hint-${lang.code}`}>
              {lang.scriptHint}
            </Text>
            <Text
              style={[
                styles.buttonText,
                {
                  fontSize: lang.fontSize,
                  fontFamily: lang.fontFamily,
                  fontWeight: '700',
                  color: colors.textPrimary,
                },
              ]}
            >
              {lang.nativeLabel}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const BUTTON_MIN_HEIGHT = 80

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  globeIcon: {
    fontSize: 64,
    marginBottom: 40,
    writingDirection: 'ltr',
  },
  buttonList: {
    width: '100%',
    gap: 16,
  },
  button: {
    minHeight: BUTTON_MIN_HEIGHT,
    borderRadius: consumerBorderRadius.card,
    borderWidth: 2,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  scriptHint: {
    fontSize: 16,
    opacity: 0.6,
    fontWeight: '600',
    width: 28,
    textAlign: 'center',
  },
  buttonText: {
    textAlign: 'center',
    flex: 1,
  },
})
