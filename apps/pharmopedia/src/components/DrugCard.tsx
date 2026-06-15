import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { DrugSearchResult } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  result: DrugSearchResult
  lang: Lang
  onPress: () => void
}

export function DrugCard({ result, lang, onPress }: Props) {
  const colors = useThemeColors()
  const useLocal = lang !== 'en' && !!result.localName
  const primaryName = useLocal ? result.localName! : result.innName
  const secondaryName = useLocal ? result.innName : undefined
  const isRtl = isRtlLang(lang)

  return (
    <Pressable
      style={[styles.card, { borderBottomColor: colors.borderSubtle, backgroundColor: colors.surface }]}
      onPress={onPress}
      testID={`drug-card-${result.atcCode}`}
    >
      <View style={styles.row}>
        <Text
          testID="drug-primary-name"
          style={[styles.primaryName, { color: colors.textPrimary }, isRtl && styles.rtlText]}
          numberOfLines={1}
        >
          {primaryName}
        </Text>
        <Text style={[styles.atcCode, { color: colors.textSecondary }]}>{result.atcCode}</Text>
      </View>
      {secondaryName && (
        <Text testID="drug-secondary-name" style={[styles.secondaryName, { color: colors.textSecondary }]}>{secondaryName}</Text>
      )}
      <Text style={[styles.meta, { color: colors.textSecondary }]}>
        {result.therapeuticClass}{result.doseForms.length > 0 ? ` • ${result.doseForms.join(', ')}` : ''}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { padding: 14, borderBottomWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  primaryName: { fontSize: 16, fontWeight: '600', flex: 1 },
  secondaryName: { fontSize: 13, marginTop: 2 },
  atcCode: { fontSize: 13, marginStart: 8 },
  rtlText: { fontFamily: 'NotoNaskhArabic', textAlign: 'right' },
  meta: { fontSize: 13, marginTop: 4 },
})
