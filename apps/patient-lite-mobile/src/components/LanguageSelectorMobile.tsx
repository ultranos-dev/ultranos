import { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  Alert,
} from 'react-native'
import { useAppLocale } from '@/hooks/useAppLocale'
import {
  consumerSpacing,
  consumerBorderRadius,
  consumerTypography,
} from '@/theme/consumer'
import { useTheme } from '@/theme/ThemeProvider'
import type { SupportedLocale } from '@/i18n'

interface LanguageOption {
  code: SupportedLocale
  nativeLabel: string
}

const LANGUAGES: LanguageOption[] = [
  { code: 'en', nativeLabel: 'English' },
  { code: 'ar', nativeLabel: 'العربية' },
  { code: 'prs', nativeLabel: 'دری' },
]

export interface LanguageSelectorMobileProps {
  /** Called before locale change with the target locale — use to play audio greetings */
  onLanguageTap?: (locale: SupportedLocale) => void
}

export function LanguageSelectorMobile({ onLanguageTap }: LanguageSelectorMobileProps) {
  const { locale, setLocale } = useAppLocale()
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)

  const handleSelect = useCallback(
    async (code: SupportedLocale) => {
      onLanguageTap?.(code)
      if (code === locale) {
        setOpen(false)
        return
      }

      const { requiresRestart } = await setLocale(code)
      setOpen(false)

      if (requiresRestart) {
        Alert.alert(
          'Layout Direction Changed',
          'Please restart the app to apply the new layout direction.',
          [{ text: 'OK' }]
        )
      }
    },
    [locale, setLocale, onLanguageTap]
  )

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Change language"
        accessibilityRole="button"
        style={styles.globeButton}
      >
        <Text style={styles.globeIcon}>🌐</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
            {LANGUAGES.map((lang) => (
              <Pressable
                key={lang.code}
                onPress={() => handleSelect(lang.code)}
                accessibilityRole="button"
                accessibilityState={{ selected: lang.code === locale }}
                style={[
                  styles.option,
                  lang.code === locale && { backgroundColor: colors.primary[50] },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    { color: colors.textPrimary },
                    lang.code === locale && { fontWeight: '700', color: colors.primary[500] },
                  ]}
                >
                  {lang.nativeLabel}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  globeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globeIcon: {
    fontSize: 22,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    borderRadius: consumerBorderRadius.xl,
    paddingVertical: consumerSpacing.md,
    paddingHorizontal: consumerSpacing.lg,
    minWidth: 200,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  option: {
    paddingVertical: consumerSpacing.md,
    paddingHorizontal: consumerSpacing.md,
    borderRadius: consumerBorderRadius.md,
  },
  optionText: {
    fontSize: consumerTypography.body.fontSize,
    textAlign: 'center',
  },
})
