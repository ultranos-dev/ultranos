# Pharmopedia E2 — App Shell & IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the E1 UI kit into the app and give every Pharmopedia tab a collapsing large-title header in the Clinical-Calm style, fixing the shell bugs and unblocking the broken screen test harness along the way.

**Architecture:** Add `UiKitProvider` at the app root (fed by `theme-store` + `lang-store`). Build three shared collapsing-header components in `@ultranos/ui-kit/native` (`CollapsibleHeaderParts` internals, `CollapsibleList` for FlatList screens, `CollapsibleScreen` for ScrollView screens) using core RN `Animated` with `useNativeDriver`. Retrofit the four tab screens onto them. Fix the Vitest harness so the 11 Expo-dependent screen suites run.

**Tech Stack:** React 19, React Native 0.81, Expo Router, core `Animated`, TypeScript, Vitest + react-test-renderer.

**Conventions (keep):** tokens-only (`tokens.native.ts`); theme via `useThemeColors()`, RTL via `useRtl()`; icons from `lucide-react-native`; chevrons flip with `scaleX(-1)` in RTL. **Commits:** this repo forbids autonomous commits — treat `Commit` steps as checkpoints, run only on the user's go-ahead, and append the repo's `Co-Authored-By` trailer.

**Nesting note:** Tasks 3–5 each append exports to `packages/ui-kit/src/native/index.ts`; Tasks 6–9 each edit a different screen file. Run tasks sequentially (no parallel implementers) to avoid barrel/edit races.

---

## File Structure

**Created:**
- `apps/pharmopedia/src/__mocks__/expo-router.js`, `expo-haptics.js`, `expo-location.js`, `expo-updates.js`, `expo-status-bar.js`, `expo-font.js`, `@react-native-community/netinfo.js` — Vitest mocks for Expo/native modules.
- `packages/ui-kit/src/native/collapsible-parts.tsx` — `LargeTitle`, `CompactBar`, `LARGE_TITLE_HEIGHT`, `useScrollY` (shared header internals).
- `packages/ui-kit/src/native/CollapsibleList.tsx` — Animated FlatList screen container.
- `packages/ui-kit/src/native/CollapsibleScreen.tsx` — Animated ScrollView screen container.
- Tests: `apps/pharmopedia/src/__tests__/ui-native/CollapsibleList.test.tsx`, `CollapsibleScreen.test.tsx`.

**Modified:**
- `apps/pharmopedia/vitest.config.ts` — `define: { __DEV__: true }` + new module aliases.
- `apps/pharmopedia/src/__mocks__/react-native.js` — extend `Animated` (`event`, `FlatList`, `ScrollView`).
- `packages/ui-kit/src/native/index.ts` — export the two new containers.
- `apps/pharmopedia/app/_layout.tsx` — wrap tree in `UiKitProvider`.
- `apps/pharmopedia/app/(tabs)/index.tsx`, `browse.tsx`, `saved.tsx`, `profile.tsx` — retrofit onto collapsible containers + bug fixes.
- `apps/pharmopedia/src/i18n/locales/{en,prs,ps,ar}.ts` — add `saved.browseCta`.

---

## Task 1: Fix the test harness (Expo module mocks + `__DEV__`)

**Files:**
- Modify: `apps/pharmopedia/vitest.config.ts`
- Modify: `apps/pharmopedia/src/__mocks__/react-native.js`
- Create: `apps/pharmopedia/src/__mocks__/expo-router.js`, `expo-haptics.js`, `expo-location.js`, `expo-updates.js`, `expo-status-bar.js`, `expo-font.js`, and `apps/pharmopedia/src/__mocks__/@react-native-community/netinfo.js`

- [ ] **Step 1: Confirm the current failure**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/saved-tab.test.tsx 2>&1 | head -20`
Expected: FAIL with `ReferenceError: __DEV__ is not defined` (from `expo-modules-core`).

- [ ] **Step 2: Add `__DEV__` define and module aliases to `vitest.config.ts`**

In `apps/pharmopedia/vitest.config.ts`, add a top-level `define` and extend `resolve.alias`. The `test` block gets `define`:
```ts
  define: { __DEV__: 'true' },
```
And add these aliases inside `resolve.alias` (alongside the existing ones):
```ts
      'expo-router': path.resolve(__dirname, 'src/__mocks__/expo-router.js'),
      'expo-haptics': path.resolve(__dirname, 'src/__mocks__/expo-haptics.js'),
      'expo-location': path.resolve(__dirname, 'src/__mocks__/expo-location.js'),
      'expo-updates': path.resolve(__dirname, 'src/__mocks__/expo-updates.js'),
      'expo-status-bar': path.resolve(__dirname, 'src/__mocks__/expo-status-bar.js'),
      'expo-font': path.resolve(__dirname, 'src/__mocks__/expo-font.js'),
      '@react-native-community/netinfo': path.resolve(__dirname, 'src/__mocks__/@react-native-community/netinfo.js'),
```
(`expo-secure-store` and `expo-sqlite` are already mocked per-test / via existing mock; leave them.)

- [ ] **Step 3: Extend the react-native mock's `Animated`**

In `apps/pharmopedia/src/__mocks__/react-native.js`, add to the `Animated` object (so collapsible components render under test):
```js
  event: () => () => {},
  FlatList,
  ScrollView: View,
```
(Place these inside the existing `const Animated = { ... }` object, after `sequence`.)

- [ ] **Step 4: Create the Expo mocks**

Create `apps/pharmopedia/src/__mocks__/expo-router.js`:
```js
const React = require('react')
const noopRouter = { push: () => {}, replace: () => {}, back: () => {}, navigate: () => {}, setParams: () => {} }
module.exports = {
  useRouter: () => noopRouter,
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  useSegments: () => [],
  Link: ({ children }) => React.createElement('Link', null, children),
  Redirect: () => null,
  Stack: Object.assign(({ children }) => React.createElement('Stack', null, children), { Screen: () => null }),
  Tabs: Object.assign(({ children }) => React.createElement('Tabs', null, children), { Screen: () => null }),
  router: noopRouter,
}
```

Create `apps/pharmopedia/src/__mocks__/expo-haptics.js`:
```js
module.exports = {
  impactAsync: async () => {},
  notificationAsync: async () => {},
  selectionAsync: async () => {},
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}
```

Create `apps/pharmopedia/src/__mocks__/expo-location.js`:
```js
module.exports = {
  requestForegroundPermissionsAsync: async () => ({ status: 'granted', granted: true }),
  getForegroundPermissionsAsync: async () => ({ status: 'granted', granted: true }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: 34.5, longitude: 69.2 } }),
  Accuracy: { Balanced: 3, High: 4 },
}
```

Create `apps/pharmopedia/src/__mocks__/expo-updates.js`:
```js
module.exports = { reloadAsync: async () => {}, isEnabled: false, channel: 'test' }
```

Create `apps/pharmopedia/src/__mocks__/expo-status-bar.js`:
```js
module.exports = { StatusBar: () => null, setStatusBarStyle: () => {} }
```

Create `apps/pharmopedia/src/__mocks__/expo-font.js`:
```js
module.exports = { useFonts: () => [true, null], loadAsync: async () => {}, isLoaded: () => true }
```

Create `apps/pharmopedia/src/__mocks__/@react-native-community/netinfo.js`:
```js
module.exports = {
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
  addEventListener: () => () => {},
  fetch: async () => ({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
}
```

- [ ] **Step 5: Run the previously-broken suites; mock any remaining missing module**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/saved-tab.test.tsx src/__tests__/browse-tab.test.tsx src/__tests__/sync-status-banner.test.tsx 2>&1 | tail -30`
Expected: the suites now LOAD (no `__DEV__` / module-resolution crash). Individual assertions may fail because the screens are about to change — that's fine for this task; the goal is that the modules resolve. If a *different* `Cannot find module 'X'` or `__DEV__`-style error appears for another Expo/native package, create an equivalent minimal mock + alias for `X` and re-run. Do not modify screen code in this task.

- [ ] **Step 6: Confirm no regression to currently-passing suites**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native 2>&1 | grep -E "Test Files|Tests "`
Expected: ui-native still **10 files / 36 tests pass**.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/vitest.config.ts apps/pharmopedia/src/__mocks__
git commit -m "test(pharmopedia): mock Expo/native modules so screen suites load"
```

---

## Task 2: Wire UiKitProvider at the app root

**Files:**
- Modify: `apps/pharmopedia/app/_layout.tsx`

- [ ] **Step 1: Add the provider import**

In `apps/pharmopedia/app/_layout.tsx`, add after the existing ui-kit / store imports:
```ts
import { UiKitProvider } from '@ultranos/ui-kit/native'
import { isRtlLang } from '@/store/lang-store'
```

- [ ] **Step 2: Read the active lang for rtl**

Inside `RootLayout`, near the other store selectors (after `const resolvedTheme = useThemeStore((s) => s.resolvedTheme)`), add:
```ts
  const lang = useLangStore((s) => s.lang)
```

- [ ] **Step 3: Wrap the tree in the provider**

In the returned JSX, wrap the existing `<ErrorBoundary>...</ErrorBoundary>` with `UiKitProvider` (inside the fragment, after `<StatusBar/>`):
```tsx
      <UiKitProvider mode={resolvedTheme} rtl={isRtlLang(lang)}>
        <ErrorBoundary>
          {/* existing <Stack> ... </Stack> unchanged */}
        </ErrorBoundary>
      </UiKitProvider>
```
Keep the `<Stack>` and its `<Stack.Screen>` children exactly as they are; only the wrapper changes. Leave the `<Redirect>` lines as-is (after the closing `UiKitProvider`).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -c "app/_layout"`
Expected: `0` (no new errors in `_layout.tsx`).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/app/_layout.tsx
git commit -m "feat(pharmopedia): wrap app in UiKitProvider (theme + rtl)"
```

---

## Task 3: Collapsible header internals (`collapsible-parts`)

**Files:**
- Create: `packages/ui-kit/src/native/collapsible-parts.tsx`

- [ ] **Step 1: Implement the shared parts**

Create `packages/ui-kit/src/native/collapsible-parts.tsx`:
```tsx
import { useRef, type ReactNode } from 'react'
import { Animated, View, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Spacing } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'

/** Height the large-title block occupies; drives the collapse interpolation. */
export const LARGE_TITLE_HEIGHT = 60

/** Owns the scroll offset Animated.Value + the onScroll handler for a screen. */
export function useScrollY() {
  const scrollY = useRef(new Animated.Value(0)).current
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true },
  )
  return { scrollY, onScroll }
}

/** The large title that scrolls with content (rendered as the first scrolling element). */
export function LargeTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const colors = useThemeColors()
  const rtl = useRtl()
  const align = rtl ? ('right' as const) : ('left' as const)
  return (
    <View style={[styles.large, rtl && styles.largeRtl]}>
      <View style={styles.largeTitles}>
        <Text accessibilityRole="header" style={[styles.largeTitle, { color: colors.textPrimary, textAlign: align }, rtl && styles.arabic]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.largeSubtitle, { color: colors.textMuted, textAlign: align }, rtl && styles.arabic]}>{subtitle}</Text>
        ) : null}
      </View>
      {action ? <View style={styles.largeAction}>{action}</View> : null}
    </View>
  )
}

/** The compact sticky bar that fades in as the large title scrolls away. */
export function CompactBar({ title, scrollY }: { title: string; scrollY: Animated.Value }) {
  const colors = useThemeColors()
  const rtl = useRtl()
  const opacity = scrollY.interpolate({
    inputRange: [LARGE_TITLE_HEIGHT * 0.4, LARGE_TITLE_HEIGHT],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  })
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.compact, { backgroundColor: colors.surfaceElevated, borderBottomColor: colors.borderSubtle, opacity }]}
    >
      <Text numberOfLines={1} style={[styles.compactTitle, { color: colors.textPrimary, textAlign: rtl ? 'right' : 'left' }, rtl && styles.arabic]}>
        {title}
      </Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  large: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: Spacing[4], paddingTop: Spacing[2], paddingBottom: Spacing[3] },
  largeRtl: { flexDirection: 'row-reverse' },
  largeTitles: { flex: 1 },
  largeTitle: { fontFamily: FontFamily.headingBold, fontSize: FontSize['2xl'] },
  largeSubtitle: { fontFamily: FontFamily.sans, fontSize: FontSize.xs, marginTop: Spacing[1] },
  largeAction: { marginStart: Spacing[3] },
  arabic: { fontFamily: FontFamily.arabic },
  compact: { position: 'absolute', top: 0, left: 0, right: 0, height: 52, justifyContent: 'center', paddingHorizontal: Spacing[4], borderBottomWidth: StyleSheet.hairlineWidth },
  compactTitle: { fontFamily: FontFamily.sansBold, fontSize: FontSize.base },
})
```

- [ ] **Step 2: Typecheck the package excludes it from web but app will check it**

Run: `pnpm --filter @ultranos/ui-kit typecheck >/dev/null 2>&1 && echo PASS || echo FAIL`
Expected: PASS (native excluded from web tsc).

- [ ] **Step 3: Commit**

```bash
git add packages/ui-kit/src/native/collapsible-parts.tsx
git commit -m "feat(ui-kit-native): collapsible header internals"
```

---

## Task 4: CollapsibleList

**Files:**
- Create: `packages/ui-kit/src/native/CollapsibleList.tsx`
- Modify: `packages/ui-kit/src/native/index.ts`
- Test: `apps/pharmopedia/src/__tests__/ui-native/CollapsibleList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/ui-native/CollapsibleList.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { UiKitProvider, CollapsibleList } from '@ultranos/ui-kit/native'

const items = [{ id: 'a', name: 'Amoxicillin' }, { id: 'b', name: 'Metformin' }]

describe('CollapsibleList', () => {
  it('renders the title and the list items', () => {
    const { getByText } = render(
      <UiKitProvider mode="light">
        <CollapsibleList
          title="Search"
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => <Text>{item.name}</Text>}
        />
      </UiKitProvider>,
    )
    expect(getByText('Search')).toBeTruthy()
    expect(getByText('Amoxicillin')).toBeTruthy()
    expect(getByText('Metformin')).toBeTruthy()
  })

  it('renders the empty component when data is empty', () => {
    const { getByText, queryByText } = render(
      <UiKitProvider mode="light">
        <CollapsibleList
          title="Saved"
          data={[]}
          keyExtractor={(it: { id: string }) => it.id}
          renderItem={() => null}
          ListEmptyComponent={<Text>Nothing saved</Text>}
        />
      </UiKitProvider>,
    )
    expect(getByText('Nothing saved')).toBeTruthy()
    expect(queryByText('Amoxicillin')).toBeNull()
  })

  it('renders a subHeader when provided', () => {
    const { getByText } = render(
      <UiKitProvider mode="light">
        <CollapsibleList
          title="Search"
          subHeader={<Text>search-bar</Text>}
          data={[]}
          keyExtractor={(it: { id: string }) => it.id}
          renderItem={() => null}
        />
      </UiKitProvider>,
    )
    expect(getByText('search-bar')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/CollapsibleList.test.tsx`
Expected: FAIL — `CollapsibleList` not exported.

- [ ] **Step 3: Implement CollapsibleList**

Create `packages/ui-kit/src/native/CollapsibleList.tsx`:
```tsx
import { type ReactElement, type ReactNode } from 'react'
import { Animated, View, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Spacing } from '../tokens.native'
import { useThemeColors } from './theme'
import { LargeTitle, CompactBar, useScrollY } from './collapsible-parts'

interface CollapsibleListProps<T> {
  title: string
  subtitle?: string
  action?: ReactNode
  subHeader?: ReactNode
  data: T[]
  renderItem: (info: { item: T; index: number }) => ReactElement | null
  keyExtractor: (item: T, index: number) => string
  ListEmptyComponent?: ReactElement
  refreshing?: boolean
  onRefresh?: () => void
  onEndReached?: () => void
  testID?: string
}

export function CollapsibleList<T>({
  title, subtitle, action, subHeader, data, renderItem, keyExtractor,
  ListEmptyComponent, refreshing, onRefresh, onEndReached, testID,
}: CollapsibleListProps<T>) {
  const colors = useThemeColors()
  const { scrollY, onScroll } = useScrollY()
  return (
    <SafeAreaView edges={['top']} testID={testID} style={[styles.root, { backgroundColor: colors.surfaceSubtle }]}>
      <Animated.FlatList
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={
          <View>
            <LargeTitle title={title} subtitle={subtitle} action={action} />
            {subHeader ? <View style={styles.subHeader}>{subHeader}</View> : null}
          </View>
        }
        ListEmptyComponent={ListEmptyComponent}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.content}
      />
      <CompactBar title={title} scrollY={scrollY} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: Spacing[8] },
  subHeader: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[2] },
})
```

- [ ] **Step 4: Add to barrel**

In `packages/ui-kit/src/native/index.ts` add:
```ts
export { CollapsibleList } from './CollapsibleList'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/CollapsibleList.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/native/CollapsibleList.tsx packages/ui-kit/src/native/index.ts apps/pharmopedia/src/__tests__/ui-native/CollapsibleList.test.tsx
git commit -m "feat(ui-kit-native): add CollapsibleList"
```

---

## Task 5: CollapsibleScreen

**Files:**
- Create: `packages/ui-kit/src/native/CollapsibleScreen.tsx`
- Modify: `packages/ui-kit/src/native/index.ts`
- Test: `apps/pharmopedia/src/__tests__/ui-native/CollapsibleScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/ui-native/CollapsibleScreen.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { UiKitProvider, CollapsibleScreen } from '@ultranos/ui-kit/native'

describe('CollapsibleScreen', () => {
  it('renders the title and children', () => {
    const { getByText } = render(
      <UiKitProvider mode="light">
        <CollapsibleScreen title="Profile"><Text>body content</Text></CollapsibleScreen>
      </UiKitProvider>,
    )
    expect(getByText('Profile')).toBeTruthy()
    expect(getByText('body content')).toBeTruthy()
  })

  it('renders a subtitle when provided', () => {
    const { getByText } = render(
      <UiKitProvider mode="light">
        <CollapsibleScreen title="Profile" subtitle="Pharmacist"><Text>x</Text></CollapsibleScreen>
      </UiKitProvider>,
    )
    expect(getByText('Pharmacist')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/CollapsibleScreen.test.tsx`
Expected: FAIL — `CollapsibleScreen` not exported.

- [ ] **Step 3: Implement CollapsibleScreen**

Create `packages/ui-kit/src/native/CollapsibleScreen.tsx`:
```tsx
import { type ReactNode } from 'react'
import { Animated, View, RefreshControl, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Spacing } from '../tokens.native'
import { useThemeColors } from './theme'
import { LargeTitle, CompactBar, useScrollY } from './collapsible-parts'

interface CollapsibleScreenProps {
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  refreshing?: boolean
  onRefresh?: () => void
  testID?: string
}

export function CollapsibleScreen({ title, subtitle, action, children, refreshing, onRefresh, testID }: CollapsibleScreenProps) {
  const colors = useThemeColors()
  const { scrollY, onScroll } = useScrollY()
  return (
    <SafeAreaView edges={['top']} testID={testID} style={[styles.root, { backgroundColor: colors.surfaceSubtle }]}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary500} /> : undefined}
      >
        <LargeTitle title={title} subtitle={subtitle} action={action} />
        <View style={styles.body}>{children}</View>
      </Animated.ScrollView>
      <CompactBar title={title} scrollY={scrollY} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: Spacing[8] },
  body: { paddingHorizontal: Spacing[4], gap: Spacing[4] },
})
```

- [ ] **Step 4: Add to barrel**

In `packages/ui-kit/src/native/index.ts` add:
```ts
export { CollapsibleScreen } from './CollapsibleScreen'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/CollapsibleScreen.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/native/CollapsibleScreen.tsx packages/ui-kit/src/native/index.ts apps/pharmopedia/src/__tests__/ui-native/CollapsibleScreen.test.tsx
git commit -m "feat(ui-kit-native): add CollapsibleScreen"
```

---

## Task 6: Add `saved.browseCta` i18n key (all locales)

**Files:**
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts`, `prs.ts`, `ps.ts`, `ar.ts`

- [ ] **Step 1: Add the key under the `saved` block in each locale**

In `en.ts` `saved` object add: `browseCta: 'Browse medicines',`
In `prs.ts` `saved` object add: `browseCta: 'مرور داروها',`
In `ps.ts` `saved` object add: `browseCta: 'درمل وپلټئ',`
In `ar.ts` `saved` object add: `browseCta: 'تصفّح الأدوية',`
(Place it after the existing `emptyDescription` key in each file's `saved` object so all four stay structurally identical — `Translations = typeof en` enforces parity.)

- [ ] **Step 2: Typecheck locale parity**

Run: `pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -E "locales/(prs|ps|ar)\.ts.*browseCta" | head`
Expected: empty (no missing-key errors for `browseCta`). NOTE: pre-existing unrelated `ps.ts` literal-type errors may remain; ignore those.

- [ ] **Step 3: Commit**

```bash
git add apps/pharmopedia/src/i18n/locales
git commit -m "i18n(pharmopedia): add saved.browseCta in all locales"
```

---

## Task 7: Retrofit Search tab

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/index.tsx`
- Test: `apps/pharmopedia/src/__tests__/search-screen.test.tsx` (create if absent; otherwise update)

- [ ] **Step 1: Update/author the screen test**

Create or replace `apps/pharmopedia/src/__tests__/search-screen.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'
import SearchTab from '@/app/(tabs)/index'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { token: null }) => unknown) => s({ token: null }) }))
vi.mock('@/store/sync-store', () => ({ useSyncStore: (s: (x: { lastVersion: number }) => unknown) => s({ lastVersion: 0 }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))

describe('SearchTab', () => {
  it('renders the screen title and the empty prompt', () => {
    const { getByText } = render(<SearchTab />)
    expect(getByText('tabs.search')).toBeTruthy()
    expect(getByText('search.emptyTitle')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/search-screen.test.tsx`
Expected: FAIL — `tabs.search` title not found (screen has no header yet).

- [ ] **Step 3: Retrofit `index.tsx` onto CollapsibleList**

Replace the body of `apps/pharmopedia/app/(tabs)/index.tsx` so it renders a `CollapsibleList` titled `t('tabs.search')`, with `SearchBar` as `subHeader`, `results` as `data`, and the existing empty/no-results/loading states moved into `ListEmptyComponent`. Keep all existing search logic (`handleSearch`, debounce, `lastVersion`/`token` branch, `onRefresh`). Concretely:

```tsx
import { useState, useCallback } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Search, SearchX } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing } from '@ultranos/ui-kit/tokens.native'
import { CollapsibleList } from '@ultranos/ui-kit/native'
import { SearchBar } from '@/components/SearchBar'
import { SyncStatusBanner } from '@/components/SyncStatusBanner'
import { NetStatusBanner } from '@/components/NetStatusBanner'
import { DrugCard } from '@/components/DrugCard'
import { SkeletonCard } from '@/components/SkeletonCard'
import { searchDrugs } from '@/db/fts'
import { searchDrugsApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { useLangStore } from '@/store/lang-store'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { DrugSearchResult } from '@ultranos/shared-types'

export default function SearchTab() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const lang = useLangStore((s) => s.lang)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DrugSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      if (lastVersion > 0) {
        try { setResults(await searchDrugs(getDatabase(), q, lang, 50)) } catch { setResults([]) }
      } else if (token) {
        try { setResults(await searchDrugsApi(q, lang, 20, token)) } catch { setResults([]) }
      }
    } finally { setLoading(false) }
  }, [lastVersion, lang, token])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try { if (query.trim()) await handleSearch(query) } finally { setRefreshing(false) }
  }, [query, handleSearch])

  const empty = loading ? (
    <View>{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} testID={`skeleton-${i}`} />)}</View>
  ) : query.trim().length > 0 ? (
    <View style={[styles.empty, { backgroundColor: colors.surface }]}>
      <SearchX size={48} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('search.noResultsTitle')}</Text>
      <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t('search.noResultsDescription')}</Text>
    </View>
  ) : (
    <View style={[styles.empty, { backgroundColor: colors.surface }]}>
      <Search size={48} color={colors.textMuted} />
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('search.emptyTitle')}</Text>
      <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{t('search.emptyDescription')}</Text>
    </View>
  )

  return (
    <CollapsibleList<DrugSearchResult>
      title={t('tabs.search')}
      subHeader={<View><SearchBar value={query} onSearch={handleSearch} /><SyncStatusBanner /><NetStatusBanner /></View>}
      data={results}
      keyExtractor={(item, index) => `${item.atcCode}-${index}`}
      renderItem={({ item }) => <DrugCard result={item} lang={lang} onPress={() => router.push(`/drug/${item.atcCode}`)} />}
      ListEmptyComponent={empty}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  )
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', padding: Spacing[8], gap: Spacing[3], borderRadius: 12, margin: Spacing[4] },
  emptyTitle: { fontSize: FontSize.md, fontFamily: FontFamily.sansSemibold, textAlign: 'center' },
  emptyDesc: { fontSize: FontSize.sm, fontFamily: FontFamily.sans, textAlign: 'center' },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/search-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/app/(tabs)/index.tsx apps/pharmopedia/src/__tests__/search-screen.test.tsx
git commit -m "feat(pharmopedia): collapsing header on Search tab"
```

---

## Task 8: Retrofit Saved tab (with empty-state CTA + SafeArea fix)

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/saved.tsx`
- Test: `apps/pharmopedia/src/__tests__/saved-tab.test.tsx`

- [ ] **Step 1: Update the test to assert header + empty CTA**

Replace `apps/pharmopedia/src/__tests__/saved-tab.test.tsx` with:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'
import SavedTab from '@/app/(tabs)/saved'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
vi.mock('@/store/bookmark-store', () => ({ useBookmarkStore: (s: (x: { bookmarks: [] }) => unknown) => s({ bookmarks: [] }) }))

describe('SavedTab', () => {
  it('renders the title and an empty state with a browse CTA', () => {
    const { getByText } = render(<SavedTab />)
    expect(getByText('tabs.saved')).toBeTruthy()
    expect(getByText('saved.emptyTitle')).toBeTruthy()
    expect(getByText('saved.browseCta')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/saved-tab.test.tsx`
Expected: FAIL — title / CTA not present.

- [ ] **Step 3: Retrofit `saved.tsx`**

Replace `apps/pharmopedia/app/(tabs)/saved.tsx`:
```tsx
import { useMemo, useState, useCallback } from 'react'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { BookmarkPlus } from 'lucide-react-native'
import { CollapsibleList, EmptyState } from '@ultranos/ui-kit/native'
import { DrugCard } from '@/components/DrugCard'
import { useLangStore } from '@/store/lang-store'
import { useBookmarkStore } from '@/store/bookmark-store'
import type { DrugSearchResult } from '@ultranos/shared-types'

export default function SavedTab() {
  const { t } = useTranslation()
  const router = useRouter()
  const lang = useLangStore((s) => s.lang)
  const bookmarks = useBookmarkStore((s) => s.bookmarks)
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 300)
  }, [])

  const drugResults = useMemo<DrugSearchResult[]>(
    () => bookmarks.map((item) => ({
      atcCode: item.atcCode, innName: item.innName, brandNames: [], doseForms: [],
      therapeuticClass: item.therapeuticClass ?? '', localName: undefined,
    })),
    [bookmarks],
  )

  return (
    <CollapsibleList<DrugSearchResult>
      title={t('tabs.saved')}
      data={drugResults}
      keyExtractor={(item) => item.atcCode}
      renderItem={({ item }) => <DrugCard result={item} lang={lang} onPress={() => router.push(`/drug/${item.atcCode}`)} />}
      ListEmptyComponent={
        <EmptyState
          icon={BookmarkPlus}
          title={t('saved.emptyTitle')}
          description={t('saved.emptyDescription')}
          action={{ label: t('saved.browseCta'), onPress: () => router.push('/(tabs)/browse') }}
        />
      }
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/saved-tab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/app/(tabs)/saved.tsx apps/pharmopedia/src/__tests__/saved-tab.test.tsx
git commit -m "feat(pharmopedia): collapsing header + empty CTA on Saved tab"
```

---

## Task 9: Retrofit Browse tab (+ Android back fix)

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/browse.tsx`
- Test: `apps/pharmopedia/src/__tests__/browse-tab.test.tsx`

- [ ] **Step 1: Update the test (title + back-to-list on hardware back)**

Replace `apps/pharmopedia/src/__tests__/browse-tab.test.tsx` with:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'

let backHandlerCb: (() => boolean) | null = null
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string }) => unknown) => s({ lang: 'en' }), isRtlLang: () => false }))
vi.mock('@/store/sync-store', () => ({ useSyncStore: (s: (x: { lastVersion: number }) => unknown) => s({ lastVersion: 1 }) }))
vi.mock('@/db/browse', () => ({
  getTherapeuticClasses: async () => [{ name: 'Antibacterials', count: 3 }],
  getDrugsByTherapeuticClass: async () => [{ atcCode: 'J01CA04', innName: 'Amoxicillin', brandNames: [], doseForms: [], therapeuticClass: 'Antibacterials', localName: undefined }],
}))
vi.mock('@/db/migrations', () => ({ getDatabase: () => ({}) }))

describe('BrowseTab', () => {
  beforeEach(() => { backHandlerCb = null })

  it('renders the title', async () => {
    const { findByText } = render((await import('@/app/(tabs)/browse')).default())
    expect(await findByText('tabs.browse')).toBeTruthy()
  })
})
```
(If the dynamic-import render pattern is awkward in this harness, import `BrowseTab` normally at top and render `<BrowseTab />`; keep the title assertion.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/browse-tab.test.tsx`
Expected: FAIL — `tabs.browse` title not present.

- [ ] **Step 3: Retrofit `browse.tsx` + add BackHandler**

Edit `apps/pharmopedia/app/(tabs)/browse.tsx`:
1. Add imports:
```ts
import { useEffect } from 'react'
import { BackHandler } from 'react-native'
import { CollapsibleList } from '@ultranos/ui-kit/native'
```
2. Add a hardware-back effect inside the component (after `handleBack` is defined):
```ts
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedClass !== null) { handleBack(); return true }
      return false
    })
    return () => sub.remove()
  }, [selectedClass])
```
3. Replace the class-list `return` (the `SafeAreaView` + `FlatList` of `TherapeuticClassCard`) with a `CollapsibleList` titled `t('tabs.browse')`:
```tsx
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
    </>
  )
```
   Add `EmptyState` to the `@ultranos/ui-kit/native` import. Keep the existing `selectedClass !== null` drill-down branch (with its `classHeader` + in-screen back button + drug `FlatList`) as-is **above** this return, but wrap its root in the existing `SafeAreaView` (already present) — the SafeArea bug there is the *loading* branch; change the `if (classesLoading && classes.length === 0 && selectedClass === null)` early-return to render the skeletons inside the `CollapsibleList` empty component instead (delete that bare-`View` early return).

   Concretely: **delete** the `if (classesLoading && classes.length === 0 && selectedClass === null) { return (<View ...skeletons/>) }` block — loading is now handled by `ListEmptyComponent` above.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/browse-tab.test.tsx`
Expected: PASS (title renders).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/app/(tabs)/browse.tsx apps/pharmopedia/src/__tests__/browse-tab.test.tsx
git commit -m "feat(pharmopedia): collapsing header on Browse + Android back fix"
```

---

## Task 10: Retrofit Profile tab (header + coach-mark sequencing + offline banner)

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/profile.tsx`
- Test: `apps/pharmopedia/src/__tests__/profile-theme-toggle.test.tsx` (extend) — verify it still passes after changes

- [ ] **Step 1: Add a title assertion to an existing profile test**

In `apps/pharmopedia/src/__tests__/profile-theme-toggle.test.tsx`, add a test (the file already mocks the stores + safe-area):
```tsx
  it('renders the Profile title', () => {
    const { getByText } = render(<ProfileTab />)
    expect(getByText('tabs.profile')).toBeTruthy()
  })
```
(Add inside the existing `describe`. The existing mocks for `react-native-safe-area-context`, stores, and `react-i18next` already cover it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/profile-theme-toggle.test.tsx`
Expected: the new assertion FAILS (no title yet); existing assertions still pass.

- [ ] **Step 3: Retrofit `profile.tsx`**

In `apps/pharmopedia/app/(tabs)/profile.tsx`:
1. Add imports:
```ts
import { CollapsibleScreen } from '@ultranos/ui-kit/native'
import { NetStatusBanner } from '@/components/NetStatusBanner'
```
2. Read whether the lang coach-mark is dismissed (for sequencing) — add near the other store reads:
```ts
  const langCoachDismissed = useCoachMarkStore((s) => s.dismissed.has('profile-lang'))
```
3. Replace the outer `<SafeAreaView style={[styles.container,...]}>...</SafeAreaView>` wrapper with `<CollapsibleScreen title={t('tabs.profile')}>`, render `<NetStatusBanner />` as the first child, keep all the existing section `<View>`s as children, and change the two coach marks so the second is gated:
```tsx
      <CoachMark markKey="profile-lang" hint={t('coach.profileLang')} visible />
      <CoachMark markKey="profile-sync" hint={t('coach.profileSync')} visible={langCoachDismissed} />
```
4. Remove `SafeAreaView` import and the now-unused `styles.container` (the `CollapsibleScreen` provides SafeArea + padding + the section gap). Keep the section/card styles; they render inside `CollapsibleScreen`'s padded body.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/profile-theme-toggle.test.tsx`
Expected: PASS (title + existing assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/app/(tabs)/profile.tsx apps/pharmopedia/src/__tests__/profile-theme-toggle.test.tsx
git commit -m "feat(pharmopedia): Profile header + coach-mark sequencing + offline banner"
```

---

## Task 11: Finalize — full suite, typechecks, baseline comparison

**Files:** none (verification only)

- [ ] **Step 1: Run the full Pharmopedia test suite**

Run: `pnpm --filter @ultranos/pharmopedia test 2>&1 | grep -E "Test Files|Tests "`
Expected: more suites pass than before E2 (the previously-broken screen suites that were retrofitted now pass). Record the counts. Any still-failing suite must be a screen NOT touched by E2 (e.g. `login-screen`, `register-screen`, `clinical-tab-extended`, `drug-detail-i18n`, `formulary-tab`, `share-button`) — those load now (harness fixed) but may still fail on stale assertions; note them as pre-existing-content failures for E5/E6, not E2 regressions.

- [ ] **Step 2: Verify ui-native unaffected**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native 2>&1 | grep -E "Test Files|Tests "`
Expected: 12 files / 41 tests pass (E1's 10 files/36 + CollapsibleList 3 + CollapsibleScreen 2).

- [ ] **Step 3: Typechecks**

Run: `pnpm --filter @ultranos/ui-kit typecheck >/dev/null 2>&1 && echo UIKIT_PASS; pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -c "native/"`
Expected: `UIKIT_PASS` and native error count `0`.

- [ ] **Step 4: Commit (if any verification-driven fixes were needed)**

```bash
git add -A
git commit -m "chore(pharmopedia): E2 app shell & IA complete"
```

---

## Self-Review

**Spec coverage (E2 spec §3–§6):**
- §3.1 harness fix → Task 1 (`__DEV__` define + Expo mocks + Animated mock extension). ✓
- §3.2 provider wiring → Task 2. ✓
- §3.3 collapsible components → Tasks 3 (parts), 4 (List), 5 (Screen). ✓
- §3.4 retrofits: Search → Task 7, Saved → Task 8, Browse → Task 9, Profile → Task 10. ✓
- §3.5 bug fixes: Saved/Browse SafeArea (Tasks 8/9 — content now inside `CollapsibleList`), Browse Android back (Task 9 BackHandler), Profile coach-mark sequencing + offline banner (Task 10). ✓
- New i18n key `saved.browseCta` → Task 6. ✓
- §4 testing: new component tests (Tasks 4,5), retrofitted screen tests (Tasks 7–10), harness (Task 1), finalize (Task 11). ✓
- §6 success criteria → Task 11. ✓

**Placeholder scan:** Every code/test step has complete code; every run step has an expected result. Task 1 Step 5 and Task 11 Step 1 are inherently discovery/verification steps but specify exactly what to do and the acceptance condition. ✓

**Type consistency:** `CollapsibleList`/`CollapsibleScreen` prop names match between component, tests, and screen usages; `useScrollY`/`LargeTitle`/`CompactBar`/`LARGE_TITLE_HEIGHT` defined in Task 3 and consumed in Tasks 4–5; `saved.browseCta` defined in Task 6 and used in Task 8; `EmptyState`/`CollapsibleList` imported from `@ultranos/ui-kit/native` (E1/E2 barrel). ✓

**Known risk carried from spec:** the collapse animation uses native-driver `Animated` interpolation that can't be exercised under the mocked `Animated`; tests assert structure/content only. Visual/scroll behavior must be validated by running the app (Task 11 does not cover it). Flagged for manual verification.
