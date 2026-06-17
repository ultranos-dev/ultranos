import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Building2, UserPlus, ChevronRight } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { AuthShell } from '@/components/AuthShell'

export default function OnboardingScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const rtl = isRtlLang(useLangStore((s) => s.lang))

  const cards: { testID: string; icon: LucideIcon; title: string; subtitle: string; onPress: () => void }[] = [
    { testID: 'onboarding-member', icon: Building2, title: t('onboarding.memberTitle'), subtitle: t('onboarding.memberSubtitle'), onPress: () => router.push('/(auth)/login') },
    { testID: 'onboarding-public', icon: UserPlus, title: t('onboarding.publicTitle'), subtitle: t('onboarding.publicSubtitle'), onPress: () => router.push('/(auth)/register') },
  ]

  return (
    <AuthShell title={t('onboarding.chooseTitle')} subtitle={t('onboarding.chooseSubtitle')}>
      <View style={styles.cards}>
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <Pressable
              key={c.testID}
              testID={c.testID}
              onPress={c.onPress}
              accessibilityRole="button"
              accessibilityLabel={c.title}
              style={[styles.card, rtl && styles.cardRtl, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.primary50 }]}><Icon size={22} color={colors.primary600} /></View>
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary, textAlign: rtl ? 'right' : 'left' }, rtl && styles.arabic]}>{c.title}</Text>
                <Text style={[styles.cardSub, { color: colors.textSecondary, textAlign: rtl ? 'right' : 'left' }, rtl && styles.arabic]}>{c.subtitle}</Text>
              </View>
              <ChevronRight size={20} color={colors.textMuted} style={rtl ? styles.chevRtl : undefined} />
            </Pressable>
          )
        })}
      </View>
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  cards: { gap: Spacing[3], marginTop: Spacing[2] },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], borderWidth: 1, borderRadius: Radius.lg, padding: Spacing[4] },
  cardRtl: { flexDirection: 'row-reverse' },
  iconWrap: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontFamily: FontFamily.sansSemibold, fontSize: FontSize.base },
  cardSub: { fontFamily: FontFamily.sans, fontSize: FontSize.sm },
  arabic: { fontFamily: FontFamily.arabic },
  chevRtl: { transform: [{ scaleX: -1 }] },
})
