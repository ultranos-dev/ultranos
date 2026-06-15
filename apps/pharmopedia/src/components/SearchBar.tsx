import { useRef, useEffect } from 'react'
import { View, TextInput, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { FontFamily, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
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
      <TextInput
        testID="search-input"
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle },
          isRtl && styles.inputRtl,
        ]}
        placeholder={t('search.placeholder')}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={(text) => onSearch(text)}
        autoCorrect={false}
        autoCapitalize="none"
        textAlign={isRtl ? 'right' : 'left'}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: Spacing[3], borderBottomWidth: 1 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    fontSize: 16,
    fontFamily: FontFamily.sans,
  },
  inputRtl: { fontFamily: FontFamily.arabic },
})
