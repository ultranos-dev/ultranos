import { useEffect, useRef } from 'react'
import { View, TextInput, Pressable, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useLangStore, isRtlLang, type Lang } from '@/store/lang-store'
import { useThemeColors } from '@/hooks/useThemeColors'

const LANGS: Lang[] = ['en', 'prs', 'ps', 'ar']

interface Props {
  value: string
  onSearch: (q: string) => void
}

export function SearchBar({ value, onSearch }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRtl = isRtlLang(lang)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onSearch(value), 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value, onSearch])

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <TextInput
        testID="search-input"
        style={[styles.input, { borderColor: colors.border }, isRtl && styles.inputRtl]}
        placeholder={t('search.placeholder')}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={(text) => onSearch(text)}
        autoCorrect={false}
        autoCapitalize="none"
        textAlign={isRtl ? 'right' : 'left'}
        color={colors.textPrimary}
      />
      <View style={styles.langs}>
        {LANGS.map((l) => (
          <Pressable
            key={l}
            testID={`lang-${l}`}
            style={[styles.langBtn, { borderColor: colors.border }, lang === l && { backgroundColor: colors.primary500, borderColor: colors.primary500 }]}
            onPress={() => void setLang(l)}
          >
            <Text style={[styles.langText, { color: colors.textSecondary }, lang === l && { color: colors.white }]}>
              {t(`search.lang.${l}`)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 12, borderBottomWidth: 1 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 8 },
  inputRtl: { fontFamily: 'NotoNaskhArabic' },
  langs: { flexDirection: 'row', gap: 8 },
  langBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  langText: { fontSize: 13 },
})
