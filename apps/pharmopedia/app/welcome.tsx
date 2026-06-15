import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as SecureStore from 'expo-secure-store'
import { Search, MapPin, Globe } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

const WELCOME_KEY = 'pharmopedia.hasSeenWelcome'

export async function hasSeenWelcome(): Promise<boolean> {
  try { return (await SecureStore.getItemAsync(WELCOME_KEY)) === '1' } catch { return false }
}

export default function WelcomeScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()

  async function handleGetStarted() {
    try { await SecureStore.setItemAsync(WELCOME_KEY, '1') } catch { /* proceed anyway */ }
    router.replace('/(auth)/login')
  }

  const features = [
    { icon: Search, text: t('welcome.feature1') },
    { icon: MapPin, text: t('welcome.feature2') },
    { icon: Globe, text: t('welcome.feature3') },
  ]

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.content}>
        <Text style={[styles.appName, { color: colors.textPrimary }]}>Pharmopedia</Text>
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>{t('welcome.tagline')}</Text>

        <View style={styles.features}>
          {features.map(({ icon: Icon, text }, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: colors.surfaceSubtle }]}>
                <Icon size={20} color={colors.primary500} />
              </View>
              <Text style={[styles.featureText, { color: colors.textPrimary }]}>{text}</Text>
            </View>
          ))}
        </View>
      </View>

      <Pressable
        testID="get-started-button"
        style={[styles.button, { backgroundColor: colors.primary500 }]}
        onPress={() => void handleGetStarted()}
        accessibilityRole="button"
        accessibilityLabel={t('welcome.getStarted')}
      >
        <Text style={[styles.buttonText, { color: colors.white }]}>{t('welcome.getStarted')}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing[8] },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing[3] },
  appName: { fontSize: FontSize['3xl'], fontFamily: FontFamily.headingBold },
  tagline: { fontSize: FontSize.md, fontFamily: FontFamily.sans, textAlign: 'center' },
  features: { marginTop: Spacing[8], gap: Spacing[4], width: '100%' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  featureIcon: {
    width: 40, height: 40, borderRadius: Radius.full,
    justifyContent: 'center', alignItems: 'center',
  },
  featureText: { flex: 1, fontSize: FontSize.base, fontFamily: FontFamily.sans },
  button: {
    paddingHorizontal: Spacing[10], paddingVertical: Spacing[4],
    borderRadius: Radius.xl, marginBottom: Spacing[12],
  },
  buttonText: { fontSize: FontSize.md, fontFamily: FontFamily.sansSemibold },
})
