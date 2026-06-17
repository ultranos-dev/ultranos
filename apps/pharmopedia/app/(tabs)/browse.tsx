import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, Pressable, StyleSheet, RefreshControl, BackHandler,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { FolderOpen } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { CollapsibleList, EmptyState } from '@ultranos/ui-kit/native'
import { getDatabase } from '@/db/migrations'
import { getTherapeuticClasses, getDrugsByTherapeuticClass, type TherapeuticClass } from '@/db/browse'
import { TherapeuticClassCard } from '@/components/TherapeuticClassCard'
import { NetStatusBanner } from '@/components/NetStatusBanner'
import { DrugCard } from '@/components/DrugCard'
import { SkeletonCard } from '@/components/SkeletonCard'
import { useLangStore } from '@/store/lang-store'
import { useSyncStore } from '@/store/sync-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import { CoachMark } from '@/components/CoachMark'
import type { DrugSearchResult } from '@ultranos/shared-types'

export default function BrowseTab() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const lang = useLangStore((s) => s.lang)
  const lastVersion = useSyncStore((s) => s.lastVersion)

  const [classes, setClasses] = useState<TherapeuticClass[]>([])
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [drugs, setDrugs] = useState<DrugSearchResult[]>([])
  const [classesLoading, setClassesLoading] = useState(true)
  const [drugsLoading, setDrugsLoading] = useState(false)
  const [classesRefreshing, setClassesRefreshing] = useState(false)
  const [drugsRefreshing, setDrugsRefreshing] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadClasses() {
      setClassesLoading(true)
      try {
        const data = await getTherapeuticClasses(getDatabase())
        if (!cancelled) setClasses(data)
      } catch {
        if (!cancelled) setClasses([])
      } finally {
        if (!cancelled) setClassesLoading(false)
      }
    }
    void loadClasses()
    return () => { cancelled = true }
  }, [lastVersion])

  async function handleClassPress(cls: string) {
    setSelectedClass(cls)
    setDrugs([])
    setDrugsLoading(true)
    try {
      const data = await getDrugsByTherapeuticClass(getDatabase(), cls, lang)
      setDrugs(data)
    } catch {
      setDrugs([])
    } finally {
      setDrugsLoading(false)
    }
  }

  function handleBack() {
    setSelectedClass(null)
    setDrugs([])
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedClass !== null) { handleBack(); return true }
      return false
    })
    return () => sub.remove()
  }, [selectedClass])

  const onRefreshClasses = useCallback(async () => {
    setClassesRefreshing(true)
    try {
      const data = await getTherapeuticClasses(getDatabase())
      setClasses(data)
    } catch {
      // keep existing data on error
    } finally {
      setClassesRefreshing(false)
    }
  }, [])

  const onRefreshDrugs = useCallback(async () => {
    if (!selectedClass) return
    setDrugsRefreshing(true)
    try {
      const data = await getDrugsByTherapeuticClass(getDatabase(), selectedClass, lang)
      setDrugs(data)
    } catch {
      // keep existing data on error
    } finally {
      setDrugsRefreshing(false)
    }
  }, [selectedClass, lang])

  if (selectedClass !== null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.surfaceSubtle }]}>
        <NetStatusBanner />
        <View style={[styles.classHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable
            testID="browse-back-btn"
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={8}
            style={styles.backBtn}
          >
            <Text style={[styles.backText, { color: colors.primary500 }]}>{t('common.back')}</Text>
          </Pressable>
          <Text style={[styles.classTitle, { color: colors.textPrimary }]} numberOfLines={1}>{selectedClass}</Text>
        </View>
        {drugsLoading && drugs.length === 0 ? (
          <View style={styles.drugListContent}>
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} testID={`skeleton-drug-${i}`} />
            ))}
          </View>
        ) : drugs.length === 0 ? (
          <View style={styles.center}><Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('browse.noDrugs')}</Text></View>
        ) : (
          <FlatList
            data={drugs}
            keyExtractor={(item) => item.atcCode}
            contentContainerStyle={styles.drugListContent}
            renderItem={({ item }) => (
              <DrugCard
                result={item}
                lang={lang}
                onPress={() => router.push(`/drug/${item.atcCode}`)}
              />
            )}
            refreshControl={
              <RefreshControl refreshing={drugsRefreshing} onRefresh={onRefreshDrugs} tintColor={colors.primary500} />
            }
          />
        )}
      </SafeAreaView>
    )
  }

  return (
    <>
      <CollapsibleList
        title={t('tabs.browse')}
        data={classes}
        keyExtractor={(item) => item.name}
        renderItem={({ item, index }) => (
          <TherapeuticClassCard name={item.name} count={item.count} index={index} onPress={() => void handleClassPress(item.name)} />
        )}
        ListEmptyComponent={
          classesLoading
            ? <View>{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} testID={`skeleton-class-${i}`} />)}</View>
            : <EmptyState icon={FolderOpen} title={t('browse.emptyTitle')} description={t('browse.emptyDescription')} />
        }
        refreshing={classesRefreshing}
        onRefresh={onRefreshClasses}
      />
      <NetStatusBanner />
      <CoachMark
        markKey="browse-class"
        hint={t('coach.browseClass')}
        visible={classes.length > 0}
      />
    </>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  drugListContent: { paddingTop: Spacing[4], paddingBottom: Spacing[8] },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing[8] },
  emptyText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sans,
    textAlign: 'center',
  },
  classHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
  },
  backBtn: { paddingVertical: 4 },
  backText: { fontSize: FontSize.base },
  classTitle: { fontSize: FontSize.base, fontFamily: FontFamily.sansSemibold, flex: 1 },
})
