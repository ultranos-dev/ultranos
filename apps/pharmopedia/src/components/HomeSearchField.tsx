import { Pressable, Text, StyleSheet } from 'react-native'
import { Search } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

export function HomeSearchField({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  return (
    <Pressable
      testID="home-search-field"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('home.searchPlaceholder')}
      style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Search size={18} color={colors.textMuted} />
      <Text style={[styles.placeholder, { color: colors.textMuted }]}>{t('home.searchPlaceholder')}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing[3], paddingVertical: Spacing[3] },
  placeholder: { fontFamily: FontFamily.sans, fontSize: FontSize.base },
})
