import { View, Text, StyleSheet } from 'react-native'
import { Languages } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

export function MachineTranslationBanner({ t }: { t: (k: string) => string }) {
  const colors = useThemeColors()
  return (
    <View testID="machine-translation-banner" style={[styles.banner, { backgroundColor: colors.warningLight }]}>
      <Languages size={16} color={colors.warning} />
      <Text style={[styles.text, { color: colors.warning }]}>{t('drug.machineTranslatedNotice')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2], marginHorizontal: Spacing[4], marginTop: Spacing[2], padding: Spacing[3], borderRadius: Radius.md },
  text: { flex: 1, fontSize: FontSize.xs, fontFamily: FontFamily.sans },
})
