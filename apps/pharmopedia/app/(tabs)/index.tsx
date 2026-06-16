import { useState, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Pill } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { CollapsibleScreen, Banner, Chip, ListRow, EmptyState, Card, useRtl } from '@ultranos/ui-kit/native'
import { HomeSearchField } from '@/components/HomeSearchField'
import { getActiveRecalls, type RecallSummary } from '@/db/recalls'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import { useRecentSearchStore } from '@/store/recent-search-store'
import { useThemeColors } from '@/hooks/useThemeColors'

const ROLE_LABELS: Record<string, string> = {
  PATIENT: 'Patient', DOCTOR: 'Doctor', NURSE: 'Nurse', LAB_TECH: 'Lab technician', PHARMACIST: 'Pharmacist', ADMIN: 'Admin',
}

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
  const recents = useRecentSearchStore((s) => s.recents)
  const rtl = useRtl()
  const role = user?.role ?? 'PATIENT'
  const labelAlign = { textAlign: rtl ? ('right' as const) : ('left' as const) }
  const [recalls, setRecalls] = useState<RecallSummary[]>([])

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
  const savedTop = bookmarks.slice(0, 5)

  return (
    <CollapsibleScreen title={greeting} subtitle={subtitle}>
      <HomeSearchField onPress={() => router.push('/search')} />

      {recalls.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textMuted }, labelAlign]}>{t('home.safetyAlerts')}</Text>
          <View style={styles.alerts}>
            {recalls.map((r) => (
              <Banner
                key={r.atcCode}
                variant="warning"
                text={`${r.innName}${r.description ? ` — ${r.description}` : ''}`}
                onPress={() => router.push(`/drug/${r.atcCode}`)}
              />
            ))}
          </View>
        </View>
      )}

      {recents.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.textMuted }, labelAlign]}>{t('home.recent')}</Text>
          <View style={styles.chips}>
            {recents.map((q) => (
              <Chip key={q} label={q} onPress={() => router.push({ pathname: '/search', params: { q } })} />
            ))}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.savedHeader}>
          <Text style={[styles.label, { color: colors.textMuted }, labelAlign]}>{t('home.saved')}</Text>
          {bookmarks.length > 5 && (
            <Pressable onPress={() => router.push('/(tabs)/saved')} accessibilityRole="button" accessibilityLabel={t('home.seeAll')}>
              <Text style={[styles.seeAll, { color: colors.primary500 }]}>{t('home.seeAll')}</Text>
            </Pressable>
          )}
        </View>
        {savedTop.length > 0 ? (
          <Card>
            {savedTop.map((b) => (
              <ListRow key={b.atcCode} icon={Pill} label={b.innName} trailing={<ChevronRight size={18} color={colors.textMuted} />} onPress={() => router.push(`/drug/${b.atcCode}`)} />
            ))}
          </Card>
        ) : (
          <EmptyState icon={Pill} title={t('home.savedEmpty')} action={{ label: t('home.browseCta'), onPress: () => router.push('/(tabs)/browse') }} />
        )}
      </View>
    </CollapsibleScreen>
  )
}

const styles = StyleSheet.create({
  section: { gap: Spacing[2] },
  label: { fontFamily: FontFamily.sansBold, fontSize: FontSize.xs, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: Spacing[2] },
  alerts: { gap: Spacing[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  savedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing[2] },
  seeAll: { fontFamily: FontFamily.sansSemibold, fontSize: FontSize.sm },
})
