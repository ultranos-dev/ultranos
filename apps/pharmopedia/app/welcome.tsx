import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as SecureStore from 'expo-secure-store'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

const WELCOME_KEY = '@pharmopedia/hasSeenWelcome'

export default function WelcomeScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const colors = useThemeColors()

  async function handleGetStarted() {
    try {
      await SecureStore.setItemAsync(WELCOME_KEY, 'true')
    } catch {
      // SecureStore unavailable — proceed anyway
    }
    router.replace('/(auth)/login')
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.content}>
        <Text style={[styles.appName, { color: colors.textPrimary }]}>Pharmopedia</Text>
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>
          {t('welcome.tagline')}
        </Text>
      </View>
      <Pressable
        style={[styles.button, { backgroundColor: colors.primary500 }]}
        onPress={() => void handleGetStarted()}
        testID="get-started-button"
      >
        <Text style={styles.buttonText}>{t('welcome.getStarted')}</Text>
      </Pressable>
    </View>
  )
}

/** Check if welcome screen has been seen. Call during app init. */
export async function hasSeenWelcome(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(WELCOME_KEY)
    return val === 'true'
  } catch {
    return false
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[8],
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[3],
  },
  appName: {
    fontSize: FontSize['3xl'],
    fontFamily: FontFamily.headingBold,
  },
  tagline: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.sans,
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: Spacing[10],
    paddingVertical: Spacing[4],
    borderRadius: Radius.xl,
    marginBottom: Spacing[12],
  },
  buttonText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.sansSemibold,
    color: '#ffffff',
  },
})
