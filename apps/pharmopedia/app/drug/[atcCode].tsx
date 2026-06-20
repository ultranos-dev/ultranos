import { useState, useEffect } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Heart, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { ImpactFeedbackStyle } from 'expo-haptics'
import { getDrugRowByAtcCode, scopeEntryForRole } from '@/db/drug-catalog'
import { getDrugByAtcCodeApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useBookmarkStore } from '@/store/bookmark-store'
import { hapticImpact } from '@/lib/haptics'
import { hasMachineTranslatedContent } from '@/lib/localized-text'
import { MachineTranslationBanner } from '@/components/DrugDetail/MachineTranslationBanner'
import { SafetyZone } from '@/components/DrugDetail/SafetyZone'
import { DrugThumbnail } from '@/components/DrugDetail/DrugThumbnail'
import { buildDrugSections } from '@/components/DrugDetail/drug-detail-sections'
import { ShareButton } from '@/components/DrugDetail/ShareButton'
import { SkeletonCard } from '@/components/SkeletonCard'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { Chip, CollapsibleSection } from '@ultranos/ui-kit/native'
import type { DrugEntryTier1, DrugEntryTier2, DrugEntryTier3 } from '@ultranos/shared-types'

const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH', 'PHARMACIST', 'ADMIN'])
const PHARMACIST_ROLES = new Set(['PHARMACIST', 'ADMIN'])

export default function DrugDetailScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const { atcCode } = useLocalSearchParams<{ atcCode: string }>()
  const router = useRouter()
  const { token, user } = useAuthStore()
  const lang = useLangStore((s) => s.lang)
  const role = user?.role ?? 'PATIENT'
  const isClinical = CLINICAL_ROLES.has(role)
  const isPharmacist = PHARMACIST_ROLES.has(role)
  const isRtl = isRtlLang(lang)

  const isBookmarked = useBookmarkStore((s) => s.isBookmarked)
  const toggleBookmark = useBookmarkStore((s) => s.toggle)

  const [entry, setEntry] = useState<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3 | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!atcCode) return
    loadDrug(atcCode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atcCode])

  async function loadDrug(code: string) {
    setLoading(true)
    try {
      const row = await getDrugRowByAtcCode(getDatabase(), code)
      if (row) { setEntry(scopeEntryForRole(row, role)); return }
      if (token) { setEntry(await getDrugByAtcCodeApi(code, lang, token)) }
    } catch {
      // entry stays null → "not found"
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleBookmark() {
    await toggleBookmark(getDatabase(), {
      atcCode: entry!.atcCode, innName: entry!.innName, therapeuticClass: entry!.therapeuticClass,
    })
    void hapticImpact(ImpactFeedbackStyle.Light)
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surfaceSubtle }]}>
        <View style={{ width: '100%', padding: Spacing[4] }}>
          <SkeletonCard lines={1} /><SkeletonCard lines={3} /><SkeletonCard lines={2} />
        </View>
      </View>
    )
  }

  if (!entry) {
    return (
      <View style={styles.center}>
        <Text style={[styles.notFound, { color: colors.textSecondary }]}>{t('drug.notFound')}</Text>
        <Text style={[styles.notFoundDesc, { color: colors.textMuted }]}>{t('drug.notFoundDescription')}</Text>
        <Pressable onPress={() => router.replace('/(tabs)' as never)} accessibilityRole="button" accessibilityLabel={t('drug.searchInstead')}>
          <Text style={[styles.back, { color: colors.primary500 }]}>{t('drug.searchInstead')}</Text>
        </Pressable>
      </View>
    )
  }

  const localNames = (entry as DrugEntryTier1 & { localNames?: Record<string, string> }).localNames
  const localName = lang !== 'en' ? localNames?.[lang] : undefined
  const sections = buildDrugSections({ entry, lang, t, isClinical, isPharmacist })

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surfaceSubtle }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.header, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
          <Pressable
            testID="detail-back-btn"
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={8}
          >
            {isRtl ? <ChevronRight size={26} color={colors.textPrimary} /> : <ChevronLeft size={26} color={colors.textPrimary} />}
          </Pressable>
          <DrugThumbnail images={(entry as DrugEntryTier1).images} name={entry.innName} />
          <View style={styles.nameBlock}>
            <Text style={[styles.primaryName, { color: colors.textPrimary }, localName ? styles.rtlText : isRtl && styles.fallbackName]}>
              {localName || entry.innName}
            </Text>
            <Text style={[styles.innLine, { color: colors.textSecondary, writingDirection: 'ltr', textAlign: isRtl ? 'right' : 'left' }]}>
              {entry.innName}{isClinical ? ` · ${entry.atcCode}` : ''}
            </Text>
          </View>
          <View style={[styles.actionRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
            <Pressable testID="bookmark-btn" onPress={() => void handleToggleBookmark()} accessibilityRole="button"
              accessibilityLabel={isBookmarked(entry.atcCode) ? t('drug.removeBookmark') : t('drug.addBookmark')} hitSlop={8}>
              <Heart color={isBookmarked(entry.atcCode) ? colors.primary500 : colors.textMuted}
                fill={isBookmarked(entry.atcCode) ? colors.primary500 : 'none'} size={24} />
            </Pressable>
            <ShareButton atcCode={entry.atcCode} drugName={entry.innName} />
          </View>
        </View>

        <View style={styles.chipWrap}><Chip label={entry.therapeuticClass} /></View>

        <View style={[styles.headerDivider, { backgroundColor: colors.border }]} />

        {lang !== 'en' && hasMachineTranslatedContent((entry as DrugEntryTier1).translationStatus, lang) ? (
          <MachineTranslationBanner t={t} />
        ) : null}
        <SafetyZone entry={entry} lang={lang} isClinical={isClinical} />

        <View style={styles.sectionList}>
          {sections.length === 0 ? (
            <Text style={[styles.noDetail, { color: colors.textMuted }]}>{t('drug.noDetail')}</Text>
          ) : (
            sections.map((s) => (
              <CollapsibleSection key={s.id} testID={`section-${s.id}`} title={s.title} defaultOpen={s.defaultOpen}>
                <ErrorBoundary inline>{s.body}</ErrorBoundary>
              </CollapsibleSection>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // No horizontal padding on the scroll — the section list runs edge-to-edge (Saved-tab card rhythm);
  // the header and chip get their own horizontal padding instead.
  scroll: { paddingTop: Spacing[4], gap: Spacing[3], paddingBottom: Spacing[8] },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', gap: Spacing[3], paddingHorizontal: Spacing[4] },
  nameBlock: { flex: 1 },
  primaryName: { fontSize: FontSize.xl, fontFamily: FontFamily.headingBold, marginBottom: 2 },
  innLine: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  chipWrap: { flexDirection: 'row', paddingHorizontal: Spacing[4] },
  headerDivider: { height: StyleSheet.hairlineWidth },
  actionRow: { alignItems: 'center', gap: Spacing[3] },
  rtlText: { fontFamily: FontFamily.arabic, textAlign: 'right', writingDirection: 'rtl' },
  fallbackName: { textAlign: 'right', writingDirection: 'ltr' },
  sectionList: { gap: 0 },
  noDetail: { fontSize: FontSize.base, fontFamily: FontFamily.sans, textAlign: 'center', padding: Spacing[6] },
  notFound: { fontSize: FontSize.lg, marginBottom: Spacing[3] },
  notFoundDesc: { fontSize: FontSize.sm, fontFamily: FontFamily.sans, textAlign: 'center', marginBottom: Spacing[3], paddingHorizontal: Spacing[6] },
  back: { fontSize: FontSize.base },
})
