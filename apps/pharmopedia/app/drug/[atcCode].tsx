import { useState, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, SafeAreaView } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { getDrugRowByAtcCode, scopeEntryForRole } from '@/db/drug-catalog'
import { getDrugByAtcCodeApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { OverviewTab } from '@/components/DrugDetail/OverviewTab'
import { ClinicalTab } from '@/components/DrugDetail/ClinicalTab'
import { PricingTab } from '@/components/DrugDetail/PricingTab'
import { EnrichTab } from '@/components/DrugDetail/EnrichTab'
import type { DrugEntryTier1, DrugEntryTier2, DrugEntryTier3 } from '@ultranos/shared-types'

const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH', 'PHARMACIST', 'ADMIN'])
type Tab = 'overview' | 'clinical' | 'pricing' | 'enrich'

export default function DrugDetailScreen() {
  const { t } = useTranslation()
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
    return <View style={styles.center}><ActivityIndicator size="large" /></View>
  }

  if (!entry) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>{t('drug.notFound')}</Text>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>{t('drug.back')}</Text></Pressable>
      </View>
    )
  }

  // Resolve primary display name: localNames record takes precedence in non-English langs
  const localNames = (entry as DrugEntryTier1 & { localNames?: Record<string, string> }).localNames
  const useLocal = lang !== 'en' && !!localNames?.[lang]
  const primaryName = useLocal ? localNames![lang] : entry.innName
  const secondaryName = useLocal ? entry.innName : undefined

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.primaryName, isRtl && styles.rtlText]}>{primaryName}</Text>
        {secondaryName && <Text style={styles.secondaryName}>{secondaryName}</Text>}
        <Text style={styles.subheader}>{entry.atcCode} · {entry.therapeuticClass}</Text>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            testID={`tab-${tab}`}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
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
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  primaryName: { fontSize: 22, fontWeight: '700', color: '#111827', textTransform: 'capitalize' },
  secondaryName: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  subheader: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  rtlText: { fontFamily: 'NotoNaskhArabic', textAlign: 'right' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tab: { paddingHorizontal: 18, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#2563eb' },
  tabText: { fontSize: 15, color: '#6b7280' },
  tabTextActive: { color: '#2563eb', fontWeight: '600' },
  content: { flex: 1 },
  notFound: { fontSize: 18, color: '#374151', marginBottom: 12 },
  back: { color: '#2563eb', fontSize: 16 },
})
