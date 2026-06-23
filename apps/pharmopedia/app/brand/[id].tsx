import { useState, useEffect } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Heart } from 'lucide-react-native'
import { getBrandDetail } from '@/db/brands'
import { getDrugRowByAtcCode, scopeEntryForRole } from '@/db/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { hapticSelection } from '@/lib/haptics'
import { useAuthStore } from '@/store/auth-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import { SafetyZone } from '@/components/DrugDetail/SafetyZone'
import { buildDrugSections } from '@/components/DrugDetail/drug-detail-sections'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { SkeletonCard } from '@/components/SkeletonCard'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { Card, Chip, CollapsibleSection } from '@ultranos/ui-kit/native'
import type { DrugBrandDetail, DrugBrandPresentation, DrugEntryTier1, DrugEntryTier2, DrugEntryTier3 } from '@ultranos/shared-types'

const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH', 'PHARMACIST', 'ADMIN'])
const PHARMACIST_ROLES = new Set(['PHARMACIST', 'ADMIN'])

function presentationLine(p: DrugBrandPresentation): string {
  const pack = p.packSize != null ? `${p.packSize}${p.packUnit ? ` ${p.packUnit}` : ''}` : p.volume
  return [p.strength, p.doseForm, pack].filter(Boolean).join(' · ')
}

export default function BrandDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { t } = useTranslation()
  const colors = useThemeColors()
  const lang = useLangStore((s) => s.lang)
  const isRtl = isRtlLang(lang)
  const role = useAuthStore((s) => s.user?.role) ?? 'PATIENT'
  const isClinical = CLINICAL_ROLES.has(role)
  const isPharmacist = PHARMACIST_ROLES.has(role)

  const [detail, setDetail] = useState<DrugBrandDetail | null>(null)
  const [generic, setGeneric] = useState<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3 | null>(null)
  const [loading, setLoading] = useState(true)
  const bookmarked = useBookmarkStore((s) => (detail ? s.isBrandBookmarked(detail.id) : false))
  const toggleBrand = useBookmarkStore((s) => s.toggleBrand)

  async function handleToggleBookmark(d: DrugBrandDetail) {
    void hapticSelection()
    const priced = d.presentations.map((p) => p.referencePrice).filter((n): n is number => n != null)
    await toggleBrand(getDatabase(), {
      id: d.id, brandName: d.brandName, genericAtcCode: d.genericAtcCode, genericInnName: d.genericInnName,
      manufacturer: d.manufacturer, doseForm: d.presentations[0]?.doseForm,
      referencePrice: priced.length ? Math.min(...priced) : undefined,
      currency: d.presentations.find((p) => p.currency)?.currency,
    })
  }

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const d = await getBrandDetail(getDatabase(), id)
        if (cancelled) return
        setDetail(d)
        if (d) {
          const row = await getDrugRowByAtcCode(getDatabase(), d.genericAtcCode)
          if (!cancelled && row) setGeneric(scopeEntryForRole(row, role))
        }
      } catch {
        if (!cancelled) setDetail(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id, role])

  const Back = isRtl ? ChevronRight : ChevronLeft

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surfaceSubtle }]}>
        <View style={{ width: '100%', padding: Spacing[4] }}>
          <SkeletonCard lines={1} /><SkeletonCard lines={3} />
        </View>
      </View>
    )
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <Text style={[styles.notFound, { color: colors.textSecondary }]}>{t('brandDetail.notFound')}</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Text style={[styles.link, { color: colors.primary500 }]}>{t('common.back')}</Text>
        </Pressable>
      </View>
    )
  }

  const align = { textAlign: isRtl ? ('right' as const) : ('left' as const) }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surfaceSubtle }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.header, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
          <Pressable testID="brand-back-btn" onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8}>
            <Back size={26} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.nameBlock}>
            <Text testID="brand-name" style={[styles.brandName, { color: colors.textPrimary }, align]} numberOfLines={2}>{detail.brandName}</Text>
            {detail.manufacturer ? (
              <Text style={[styles.mfr, { color: colors.textSecondary }, align]}>{detail.manufacturer}</Text>
            ) : null}
          </View>
          <Pressable
            testID="brand-bookmark-btn"
            onPress={() => void handleToggleBookmark(detail)}
            accessibilityRole="button"
            accessibilityLabel={bookmarked ? t('drug.removeBookmark') : t('drug.addBookmark')}
            accessibilityState={{ selected: bookmarked }}
            hitSlop={8}
          >
            <Heart size={24} color={bookmarked ? colors.primary500 : colors.textMuted} fill={bookmarked ? colors.primary500 : 'none'} />
          </Pressable>
        </View>

        <View style={styles.body}>
          {/* Presentations + price (commercial layer) */}
          <Text style={[styles.label, { color: colors.textMuted }, align]}>{t('brandDetail.presentations')}</Text>
          <Card>
            {detail.presentations.map((p, i) => (
              <View key={p.id} testID={`presentation-${p.id}`} style={[styles.presRow, { borderTopColor: colors.borderSubtle, borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth, flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
                <Text style={[styles.presText, { color: colors.textPrimary }, align]} numberOfLines={2}>{presentationLine(p)}</Text>
                {p.referencePrice != null ? (
                  <Text style={[styles.price, { backgroundColor: colors.primary50, color: colors.primary700 }]}>
                    {`${p.referencePrice}${p.currency ? ` ${p.currency}` : ''}`}
                  </Text>
                ) : null}
              </View>
            ))}
          </Card>

          {/* Link to the generic — single source of clinical truth */}
          <Pressable
            testID="brand-generic-link"
            onPress={() => router.push(`/drug/${detail.genericAtcCode}`)}
            accessibilityRole="button"
            accessibilityLabel={`${t('brandDetail.genericIngredient')}: ${detail.genericInnName}`}
            style={[styles.genericLink, { backgroundColor: colors.primary50, borderColor: colors.primary100, flexDirection: isRtl ? 'row-reverse' : 'row' }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.genericLabel, { color: colors.primary600 }, align]}>{t('brandDetail.genericIngredient')}</Text>
              <Text style={[styles.genericName, { color: colors.primary700 }, align]}>{detail.genericInnName}</Text>
            </View>
            <ChevronRight size={20} color={colors.primary600} style={isRtl ? styles.flip : undefined} />
          </Pressable>

          {/* Sibling brands (substitution loop) */}
          {detail.siblings.length > 0 ? (
            <>
              <Text style={[styles.label, { color: colors.textMuted }, align]}>{t('brandDetail.otherBrands')}</Text>
              <View style={[styles.siblings, isRtl && styles.siblingsRtl]}>
                {detail.siblings.map((s) => (
                  <Chip key={s.id} testID={`sibling-${s.id}`} label={s.brandName} onPress={() => router.push({ pathname: '/brand/[id]', params: { id: s.id } })} />
                ))}
              </View>
            </>
          ) : null}
        </View>

        {/* Clinical content — sourced from the generic (single source of truth):
            allergy/safety pinned first, then the generic's full section list.
            Rendered edge-to-edge (outside the padded body) so the collapsible
            headers are full-width with hairline separators, matching the generic
            drug-detail page. The generic link above already opens the full page,
            so there's no redundant bottom link. */}
        {generic ? (
          <>
            <Text style={[styles.clinicalFrom, { color: colors.textMuted }, align]}>
              {`${t('brandDetail.clinicalFrom')} ${detail.genericInnName}`}
            </Text>
            <SafetyZone entry={generic} lang={lang} isClinical={isClinical} />
            <View style={styles.sectionList}>
              {buildDrugSections({ entry: generic, lang, t, isClinical, isPharmacist }).map((s) => (
                <CollapsibleSection key={s.id} testID={`section-${s.id}`} title={s.title} defaultOpen={s.defaultOpen}>
                  <ErrorBoundary inline>{s.body}</ErrorBoundary>
                </CollapsibleSection>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingTop: Spacing[4], gap: Spacing[3], paddingBottom: Spacing[8] },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { alignItems: 'center', gap: Spacing[3], paddingHorizontal: Spacing[4] },
  nameBlock: { flex: 1 },
  brandName: { fontSize: FontSize.xl, fontFamily: FontFamily.headingBold, marginBottom: 2 },
  mfr: { fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  body: { paddingHorizontal: Spacing[4], gap: Spacing[2] },
  label: { fontSize: FontSize.xs, fontFamily: FontFamily.sansBold, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: Spacing[2] },
  presRow: { alignItems: 'center', justifyContent: 'space-between', gap: Spacing[2], paddingVertical: Spacing[3], paddingHorizontal: Spacing[4] },
  presText: { flex: 1, fontSize: FontSize.sm, fontFamily: FontFamily.sans },
  price: { fontSize: FontSize.sm, fontFamily: FontFamily.sansBold, borderRadius: Radius.md, paddingHorizontal: Spacing[2], paddingVertical: 2, overflow: 'hidden' },
  genericLink: { alignItems: 'center', gap: Spacing[2], borderWidth: 1, borderRadius: Radius.lg, padding: Spacing[4] },
  genericLabel: { fontSize: FontSize.xs, fontFamily: FontFamily.sansBold, letterSpacing: 0.4, textTransform: 'uppercase' },
  genericName: { fontSize: FontSize.base, fontFamily: FontFamily.sansSemibold, marginTop: 2 },
  flip: { transform: [{ scaleX: -1 }] },
  siblings: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  siblingsRtl: { flexDirection: 'row-reverse' },
  // Attribution label stays padded so it aligns with the section header text;
  // the section list itself runs edge-to-edge (gap:0) for full-width hairlines.
  clinicalFrom: { fontSize: FontSize.xs, fontFamily: FontFamily.sans, fontStyle: 'italic', paddingHorizontal: Spacing[4] },
  sectionList: { gap: 0 },
  notFound: { fontSize: FontSize.lg, marginBottom: Spacing[3] },
  link: { fontSize: FontSize.base },
})
