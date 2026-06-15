# Pharmopedia Motion & Feedback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add animations, haptic feedback, skeleton loaders, pull-to-refresh, an offline indicator, and error boundaries to make the app feel polished and responsive.

**Architecture:** `react-native-reanimated` (already installed) powers all animations. `expo-haptics` provides tactile feedback. A `SkeletonCard` component with shimmer animation replaces all `ActivityIndicator` loading states. `@react-native-community/netinfo` drives a `NetStatusBanner` for offline detection. React error boundaries wrap the tab navigator and each drug detail tab.

**Tech Stack:** react-native-reanimated, expo-haptics, @react-native-community/netinfo, Vitest

**Spec:** `docs/superpowers/specs/2026-06-14-pharmopedia-ux-polish-design.md` — Epic 2

**Prerequisite:** Epic 1 (Dark Mode & Theme System) must be complete — this epic uses `useThemeColors()` throughout.

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `apps/pharmopedia/src/lib/haptics.ts` | Thin wrapper around expo-haptics, no-ops on unsupported devices |
| `apps/pharmopedia/src/components/SkeletonCard.tsx` | Shimmer skeleton loader (theme-aware) |
| `apps/pharmopedia/src/components/NetStatusBanner.tsx` | Offline connectivity banner |
| `apps/pharmopedia/src/components/CrashFallback.tsx` | Error boundary fallback UI |
| `apps/pharmopedia/src/components/ErrorBoundary.tsx` | React class component error boundary |
| `apps/pharmopedia/src/__tests__/haptics.test.ts` | Haptics wrapper tests |
| `apps/pharmopedia/src/__tests__/skeleton-card.test.tsx` | Skeleton component tests |
| `apps/pharmopedia/src/__tests__/net-status-banner.test.tsx` | Offline banner tests |
| `apps/pharmopedia/src/__tests__/error-boundary.test.tsx` | Error boundary tests |

### Modified Files

| File | Change |
|---|---|
| `apps/pharmopedia/app/_layout.tsx` | Wrap tab navigator in ErrorBoundary |
| `apps/pharmopedia/app/(tabs)/_layout.tsx` | Tab switch transition config |
| `apps/pharmopedia/app/(tabs)/index.tsx` | Skeleton loaders, pull-to-refresh |
| `apps/pharmopedia/app/(tabs)/browse.tsx` | Skeleton loaders, pull-to-refresh |
| `apps/pharmopedia/app/(tabs)/saved.tsx` | Pull-to-refresh |
| `apps/pharmopedia/app/drug/[atcCode].tsx` | Animated tab indicator, skeleton, error boundaries per tab |
| `apps/pharmopedia/src/components/DrugCard.tsx` | Staggered entrance animation |
| `apps/pharmopedia/src/components/TherapeuticClassCard.tsx` | Staggered entrance animation |
| `apps/pharmopedia/src/components/PriceCard.tsx` | Staggered entrance animation |
| `apps/pharmopedia/src/components/SyncStatusBanner.tsx` | Animated sync counter |
| `apps/pharmopedia/src/components/DrugDetail/PricingTab.tsx` | Skeleton loaders, pull-to-refresh |
| `apps/pharmopedia/src/i18n/locales/en.ts` | Add `net.offline` key |
| `apps/pharmopedia/src/i18n/locales/prs.ts` | Add `net.offline` key |
| `apps/pharmopedia/src/i18n/locales/ps.ts` | Add `net.offline` key |
| `apps/pharmopedia/src/i18n/locales/ar.ts` | Add `net.offline` key |

---

## Task 1: Install new dependencies

**Files:** `apps/pharmopedia/package.json`

- [ ] **Step 1: Install expo-haptics**

Run: `cd apps/pharmopedia && npx expo install expo-haptics`

- [ ] **Step 2: Install @react-native-community/netinfo**

Run: `cd apps/pharmopedia && npx expo install @react-native-community/netinfo`

- [ ] **Step 3: Commit**

```bash
git add apps/pharmopedia/package.json pnpm-lock.yaml
git commit -m "chore(pharmopedia): add expo-haptics and @react-native-community/netinfo"
```

---

## Task 2: Configure screen transitions

**Files:**
- Modify: `apps/pharmopedia/app/_layout.tsx`
- Modify: `apps/pharmopedia/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Add drug detail slide-up transition**

In `apps/pharmopedia/app/_layout.tsx`, update the drug detail Stack.Screen options:

```typescript
<Stack.Screen
  name="drug/[atcCode]"
  options={{
    headerShown: true,
    title: '',
    animation: 'slide_from_bottom',
    animationDuration: 300,
  }}
/>
```

- [ ] **Step 2: Add auth-to-tabs fade transition**

Update the auth and tabs Stack.Screen options:

```typescript
<Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
<Stack.Screen name="(tabs)" options={{ animation: 'fade', animationDuration: 250 }} />
```

- [ ] **Step 3: Run existing tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/pharmopedia/app/_layout.tsx apps/pharmopedia/app/\(tabs\)/_layout.tsx
git commit -m "feat(pharmopedia): screen transitions — slide-up detail, fade auth/tabs"
```

---

## Task 3: Create haptics wrapper

**Files:**
- Create: `apps/pharmopedia/src/lib/haptics.ts`
- Test: `apps/pharmopedia/src/__tests__/haptics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/haptics.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockImpact = vi.fn()
const mockNotification = vi.fn()
const mockSelection = vi.fn()

vi.mock('expo-haptics', () => ({
  impactAsync: mockImpact,
  notificationAsync: mockNotification,
  selectionAsync: mockSelection,
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success', Error: 'Error', Warning: 'Warning' },
}))

import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/haptics'

beforeEach(() => vi.clearAllMocks())

describe('haptics', () => {
  it('hapticImpact calls impactAsync with the given style', async () => {
    await hapticImpact('Light')
    expect(mockImpact).toHaveBeenCalledWith('Light')
  })

  it('hapticNotification calls notificationAsync', async () => {
    await hapticNotification('Success')
    expect(mockNotification).toHaveBeenCalledWith('Success')
  })

  it('hapticSelection calls selectionAsync', async () => {
    await hapticSelection()
    expect(mockSelection).toHaveBeenCalledTimes(1)
  })

  it('swallows errors silently', async () => {
    mockImpact.mockRejectedValueOnce(new Error('Haptics unavailable'))
    // Should not throw
    await hapticImpact('Light')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/haptics.test.ts`
Expected: FAIL — module `@/lib/haptics` not found

- [ ] **Step 3: Implement haptics wrapper**

Create `apps/pharmopedia/src/lib/haptics.ts`:

```typescript
import * as Haptics from 'expo-haptics'

export async function hapticImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
): Promise<void> {
  try {
    await Haptics.impactAsync(style)
  } catch {
    // Haptics unavailable (emulator, unsupported device) — silent no-op
  }
}

export async function hapticNotification(
  type: Haptics.NotificationFeedbackType,
): Promise<void> {
  try {
    await Haptics.notificationAsync(type)
  } catch {
    // Silent no-op
  }
}

export async function hapticSelection(): Promise<void> {
  try {
    await Haptics.selectionAsync()
  } catch {
    // Silent no-op
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/haptics.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/lib/haptics.ts apps/pharmopedia/src/__tests__/haptics.test.ts
git commit -m "feat(pharmopedia): haptics wrapper with silent no-op on unsupported devices"
```

---

## Task 4: Create SkeletonCard component

**Files:**
- Create: `apps/pharmopedia/src/components/SkeletonCard.tsx`
- Test: `apps/pharmopedia/src/__tests__/skeleton-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/skeleton-card.test.tsx`:

```typescript
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'

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
vi.mock('react-native-reanimated', () => {
  const React = require('react')
  return {
    default: { createAnimatedComponent: (c: React.ComponentType) => c },
    useSharedValue: () => ({ value: 0 }),
    useAnimatedStyle: (fn: () => Record<string, unknown>) => fn(),
    withRepeat: (v: number) => v,
    withTiming: (v: number) => v,
    Easing: { inOut: (e: unknown) => e, ease: 0 },
  }
})

import { SkeletonCard } from '@/components/SkeletonCard'

describe('SkeletonCard', () => {
  it('renders with default variant (drug)', () => {
    const { getByTestId } = render(<SkeletonCard testID="skel-1" />)
    expect(getByTestId('skel-1')).toBeTruthy()
  })

  it('renders multiple skeleton lines', () => {
    const { getByTestId } = render(<SkeletonCard testID="skel-1" lines={3} />)
    expect(getByTestId('skel-1')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/skeleton-card.test.tsx`
Expected: FAIL — module `@/components/SkeletonCard` not found

- [ ] **Step 3: Implement SkeletonCard**

Create `apps/pharmopedia/src/components/SkeletonCard.tsx`:

```typescript
import { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  testID?: string
  lines?: number
}

export function SkeletonCard({ testID, lines = 2 }: Props) {
  const colors = useThemeColors()
  const shimmer = useSharedValue(0)

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    )
  }, [shimmer])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + shimmer.value * 0.6,
  }))

  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle }]}
    >
      <Animated.View
        style={[styles.titleLine, { backgroundColor: colors.surfaceSubtle }, animatedStyle]}
      />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bodyLine,
            { backgroundColor: colors.surfaceSubtle, width: i === lines - 2 ? '60%' : '85%' },
            animatedStyle,
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing[4],
    borderBottomWidth: 1,
  },
  titleLine: {
    height: 16,
    borderRadius: Radius.sm,
    width: '70%',
    marginBottom: Spacing[2],
  },
  bodyLine: {
    height: 12,
    borderRadius: Radius.sm,
    marginTop: Spacing[1],
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/skeleton-card.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/components/SkeletonCard.tsx apps/pharmopedia/src/__tests__/skeleton-card.test.tsx
git commit -m "feat(pharmopedia): SkeletonCard component with shimmer animation"
```

---

## Task 5: Add skeleton loaders to search tab

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/index.tsx`

- [ ] **Step 1: Add SkeletonCard import**

```typescript
import { SkeletonCard } from '@/components/SkeletonCard'
```

- [ ] **Step 2: Add loading state**

Add a `loading` state alongside existing `results` state:

```typescript
const [loading, setLoading] = useState(false)
```

Wrap the search logic to set `loading` true before searching and false after:

```typescript
// In the search handler:
setLoading(true)
try {
  // ... existing search logic ...
} finally {
  setLoading(false)
}
```

- [ ] **Step 3: Replace ActivityIndicator with skeletons**

Replace any existing `ActivityIndicator` or empty loading state with:

```tsx
{loading && results.length === 0 && (
  <View>
    {[0, 1, 2, 3].map((i) => (
      <SkeletonCard key={i} testID={`skeleton-${i}`} />
    ))}
  </View>
)}
```

- [ ] **Step 4: Add pull-to-refresh**

Add `RefreshControl` to the FlatList:

```typescript
import { RefreshControl } from 'react-native'
```

Add refreshing state:

```typescript
const [refreshing, setRefreshing] = useState(false)
```

Add refresh handler:

```typescript
async function onRefresh() {
  setRefreshing(true)
  // Re-run current search
  try {
    // ... same search logic as the main handler ...
  } finally {
    setRefreshing(false)
  }
}
```

Add to FlatList:

```tsx
<FlatList
  ...
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.primary500}
    />
  }
/>
```

- [ ] **Step 5: Run existing search tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/app/\(tabs\)/index.tsx
git commit -m "feat(pharmopedia): skeleton loaders + pull-to-refresh on search tab"
```

---

## Task 6: Add skeleton loaders and pull-to-refresh to browse and saved tabs

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/browse.tsx`
- Modify: `apps/pharmopedia/app/(tabs)/saved.tsx`

- [ ] **Step 1: Add skeletons to browse tab**

Import `SkeletonCard`. Add `loading` state for class list and drug list fetches. Show 3 skeleton cards while `loading && items.length === 0`.

- [ ] **Step 2: Add pull-to-refresh to browse tab**

Add `RefreshControl` to the `FlatList` (or `ScrollView` if that's what's used). Refresh re-fetches therapeutic classes from SQLite.

```tsx
<FlatList
  ...
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.primary500}
    />
  }
/>
```

- [ ] **Step 3: Add pull-to-refresh to saved tab**

Add `RefreshControl` to the saved tab's FlatList. Refresh re-reads bookmarks from the store.

- [ ] **Step 4: Run tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/app/\(tabs\)/browse.tsx apps/pharmopedia/app/\(tabs\)/saved.tsx
git commit -m "feat(pharmopedia): skeleton loaders + pull-to-refresh on browse and saved tabs"
```

---

## Task 7: Add staggered list item entrance animations

**Files:**
- Modify: `apps/pharmopedia/src/components/DrugCard.tsx`
- Modify: `apps/pharmopedia/src/components/TherapeuticClassCard.tsx`
- Modify: `apps/pharmopedia/src/components/PriceCard.tsx`

- [ ] **Step 1: Add entrance animation to DrugCard**

Import reanimated:

```typescript
import Animated, { FadeInUp } from 'react-native-reanimated'
```

Add `index` prop:

```typescript
interface Props {
  result: DrugSearchResult
  lang: Lang
  onPress: () => void
  index?: number
}
```

Wrap the outer `Pressable` in an `Animated.View` with entering animation:

```tsx
const enterDelay = Math.min((index ?? 0) * 50, 500)

return (
  <Animated.View entering={FadeInUp.delay(enterDelay).duration(300)}>
    <Pressable ...>
      ...
    </Pressable>
  </Animated.View>
)
```

- [ ] **Step 2: Add entrance animation to TherapeuticClassCard**

Same pattern: add `index` prop, wrap in `Animated.View` with `FadeInUp.delay(index * 50)`.

- [ ] **Step 3: Add entrance animation to PriceCard**

Same pattern.

- [ ] **Step 4: Pass index prop from parent FlatLists**

In `index.tsx`, `browse.tsx`, and `PricingTab.tsx`, update `renderItem` to pass `index`:

```tsx
renderItem={({ item, index }) => (
  <DrugCard result={item} lang={lang} onPress={...} index={index} />
)}
```

- [ ] **Step 5: Run all tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass (reanimated is mocked in tests)

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/src/components/DrugCard.tsx apps/pharmopedia/src/components/TherapeuticClassCard.tsx apps/pharmopedia/src/components/PriceCard.tsx apps/pharmopedia/app/
git commit -m "feat(pharmopedia): staggered fade-in-up entrance animations for list items"
```

---

## Task 8: Add animated tab indicator on drug detail screen

**Files:**
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`

- [ ] **Step 1: Import reanimated**

```typescript
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
```

- [ ] **Step 2: Add animated underline**

Track the active tab index and tab layout measurements:

```typescript
const [tabLayouts, setTabLayouts] = useState<{ x: number; width: number }[]>([])
const indicatorX = useSharedValue(0)
const indicatorW = useSharedValue(0)
```

On tab press, animate the indicator:

```typescript
function onTabPress(index: number) {
  setActiveTabIndex(index)
  if (tabLayouts[index]) {
    indicatorX.value = withTiming(tabLayouts[index].x, { duration: 250 })
    indicatorW.value = withTiming(tabLayouts[index].width, { duration: 250 })
  }
}
```

Measure each tab using `onLayout`:

```tsx
<Pressable
  onLayout={(e) => {
    const { x, width } = e.nativeEvent.layout
    setTabLayouts((prev) => {
      const next = [...prev]
      next[index] = { x, width }
      return next
    })
  }}
  ...
>
```

Render the animated underline:

```tsx
const indicatorStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: indicatorX.value }],
  width: indicatorW.value,
}))

<View style={styles.tabBar}>
  {tabs.map((tab, i) => (
    <Pressable key={tab.key} onPress={() => onTabPress(i)} onLayout={...}>
      <Text style={[
        styles.tabLabel,
        { color: activeTabIndex === i ? colors.primary500 : colors.textMuted }
      ]}>
        {tab.label}
      </Text>
    </Pressable>
  ))}
  <Animated.View style={[styles.tabIndicator, { backgroundColor: colors.primary500 }, indicatorStyle]} />
</View>
```

Add indicator style:

```typescript
tabIndicator: {
  position: 'absolute',
  bottom: 0,
  height: 2,
  borderRadius: 1,
},
```

- [ ] **Step 3: Add skeleton for drug detail loading**

Replace any `ActivityIndicator` while the drug entry loads with a skeleton layout:

```tsx
{loading && (
  <View style={{ padding: Spacing[4] }}>
    <SkeletonCard lines={1} />
    <SkeletonCard lines={3} />
    <SkeletonCard lines={2} />
  </View>
)}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/app/drug/\[atcCode\].tsx
git commit -m "feat(pharmopedia): animated tab indicator + skeleton loader on drug detail screen"
```

---

## Task 9: Add bookmark toggle animation and haptics

**Files:**
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`

- [ ] **Step 1: Add haptic import and bookmark animation**

```typescript
import { hapticImpact } from '@/lib/haptics'
import { ImpactFeedbackStyle } from 'expo-haptics'
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated'
```

Add a shared value for the heart scale:

```typescript
const heartScale = useSharedValue(1)
```

Animated style:

```typescript
const heartAnimatedStyle = useAnimatedStyle(() => ({
  transform: [{ scale: heartScale.value }],
}))
```

Update the bookmark toggle handler:

```typescript
async function handleToggleBookmark() {
  const wasBookmarked = isBookmarked(entry.atcCode)
  await toggleBookmark(getDatabase(), {
    atcCode: entry.atcCode,
    innName: entry.innName,
    therapeuticClass: entry.therapeuticClass,
  })
  if (!wasBookmarked) {
    // Animate only on "add" — asymmetric feedback
    heartScale.value = withSpring(1.3, { damping: 8 }, () => {
      heartScale.value = withSpring(1)
    })
    void hapticImpact(ImpactFeedbackStyle.Light)
  }
}
```

Wrap the heart icon in `Animated.View`:

```tsx
<Animated.View style={heartAnimatedStyle}>
  <Heart
    color={isBookmarked(entry.atcCode) ? colors.danger : colors.textMuted}
    fill={isBookmarked(entry.atcCode) ? colors.danger : 'none'}
    size={24}
  />
</Animated.View>
```

- [ ] **Step 2: Add haptics to share button**

In `ShareButton.tsx` or inline in the drug detail screen, add:

```typescript
import { hapticImpact } from '@/lib/haptics'
import { ImpactFeedbackStyle } from 'expo-haptics'

// In the share handler:
void hapticImpact(ImpactFeedbackStyle.Light)
```

- [ ] **Step 3: Run tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/pharmopedia/app/drug/\[atcCode\].tsx apps/pharmopedia/src/components/ShareButton.tsx
git commit -m "feat(pharmopedia): bookmark heart animation + haptic feedback on bookmark/share"
```

---

## Task 10: Add haptics to sync, auth, enrich, and settings

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/profile.tsx`
- Modify: `apps/pharmopedia/app/(auth)/login.tsx`
- Modify: `apps/pharmopedia/app/(auth)/register.tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx`

- [ ] **Step 1: Add sync haptics to profile.tsx**

After a successful sync completes:
```typescript
import { hapticNotification } from '@/lib/haptics'
import { NotificationFeedbackType } from 'expo-haptics'

// On sync success:
void hapticNotification(NotificationFeedbackType.Success)

// On sync error:
void hapticNotification(NotificationFeedbackType.Error)
```

On language/theme change:
```typescript
import { hapticSelection } from '@/lib/haptics'

// In setLang handler:
void hapticSelection()

// In setThemeMode handler:
void hapticSelection()
```

- [ ] **Step 2: Add error haptics to auth screens**

In `login.tsx` and `register.tsx`, on auth failure:
```typescript
import { hapticNotification } from '@/lib/haptics'
import { NotificationFeedbackType } from 'expo-haptics'

// In the catch block of login/register:
void hapticNotification(NotificationFeedbackType.Error)
```

- [ ] **Step 3: Add success haptics to EnrichTab**

After successful enrich form submission:
```typescript
void hapticNotification(NotificationFeedbackType.Success)
```

- [ ] **Step 4: Run tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass (haptics module is mocked)

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/app/\(tabs\)/profile.tsx apps/pharmopedia/app/\(auth\)/login.tsx apps/pharmopedia/app/\(auth\)/register.tsx apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx
git commit -m "feat(pharmopedia): haptic feedback on sync, auth errors, enrich, and settings changes"
```

---

## Task 11: Animated sync counter in SyncStatusBanner

**Files:**
- Modify: `apps/pharmopedia/src/components/SyncStatusBanner.tsx`

- [ ] **Step 1: Add reanimated imports**

```typescript
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  useDerivedValue,
} from 'react-native-reanimated'
```

- [ ] **Step 2: Create animated text component**

React Native `Text` doesn't support `animatedProps` for text content directly. Use a derived value to drive the displayed count:

```typescript
const AnimatedText = Animated.createAnimatedComponent(Text)

// Inside the component:
const displayCount = useSharedValue(0)

useEffect(() => {
  displayCount.value = withTiming(syncedCount, { duration: 300 })
}, [syncedCount])

const animatedText = useDerivedValue(() =>
  t('sync.syncingCount', { count: Math.round(displayCount.value) })
)
```

Since animated text content is tricky in RN, a simpler approach is to just animate the opacity when the count changes:

```typescript
const countOpacity = useSharedValue(1)

useEffect(() => {
  countOpacity.value = 0.3
  countOpacity.value = withTiming(1, { duration: 400 })
}, [syncedCount])

const countAnimatedStyle = useAnimatedStyle(() => ({
  opacity: countOpacity.value,
}))
```

Then wrap the syncing text:

```tsx
<Animated.Text style={[styles.text, { color: colors.textPrimary }, countAnimatedStyle]}>
  {syncedCount > 0
    ? t('sync.syncingCount', { count: syncedCount })
    : t('sync.syncing')}
</Animated.Text>
```

- [ ] **Step 3: Run tests**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/sync-status-banner`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/pharmopedia/src/components/SyncStatusBanner.tsx
git commit -m "feat(pharmopedia): animated opacity transition on sync counter update"
```

---

## Task 12: Create NetStatusBanner (offline indicator)

**Files:**
- Create: `apps/pharmopedia/src/components/NetStatusBanner.tsx`
- Test: `apps/pharmopedia/src/__tests__/net-status-banner.test.tsx`

- [ ] **Step 1: Add i18n keys**

In all 4 locale files, add to a new `net` section:

**en.ts:**
```typescript
net: {
  offline: "You're offline — showing cached data",
},
```

**prs.ts:**
```typescript
net: {
  offline: 'شما آفلاین هستید — داده‌های ذخیره شده نمایش داده می‌شود',
},
```

**ps.ts:**
```typescript
net: {
  offline: 'تاسو آفلاین یاست — کیش شوی معلومات ښودل کیږي',
},
```

**ar.ts:**
```typescript
net: {
  offline: 'أنت غير متصل — يتم عرض البيانات المحفوظة',
},
```

- [ ] **Step 2: Write the failing test**

Create `apps/pharmopedia/src/__tests__/net-status-banner.test.tsx`:

```typescript
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react-native'

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
vi.mock('react-native-reanimated', () => {
  const React = require('react')
  return {
    default: { createAnimatedComponent: (c: React.ComponentType) => c, View: 'View' },
    useSharedValue: () => ({ value: 0 }),
    useAnimatedStyle: (fn: () => Record<string, unknown>) => fn(),
    withTiming: (v: number) => v,
    FadeInDown: { duration: () => ({ build: () => ({}) }) },
    FadeOutUp: { duration: () => ({ build: () => ({}) }) },
  }
})

const mockUseNetInfo = vi.fn()
vi.mock('@react-native-community/netinfo', () => ({
  useNetInfo: mockUseNetInfo,
}))

import { NetStatusBanner } from '@/components/NetStatusBanner'

describe('NetStatusBanner', () => {
  it('renders offline message when not connected', () => {
    mockUseNetInfo.mockReturnValue({ isConnected: false })
    const { getByText } = render(<NetStatusBanner />)
    expect(getByText('net.offline')).toBeTruthy()
  })

  it('renders nothing when connected', () => {
    mockUseNetInfo.mockReturnValue({ isConnected: true })
    const { queryByText } = render(<NetStatusBanner />)
    expect(queryByText('net.offline')).toBeNull()
  })

  it('renders nothing when connection status is null (loading)', () => {
    mockUseNetInfo.mockReturnValue({ isConnected: null })
    const { queryByText } = render(<NetStatusBanner />)
    expect(queryByText('net.offline')).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/net-status-banner.test.tsx`
Expected: FAIL — module `@/components/NetStatusBanner` not found

- [ ] **Step 4: Implement NetStatusBanner**

Create `apps/pharmopedia/src/components/NetStatusBanner.tsx`:

```typescript
import { Text, StyleSheet } from 'react-native'
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated'
import { useNetInfo } from '@react-native-community/netinfo'
import { useTranslation } from 'react-i18next'
import { FontFamily, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

export function NetStatusBanner() {
  const { t } = useTranslation()
  const { isConnected } = useNetInfo()
  const colors = useThemeColors()

  // Don't show during initial check (isConnected === null) or when connected
  if (isConnected !== false) return null

  return (
    <Animated.View
      entering={FadeInDown.duration(200)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.banner, { backgroundColor: colors.warningLight }]}
    >
      <Text style={[styles.text, { color: colors.warningDark }]}>
        {t('net.offline')}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
  },
  text: {
    fontSize: 13,
    fontFamily: FontFamily.sans,
    textAlign: 'center',
  },
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/net-status-banner.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 6: Add NetStatusBanner to tab screens**

In `apps/pharmopedia/app/(tabs)/_layout.tsx` or in individual tab screens, add `<NetStatusBanner />` below `<SyncStatusBanner />`. The recommended placement is in the tabs layout so it appears on all tabs:

```tsx
import { NetStatusBanner } from '@/components/NetStatusBanner'

// In the layout, if using a wrapper:
// Or add it to each tab screen individually below SyncStatusBanner
```

Since the tabs layout uses `<Tabs>` from expo-router which doesn't support header injection, add `<NetStatusBanner />` to each tab screen file right after `<SyncStatusBanner />`.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/src/components/NetStatusBanner.tsx apps/pharmopedia/src/__tests__/net-status-banner.test.tsx apps/pharmopedia/src/i18n/locales/ apps/pharmopedia/app/
git commit -m "feat(pharmopedia): NetStatusBanner — offline connectivity indicator with slide animation"
```

---

## Task 13: Create ErrorBoundary and CrashFallback

**Files:**
- Create: `apps/pharmopedia/src/components/ErrorBoundary.tsx`
- Create: `apps/pharmopedia/src/components/CrashFallback.tsx`
- Test: `apps/pharmopedia/src/__tests__/error-boundary.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/error-boundary.test.tsx`:

```typescript
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'

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

import { ErrorBoundary } from '@/components/ErrorBoundary'

function BrokenComponent(): React.ReactElement {
  throw new Error('Test crash')
}

function WorkingComponent(): React.ReactElement {
  return <Text>Working</Text>
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <WorkingComponent />
      </ErrorBoundary>,
    )
    expect(getByText('Working')).toBeTruthy()
  })

  it('renders CrashFallback when child throws', () => {
    // Suppress console.error from React error boundary
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { getByText } = render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    )
    expect(getByText('common.somethingWentWrong')).toBeTruthy()

    spy.mockRestore()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/error-boundary.test.tsx`
Expected: FAIL — modules not found

- [ ] **Step 3: Add i18n keys**

Add to all 4 locale files in the `common` section:

**en.ts:**
```typescript
somethingWentWrong: 'Something went wrong',
reload: 'Reload',
tabError: 'This section encountered an error',
```

**prs.ts:**
```typescript
somethingWentWrong: 'مشکلی رخ داده است',
reload: 'بارگذاری مجدد',
tabError: 'این بخش با خطا مواجه شد',
```

**ps.ts:**
```typescript
somethingWentWrong: 'یوه ستونزه رامنځته شوه',
reload: 'بیا پورته کول',
tabError: 'دا برخه له تېروتنې سره مخ شوه',
```

**ar.ts:**
```typescript
somethingWentWrong: 'حدث خطأ ما',
reload: 'إعادة التحميل',
tabError: 'واجه هذا القسم خطأ',
```

- [ ] **Step 4: Implement CrashFallback**

Create `apps/pharmopedia/src/components/CrashFallback.tsx`:

```typescript
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import * as Updates from 'expo-updates'
import { AlertTriangle } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing, Radius } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'

interface Props {
  /** If true, renders compact inline fallback instead of full-screen */
  inline?: boolean
}

export function CrashFallback({ inline }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()

  if (inline) {
    return (
      <View style={[styles.inlineContainer, { backgroundColor: colors.surfaceSubtle }]}>
        <AlertTriangle size={24} color={colors.textMuted} />
        <Text style={[styles.inlineText, { color: colors.textMuted }]}>
          {t('common.tabError')}
        </Text>
      </View>
    )
  }

  return (
    <View style={[styles.fullContainer, { backgroundColor: colors.surface }]}>
      <AlertTriangle size={48} color={colors.textMuted} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>
        {t('common.somethingWentWrong')}
      </Text>
      <Pressable
        style={[styles.button, { backgroundColor: colors.primary500 }]}
        onPress={() => {
          try { void Updates.reloadAsync() } catch { /* Expo Go fallback */ }
        }}
      >
        <Text style={styles.buttonText}>{t('common.reload')}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  fullContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[8],
    gap: Spacing[4],
  },
  title: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.sansSemibold,
    textAlign: 'center',
  },
  button: {
    paddingHorizontal: Spacing[6],
    paddingVertical: Spacing[3],
    borderRadius: Radius.md,
    marginTop: Spacing[2],
  },
  buttonText: {
    fontSize: FontSize.base,
    fontFamily: FontFamily.sansSemibold,
    color: '#ffffff',
  },
  inlineContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing[8],
    gap: Spacing[3],
    borderRadius: Radius.md,
    margin: Spacing[4],
  },
  inlineText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.sans,
    textAlign: 'center',
  },
})
```

- [ ] **Step 5: Implement ErrorBoundary**

Create `apps/pharmopedia/src/components/ErrorBoundary.tsx`:

```typescript
import React from 'react'
import { CrashFallback } from './CrashFallback'

interface Props {
  children: React.ReactNode
  /** If true, renders compact inline fallback */
  inline?: boolean
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return <CrashFallback inline={this.props.inline} />
    }
    return this.props.children
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/error-boundary.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/src/components/ErrorBoundary.tsx apps/pharmopedia/src/components/CrashFallback.tsx apps/pharmopedia/src/__tests__/error-boundary.test.tsx apps/pharmopedia/src/i18n/locales/
git commit -m "feat(pharmopedia): ErrorBoundary + CrashFallback (full-screen and inline variants)"
```

---

## Task 14: Wire error boundaries into app

**Files:**
- Modify: `apps/pharmopedia/app/_layout.tsx`
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`

- [ ] **Step 1: Wrap tab navigator in ErrorBoundary**

In `apps/pharmopedia/app/_layout.tsx`, import and wrap:

```typescript
import { ErrorBoundary } from '@/components/ErrorBoundary'
```

Wrap the `<Stack>` in the return:

```tsx
return (
  <>
    <StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
    <ErrorBoundary>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="drug/[atcCode]" options={{ headerShown: true, title: '' }} />
      </Stack>
    </ErrorBoundary>
    {!isAuthenticated && <Redirect href="/(auth)/login" />}
  </>
)
```

- [ ] **Step 2: Wrap each drug detail tab in inline ErrorBoundary**

In `apps/pharmopedia/app/drug/[atcCode].tsx`, wrap each tab's render:

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary'

// Replace:
{activeTab === 'overview' && <OverviewTab entry={entry} lang={lang} />}

// With:
{activeTab === 'overview' && (
  <ErrorBoundary inline>
    <OverviewTab entry={entry} lang={lang} />
  </ErrorBoundary>
)}
```

Repeat for each tab (clinical, formulary, pricing, enrich).

- [ ] **Step 3: Run all tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add apps/pharmopedia/app/_layout.tsx apps/pharmopedia/app/drug/\[atcCode\].tsx
git commit -m "feat(pharmopedia): wire error boundaries into root layout and drug detail tabs"
```

---

## Task 15: Final verification

- [ ] **Step 1: Run full test suite**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass including new test files (haptics, skeleton-card, net-status-banner, error-boundary)

- [ ] **Step 2: Verify no regressions**

Run: `cd apps/pharmopedia && npx vitest run --reporter=verbose`
Expected: All existing tests pass alongside new tests

- [ ] **Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix(pharmopedia): test fixes for motion and feedback epic"
```
