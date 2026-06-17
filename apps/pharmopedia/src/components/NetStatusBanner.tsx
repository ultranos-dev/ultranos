import { Text, StyleSheet } from 'react-native'
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated'
import { useNetInfo } from '@react-native-community/netinfo'
import { useTranslation } from 'react-i18next'
import { FontFamily, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useReducedMotion } from '@ultranos/ui-kit/native'

export function NetStatusBanner() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const { isConnected } = useNetInfo()
  const reduced = useReducedMotion()

  // Don't show during initial check (isConnected === null) or when connected
  if (isConnected !== false) return null

  return (
    <Animated.View
      entering={reduced ? undefined : FadeInDown.duration(200)}
      exiting={reduced ? undefined : FadeOutUp.duration(200)}
      style={[styles.banner, { backgroundColor: colors.warningLight }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Text style={[styles.text, { color: colors.warningDark }]}>
        {t('net.offline')}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
  },
  text: {
    fontSize: 13,
    fontFamily: FontFamily.sans,
    textAlign: 'center',
  },
})
