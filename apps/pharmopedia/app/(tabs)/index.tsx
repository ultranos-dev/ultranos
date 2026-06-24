import { useState, useEffect, useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pill, XCircle } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { CollapsibleScreen, Banner, Chip, EmptyState, useRtl, useConfirm } from '@ultranos/ui-kit/native'
import { SearchBar } from '@/components/SearchBar'
import { SearchResults } from '@/components/SearchResults'
import { DrugCard } from '@/components/DrugCard'
import { BrandResultCard } from '@/components/BrandResultCard'
import type { DrugSearchResult, BrandSearchResult } from '@ultranos/shared-types'
import { useDrugSearch } from '@/hooks/useDrugSearch'
import { getActiveRecalls, type RecallSummary } from '@/db/recalls'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import { useRecentSearchStore } from '@/store/recent-search-store'
import { useDismissedAlertsStore, isAlertHidden } from '@/store/dismissed-alerts-store'
import { useLangStore } from '@/store/lang-store'
import { useThemeColors } from '@/hooks/useThemeColors'

const ROLE_LABELS: Record<string, string> = {
  PATIENT: 'Patient', DOCTOR: 'Doctor', NURSE: 'Nurse', LAB_TECH: 'Lab technician', PHARMACIST: 'Pharmacist', ADMIN: 'Admin',
}

// Saved preview merges generic + brand bookmarks (newest first), mirroring the Saved tab.
type SavedItem =
  | { kind: 'generic'; savedAt: string; generic: DrugSearchResult }
  | { kind: 'brand'; savedAt: string; brand: BrandSearchResult }

function greetingKey(hour: number): 'home.greetingMorning' | 'home.greetingAfternoon' | 'home.greetingEvening' {
  if (hour < 12) return 'home.greetingMorning'
  if (hour < 18) return 'home.greetingAfternoon'
  return 'home.greetingEvening'
}

export default function HomeTab() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const brandBookmarks = useBookmarkStore((s) => s.brandBookmarks)
  const recents = useRecentSearchStore((s) => s.recents)
  const addRecent = useRecentSearchStore((s) => s.add)
  const clearRecents = useRecentSearchStore((s) => s.clear)
  const lang = useLangStore((s) => s.lang)
  const dismissedMap = useDismissedAlertsStore((s) => s.dismissed)
  const policyDays = useDismissedAlertsStore((s) => s.policyDays)
  const dismissAlert = useDismissedAlertsStore((s) => s.dismiss)
  const { confirm, confirmDialog } = useConfirm()
  const rtl = useRtl()
  const role = user?.role ?? 'PATIENT'
  const labelAlign = rtl
    ? { textAlign: 'right' as const, fontFamily: FontFamily.arabic }
    : { textAlign: 'left' as const }
  const [recalls, setRecalls] = useState<RecallSummary[]>([])

  const { query, results, brands, loading, search } = useDrugSearch()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const r = await getActiveRecalls(getDatabase(), role)
        if (!cancelled) setRecalls(r)
      } catch {
        if (!cancelled) setRecalls([])
      }
    })()
    return () => { cancelled = true }
  }, [role])

  const greeting = t(greetingKey(new Date().getHours()))
  const subtitle = ROLE_LABELS[role] ?? role

  const savedItems = useMemo<SavedItem[]>(() => {
    const generics: SavedItem[] = bookmarks.map((b) => ({
      kind: 'generic', savedAt: b.savedAt,
      generic: { atcCode: b.atcCode, innName: b.innName, brandNames: [], doseForms: [], therapeuticClass: b.therapeuticClass ?? '', localName: undefined },
    }))
    const brandsSaved: SavedItem[] = brandBookmarks.map((b) => ({
      kind: 'brand', savedAt: b.savedAt,
      brand: { id: b.id, brandName: b.brandName, manufacturer: b.manufacturer ?? undefined, genericAtcCode: b.genericAtcCode, genericInnName: b.genericInnName ?? '', doseForm: b.doseForm ?? undefined, referencePrice: b.referencePrice ?? undefined, currency: b.currency ?? undefined },
    }))
    return [...generics, ...brandsSaved].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
  }, [bookmarks, brandBookmarks])
  const savedTop = savedItems.slice(0, 5)

  // Hide alerts the user dismissed, until the reappear policy lets them return.
  const now = Date.now()
  const visibleRecalls = recalls.filter((r) => !isAlertHidden(dismissedMap[r.atcCode], policyDays, now))

  async function confirmDismiss(r: RecallSummary) {
    const ok = await confirm({
      title: t('home.dismissAlertTitle'),
      message: t('home.dismissAlertMessage'),
      confirmLabel: t('home.dismissAlertConfirm'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      testID: 'dismiss-alert-dialog',
    })
    if (ok) void dismissAlert(r.atcCode)
  }

  async function confirmClearRecents() {
    const ok = await confirm({
      title: t('home.clearRecentTitle'),
      message: t('home.clearRecentMessage'),
      confirmLabel: t('home.clearRecentConfirm'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      testID: 'clear-recents-dialog',
    })
    if (ok) void clearRecents()
  }

  return (
    <CollapsibleScreen title={greeting} subtitle={subtitle}>
      <SearchBar value={query} onSearch={search} />

      {query.trim().length > 0 ? (
        <View style={styles.section}>
          <SearchResults
            query={query}
            results={results}
            brands={brands}
            loading={loading}
            lang={lang}
            onSelectGeneric={(atcCode) => { void addRecent(query); router.push(`/drug/${atcCode}`) }}
            onSelectBrand={(id) => { void addRecent(query); router.push({ pathname: '/brand/[id]', params: { id } }) }}
          />
        </View>
      ) : (
        <>
          {visibleRecalls.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.textMuted }, labelAlign]}>{t('home.safetyAlerts')}</Text>
              <View style={styles.alerts}>
                {visibleRecalls.map((r) => (
                  <Banner
                    key={r.atcCode}
                    testID={`recall-${r.atcCode}`}
                    variant="warning"
                    text={`${r.innName}${r.description ? ` — ${r.description}` : ''}`}
                    onPress={() => router.push(`/drug/${r.atcCode}`)}
                    onDismiss={() => void confirmDismiss(r)}
                    dismissLabel={t('home.dismissAlertA11y')}
                  />
                ))}
              </View>
            </View>
          )}

          {recents.length > 0 && (
            <View style={styles.section}>
              <View style={[styles.sectionHeader, rtl && styles.rowReverse]}>
                <Text style={[styles.label, { color: colors.textMuted }, labelAlign]}>{t('home.recent')}</Text>
                <Pressable
                  testID="clear-recents-btn"
                  onPress={() => void confirmClearRecents()}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.clearRecent')}
                  hitSlop={8}
                >
                  <XCircle size={18} color={colors.textMuted} />
                </Pressable>
              </View>
              <View style={styles.chips}>
                {recents.map((q) => (
                  <Chip key={q} label={q} onPress={() => void search(q)} />
                ))}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.label, { color: colors.textMuted }, labelAlign]}>{t('home.saved')}</Text>
              {savedItems.length > 5 && (
                <Pressable onPress={() => router.push('/(tabs)/saved')} accessibilityRole="button" accessibilityLabel={t('home.seeAll')}>
                  <Text style={[styles.seeAll, { color: colors.primary500 }, rtl && styles.arabic]}>{t('home.seeAll')}</Text>
                </Pressable>
              )}
            </View>
            {savedTop.length > 0 ? (
              <View style={styles.savedList}>
                {savedTop.map((item) =>
                  item.kind === 'brand' ? (
                    <BrandResultCard
                      key={`b-${item.brand.id}`}
                      result={item.brand}
                      lang={lang}
                      compact
                      onPress={() => router.push({ pathname: '/brand/[id]', params: { id: item.brand.id } })}
                    />
                  ) : (
                    <DrugCard
                      key={`g-${item.generic.atcCode}`}
                      result={item.generic}
                      lang={lang}
                      compact
                      onPress={() => router.push(`/drug/${item.generic.atcCode}`)}
                    />
                  ),
                )}
              </View>
            ) : (
              <EmptyState icon={Pill} title={t('home.savedEmpty')} action={{ label: t('home.browseCta'), onPress: () => router.push('/(tabs)/browse') }} />
            )}
          </View>
        </>
      )}
      {confirmDialog}
    </CollapsibleScreen>
  )
}

const styles = StyleSheet.create({
  section: { gap: Spacing[2] },
  savedList: { gap: Spacing[2] },
  label: { fontFamily: FontFamily.sansBold, fontSize: FontSize.xs, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: Spacing[2] },
  alerts: { gap: Spacing[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing[2] },
  rowReverse: { flexDirection: 'row-reverse' },
  seeAll: { fontFamily: FontFamily.sansSemibold, fontSize: FontSize.sm },
  arabic: { fontFamily: FontFamily.arabic },
})
