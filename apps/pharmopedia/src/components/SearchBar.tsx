import { useRef, useEffect } from 'react'
import { View, TextInput, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react-native'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  value: string
  onSearch: (q: string) => void
}

export function SearchBar({ value, onSearch }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const lang = useLangStore((s) => s.lang)
  const isRtl = isRtlLang(lang)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onSearch(value), 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value, onSearch])

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: colors.surfaceSubtle }]}>
        <TextInput
          testID="search-input"
          style={[
            styles.input,
            { color: colors.textPrimary },
            isRtl && styles.inputRtl,
          ]}
          placeholder={t('search.placeholder')}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={(text) => onSearch(text)}
          accessibilityRole="search"
          accessibilityLabel={t('search.placeholder')}
          accessibilityHint={t('search.empty')}
          autoCorrect={false}
          autoCapitalize="none"
          textAlign={isRtl ? 'right' : 'left'}
        />
        {value.length > 0 && (
          <Pressable
            testID="search-clear"
            onPress={() => onSearch('')}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            style={styles.clearButton}
          >
            <X size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: Spacing[3], borderBottomWidth: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.md },
  input: {
    flex: 1,
    padding: Spacing[3],
    fontSize: FontSize.base,
    fontFamily: FontFamily.sans,
  },
  inputRtl: { fontFamily: FontFamily.arabic },
  clearButton: { paddingHorizontal: Spacing[3] },
})
