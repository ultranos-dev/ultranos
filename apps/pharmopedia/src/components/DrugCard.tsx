import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { DrugSearchResult } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'

interface Props {
  result: DrugSearchResult
  lang: Lang
  onPress: () => void
}

export function DrugCard({ result, lang, onPress }: Props) {
  const useLocal = lang !== 'en' && !!result.localName
  const primaryName = useLocal ? result.localName! : result.innName
  const secondaryName = useLocal ? result.innName : undefined
  const isRtl = isRtlLang(lang)

  return (
    <Pressable style={styles.card} onPress={onPress} testID={`drug-card-${result.atcCode}`}>
      <View style={styles.row}>
        <Text
          testID="drug-primary-name"
          style={[styles.primaryName, isRtl && styles.rtlText]}
          numberOfLines={1}
        >
          {primaryName}
        </Text>
        <Text style={styles.atcCode}>{result.atcCode}</Text>
      </View>
      {secondaryName && (
        <Text testID="drug-secondary-name" style={styles.secondaryName}>{secondaryName}</Text>
      )}
      <Text style={styles.meta}>
        {result.therapeuticClass}{result.doseForms.length > 0 ? ` • ${result.doseForms.join(', ')}` : ''}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fff' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  primaryName: { fontSize: 16, fontWeight: '600', color: '#111827', flex: 1 },
  secondaryName: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  atcCode: { fontSize: 13, color: '#6b7280', marginStart: 8 },
  rtlText: { fontFamily: 'NotoNaskhArabic', textAlign: 'right' },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 4 },
})
