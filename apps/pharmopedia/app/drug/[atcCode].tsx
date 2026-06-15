import { useState, useEffect, useRef } from 'react'
import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring } from 'react-native-reanimated'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Heart } from 'lucide-react-native'
import { ImpactFeedbackStyle } from 'expo-haptics'
import { getDrugRowByAtcCode, scopeEntryForRole } from '@/db/drug-catalog'
import { getDrugByAtcCodeApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useBookmarkStore } from '@/store/bookmark-store'
import { hapticImpact } from '@/lib/haptics'
import { OverviewTab } from '@/components/DrugDetail/OverviewTab'
import { ClinicalTab } from '@/components/DrugDetail/ClinicalTab'
import { PricingTab } from '@/components/DrugDetail/PricingTab'
import { EnrichTab } from '@/components/DrugDetail/EnrichTab'
import { ShareButton } from '@/components/DrugDetail/ShareButton'
import { SkeletonCard } from '@/components/SkeletonCard'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { CoachMark } from '@/components/CoachMark'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import type { DrugEntryTier1, DrugEntryTier2, DrugEntryTier3 } from '@ultranos/shared-types'

const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH', 'PHARMACIST', 'ADMIN'])
type Tab = 'overview' | 'clinical' | 'pricing' | 'enrich'

export default function DrugDetailScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const { atcCode } = useLocalSearchParams<{ atcCode: string }>()
  const router = useRouter()
  const { token, user } = useAuthStore()
  const lang = useLangStore((s) => s.lang)
  const role = user?.role ?? 'PATIENT'
  const isClinical = CLINICAL_ROLES.has(role)
  const isRtl = isRtlLang(lang)

  const isBookmarked = useBookmarkStore((s) => s.isBookmarked)
  const toggleBookmark = useBookmarkStore((s) => s.toggleBookmark)

  const visitCount = useRef(0)
  useEffect(() => { visitCount.current += 1 }, [])

  const [entry, setEntry] = useState<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3 | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [tabLayouts, setTabLayouts] = useState<{ x: number; width: number }[]>([])

  const indicatorX = useSharedValue(0)
  const indicatorW = useSharedValue(0)
  const heartScale = useSharedValue(1)

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
  }))

  const heartAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: heartScale.value }],
  }))

  const TABS: Tab[] = ['overview', ...(isClinical ? ['clinical' as Tab] : []), 'pricing', ...(isClinical ? ['enrich' as Tab] : [])]

  const TAB_LABELS: Record<Tab, string> = {
    overview: t('drug.tabs.overview'),
    clinical: t('drug.tabs.clinical'),
    pricing: t('drug.tabs.pricing'),
    enrich: t('drug.tabs.enrich'),
  }

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
      if (token) { const apiEntry = await getDrugByAtcCodeApi(code, token); setEntry(apiEntry) }
    } catch {
      // entry stays null → renders "Drug not found"
    } finally {
      setLoading(false)
    }
  }

  function onTabPress(index: number) {
    setActiveTab(TABS[index])
    if (tabLayouts[index]) {
      indicatorX.value = withTiming(tabLayouts[index].x, { duration: 250 })
      indicatorW.value = withTiming(tabLayouts[index].width, { duration: 250 })
    }
  }

  async function handleToggleBookmark() {
    const wasBookmarked = isBookmarked(entry!.atcCode)
    await toggleBookmark(getDatabase(), {
      atcCode: entry!.atcCode,
      innName: entry!.innName,
      therapeuticClass: entry!.therapeuticClass,
    })
    if (!wasBookmarked) {
      heartScale.value = withSpring(1.3, { damping: 8 }, () => {
        heartScale.value = withSpring(1)
      })
      void hapticImpact(ImpactFeedbackStyle.Light)
    }
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surfaceSubtle }]}>
        <View style={{ width: '100%', padding: Spacing[4] }}>
          <SkeletonCard lines={1} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </View>
      </View>
    )
  }

  if (!entry) {
    return (
      <View style={styles.center}>
        <Text style={[styles.notFound, { color: colors.textSecondary }]}>{t('drug.notFound')}</Text>
        <Pressable onPress={() => router.back()}><Text style={[styles.back, { color: colors.primary500 }]}>{t('drug.back')}</Text></Pressable>
      </View>
    )
  }

  const localNames = (entry as DrugEntryTier1 & { localNames?: Record<string, string> }).localNames
  const localName = lang !== 'en' ? localNames?.[lang] : undefined

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surfaceSubtle }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.primaryName, { color: colors.textPrimary }, isRtl && styles.rtlText]}>
          {localName || entry.innName}
        </Text>
        <Text style={[styles.innLine, { color: colors.textSecondary }]}>
          {entry.innName} · {entry.atcCode}
        </Text>
        <View style={[styles.classBadge, { backgroundColor: colors.surfaceSubtle }]}>
          <Text style={[styles.classBadgeText, { color: colors.textSecondary }]}>
            {entry.therapeuticClass}
          </Text>
        </View>
        <View style={styles.actionRow}>
          <Pressable testID="bookmark-btn" onPress={() => void handleToggleBookmark()}>
            <Animated.View style={heartAnimatedStyle}>
              <Heart
                color={isBookmarked(entry.atcCode) ? colors.danger : colors.textMuted}
                fill={isBookmarked(entry.atcCode) ? colors.danger : 'none'}
                size={24}
              />
            </Animated.View>
          </Pressable>
          <ShareButton entry={entry} />
        </View>
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {TABS.map((tab, i) => (
          <Pressable
            key={tab}
            testID={`tab-${tab}`}
            style={styles.tab}
            onPress={() => onTabPress(i)}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout
              setTabLayouts((prev) => {
                const next = [...prev]
                next[i] = { x, width }
                return next
              })
            }}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === tab && { color: colors.primary500, fontWeight: '600' }]}>
              {TAB_LABELS[tab]}
            </Text>
          </Pressable>
        ))}
        <Animated.View style={[styles.tabIndicator, { backgroundColor: colors.primary500 }, indicatorStyle]} />
      </View>

      <View style={styles.content}>
        {activeTab === 'overview' && (
          <ErrorBoundary inline>
            <OverviewTab entry={entry} lang={lang} />
          </ErrorBoundary>
        )}
        {activeTab === 'clinical' && isClinical && (
          <ErrorBoundary inline>
            <ClinicalTab entry={entry as DrugEntryTier2} />
          </ErrorBoundary>
        )}
        {activeTab === 'pricing' && (
          <ErrorBoundary inline>
            <PricingTab atcCode={entry.atcCode} />
          </ErrorBoundary>
        )}
        {activeTab === 'enrich' && isClinical && (
          <ErrorBoundary inline>
            <EnrichTab atcCode={entry.atcCode} />
          </ErrorBoundary>
        )}
      </View>
      <CoachMark
        markKey="detail-bookmark"
        hint={t('coach.detailBookmark')}
        visible={visitCount.current >= 2 && !!entry}
      />
      <CoachMark
        markKey="detail-tabs"
        hint={t('coach.detailTabs')}
        visible={visitCount.current >= 2 && !!entry}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, borderBottomWidth: 1 },
  primaryName: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.headingBold,
    marginBottom: 2,
  },
  innLine: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sans,
    marginBottom: Spacing[2],
  },
  classBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
    marginBottom: Spacing[3],
  },
  classBadgeText: {
    fontSize: 12,
    fontFamily: FontFamily.sans,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing[3],
  },
  rtlText: { fontFamily: FontFamily.arabic, textAlign: 'right' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { paddingHorizontal: 18, paddingVertical: 12 },
  tabText: { fontSize: 15 },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    borderRadius: 1,
  },
  content: { flex: 1 },
  notFound: { fontSize: 18, marginBottom: 12 },
  back: { fontSize: 16 },
})
