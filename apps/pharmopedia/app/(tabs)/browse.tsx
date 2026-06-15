import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, FlatList, Pressable, StyleSheet, RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { FolderOpen } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
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

  const visitCount = useRef(0)
  useEffect(() => { visitCount.current += 1 }, [])

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

  if (classesLoading && classes.length === 0 && selectedClass === null) {
    return (
      <View style={styles.container}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} testID={`skeleton-class-${i}`} />
        ))}
      </View>
    )
  }

  if (selectedClass !== null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.surfaceSubtle }]}>
        <NetStatusBanner />
        <View style={[styles.classHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Pressable testID="browse-back-btn" onPress={handleBack} style={styles.backBtn}>
            <Text style={[styles.backText, { color: colors.primary500 }]}>{t('common.back')}</Text>
          </Pressable>
          <Text style={[styles.classTitle, { color: colors.textPrimary }]} numberOfLines={1}>{selectedClass}</Text>
        </View>
        {drugsLoading && drugs.length === 0 ? (
          <View>
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
            renderItem={({ item, index }) => (
              <DrugCard
                result={item}
                lang={lang}
                onPress={() => router.push(`/drug/${item.atcCode}`)}
                index={index}
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surfaceSubtle }]}>
      <NetStatusBanner />
      {classes.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
          <FolderOpen size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('browse.emptyTitle')}</Text>
          <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>{t('browse.emptyDescription')}</Text>
        </View>
      ) : (
        <FlatList
          data={classes}
          keyExtractor={(item) => item.name}
          renderItem={({ item, index }) => (
            <TherapeuticClassCard
              name={item.name}
              count={item.count}
              onPress={() => void handleClassPress(item.name)}
              index={index}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={classesRefreshing} onRefresh={onRefreshClasses} tintColor={colors.primary500} />
          }
        />
      )}
      <CoachMark
        markKey="browse-class"
        hint={t('coach.browseClass')}
        visible={visitCount.current >= 2 && classes.length > 0}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[8],
    gap: Spacing[3],
  },
  emptyTitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.sansSemibold,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sans,
    textAlign: 'center',
  },
  classHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { paddingVertical: 4 },
  backText: { fontSize: 15 },
  classTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
})
