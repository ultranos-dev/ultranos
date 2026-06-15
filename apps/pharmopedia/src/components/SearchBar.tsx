import { useEffect, useRef } from 'react'
import { View, TextInput, Pressable, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useLangStore, isRtlLang, type Lang } from '@/store/lang-store'

const LANGS: Lang[] = ['en', 'prs', 'ps', 'ar']

interface Props {
  value: string
  onSearch: (q: string) => void
}

export function SearchBar({ value, onSearch }: Props) {
  const { t } = useTranslation()
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
    <View style={styles.container}>
      <TextInput
        testID="search-input"
        style={[styles.input, isRtl && styles.inputRtl]}
        placeholder={t('search.placeholder')}
        value={value}
        onChangeText={(text) => onSearch(text)}
        autoCorrect={false}
        autoCapitalize="none"
        textAlign={isRtl ? 'right' : 'left'}
      />
      <View style={styles.langs}>
        {LANGS.map((l) => (
          <Pressable
            key={l}
            testID={`lang-${l}`}
            style={[styles.langBtn, lang === l && styles.langBtnActive]}
            onPress={() => void setLang(l)}
          >
            <Text style={[styles.langText, lang === l && styles.langTextActive]}>
              {t(`search.lang.${l}`)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 8 },
  inputRtl: { fontFamily: 'NotoNaskhArabic' },
  langs: { flexDirection: 'row', gap: 8 },
  langBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db' },
  langBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  langText: { fontSize: 13, color: '#374151' },
  langTextActive: { color: '#fff' },
})
