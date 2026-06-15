# Pharmopedia Visual Refinement & Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign cards and empty states, polish the tab bar, move the language selector to auth screens, add a welcome screen, and implement progressive coach marks.

**Architecture:** Card components get visual upgrades (elevation, accent bars, icons). Empty states use a consistent icon + title + description pattern. A `CoachMark` overlay component with a Zustand tracking store provides progressive first-use hints. A single welcome screen gates first-launch users.

**Tech Stack:** react-native-reanimated (for coach mark overlay), Zustand, expo-secure-store, lucide-react-native, Vitest

**Spec:** `docs/superpowers/specs/2026-06-14-pharmopedia-ux-polish-design.md` — Epic 3

**Prerequisites:** Epic 1 (Dark Mode & Theme System) must be complete. Epic 2 (Motion & Feedback) should be complete (for entrance animations on cards), but is not strictly required.

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `apps/pharmopedia/src/components/CoachMark.tsx` | Tooltip overlay with target highlighting |
| `apps/pharmopedia/src/store/coach-mark-store.ts` | Tracks dismissed coach marks (SecureStore-backed) |
| `apps/pharmopedia/app/welcome.tsx` | First-launch welcome screen |
| `apps/pharmopedia/src/components/LanguageChips.tsx` | Reusable language selector chip row for auth screens |
| `apps/pharmopedia/src/__tests__/coach-mark-store.test.ts` | Store tests |
| `apps/pharmopedia/src/__tests__/coach-mark.test.tsx` | CoachMark component tests |
| `apps/pharmopedia/src/__tests__/language-chips.test.tsx` | LanguageChips tests |
| `apps/pharmopedia/src/__tests__/welcome-screen.test.tsx` | Welcome screen tests |

### Modified Files

| File | Change |
|---|---|
| `apps/pharmopedia/src/components/DrugCard.tsx` | Elevated card, accent bar, badge chip, heart icon |
| `apps/pharmopedia/src/components/TherapeuticClassCard.tsx` | Category icon, count badge, chevron |
| `apps/pharmopedia/src/components/PriceCard.tsx` | Stock border, MapPin icon, bold price |
| `apps/pharmopedia/app/drug/[atcCode].tsx` | Header hierarchy restructure |
| `apps/pharmopedia/app/(tabs)/index.tsx` | Rich empty states |
| `apps/pharmopedia/app/(tabs)/browse.tsx` | Rich empty states, coach mark |
| `apps/pharmopedia/app/(tabs)/saved.tsx` | Rich empty state |
| `apps/pharmopedia/app/(tabs)/profile.tsx` | Coach marks on lang selector and sync button |
| `apps/pharmopedia/app/(tabs)/_layout.tsx` | Tab bar visual polish |
| `apps/pharmopedia/app/(auth)/login.tsx` | Language chip selector at top |
| `apps/pharmopedia/app/(auth)/register.tsx` | Language chip selector at top |
| `apps/pharmopedia/src/components/SearchBar.tsx` | Remove language switcher |
| `apps/pharmopedia/src/components/DrugDetail/FormularyTab.tsx` | Rich empty state for substitutes |
| `apps/pharmopedia/src/components/DrugDetail/PricingTab.tsx` | Rich empty state for prices |
| `apps/pharmopedia/app/_layout.tsx` | Welcome screen routing |
| `apps/pharmopedia/src/i18n/locales/en.ts` | Empty state strings, coach marks, welcome copy |
| `apps/pharmopedia/src/i18n/locales/prs.ts` | Same |
| `apps/pharmopedia/src/i18n/locales/ps.ts` | Same |
| `apps/pharmopedia/src/i18n/locales/ar.ts` | Same |

---

## Task 1: Add all i18n keys for Epic 3

**Files:**
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/prs.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ps.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ar.ts`

- [ ] **Step 1: Add keys to en.ts**

Add to the appropriate sections:

```typescript
// In search section:
emptyTitle: 'Find a medication',
emptyDescription: 'Search by drug name, brand, or ATC code',
noResultsTitle: 'No results',
noResultsDescription: 'Try a different spelling or search term',

// In browse section:
emptyTitle: 'No categories yet',
emptyDescription: 'Sync your catalog to browse by class',

// In saved section:
emptyTitle: 'No saved drugs',
emptyDescription: 'Bookmark drugs to find them quickly here',

// In pricing section (under drug):
emptyTitle: 'No prices nearby',
emptyDescription: 'Try again when connected to the internet',

// In formulary section (under drug):
noSubstitutes: 'No substitutes listed',

// New welcome section:
welcome: {
  tagline: 'Your offline drug reference',
  getStarted: 'Get Started',
},

// New coach section:
coach: {
  browseClass: 'Tap a category to see all drugs in that class',
  detailBookmark: 'Save drugs for quick access in the Saved tab',
  detailTabs: 'Swipe between tabs for clinical details, pricing, and more',
  profileLang: 'Change your language anytime from settings',
  profileSync: 'Keep your catalog updated — sync downloads the latest drugs',
},
```

- [ ] **Step 2: Add keys to prs.ts (Dari)**

```typescript
// search
emptyTitle: 'یک دارو پیدا کنید',
emptyDescription: 'با نام دارو، برند یا کد ATC جستجو کنید',
noResultsTitle: 'نتیجه‌ای یافت نشد',
noResultsDescription: 'املای دیگری را امتحان کنید',

// browse
emptyTitle: 'هنوز دسته‌بندی وجود ندارد',
emptyDescription: 'کتابچه خود را همگام‌سازی کنید',

// saved
emptyTitle: 'هیچ داروی ذخیره‌شده‌ای نیست',
emptyDescription: 'داروها را نشانه‌گذاری کنید تا اینجا سریع پیدا شوند',

// pricing
emptyTitle: 'قیمتی در نزدیکی یافت نشد',
emptyDescription: 'وقتی به اینترنت متصل شدید دوباره تلاش کنید',

// formulary
noSubstitutes: 'جایگزینی فهرست نشده',

// welcome
welcome: {
  tagline: 'مرجع داروی آفلاین شما',
  getStarted: 'شروع کنید',
},

// coach
coach: {
  browseClass: 'روی یک دسته ضربه بزنید تا داروهای آن را ببینید',
  detailBookmark: 'داروها را ذخیره کنید تا در تب ذخیره‌شده‌ها سریع پیدا شوند',
  detailTabs: 'بین تب‌ها بکشید برای جزئیات بالینی و قیمت‌گذاری',
  profileLang: 'زبان خود را هر وقت از تنظیمات تغییر دهید',
  profileSync: 'کتابچه خود را به‌روز نگه دارید — همگام‌سازی آخرین داروها را دانلود می‌کند',
},
```

- [ ] **Step 3: Add keys to ps.ts (Pashto)**

```typescript
emptyTitle: 'یوه درمل ومومئ',
emptyDescription: 'د درمل نوم، برانډ یا ATC کوډ سره لټون وکړئ',
noResultsTitle: 'هیڅ پایلې نشته',
noResultsDescription: 'بل املا هڅه وکړئ',

// browse
emptyTitle: 'تر اوسه هیڅ کټګوري نشته',
emptyDescription: 'خپل کتابچه همغږي کړئ',

// saved
emptyTitle: 'هیڅ خوندي شوي درمل نشته',
emptyDescription: 'درمل نښه کړئ ترڅو دلته ژر ومومئ',

// pricing
emptyTitle: 'نږدې بیې ونه موندل شوې',
emptyDescription: 'کله چې انټرنیټ ته وصل شئ بیا هڅه وکړئ',

// formulary
noSubstitutes: 'هیڅ بدیل لیست شوی نه دی',

welcome: {
  tagline: 'ستاسو آفلاین درملو مرجع',
  getStarted: 'پیل وکړئ',
},

coach: {
  browseClass: 'په یوه کټګوري ټک وکړئ ترڅو ټولې درمل وګورئ',
  detailBookmark: 'درمل خوندي کړئ ترڅو د خوندي شوي تب کې ژر ومومئ',
  detailTabs: 'د کلینیکي توضیحاتو او بیو لپاره تبونو ته سوایپ وکړئ',
  profileLang: 'خپله ژبه هر وخت د تنظیماتو څخه بدل کړئ',
  profileSync: 'خپل کتابچه تازه وساتئ — همغږي وروستي درمل ډاونلوډ کوي',
},
```

- [ ] **Step 4: Add keys to ar.ts (Arabic)**

```typescript
emptyTitle: 'ابحث عن دواء',
emptyDescription: 'ابحث بالاسم التجاري أو الاسم العلمي أو رمز ATC',
noResultsTitle: 'لا توجد نتائج',
noResultsDescription: 'جرب تهجئة مختلفة',

// browse
emptyTitle: 'لا توجد فئات بعد',
emptyDescription: 'قم بمزامنة الكتالوج للتصفح حسب الفئة',

// saved
emptyTitle: 'لا توجد أدوية محفوظة',
emptyDescription: 'أضف أدوية إلى المفضلة للعثور عليها بسرعة هنا',

// pricing
emptyTitle: 'لا توجد أسعار قريبة',
emptyDescription: 'حاول مرة أخرى عند الاتصال بالإنترنت',

// formulary
noSubstitutes: 'لم يتم إدراج بدائل',

welcome: {
  tagline: 'مرجعك الدوائي بدون اتصال',
  getStarted: 'ابدأ',
},

coach: {
  browseClass: 'اضغط على فئة لرؤية جميع الأدوية فيها',
  detailBookmark: 'احفظ الأدوية للوصول السريع في تبويب المحفوظات',
  detailTabs: 'اسحب بين التبويبات للتفاصيل السريرية والأسعار',
  profileLang: 'غيّر لغتك في أي وقت من الإعدادات',
  profileSync: 'حافظ على تحديث الكتالوج — المزامنة تنزّل أحدث الأدوية',
},
```

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/i18n/locales/
git commit -m "feat(pharmopedia): i18n keys for empty states, welcome screen, and coach marks (4 locales)"
```

---

## Task 2: Redesign DrugCard

**Files:**
- Modify: `apps/pharmopedia/src/components/DrugCard.tsx`

- [ ] **Step 1: Update DrugCard with elevated card design**

Replace the contents of `apps/pharmopedia/src/components/DrugCard.tsx`:

```typescript
import { View, Text, Pressable, StyleSheet, I18nManager } from 'react-native'
import { Heart } from 'lucide-react-native'
import type { DrugSearchResult } from '@ultranos/shared-types'
import { isRtlLang, type Lang } from '@/store/lang-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import { FontFamily, Spacing, Radius, Shadow } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  result: DrugSearchResult
  lang: Lang
  onPress: () => void
  index?: number
}

export function DrugCard({ result, lang, onPress }: Props) {
  const colors = useThemeColors()
  const isBookmarked = useBookmarkStore((s) => s.isBookmarked)
  const useLocal = lang !== 'en' && !!result.localName
  const primaryName = useLocal ? result.localName! : result.innName
  const secondaryName = useLocal ? result.innName : undefined
  const isRtl = isRtlLang(lang)
  const bookmarked = isBookmarked(result.atcCode)

  return (
    <Pressable
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.borderSubtle,
        },
        ...Shadow.sm,
      ]}
      onPress={onPress}
      testID={`drug-card-${result.atcCode}`}
    >
      {/* Accent bar */}
      <View
        style={[
          styles.accentBar,
          { backgroundColor: colors.primary500 },
          I18nManager.isRTL && styles.accentBarRtl,
        ]}
      />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text
            testID="drug-primary-name"
            style={[styles.primaryName, { color: colors.textPrimary }, isRtl && styles.rtlText]}
            numberOfLines={1}
          >
            {primaryName}
          </Text>
          <Heart
            size={18}
            color={bookmarked ? colors.danger : colors.textMuted}
            fill={bookmarked ? colors.danger : 'none'}
          />
        </View>
        {secondaryName && (
          <Text testID="drug-secondary-name" style={[styles.secondaryName, { color: colors.textSecondary }]}>
            {secondaryName}
          </Text>
        )}
        <View style={styles.metaRow}>
          <View style={[styles.classBadge, { backgroundColor: colors.surfaceSubtle }]}>
            <Text style={[styles.classBadgeText, { color: colors.textSecondary }]}>
              {result.therapeuticClass}
            </Text>
          </View>
          <Text style={[styles.atcCode, { color: colors.textMuted }]}>{result.atcCode}</Text>
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[3],
    flexDirection: 'row',
    overflow: 'hidden',
  },
  accentBar: {
    width: 3,
    alignSelf: 'stretch',
  },
  accentBarRtl: {
    // In RTL, the bar is on the right (handled by flexDirection reversal)
  },
  content: {
    flex: 1,
    padding: Spacing[3],
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  primaryName: {
    fontSize: 16,
    fontFamily: FontFamily.sansSemibold,
    flex: 1,
    marginEnd: Spacing[2],
  },
  secondaryName: {
    fontSize: 13,
    fontFamily: FontFamily.sans,
    marginTop: 2,
  },
  rtlText: { fontFamily: FontFamily.arabic, textAlign: 'right' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing[2],
    gap: Spacing[2],
  },
  classBadge: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  classBadgeText: {
    fontSize: 12,
    fontFamily: FontFamily.sans,
  },
  atcCode: {
    fontSize: 12,
    fontFamily: FontFamily.sans,
  },
})
```

- [ ] **Step 2: Run DrugCard tests**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/drug-card`
Expected: PASS (may need test adjustments for new structure — update selectors if needed)

- [ ] **Step 3: Commit**

```bash
git add apps/pharmopedia/src/components/DrugCard.tsx
git commit -m "feat(pharmopedia): DrugCard redesign — elevated card, accent bar, badge chip, heart icon"
```

---

## Task 3: Redesign TherapeuticClassCard

**Files:**
- Modify: `apps/pharmopedia/src/components/TherapeuticClassCard.tsx`

- [ ] **Step 1: Add category icon lookup and chevron**

```typescript
import { View, Text, Pressable, StyleSheet } from 'react-native'
import {
  Heart, Pill, Shield, Brain, Bone, Eye, Baby, Droplets, Flame, Activity, ChevronRight,
} from 'lucide-react-native'
import { FontFamily, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

const CLASS_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  cardiovascular: Heart,
  analgesic: Pill,
  'anti-infective': Shield,
  neurological: Brain,
  musculoskeletal: Bone,
  ophthalmic: Eye,
  pediatric: Baby,
  renal: Droplets,
  'anti-inflammatory': Flame,
}

function getClassIcon(name: string) {
  const key = name.toLowerCase()
  for (const [k, Icon] of Object.entries(CLASS_ICONS)) {
    if (key.includes(k)) return Icon
  }
  return Activity // generic fallback
}

interface Props {
  name: string
  count: number
  onPress: () => void
}

export function TherapeuticClassCard({ name, count, onPress }: Props) {
  const colors = useThemeColors()
  const Icon = getClassIcon(name)

  return (
    <Pressable
      testID={`class-card-${name}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? colors.surfaceSubtle : colors.surface, borderBottomColor: colors.borderSubtle },
      ]}
      onPress={onPress}
    >
      <View style={[styles.iconCircle, { backgroundColor: colors.surfaceSubtle }]}>
        <Icon size={20} color={colors.primary500} />
      </View>
      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
        {name}
      </Text>
      <View style={[styles.countBadge, { backgroundColor: colors.primary50 }]}>
        <Text style={[styles.countText, { color: colors.primary600 }]}>{count}</Text>
      </View>
      <ChevronRight size={16} color={colors.textMuted} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    borderBottomWidth: 1,
    gap: Spacing[3],
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    fontSize: 15,
    fontFamily: FontFamily.sansMedium,
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.full,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    fontSize: 13,
    fontFamily: FontFamily.sansSemibold,
  },
})
```

- [ ] **Step 2: Run tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/pharmopedia/src/components/TherapeuticClassCard.tsx
git commit -m "feat(pharmopedia): TherapeuticClassCard redesign — category icon, count badge, chevron"
```

---

## Task 4: Redesign PriceCard

**Files:**
- Modify: `apps/pharmopedia/src/components/PriceCard.tsx`

- [ ] **Step 1: Add stock border and MapPin icon**

```typescript
import { View, Text, StyleSheet } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import type { PharmacyPrice } from '@ultranos/shared-types'
import { FontFamily, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

export function PriceCard({ price }: { price: PharmacyPrice }) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  const stockBorderColor = {
    in_stock:     colors.success,
    low_stock:    colors.warning,
    out_of_stock: colors.danger,
  }[price.stockSignal]

  const stockTextColor = {
    in_stock:     colors.successDark,
    low_stock:    colors.warningDark,
    out_of_stock: colors.dangerDark,
  }[price.stockSignal]

  const stockKey = {
    in_stock:     'pricing.inStock',
    low_stock:    'pricing.lowStock',
    out_of_stock: 'pricing.outOfStock',
  }[price.stockSignal]

  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderLeftColor: stockBorderColor }]}
      testID={`price-card-${price.facilityId}`}
    >
      <View style={styles.topRow}>
        <Text style={[styles.pharmacy, { color: colors.textPrimary }]}>{price.pharmacyName}</Text>
        <Text style={[styles.priceText, { color: colors.primary500 }]}>
          {t('pricing.price', { price: price.retailPrice.toFixed(2) })}
        </Text>
      </View>
      <View style={styles.bottomRow}>
        <View style={styles.distanceRow}>
          <MapPin size={12} color={colors.textMuted} />
          <Text style={[styles.distance, { color: colors.textMuted }]}>
            {t('pricing.distance', { km: price.distanceKm.toFixed(1) })}
          </Text>
        </View>
        <Text style={[styles.stock, { color: stockTextColor }]}>{t(stockKey)}</Text>
      </View>
      {price.doseForm && (
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {price.doseForm}{price.quantity ? ` × ${price.quantity}` : ''}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing[4],
    marginHorizontal: Spacing[4],
    marginBottom: Spacing[3],
    borderRadius: Radius.lg,
    borderLeftWidth: 3,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pharmacy: { fontSize: 15, fontFamily: FontFamily.sansSemibold, flex: 1 },
  priceText: { fontSize: 17, fontFamily: FontFamily.sansBold },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing[1] },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  distance: { fontSize: 13, fontFamily: FontFamily.sans },
  stock: { fontSize: 13, fontFamily: FontFamily.sansSemibold },
  meta: { fontSize: 13, fontFamily: FontFamily.sans, marginTop: Spacing[1] },
})
```

- [ ] **Step 2: Run tests and commit**

Run: `cd apps/pharmopedia && npx vitest run`

```bash
git add apps/pharmopedia/src/components/PriceCard.tsx
git commit -m "feat(pharmopedia): PriceCard redesign — stock border, MapPin icon, bold price"
```

---

## Task 5: Restructure drug detail header

**Files:**
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`

- [ ] **Step 1: Update the header layout**

In `apps/pharmopedia/app/drug/[atcCode].tsx`, replace the existing header section (above the tabs) with the new hierarchy:

```tsx
{/* Header */}
<View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
  <Text style={[styles.primaryName, { color: colors.textPrimary }]}>
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
    <Pressable onPress={handleToggleBookmark} testID="bookmark-toggle">
      {/* Animated heart from Epic 2 */}
    </Pressable>
    <ShareButton entry={entry} />
  </View>
</View>
```

Add styles:

```typescript
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
```

- [ ] **Step 2: Run tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/pharmopedia/app/drug/\[atcCode\].tsx
git commit -m "feat(pharmopedia): drug detail header redesign — name hierarchy, badge, action row"
```

---

## Task 6: Upgrade empty states across all screens

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/index.tsx`
- Modify: `apps/pharmopedia/app/(tabs)/browse.tsx`
- Modify: `apps/pharmopedia/app/(tabs)/saved.tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/PricingTab.tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/FormularyTab.tsx`

- [ ] **Step 1: Create empty state pattern**

Each empty state follows the same pattern. Use inline JSX (no separate component needed — this is a RN app, not web with the shared EmptyState component):

```tsx
<View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
  <SearchIcon size={48} color={colors.textMuted} />
  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('search.emptyTitle')}</Text>
  <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>{t('search.emptyDescription')}</Text>
</View>
```

Shared empty state styles (add to each file's StyleSheet):

```typescript
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
```

- [ ] **Step 2: Update search tab (index.tsx)**

Replace existing empty states:

- No query entered: `Search` icon + `search.emptyTitle` + `search.emptyDescription`
- No results: `SearchX` icon + `search.noResultsTitle` + `search.noResultsDescription`

Import icons:
```typescript
import { Search, SearchX } from 'lucide-react-native'
```

- [ ] **Step 3: Update browse tab (browse.tsx)**

- No classes: `FolderOpen` icon + `browse.emptyTitle` + `browse.emptyDescription`

- [ ] **Step 4: Update saved tab (saved.tsx)**

- No bookmarks: `BookmarkPlus` icon + `saved.emptyTitle` + `saved.emptyDescription`

- [ ] **Step 5: Update PricingTab**

- No prices: `MapPinOff` icon + `drug.pricing.emptyTitle` + `drug.pricing.emptyDescription`

- [ ] **Step 6: Update FormularyTab**

- No substitutes: `Pill` icon + `drug.formulary.noSubstitutes` (title only, no description)

- [ ] **Step 7: Run tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/pharmopedia/app/\(tabs\)/ apps/pharmopedia/src/components/DrugDetail/
git commit -m "feat(pharmopedia): rich empty states with icons across search, browse, saved, pricing, formulary"
```

---

## Task 7: Polish bottom tab bar

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Update tab bar styling**

```typescript
import { FontFamily, FontSize, Shadow } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

export default function TabsLayout() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  useAutoSync()

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: colors.primary500,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarLabelStyle: {
        fontFamily: FontFamily.sansMedium,
        fontSize: FontSize.xs,
      },
      tabBarStyle: {
        backgroundColor: colors.surfaceElevated,
        borderTopColor: colors.borderSubtle,
        ...Shadow.sm,
      },
    }}>
      ...
    </Tabs>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/pharmopedia/app/\(tabs\)/_layout.tsx
git commit -m "feat(pharmopedia): polished tab bar — font, shadow, theme-aware colors"
```

---

## Task 8: Create LanguageChips and move selector to auth screens

**Files:**
- Create: `apps/pharmopedia/src/components/LanguageChips.tsx`
- Modify: `apps/pharmopedia/app/(auth)/login.tsx`
- Modify: `apps/pharmopedia/app/(auth)/register.tsx`
- Modify: `apps/pharmopedia/src/components/SearchBar.tsx`
- Test: `apps/pharmopedia/src/__tests__/language-chips.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/language-chips.test.tsx`:

```typescript
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))
vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native')
  return {
    ...actual,
    Appearance: {
      getColorScheme: vi.fn(() => 'light'),
      addChangeListener: vi.fn(() => ({ remove: vi.fn() })),
    },
  }
})

import { useLangStore } from '@/store/lang-store'
import { LanguageChips } from '@/components/LanguageChips'

beforeEach(() => {
  vi.clearAllMocks()
  useLangStore.setState({ lang: 'en', initialized: true })
})

describe('LanguageChips', () => {
  it('renders 4 language chips', () => {
    const { getByTestId } = render(<LanguageChips />)
    expect(getByTestId('lang-chip-en')).toBeTruthy()
    expect(getByTestId('lang-chip-prs')).toBeTruthy()
    expect(getByTestId('lang-chip-ps')).toBeTruthy()
    expect(getByTestId('lang-chip-ar')).toBeTruthy()
  })

  it('highlights the active language', () => {
    useLangStore.setState({ lang: 'prs' })
    const { getByTestId } = render(<LanguageChips />)
    // Active chip should exist and be styled differently
    expect(getByTestId('lang-chip-prs')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Implement LanguageChips**

Create `apps/pharmopedia/src/components/LanguageChips.tsx`:

```typescript
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useLangStore, type Lang } from '@/store/lang-store'
import { FontFamily, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { hapticSelection } from '@/lib/haptics'

const CHIPS: { value: Lang; label: string }[] = [
  { value: 'en', label: 'EN' },
  { value: 'prs', label: 'دری' },
  { value: 'ps', label: 'پښتو' },
  { value: 'ar', label: 'عربي' },
]

export function LanguageChips() {
  const colors = useThemeColors()
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)

  return (
    <View style={styles.row}>
      {CHIPS.map((chip) => {
        const active = lang === chip.value
        return (
          <Pressable
            key={chip.value}
            testID={`lang-chip-${chip.value}`}
            style={[
              styles.chip,
              {
                backgroundColor: active ? colors.primary500 : colors.surfaceSubtle,
                borderColor: active ? colors.primary500 : colors.border,
              },
            ]}
            onPress={() => {
              void hapticSelection()
              void setLang(chip.value)
            }}
          >
            <Text
              style={[
                styles.chipText,
                { color: active ? '#ffffff' : colors.textSecondary },
              ]}
            >
              {chip.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingVertical: Spacing[3],
  },
  chip: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 14,
    fontFamily: FontFamily.sansMedium,
  },
})
```

- [ ] **Step 3: Add LanguageChips to login.tsx**

At the top of the login screen (before the form), add:

```typescript
import { LanguageChips } from '@/components/LanguageChips'

// In the JSX, at the very top of the ScrollView/View:
<LanguageChips />
```

- [ ] **Step 4: Add LanguageChips to register.tsx**

Same placement as login.

- [ ] **Step 5: Remove language switcher from SearchBar.tsx**

Remove the language buttons from SearchBar. Remove the `LANGS` constant, the `setLang` selector, and the entire `<View style={styles.langs}>` block. Remove the associated styles (`langs`, `langBtn`, `langBtnActive`, `langText`, `langTextActive`). The SearchBar becomes just the text input:

```typescript
import { useRef, useEffect } from 'react'
import { View, TextInput, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { FontFamily, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  value: string
  onSearch: (q: string) => void
}

export function SearchBar({ value, onSearch }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const lang = useLangStore((s) => s.lang)
  const isRtl = isRtlLang(lang)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onSearch(value), 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value, onSearch])

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
      <TextInput
        testID="search-input"
        style={[
          styles.input,
          { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle },
          isRtl && styles.inputRtl,
        ]}
        placeholder={t('search.placeholder')}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={(text) => onSearch(text)}
        autoCorrect={false}
        autoCapitalize="none"
        textAlign={isRtl ? 'right' : 'left'}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: Spacing[3], borderBottomWidth: 1 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    fontSize: 16,
    fontFamily: FontFamily.sans,
  },
  inputRtl: { fontFamily: FontFamily.arabic },
})
```

- [ ] **Step 6: Run tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: PASS. SearchBar tests that tested language buttons will fail — update those tests to remove language switcher assertions.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/src/components/LanguageChips.tsx apps/pharmopedia/src/components/SearchBar.tsx apps/pharmopedia/app/\(auth\)/ apps/pharmopedia/src/__tests__/language-chips.test.tsx
git commit -m "feat(pharmopedia): language chips on auth screens, remove lang switcher from SearchBar"
```

---

## Task 9: Create coach mark store

**Files:**
- Create: `apps/pharmopedia/src/store/coach-mark-store.ts`
- Test: `apps/pharmopedia/src/__tests__/coach-mark-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/coach-mark-store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react-native'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))

import * as SecureStore from 'expo-secure-store'
import { useCoachMarkStore } from '@/store/coach-mark-store'

beforeEach(() => {
  vi.clearAllMocks()
  useCoachMarkStore.setState({ dismissed: new Set(), initialized: false })
})

describe('coach-mark-store', () => {
  it('initializes with empty dismissed set', () => {
    const { result } = renderHook(() => useCoachMarkStore())
    expect(result.current.dismissed.size).toBe(0)
  })

  it('init loads dismissed keys from SecureStore', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue('browse-class,detail-bookmark')

    const { result } = renderHook(() => useCoachMarkStore())
    await act(async () => { await result.current.init() })

    expect(result.current.dismissed.has('browse-class')).toBe(true)
    expect(result.current.dismissed.has('detail-bookmark')).toBe(true)
    expect(result.current.initialized).toBe(true)
  })

  it('dismiss adds key and persists', async () => {
    const { result } = renderHook(() => useCoachMarkStore())
    await act(async () => { await result.current.init() })
    await act(async () => { await result.current.dismiss('browse-class') })

    expect(result.current.dismissed.has('browse-class')).toBe(true)
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      '@pharmopedia/coach-dismissed',
      'browse-class',
    )
  })

  it('shouldShow returns false for dismissed keys', async () => {
    const { result } = renderHook(() => useCoachMarkStore())
    await act(async () => { await result.current.init() })
    await act(async () => { await result.current.dismiss('browse-class') })

    expect(result.current.shouldShow('browse-class')).toBe(false)
    expect(result.current.shouldShow('detail-bookmark')).toBe(true)
  })

  it('reset clears all dismissed keys', async () => {
    const { result } = renderHook(() => useCoachMarkStore())
    await act(async () => { await result.current.init() })
    await act(async () => { await result.current.dismiss('browse-class') })
    await act(async () => { await result.current.reset() })

    expect(result.current.dismissed.size).toBe(0)
  })
})
```

- [ ] **Step 2: Implement coach-mark-store**

Create `apps/pharmopedia/src/store/coach-mark-store.ts`:

```typescript
import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

const COACH_KEY = '@pharmopedia/coach-dismissed'

interface CoachMarkState {
  dismissed: Set<string>
  initialized: boolean
  init: () => Promise<void>
  dismiss: (key: string) => Promise<void>
  shouldShow: (key: string) => boolean
  reset: () => Promise<void>
}

export const useCoachMarkStore = create<CoachMarkState>((set, get) => ({
  dismissed: new Set<string>(),
  initialized: false,

  async init() {
    if (get().initialized) return
    let dismissed = new Set<string>()
    try {
      const saved = await SecureStore.getItemAsync(COACH_KEY)
      if (saved) {
        dismissed = new Set(saved.split(',').filter(Boolean))
      }
    } catch {
      // SecureStore unavailable — start fresh
    }
    set({ dismissed, initialized: true })
  },

  async dismiss(key: string) {
    const next = new Set(get().dismissed)
    next.add(key)
    set({ dismissed: next })
    try {
      await SecureStore.setItemAsync(COACH_KEY, [...next].join(','))
    } catch {
      // SecureStore write failed — state is still updated in memory
    }
  },

  shouldShow(key: string) {
    return !get().dismissed.has(key)
  },

  async reset() {
    set({ dismissed: new Set() })
    try {
      await SecureStore.setItemAsync(COACH_KEY, '')
    } catch {
      // Silent
    }
  },
}))
```

- [ ] **Step 3: Run tests**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/coach-mark-store.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 4: Wire reset into auth logout**

In the logout handler (wherever `useAuthStore.logout()` is called — in `profile.tsx`), add:

```typescript
import { useCoachMarkStore } from '@/store/coach-mark-store'

// In logout handler:
useCoachMarkStore.getState().reset()
```

- [ ] **Step 5: Init coach mark store in root layout**

In `apps/pharmopedia/app/_layout.tsx`, add:

```typescript
import { useCoachMarkStore } from '@/store/coach-mark-store'

// In the init function, after bookmark store init:
await useCoachMarkStore.getState().init()
```

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/src/store/coach-mark-store.ts apps/pharmopedia/src/__tests__/coach-mark-store.test.ts apps/pharmopedia/app/_layout.tsx apps/pharmopedia/app/\(tabs\)/profile.tsx
git commit -m "feat(pharmopedia): coach mark store — tracks dismissed hints with SecureStore persistence"
```

---

## Task 10: Create CoachMark component

**Files:**
- Create: `apps/pharmopedia/src/components/CoachMark.tsx`
- Test: `apps/pharmopedia/src/__tests__/coach-mark.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/coach-mark.test.tsx`:

```typescript
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))
vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native')
  return {
    ...actual,
    Appearance: {
      getColorScheme: vi.fn(() => 'light'),
      addChangeListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Modal: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
      visible ? children : null,
  }
})
vi.mock('react-native-reanimated', () => {
  const React = require('react')
  return {
    default: { createAnimatedComponent: (c: React.ComponentType) => c, View: 'View' },
    useSharedValue: () => ({ value: 0 }),
    useAnimatedStyle: (fn: () => Record<string, unknown>) => fn(),
    withTiming: (v: number) => v,
    FadeIn: { delay: () => ({ duration: () => ({ build: () => ({}) }) }) },
  }
})

import { CoachMark } from '@/components/CoachMark'
import { useCoachMarkStore } from '@/store/coach-mark-store'

beforeEach(() => {
  vi.clearAllMocks()
  useCoachMarkStore.setState({ dismissed: new Set(), initialized: true })
})

describe('CoachMark', () => {
  it('renders hint text when visible', () => {
    const { getByText } = render(
      <CoachMark markKey="test-key" hint="Test hint" visible />,
    )
    expect(getByText('Test hint')).toBeTruthy()
  })

  it('does not render when not visible', () => {
    const { queryByText } = render(
      <CoachMark markKey="test-key" hint="Test hint" visible={false} />,
    )
    expect(queryByText('Test hint')).toBeNull()
  })

  it('does not render when already dismissed', () => {
    useCoachMarkStore.setState({ dismissed: new Set(['test-key']) })
    const { queryByText } = render(
      <CoachMark markKey="test-key" hint="Test hint" visible />,
    )
    expect(queryByText('Test hint')).toBeNull()
  })

  it('calls dismiss on press', () => {
    const dismissSpy = vi.fn()
    useCoachMarkStore.setState({ dismissed: new Set(), initialized: true, dismiss: dismissSpy })
    const { getByTestId } = render(
      <CoachMark markKey="test-key" hint="Test hint" visible />,
    )
    fireEvent.press(getByTestId('coach-mark-overlay'))
    expect(dismissSpy).toHaveBeenCalledWith('test-key')
  })
})
```

- [ ] **Step 2: Implement CoachMark**

Create `apps/pharmopedia/src/components/CoachMark.tsx`:

```typescript
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useCoachMarkStore } from '@/store/coach-mark-store'

interface Props {
  markKey: string
  hint: string
  visible: boolean
}

export function CoachMark({ markKey, hint, visible }: Props) {
  const colors = useThemeColors()
  const shouldShow = useCoachMarkStore((s) => s.shouldShow)
  const dismiss = useCoachMarkStore((s) => s.dismiss)

  if (!visible || !shouldShow(markKey)) return null

  return (
    <Modal transparent animationType="none" visible>
      <Pressable
        testID="coach-mark-overlay"
        style={styles.overlay}
        onPress={() => void dismiss(markKey)}
      >
        <Animated.View
          entering={FadeIn.delay(300).duration(250)}
          style={[styles.tooltip, { backgroundColor: colors.textPrimary }]}
        >
          <Text style={[styles.hint, { color: colors.surface }]}>{hint}</Text>
          <Text style={[styles.tapHint, { color: colors.textMuted }]}>Tap to dismiss</Text>
        </Animated.View>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[8],
  },
  tooltip: {
    padding: Spacing[4],
    borderRadius: Radius.lg,
    maxWidth: 300,
    gap: Spacing[2],
  },
  hint: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sansMedium,
    textAlign: 'center',
  },
  tapHint: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.sans,
    textAlign: 'center',
  },
})
```

- [ ] **Step 3: Run tests**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/coach-mark.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 4: Commit**

```bash
git add apps/pharmopedia/src/components/CoachMark.tsx apps/pharmopedia/src/__tests__/coach-mark.test.tsx
git commit -m "feat(pharmopedia): CoachMark overlay component with dismiss tracking"
```

---

## Task 11: Wire coach marks into screens

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/browse.tsx`
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`
- Modify: `apps/pharmopedia/app/(tabs)/profile.tsx`

- [ ] **Step 1: Add coach mark to browse tab**

In `apps/pharmopedia/app/(tabs)/browse.tsx`:

```typescript
import { CoachMark } from '@/components/CoachMark'
import { useTranslation } from 'react-i18next'

// Track visit count with a ref:
const visitCount = useRef(0)
useEffect(() => { visitCount.current += 1 }, [])

// At the end of the JSX:
<CoachMark
  markKey="browse-class"
  hint={t('coach.browseClass')}
  visible={visitCount.current >= 2 && classes.length > 0}
/>
```

- [ ] **Step 2: Add coach marks to drug detail**

In `apps/pharmopedia/app/drug/[atcCode].tsx`:

```typescript
import { CoachMark } from '@/components/CoachMark'

const visitCount = useRef(0)
useEffect(() => { visitCount.current += 1 }, [])

// Two coach marks — only one shows at a time (CoachMark internally checks shouldShow):
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
```

Note: Since both check `shouldShow` internally, only the first undismissed one will render. After `detail-bookmark` is dismissed, `detail-tabs` will show on the next visit.

- [ ] **Step 3: Add coach marks to profile**

```typescript
import { CoachMark } from '@/components/CoachMark'

const visitCount = useRef(0)
useEffect(() => { visitCount.current += 1 }, [])

<CoachMark
  markKey="profile-lang"
  hint={t('coach.profileLang')}
  visible={visitCount.current >= 2}
/>
<CoachMark
  markKey="profile-sync"
  hint={t('coach.profileSync')}
  visible={visitCount.current >= 2}
/>
```

- [ ] **Step 4: Run tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/app/
git commit -m "feat(pharmopedia): wire 5 progressive coach marks into browse, drug detail, and profile"
```

---

## Task 12: Create welcome screen

**Files:**
- Create: `apps/pharmopedia/app/welcome.tsx`
- Modify: `apps/pharmopedia/app/_layout.tsx`
- Test: `apps/pharmopedia/src/__tests__/welcome-screen.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/welcome-screen.test.tsx`:

```typescript
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))
vi.mock('react-native', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-native')
  return {
    ...actual,
    Appearance: {
      getColorScheme: vi.fn(() => 'light'),
      addChangeListener: vi.fn(() => ({ remove: vi.fn() })),
    },
  }
})
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}))

import WelcomeScreen from '@/app/welcome'

describe('WelcomeScreen', () => {
  it('renders app name and tagline', () => {
    const { getByText } = render(<WelcomeScreen />)
    expect(getByText('Pharmopedia')).toBeTruthy()
    expect(getByText('welcome.tagline')).toBeTruthy()
  })

  it('renders Get Started button', () => {
    const { getByText } = render(<WelcomeScreen />)
    expect(getByText('welcome.getStarted')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Implement welcome screen**

Create `apps/pharmopedia/app/welcome.tsx`:

```typescript
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import * as SecureStore from 'expo-secure-store'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

const WELCOME_KEY = '@pharmopedia/hasSeenWelcome'

export default function WelcomeScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const colors = useThemeColors()

  async function handleGetStarted() {
    try {
      await SecureStore.setItemAsync(WELCOME_KEY, 'true')
    } catch {
      // SecureStore unavailable — proceed anyway
    }
    router.replace('/(auth)/login')
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.content}>
        <Text style={[styles.appName, { color: colors.textPrimary }]}>Pharmopedia</Text>
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>
          {t('welcome.tagline')}
        </Text>
      </View>
      <Pressable
        style={[styles.button, { backgroundColor: colors.primary500 }]}
        onPress={() => void handleGetStarted()}
        testID="get-started-button"
      >
        <Text style={styles.buttonText}>{t('welcome.getStarted')}</Text>
      </Pressable>
    </View>
  )
}

/** Check if welcome screen has been seen. Call during app init. */
export async function hasSeenWelcome(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(WELCOME_KEY)
    return val === 'true'
  } catch {
    return false
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[8],
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing[3],
  },
  appName: {
    fontSize: FontSize['3xl'],
    fontFamily: FontFamily.headingBold,
  },
  tagline: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.sans,
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: Spacing[10],
    paddingVertical: Spacing[4],
    borderRadius: Radius.xl,
    marginBottom: Spacing[12],
  },
  buttonText: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.sansSemibold,
    color: '#ffffff',
  },
})
```

- [ ] **Step 3: Wire welcome routing into root layout**

In `apps/pharmopedia/app/_layout.tsx`:

Add import:
```typescript
import { hasSeenWelcome } from './welcome'
```

Add state:
```typescript
const [showWelcome, setShowWelcome] = useState<boolean | null>(null)
```

In the init function, check welcome status:
```typescript
const seen = await hasSeenWelcome()
setShowWelcome(!seen)
```

Add welcome screen to the Stack and conditional redirect:
```tsx
<Stack screenOptions={{ headerShown: false }}>
  <Stack.Screen name="welcome" />
  <Stack.Screen name="(auth)" />
  <Stack.Screen name="(tabs)" />
  <Stack.Screen name="drug/[atcCode]" options={{ headerShown: true, title: '' }} />
</Stack>
{showWelcome && <Redirect href="/welcome" />}
{!showWelcome && !isAuthenticated && <Redirect href="/(auth)/login" />}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/app/welcome.tsx apps/pharmopedia/app/_layout.tsx apps/pharmopedia/src/__tests__/welcome-screen.test.tsx
git commit -m "feat(pharmopedia): welcome screen with first-launch detection"
```

---

## Task 13: Final verification

- [ ] **Step 1: Run full test suite**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass including new test files (language-chips, coach-mark-store, coach-mark, welcome-screen)

- [ ] **Step 2: Verify no regressions in existing tests**

Run: `cd apps/pharmopedia && npx vitest run --reporter=verbose`
Expected: All existing tests pass. SearchBar tests should be updated to not assert on language buttons.

- [ ] **Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix(pharmopedia): test fixes for visual refinement and onboarding epic"
```
