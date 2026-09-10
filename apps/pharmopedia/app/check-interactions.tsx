import { useState, useCallback, useRef } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, X, AlertTriangle } from 'lucide-react-native'
import type { DrugSearchResult } from '@ultranos/shared-types'
import type { InteractionResult } from '@ultranos/drug-db'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { searchDrugs } from '@/db/fts'
import { getDatabase } from '@/db/migrations'
import { checkDrugInteractions } from '@/services/interaction-service'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { useThemeColors } from '@/hooks/useThemeColors'

type CheckState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'unavailable' }
  | { phase: 'done'; interactions: InteractionResult[] }

/** Dedupe key for a pairwise interaction, order-independent. */
function pairKey(i: InteractionResult): string {
  return [i.drugA.toLowerCase(), i.drugB.toLowerCase()].sort().join('|')
}

function severityColor(severity: string, colors: ReturnType<typeof useThemeColors>): string {
  const s = severity.toUpperCase()
  if (s.includes('CONTRA') || s === 'MAJOR' || s.includes('ALLERGY')) return colors.danger
  if (s === 'MODERATE') return colors.warning
  return colors.textMuted
}

export default function CheckInteractionsScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const lang = useLangStore((s) => s.lang)
  const isRtl = isRtlLang(lang)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DrugSearchResult[]>([])
  const [meds, setMeds] = useState<string[]>([])
  const [check, setCheck] = useState<CheckState>({ phase: 'idle' })
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearch = useCallback((value: string) => {
    setQuery(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (value.trim().length < 2) { setResults([]); return }
    searchTimer.current = setTimeout(async () => {
      try {
        setResults(await searchDrugs(getDatabase(), value, lang, 8))
      } catch {
        setResults([])
      }
    }, 150)
  }, [lang])

  const addMed = useCallback((name: string) => {
    setMeds((prev) => (prev.some((m) => m.toLowerCase() === name.toLowerCase()) ? prev : [...prev, name]))
    setQuery('')
    setResults([])
    setCheck({ phase: 'idle' })
  }, [])

  const removeMed = useCallback((name: string) => {
    setMeds((prev) => prev.filter((m) => m !== name))
    setCheck({ phase: 'idle' })
  }, [])

  const runCheck = useCallback(async () => {
    if (meds.length < 2) return
    setCheck({ phase: 'checking' })
    const db = getDatabase()
    const found = new Map<string, InteractionResult>()
    let anyUnavailable = false
    // Check each med against the others; the shared checker returns UNAVAILABLE
    // (never a false CLEAR) when the local interaction catalog is missing (Rule 3).
    for (let i = 0; i < meds.length; i++) {
      const others = meds.filter((_, j) => j !== i)
      try {
        const summary = await checkDrugInteractions(meds[i]!, others, db)
        if (summary.result === 'UNAVAILABLE') { anyUnavailable = true; break }
        for (const r of summary.interactions) found.set(pairKey(r), r)
      } catch {
        anyUnavailable = true
        break
      }
    }
    if (anyUnavailable) setCheck({ phase: 'unavailable' })
    else setCheck({ phase: 'done', interactions: [...found.values()] })
  }, [meds])

  const inputStyle = [styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface }]

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surfaceSubtle }]} edges={['top']}>
      <View style={[styles.header, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8}>
          {isRtl ? <ChevronRight size={26} color={colors.textPrimary} /> : <ChevronLeft size={26} color={colors.textPrimary} />}
        </Pressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t('interactions.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.helper, { color: colors.textSecondary }]}>{t('interactions.helper')}</Text>

        <TextInput
          value={query}
          onChangeText={handleSearch}
          placeholder={t('interactions.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          style={inputStyle}
          accessibilityLabel={t('interactions.searchPlaceholder')}
        />

        {results.length > 0 && (
          <View style={[styles.results, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {results.map((r) => (
              <Pressable key={r.atcCode} onPress={() => addMed(r.innName)} style={styles.resultRow} accessibilityRole="button">
                <Text style={[styles.resultName, { color: colors.textPrimary }]}>{r.innName}</Text>
                <Text style={[styles.resultClass, { color: colors.textMuted }]}>{r.therapeuticClass}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {meds.length > 0 && (
          <View style={styles.chips}>
            {meds.map((m) => (
              <View key={m} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.chipText, { color: colors.textPrimary }]}>{m}</Text>
                <Pressable onPress={() => removeMed(m)} accessibilityRole="button" accessibilityLabel={`${t('interactions.remove')} ${m}`} hitSlop={6}>
                  <X size={16} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <Pressable
          onPress={() => void runCheck()}
          disabled={meds.length < 2 || check.phase === 'checking'}
          style={[styles.checkBtn, { backgroundColor: meds.length < 2 ? colors.border : colors.primary500 }]}
          accessibilityRole="button"
        >
          {check.phase === 'checking'
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.checkBtnText}>{t('interactions.checkButton')}</Text>}
        </Pressable>

        {meds.length < 2 && <Text style={[styles.hint, { color: colors.textMuted }]}>{t('interactions.needTwo')}</Text>}

        {check.phase === 'unavailable' && (
          <View style={[styles.banner, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}>
            <AlertTriangle size={18} color={colors.danger} />
            <Text style={[styles.bannerText, { color: colors.danger }]}>{t('interactions.unavailable')}</Text>
          </View>
        )}

        {check.phase === 'done' && check.interactions.length === 0 && (
          <View style={[styles.banner, { backgroundColor: colors.successLight, borderColor: colors.success }]}>
            <Text style={[styles.bannerText, { color: colors.success }]}>{t('interactions.noInteractions')}</Text>
          </View>
        )}

        {check.phase === 'done' && check.interactions.length > 0 && (
          <View style={styles.resultsList}>
            <Text style={[styles.resultsTitle, { color: colors.textPrimary }]}>{t('interactions.resultsTitle')}</Text>
            {check.interactions.map((i, idx) => (
              <View key={`${pairKey(i)}-${idx}`} style={[styles.interactionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.interactionHead}>
                  <Text style={[styles.pair, { color: colors.textPrimary }]}>{i.drugA} · {i.drugB}</Text>
                  <Text style={[styles.severity, { color: severityColor(String(i.severity), colors) }]}>{String(i.severity)}</Text>
                </View>
                <Text style={[styles.desc, { color: colors.textSecondary }]}>{i.description}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', gap: Spacing[3], paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  title: { fontSize: FontSize.xl, fontFamily: FontFamily.headingBold },
  scroll: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[8], gap: Spacing[3] },
  helper: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3], fontSize: FontSize.base, fontFamily: FontFamily.sans },
  results: { borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
  resultRow: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  resultName: { fontSize: FontSize.base, fontFamily: FontFamily.sansSemibold },
  resultClass: { fontSize: FontSize.xs, fontFamily: FontFamily.sans },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], borderWidth: 1, borderRadius: Radius.full, paddingStart: Spacing[3], paddingEnd: Spacing[2], paddingVertical: Spacing[2] },
  chipText: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  checkBtn: { borderRadius: Radius.md, paddingVertical: Spacing[3], alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  checkBtnText: { color: '#fff', fontSize: FontSize.base, fontFamily: FontFamily.sansSemibold },
  hint: { fontSize: FontSize.xs, fontFamily: FontFamily.sans, textAlign: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], borderWidth: 1, borderRadius: Radius.md, padding: Spacing[3] },
  bannerText: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.sansSemibold },
  resultsList: { gap: Spacing[2] },
  resultsTitle: { fontSize: FontSize.base, fontFamily: FontFamily.sansSemibold },
  interactionCard: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing[3], gap: Spacing[1] },
  interactionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pair: { fontSize: FontSize.sm, fontFamily: FontFamily.sansSemibold, flex: 1 },
  severity: { fontSize: FontSize.xs, fontFamily: FontFamily.sansBold },
  desc: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
})
