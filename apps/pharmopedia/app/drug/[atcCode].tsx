import { useState, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, SafeAreaView } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { getDrugRowByAtcCode, scopeEntryForRole } from '@/db/drug-catalog'
import { getDrugByAtcCodeApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import { OverviewTab } from '@/components/DrugDetail/OverviewTab'
import { ClinicalTab } from '@/components/DrugDetail/ClinicalTab'
import { PricingTab } from '@/components/DrugDetail/PricingTab'
import { EnrichTab } from '@/components/DrugDetail/EnrichTab'
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

  const [entry, setEntry] = useState<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3 | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary500} /></View>
  }

  if (!entry) {
    return (
      <View style={styles.center}>
        <Text style={[styles.notFound, { color: colors.textSecondary }]}>{t('drug.notFound')}</Text>
        <Pressable onPress={() => router.back()}><Text style={[styles.back, { color: colors.primary500 }]}>{t('drug.back')}</Text></Pressable>
      </View>
    )
  }

  // Resolve primary display name: localNames record takes precedence in non-English langs
  const localNames = (entry as DrugEntryTier1 & { localNames?: Record<string, string> }).localNames
  const useLocal = lang !== 'en' && !!localNames?.[lang]
  const primaryName = useLocal ? localNames![lang] : entry.innName
  const secondaryName = useLocal ? entry.innName : undefined

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surfaceSubtle }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.primaryName, { color: colors.textPrimary }, isRtl && styles.rtlText]}>{primaryName}</Text>
        {secondaryName && <Text style={[styles.secondaryName, { color: colors.textSecondary }]}>{secondaryName}</Text>}
        <Text style={[styles.subheader, { color: colors.textSecondary }]}>{entry.atcCode} · {entry.therapeuticClass}</Text>
      </View>

      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            testID={`tab-${tab}`}
            style={[styles.tab, activeTab === tab && { borderBottomWidth: 2, borderBottomColor: colors.primary500 }]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, { color: colors.textSecondary }, activeTab === tab && { color: colors.primary500, fontWeight: '600' }]}>
              {TAB_LABELS[tab]}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.content}>
        {activeTab === 'overview' && <OverviewTab entry={entry} lang={lang} />}
        {activeTab === 'clinical' && isClinical && <ClinicalTab entry={entry as DrugEntryTier2} />}
        {activeTab === 'pricing' && <PricingTab atcCode={entry.atcCode} />}
        {activeTab === 'enrich' && isClinical && <EnrichTab atcCode={entry.atcCode} />}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, borderBottomWidth: 1 },
  primaryName: { fontSize: 22, fontWeight: '700', textTransform: 'capitalize' },
  secondaryName: { fontSize: 14, marginTop: 2 },
  subheader: { fontSize: 14, marginTop: 4 },
  rtlText: { fontFamily: 'NotoNaskhArabic', textAlign: 'right' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { paddingHorizontal: 18, paddingVertical: 12 },
  tabText: { fontSize: 15 },
  content: { flex: 1 },
  notFound: { fontSize: 18, marginBottom: 12 },
  back: { fontSize: 16 },
})
