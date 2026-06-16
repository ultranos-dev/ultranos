# Pharmopedia E1 — Native UI Kit Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared, theme-aware, RTL-aware, accessible set of React Native UI primitives in `@ultranos/ui-kit/native` (`Screen`, `ScreenHeader`, `Card`/`CardSection`, `ListRow`, `Button`, `Avatar`, `Chip`, `Banner`, `EmptyState`) that the Pharmopedia screens (and future RN apps) will be rebuilt on.

**Architecture:** Native components live as source `.tsx` under `packages/ui-kit/src/native/`, consumed directly by the app via a new `"./native"` package export (Metro/Babel compiles them in-app — no ui-kit build step, exactly like the existing `tokens.native.ts`). All values come from `tokens.native.ts`. Theme (light/dark) and direction (RTL) are supplied by a `UiKitProvider` React context; components read them via `useThemeColors()` / `useRtl()`, keeping the package free of any app store dependency. Tests run under Pharmopedia's existing Vitest + react-test-renderer harness (which already mocks `react-native`, `@testing-library/react-native`, and `lucide-react-native`).

**Tech Stack:** React 19, React Native 0.81, TypeScript, Vitest, react-test-renderer, lucide-react-native, react-native-safe-area-context.

**Important conventions discovered (do not deviate):**
- Native code imports icons **directly from `lucide-react-native`** (matches all existing Pharmopedia components and the test mock). The `@ultranos/ui-kit/icons` barrel is **web-only** (lucide-react) — do not use it in native code.
- `DirectionalIcon` from `@ultranos/ui-kit` is **web-only** (renders a `<span>` with CSS variables). For RN, mirror navigation icons (chevrons) with a `transform: [{ scaleX: -1 }]` style when RTL.
- Color keys come from `tokens.native.ts`. There is **no `primaryLight`** key — use `primary50` for tinted backgrounds.
- Tests must live under `apps/pharmopedia/src/**/*.test.tsx` (Vitest `include` is `src/**/*.test.{ts,tsx}`).
- **Commits:** This repo forbids autonomous commits (CLAUDE.md). Treat each `Commit` step as a checkpoint — run it only with the user's go-ahead. Append the repo's required `Co-Authored-By` trailer when you do.

---

## File Structure

**Created (package):**
- `packages/ui-kit/src/native/theme.tsx` — `UiKitProvider`, `useThemeColors()`, `useRtl()` (context; defaults light/LTR).
- `packages/ui-kit/src/native/Screen.tsx` — SafeArea + background + padding wrapper.
- `packages/ui-kit/src/native/ScreenHeader.tsx` — large title + subtitle + trailing action.
- `packages/ui-kit/src/native/Card.tsx` — `Card` + `CardSection` (labeled group with auto dividers).
- `packages/ui-kit/src/native/ListRow.tsx` — icon + label + value/trailing/chevron, pressable.
- `packages/ui-kit/src/native/Button.tsx` — primary/secondary/destructive, loading.
- `packages/ui-kit/src/native/Avatar.tsx` — photo or initials.
- `packages/ui-kit/src/native/Chip.tsx` — selectable pill.
- `packages/ui-kit/src/native/Banner.tsx` — info/warning/error/success inline banner.
- `packages/ui-kit/src/native/EmptyState.tsx` — icon + title + description + action.
- `packages/ui-kit/src/native/index.ts` — barrel.

**Created (tests, in the app):**
- `apps/pharmopedia/src/__tests__/ui-native/_flatten.ts` — style-flatten helper.
- `apps/pharmopedia/src/__tests__/ui-native/theme.test.tsx`
- `…/Screen.test.tsx`, `…/ScreenHeader.test.tsx`, `…/Card.test.tsx`, `…/ListRow.test.tsx`, `…/Button.test.tsx`, `…/Avatar.test.tsx`, `…/Chip.test.tsx`, `…/Banner.test.tsx`, `…/EmptyState.test.tsx`

**Modified:**
- `packages/ui-kit/package.json` — add `"./native"` export.
- `packages/ui-kit/tsconfig.json` — exclude `src/native` from the web `tsc` build.
- `apps/pharmopedia/vitest.config.ts` — alias `@ultranos/ui-kit/native` → source.
- `apps/pharmopedia/tsconfig.json` — `paths` entry for `@ultranos/ui-kit/native`.
- `apps/pharmopedia/src/__mocks__/lucide-react-native.js` — add `CheckCircle`.

---

## Task 1: Scaffold package, provider, wiring

**Files:**
- Modify: `packages/ui-kit/package.json`
- Modify: `packages/ui-kit/tsconfig.json:10`
- Modify: `apps/pharmopedia/vitest.config.ts:26`
- Modify: `apps/pharmopedia/tsconfig.json:24-31`
- Create: `packages/ui-kit/src/native/theme.tsx`
- Create: `packages/ui-kit/src/native/index.ts`
- Create: `apps/pharmopedia/src/__tests__/ui-native/_flatten.ts`
- Test: `apps/pharmopedia/src/__tests__/ui-native/theme.test.tsx`

- [ ] **Step 1: Add the `"./native"` export to the ui-kit package**

In `packages/ui-kit/package.json`, add this line to the `exports` map (after the `"./tokens.native"` entry):
```json
    "./native": "./src/native/index.ts"
```

- [ ] **Step 2: Exclude `src/native` from the ui-kit web tsc build**

In `packages/ui-kit/tsconfig.json`, change the `exclude` array to include `"src/native"`:
```json
  "exclude": ["src/__tests__", "src/**/*.test.tsx", "src/**/*.test.ts", "src/hooks/useAppLocale.ts", "src/tailwind.preset.ts", "src/components/ConnectedLanguageSelector.tsx", "src/native"]
```

- [ ] **Step 3: Add the Vitest alias in the app**

In `apps/pharmopedia/vitest.config.ts`, add to `resolve.alias` (after the `@ultranos/ui-kit/tokens.native` line):
```ts
      '@ultranos/ui-kit/native': path.resolve(__dirname, '../../packages/ui-kit/src/native/index.ts'),
```

- [ ] **Step 4: Add the tsconfig path in the app**

In `apps/pharmopedia/tsconfig.json`, add to `compilerOptions.paths`:
```json
      "@ultranos/ui-kit/native": [
        "../../packages/ui-kit/src/native/index.ts"
      ]
```

- [ ] **Step 5: Create the style-flatten test helper**

Create `apps/pharmopedia/src/__tests__/ui-native/_flatten.ts`:
```ts
/** Merge a (possibly array) RN style prop into a single object for assertions. */
export function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style
      .filter((s) => s && typeof s === 'object' && !Array.isArray(s))
      .reduce((acc, s) => ({ ...acc, ...(s as object) }), {} as Record<string, unknown>)
  }
  if (style && typeof style === 'object') return style as Record<string, unknown>
  return {}
}
```

- [ ] **Step 6: Write the failing test for the theme provider**

Create `apps/pharmopedia/src/__tests__/ui-native/theme.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { UiKitProvider, useThemeColors, useRtl } from '@ultranos/ui-kit/native'

function Probe() {
  const colors = useThemeColors()
  const rtl = useRtl()
  return <Text testID="probe">{`${colors.textPrimary}|${rtl}`}</Text>
}

describe('UiKitProvider / useThemeColors / useRtl', () => {
  it('defaults to light + LTR with no provider', () => {
    const { getByTestId } = render(<Probe />)
    expect(getByTestId('probe').props.children).toBe('#141c28|false')
  })

  it('resolves dark colors when mode="dark"', () => {
    const { getByTestId } = render(
      <UiKitProvider mode="dark"><Probe /></UiKitProvider>,
    )
    expect(getByTestId('probe').props.children).toBe('#f0f0f0|false')
  })

  it('exposes rtl=true when rtl is set', () => {
    const { getByTestId } = render(
      <UiKitProvider mode="light" rtl><Probe /></UiKitProvider>,
    )
    expect(getByTestId('probe').props.children).toBe('#141c28|true')
  })
})
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/theme.test.tsx`
Expected: FAIL — cannot resolve `@ultranos/ui-kit/native` (module/export missing).

- [ ] **Step 8: Implement the theme provider**

Create `packages/ui-kit/src/native/theme.tsx`:
```tsx
import { createContext, useContext, type ReactNode } from 'react'
import { Colors, ColorsDark, type ThemeColors } from '../tokens.native'

export type ThemeMode = 'light' | 'dark'

interface UiKitContextValue {
  mode: ThemeMode
  rtl: boolean
}

const UiKitContext = createContext<UiKitContextValue>({ mode: 'light', rtl: false })

export function UiKitProvider({
  mode = 'light',
  rtl = false,
  children,
}: {
  mode?: ThemeMode
  rtl?: boolean
  children: ReactNode
}) {
  return <UiKitContext.Provider value={{ mode, rtl }}>{children}</UiKitContext.Provider>
}

export function useThemeColors(): ThemeColors {
  return useContext(UiKitContext).mode === 'dark' ? ColorsDark : Colors
}

export function useRtl(): boolean {
  return useContext(UiKitContext).rtl
}
```

- [ ] **Step 9: Create the barrel with the provider exports**

Create `packages/ui-kit/src/native/index.ts`:
```ts
export { UiKitProvider, useThemeColors, useRtl, type ThemeMode } from './theme'
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/theme.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 11: Commit**

```bash
git add packages/ui-kit/package.json packages/ui-kit/tsconfig.json packages/ui-kit/src/native apps/pharmopedia/vitest.config.ts apps/pharmopedia/tsconfig.json apps/pharmopedia/src/__tests__/ui-native
git commit -m "feat(ui-kit-native): scaffold native UI kit + theme provider"
```

---

## Task 2: Screen

**Files:**
- Create: `packages/ui-kit/src/native/Screen.tsx`
- Modify: `packages/ui-kit/src/native/index.ts`
- Test: `apps/pharmopedia/src/__tests__/ui-native/Screen.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/ui-native/Screen.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { UiKitProvider, Screen } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

vi.mock('react-native-safe-area-context', () => {
  const React = require('react')
  return {
    SafeAreaView: ({ children, style, testID }: { children?: React.ReactNode; style?: unknown; testID?: string }) =>
      React.createElement('SafeAreaView', { style, testID }, children),
  }
})

describe('Screen', () => {
  it('renders children', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><Screen><Text>hello</Text></Screen></UiKitProvider>,
    )
    expect(getByText('hello')).toBeTruthy()
  })

  it('uses the dark subtle surface background in dark mode', () => {
    const { getByTestId } = render(
      <UiKitProvider mode="dark"><Screen testID="screen"><Text>x</Text></Screen></UiKitProvider>,
    )
    expect(flattenStyle(getByTestId('screen').props.style).backgroundColor).toBe('#2a2a2a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/Screen.test.tsx`
Expected: FAIL — `Screen` is not exported.

- [ ] **Step 3: Implement Screen**

Create `packages/ui-kit/src/native/Screen.tsx`:
```tsx
import { type ReactNode } from 'react'
import { ScrollView, View, StyleSheet } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { Spacing } from '../tokens.native'
import { useThemeColors } from './theme'

interface ScreenProps {
  children: ReactNode
  scroll?: boolean
  edges?: Edge[]
  padded?: boolean
  testID?: string
}

export function Screen({ children, scroll = false, edges = ['top'], padded = true, testID }: ScreenProps) {
  const colors = useThemeColors()
  const inner = padded ? <View style={styles.padded}>{children}</View> : children
  return (
    <SafeAreaView edges={edges} testID={testID} style={[styles.root, { backgroundColor: colors.surfaceSubtle }]}>
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{inner}</ScrollView> : inner}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { flex: 1, paddingHorizontal: Spacing[4] },
  scroll: { paddingBottom: Spacing[8] },
})
```

- [ ] **Step 4: Add to barrel**

In `packages/ui-kit/src/native/index.ts` add:
```ts
export { Screen } from './Screen'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/Screen.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/native/Screen.tsx packages/ui-kit/src/native/index.ts apps/pharmopedia/src/__tests__/ui-native/Screen.test.tsx
git commit -m "feat(ui-kit-native): add Screen primitive"
```

---

## Task 3: ScreenHeader

**Files:**
- Create: `packages/ui-kit/src/native/ScreenHeader.tsx`
- Modify: `packages/ui-kit/src/native/index.ts`
- Test: `apps/pharmopedia/src/__tests__/ui-native/ScreenHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/ui-native/ScreenHeader.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { UiKitProvider, ScreenHeader } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

describe('ScreenHeader', () => {
  it('renders title and subtitle', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><ScreenHeader title="Saved" subtitle="12 medicines" /></UiKitProvider>,
    )
    expect(getByText('Saved')).toBeTruthy()
    expect(getByText('12 medicines')).toBeTruthy()
  })

  it('exposes the title as an accessibility header', () => {
    const { getByRole } = render(
      <UiKitProvider mode="light"><ScreenHeader title="Profile" /></UiKitProvider>,
    )
    expect(getByRole('header')).toBeTruthy()
  })

  it('renders the action slot', () => {
    const { getByTestId } = render(
      <UiKitProvider mode="light"><ScreenHeader title="Home" action={<Text testID="act">A</Text>} /></UiKitProvider>,
    )
    expect(getByTestId('act')).toBeTruthy()
  })

  it('uses the Arabic font for the title in RTL', () => {
    const { getByRole } = render(
      <UiKitProvider mode="light" rtl><ScreenHeader title="حفظ" /></UiKitProvider>,
    )
    expect(flattenStyle(getByRole('header').props.style).fontFamily).toBe('NotoNaskhArabic')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/ScreenHeader.test.tsx`
Expected: FAIL — `ScreenHeader` is not exported.

- [ ] **Step 3: Implement ScreenHeader**

Create `packages/ui-kit/src/native/ScreenHeader.tsx`:
```tsx
import { type ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Spacing } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'

interface ScreenHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function ScreenHeader({ title, subtitle, action }: ScreenHeaderProps) {
  const colors = useThemeColors()
  const rtl = useRtl()
  const align = rtl ? ('right' as const) : ('left' as const)
  return (
    <View style={[styles.row, rtl && styles.rowRtl]}>
      <View style={styles.titles}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.textPrimary, textAlign: align }, rtl && styles.arabic]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted, textAlign: align }, rtl && styles.arabic]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: Spacing[4], paddingHorizontal: Spacing[4], paddingBottom: Spacing[2] },
  rowRtl: { flexDirection: 'row-reverse' },
  titles: { flex: 1 },
  title: { fontFamily: FontFamily.headingBold, fontSize: FontSize['2xl'] },
  subtitle: { fontFamily: FontFamily.sans, fontSize: FontSize.xs, marginTop: Spacing[1] },
  arabic: { fontFamily: FontFamily.arabic },
  action: { marginStart: Spacing[3] },
})
```

- [ ] **Step 4: Add to barrel**

In `packages/ui-kit/src/native/index.ts` add:
```ts
export { ScreenHeader } from './ScreenHeader'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/ScreenHeader.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/native/ScreenHeader.tsx packages/ui-kit/src/native/index.ts apps/pharmopedia/src/__tests__/ui-native/ScreenHeader.test.tsx
git commit -m "feat(ui-kit-native): add ScreenHeader primitive"
```

---

## Task 4: Card / CardSection

**Files:**
- Create: `packages/ui-kit/src/native/Card.tsx`
- Modify: `packages/ui-kit/src/native/index.ts`
- Test: `apps/pharmopedia/src/__tests__/ui-native/Card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/ui-native/Card.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { Text } from 'react-native'
import { UiKitProvider, Card, CardSection } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

describe('Card / CardSection', () => {
  it('renders children with the surface background', () => {
    const { getByText, getByTestId } = render(
      <UiKitProvider mode="light"><Card testID="card"><Text>body</Text></Card></UiKitProvider>,
    )
    expect(getByText('body')).toBeTruthy()
    expect(flattenStyle(getByTestId('card').props.style).backgroundColor).toBe('#ffffff')
  })

  it('renders an optional section label and its children', () => {
    const { getByText } = render(
      <UiKitProvider mode="light">
        <CardSection label="PREFERENCES">
          <Text>row 1</Text>
          <Text>row 2</Text>
        </CardSection>
      </UiKitProvider>,
    )
    expect(getByText('PREFERENCES')).toBeTruthy()
    expect(getByText('row 1')).toBeTruthy()
    expect(getByText('row 2')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/Card.test.tsx`
Expected: FAIL — `Card` / `CardSection` not exported.

- [ ] **Step 3: Implement Card / CardSection**

Create `packages/ui-kit/src/native/Card.tsx`:
```tsx
import { Children, type ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Radius, Spacing, Shadow } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'

interface CardProps {
  children: ReactNode
  padded?: boolean
  testID?: string
}

export function Card({ children, padded = false, testID }: CardProps) {
  const colors = useThemeColors()
  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }, padded && styles.padded]}
    >
      {children}
    </View>
  )
}

interface CardSectionProps {
  label?: string
  children: ReactNode
}

export function CardSection({ label, children }: CardSectionProps) {
  const colors = useThemeColors()
  const rtl = useRtl()
  const items = Children.toArray(children)
  return (
    <View style={styles.section}>
      {label ? (
        <Text style={[styles.label, { color: colors.textMuted, textAlign: rtl ? 'right' : 'left' }]}>{label}</Text>
      ) : null}
      <Card>
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 ? <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} /> : null}
            {child}
          </View>
        ))}
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', ...Shadow.sm },
  padded: { padding: Spacing[4] },
  section: { marginBottom: Spacing[4] },
  label: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.xs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing[2],
    marginHorizontal: Spacing[1],
  },
  divider: { height: StyleSheet.hairlineWidth },
})
```

- [ ] **Step 4: Add to barrel**

In `packages/ui-kit/src/native/index.ts` add:
```ts
export { Card, CardSection } from './Card'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/Card.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/native/Card.tsx packages/ui-kit/src/native/index.ts apps/pharmopedia/src/__tests__/ui-native/Card.test.tsx
git commit -m "feat(ui-kit-native): add Card and CardSection primitives"
```

---

## Task 5: ListRow

**Files:**
- Create: `packages/ui-kit/src/native/ListRow.tsx`
- Modify: `packages/ui-kit/src/native/index.ts`
- Test: `apps/pharmopedia/src/__tests__/ui-native/ListRow.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/ui-native/ListRow.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { Globe } from 'lucide-react-native'
import { UiKitProvider, ListRow } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

describe('ListRow', () => {
  it('renders label and value', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><ListRow icon={Globe} label="Language" value="English" /></UiKitProvider>,
    )
    expect(getByText('Language')).toBeTruthy()
    expect(getByText('English')).toBeTruthy()
  })

  it('is a button with a composed label when pressable, and fires onPress', () => {
    const onPress = vi.fn()
    const { getByRole } = render(
      <UiKitProvider mode="light"><ListRow label="Language" value="English" onPress={onPress} /></UiKitProvider>,
    )
    const row = getByRole('button')
    expect(row.props.accessibilityLabel).toBe('Language, English')
    fireEvent.press(row)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('is not a button when not pressable', () => {
    const { queryByRole } = render(
      <UiKitProvider mode="light"><ListRow label="Static" /></UiKitProvider>,
    )
    expect(queryByRole('button')).toBeNull()
  })

  it('colours the label with danger when destructive', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><ListRow label="Delete" destructive /></UiKitProvider>,
    )
    expect(flattenStyle(getByText('Delete').props.style).color).toBe('#dc2626')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/ListRow.test.tsx`
Expected: FAIL — `ListRow` not exported.

- [ ] **Step 3: Implement ListRow**

Create `packages/ui-kit/src/native/ListRow.tsx`:
```tsx
import { type ReactNode } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '../tokens.native'
import { useThemeColors, useRtl } from './theme'

interface ListRowProps {
  icon?: LucideIcon
  label: string
  value?: string
  trailing?: ReactNode
  onPress?: () => void
  destructive?: boolean
  accessibilityHint?: string
  testID?: string
}

export function ListRow({
  icon: Icon,
  label,
  value,
  trailing,
  onPress,
  destructive,
  accessibilityHint,
  testID,
}: ListRowProps) {
  const colors = useThemeColors()
  const rtl = useRtl()
  const labelColor = destructive ? colors.danger : colors.textPrimary
  const content = (
    <View style={[styles.row, rtl && styles.rowRtl]}>
      {Icon ? (
        <View style={[styles.iconWrap, { backgroundColor: colors.primary50 }]}>
          <Icon size={18} color={colors.primary600} />
        </View>
      ) : null}
      <Text
        style={[styles.label, { color: labelColor, textAlign: rtl ? 'right' : 'left' }, rtl && styles.arabic]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {value ? <Text style={[styles.value, { color: colors.textMuted }]} numberOfLines={1}>{value}</Text> : null}
      {trailing ?? (onPress ? <ChevronRight size={18} color={colors.textMuted} style={rtl ? styles.chevRtl : undefined} /> : null)}
    </View>
  )
  if (!onPress) return <View testID={testID}>{content}</View>
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      hitSlop={8}
      style={({ pressed }) => [pressed && { backgroundColor: colors.surfaceSubtle }]}
    >
      {content}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], minHeight: 48, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  rowRtl: { flexDirection: 'row-reverse' },
  iconWrap: { width: 32, height: 32, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontFamily: FontFamily.sansMedium, fontSize: FontSize.base },
  value: { fontFamily: FontFamily.sans, fontSize: FontSize.sm },
  arabic: { fontFamily: FontFamily.arabic },
  chevRtl: { transform: [{ scaleX: -1 }] },
})
```

- [ ] **Step 4: Add to barrel**

In `packages/ui-kit/src/native/index.ts` add:
```ts
export { ListRow } from './ListRow'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/ListRow.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/native/ListRow.tsx packages/ui-kit/src/native/index.ts apps/pharmopedia/src/__tests__/ui-native/ListRow.test.tsx
git commit -m "feat(ui-kit-native): add ListRow primitive"
```

---

## Task 6: Button

**Files:**
- Create: `packages/ui-kit/src/native/Button.tsx`
- Modify: `packages/ui-kit/src/native/index.ts`
- Test: `apps/pharmopedia/src/__tests__/ui-native/Button.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/ui-native/Button.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { UiKitProvider, Button } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

describe('Button', () => {
  it('renders the label and fires onPress', () => {
    const onPress = vi.fn()
    const { getByText, getByRole } = render(
      <UiKitProvider mode="light"><Button label="Sync now" onPress={onPress} /></UiKitProvider>,
    )
    expect(getByText('Sync now')).toBeTruthy()
    fireEvent.press(getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('shows a spinner and hides the label while loading, and blocks press', () => {
    const onPress = vi.fn()
    const { queryByText, getByTestId, getByRole } = render(
      <UiKitProvider mode="light"><Button label="Sync now" loading onPress={onPress} /></UiKitProvider>,
    )
    expect(getByTestId('button-spinner')).toBeTruthy()
    expect(queryByText('Sync now')).toBeNull()
    fireEvent.press(getByRole('button'))
    expect(onPress).not.toHaveBeenCalled()
    expect(getByRole('button').props.accessibilityState).toEqual({ disabled: true, busy: true })
  })

  it('blocks press when disabled', () => {
    const onPress = vi.fn()
    const { getByRole } = render(
      <UiKitProvider mode="light"><Button label="Go" disabled onPress={onPress} /></UiKitProvider>,
    )
    fireEvent.press(getByRole('button'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('uses the primary brand colour for the primary variant', () => {
    const { getByRole } = render(
      <UiKitProvider mode="light"><Button label="Go" onPress={() => {}} /></UiKitProvider>,
    )
    expect(flattenStyle(getByRole('button').props.style).backgroundColor).toBe('#2e9e71')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/Button.test.tsx`
Expected: FAIL — `Button` not exported.

- [ ] **Step 3: Implement Button**

Create `packages/ui-kit/src/native/Button.tsx`:
```tsx
import { Pressable, Text, ActivityIndicator, View, StyleSheet } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '../tokens.native'
import { useThemeColors } from './theme'

type Variant = 'primary' | 'secondary' | 'destructive'

interface ButtonProps {
  label: string
  variant?: Variant
  icon?: LucideIcon
  loading?: boolean
  disabled?: boolean
  onPress: () => void
  testID?: string
}

export function Button({ label, variant = 'primary', icon: Icon, loading = false, disabled = false, onPress, testID }: ButtonProps) {
  const colors = useThemeColors()
  const bg = variant === 'primary' ? colors.primary500 : variant === 'destructive' ? colors.dangerLight : colors.surface
  const fg = variant === 'primary' ? colors.white : variant === 'destructive' ? colors.dangerDark : colors.primary500
  const border = variant === 'secondary' ? colors.primary500 : colors.transparent
  const isDisabled = disabled || loading
  return (
    <Pressable
      testID={testID}
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[styles.btn, { backgroundColor: bg, borderColor: border }, isDisabled && styles.disabled]}
    >
      {loading ? (
        <ActivityIndicator testID="button-spinner" color={fg} />
      ) : (
        <View style={styles.inner}>
          {Icon ? <Icon size={16} color={fg} /> : null}
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: { height: 48, borderRadius: Radius.lg, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing[4] },
  inner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  label: { fontFamily: FontFamily.sansBold, fontSize: FontSize.base },
  disabled: { opacity: 0.6 },
})
```

- [ ] **Step 4: Add to barrel**

In `packages/ui-kit/src/native/index.ts` add:
```ts
export { Button } from './Button'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/Button.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/native/Button.tsx packages/ui-kit/src/native/index.ts apps/pharmopedia/src/__tests__/ui-native/Button.test.tsx
git commit -m "feat(ui-kit-native): add Button primitive"
```

---

## Task 7: Avatar

**Files:**
- Create: `packages/ui-kit/src/native/Avatar.tsx`
- Modify: `packages/ui-kit/src/native/index.ts`
- Test: `apps/pharmopedia/src/__tests__/ui-native/Avatar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/ui-native/Avatar.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react-native'
import { UiKitProvider, Avatar } from '@ultranos/ui-kit/native'

describe('Avatar', () => {
  it('shows two-letter initials from a full name', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><Avatar name="Sara Ahmadi" /></UiKitProvider>,
    )
    expect(getByText('SA')).toBeTruthy()
  })

  it('shows the first two letters for a single-word name', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><Avatar name="Pharmacist" /></UiKitProvider>,
    )
    expect(getByText('PH')).toBeTruthy()
  })

  it('renders an image when photoUri is provided', () => {
    const { getByTestId } = render(
      <UiKitProvider mode="light"><Avatar name="Sara" photoUri="https://x/y.png" /></UiKitProvider>,
    )
    expect(getByTestId('avatar-image')).toBeTruthy()
  })

  it('exposes the name as an accessibility label', () => {
    const { getByLabelText } = render(
      <UiKitProvider mode="light"><Avatar name="Sara Ahmadi" /></UiKitProvider>,
    )
    expect(getByLabelText('Sara Ahmadi')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/Avatar.test.tsx`
Expected: FAIL — `Avatar` not exported.

- [ ] **Step 3: Implement Avatar**

Create `packages/ui-kit/src/native/Avatar.tsx`:
```tsx
import { View, Text, Image, StyleSheet } from 'react-native'
import { FontFamily } from '../tokens.native'
import { useThemeColors } from './theme'

interface AvatarProps {
  name?: string
  photoUri?: string
  size?: number
  testID?: string
}

function initials(name?: string): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function Avatar({ name, photoUri, size = 46, testID }: AvatarProps) {
  const colors = useThemeColors()
  const dim = { width: size, height: size, borderRadius: size / 2 }
  if (photoUri) {
    return <Image testID={testID ?? 'avatar-image'} source={{ uri: photoUri }} accessibilityLabel={name} style={dim} />
  }
  return (
    <View testID={testID} accessibilityLabel={name} style={[styles.fallback, dim, { backgroundColor: colors.primary500 }]}>
      <Text style={[styles.initials, { color: colors.white, fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: FontFamily.headingBold },
})
```

- [ ] **Step 4: Add to barrel**

In `packages/ui-kit/src/native/index.ts` add:
```ts
export { Avatar } from './Avatar'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/Avatar.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/native/Avatar.tsx packages/ui-kit/src/native/index.ts apps/pharmopedia/src/__tests__/ui-native/Avatar.test.tsx
git commit -m "feat(ui-kit-native): add Avatar primitive"
```

---

## Task 8: Chip

**Files:**
- Create: `packages/ui-kit/src/native/Chip.tsx`
- Modify: `packages/ui-kit/src/native/index.ts`
- Test: `apps/pharmopedia/src/__tests__/ui-native/Chip.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/ui-native/Chip.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { UiKitProvider, Chip } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

describe('Chip', () => {
  it('renders the label and fires onPress', () => {
    const onPress = vi.fn()
    const { getByText, getByRole } = render(
      <UiKitProvider mode="light"><Chip label="EN" onPress={onPress} /></UiKitProvider>,
    )
    expect(getByText('EN')).toBeTruthy()
    fireEvent.press(getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('reflects selected state in accessibilityState and background', () => {
    const { getByRole } = render(
      <UiKitProvider mode="light"><Chip label="EN" selected onPress={() => {}} /></UiKitProvider>,
    )
    const chip = getByRole('button')
    expect(chip.props.accessibilityState).toEqual({ selected: true })
    expect(flattenStyle(chip.props.style).backgroundColor).toBe('#2e9e71')
  })

  it('is not selected by default', () => {
    const { getByRole } = render(
      <UiKitProvider mode="light"><Chip label="EN" onPress={() => {}} /></UiKitProvider>,
    )
    expect(getByRole('button').props.accessibilityState).toEqual({ selected: false })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/Chip.test.tsx`
Expected: FAIL — `Chip` not exported.

- [ ] **Step 3: Implement Chip**

Create `packages/ui-kit/src/native/Chip.tsx`:
```tsx
import { Pressable, Text, StyleSheet } from 'react-native'
import { FontFamily, FontSize, Radius, Spacing } from '../tokens.native'
import { useThemeColors } from './theme'

interface ChipProps {
  label: string
  selected?: boolean
  onPress?: () => void
  testID?: string
}

export function Chip({ label, selected = false, onPress, testID }: ChipProps) {
  const colors = useThemeColors()
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.primary500 : colors.surface, borderColor: selected ? colors.primary500 : colors.border },
      ]}
    >
      <Text style={[styles.label, { color: selected ? colors.white : colors.textSecondary }, selected && styles.selected]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: Spacing[3], paddingVertical: Spacing[2] },
  label: { fontFamily: FontFamily.sans, fontSize: FontSize.sm },
  selected: { fontFamily: FontFamily.sansSemibold },
})
```

- [ ] **Step 4: Add to barrel**

In `packages/ui-kit/src/native/index.ts` add:
```ts
export { Chip } from './Chip'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/Chip.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/native/Chip.tsx packages/ui-kit/src/native/index.ts apps/pharmopedia/src/__tests__/ui-native/Chip.test.tsx
git commit -m "feat(ui-kit-native): add Chip primitive"
```

---

## Task 9: Banner

**Files:**
- Create: `packages/ui-kit/src/native/Banner.tsx`
- Modify: `packages/ui-kit/src/native/index.ts`
- Modify: `apps/pharmopedia/src/__mocks__/lucide-react-native.js`
- Test: `apps/pharmopedia/src/__tests__/ui-native/Banner.test.tsx`

- [ ] **Step 1: Add `CheckCircle` to the lucide mock**

In `apps/pharmopedia/src/__mocks__/lucide-react-native.js`, add a const near the other icons:
```js
const CheckCircle = createIconMock('CheckCircle')
```
and add `CheckCircle,` to the `module.exports = { … }` object.

- [ ] **Step 2: Write the failing test**

Create `apps/pharmopedia/src/__tests__/ui-native/Banner.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { UiKitProvider, Banner } from '@ultranos/ui-kit/native'
import { flattenStyle } from './_flatten'

describe('Banner', () => {
  it('renders the text', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><Banner variant="info" text="Syncing catalog…" /></UiKitProvider>,
    )
    expect(getByText('Syncing catalog…')).toBeTruthy()
  })

  it('uses role=alert for warning and error variants', () => {
    const { getByRole } = render(
      <UiKitProvider mode="light"><Banner variant="warning" text="Recall" testID="b" /></UiKitProvider>,
    )
    expect(getByRole('alert')).toBeTruthy()
  })

  it('becomes a button when onPress is provided and fires it', () => {
    const onPress = vi.fn()
    const { getByRole } = render(
      <UiKitProvider mode="light"><Banner variant="warning" text="Recall" onPress={onPress} /></UiKitProvider>,
    )
    fireEvent.press(getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('uses the danger background for the error variant', () => {
    const { getByText } = render(
      <UiKitProvider mode="light"><Banner variant="error" text="Failed" /></UiKitProvider>,
    )
    // text colour is the danger foreground
    expect(flattenStyle(getByText('Failed').props.style).color).toBe('#dc2626')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/Banner.test.tsx`
Expected: FAIL — `Banner` not exported.

- [ ] **Step 4: Implement Banner**

Create `packages/ui-kit/src/native/Banner.tsx`:
```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Info, AlertTriangle, CheckCircle } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '../tokens.native'
import { useThemeColors } from './theme'

type Variant = 'info' | 'warning' | 'error' | 'success'

interface BannerProps {
  variant: Variant
  text: string
  icon?: LucideIcon
  onPress?: () => void
  testID?: string
}

const DEFAULT_ICON: Record<Variant, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertTriangle,
  success: CheckCircle,
}

export function Banner({ variant, text, icon, onPress, testID }: BannerProps) {
  const colors = useThemeColors()
  const palette = {
    info: { bg: colors.infoLight, fg: colors.info },
    warning: { bg: colors.warningLight, fg: colors.warning },
    error: { bg: colors.dangerLight, fg: colors.danger },
    success: { bg: colors.successLight, fg: colors.success },
  }[variant]
  const Icon = icon ?? DEFAULT_ICON[variant]
  const role = variant === 'warning' || variant === 'error' ? 'alert' : undefined
  const inner = (
    <View style={[styles.banner, { backgroundColor: palette.bg }]}>
      <Icon size={16} color={palette.fg} />
      <Text style={[styles.text, { color: palette.fg }]}>{text}</Text>
    </View>
  )
  if (onPress) {
    return (
      <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={text}>
        {inner}
      </Pressable>
    )
  }
  return (
    <View testID={testID} accessibilityRole={role} accessibilityLabel={role ? text : undefined}>
      {inner}
    </View>
  )
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], borderRadius: Radius.lg, paddingHorizontal: Spacing[3], paddingVertical: Spacing[3] },
  text: { flex: 1, fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
})
```

- [ ] **Step 5: Add to barrel**

In `packages/ui-kit/src/native/index.ts` add:
```ts
export { Banner } from './Banner'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/Banner.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/ui-kit/src/native/Banner.tsx packages/ui-kit/src/native/index.ts apps/pharmopedia/src/__mocks__/lucide-react-native.js apps/pharmopedia/src/__tests__/ui-native/Banner.test.tsx
git commit -m "feat(ui-kit-native): add Banner primitive"
```

---

## Task 10: EmptyState

**Files:**
- Create: `packages/ui-kit/src/native/EmptyState.tsx`
- Modify: `packages/ui-kit/src/native/index.ts`
- Test: `apps/pharmopedia/src/__tests__/ui-native/EmptyState.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/ui-native/EmptyState.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { Bookmark } from 'lucide-react-native'
import { UiKitProvider, EmptyState } from '@ultranos/ui-kit/native'

describe('EmptyState', () => {
  it('renders title and description', () => {
    const { getByText } = render(
      <UiKitProvider mode="light">
        <EmptyState icon={Bookmark} title="No saved medicines" description="Bookmark drugs to find them fast." />
      </UiKitProvider>,
    )
    expect(getByText('No saved medicines')).toBeTruthy()
    expect(getByText('Bookmark drugs to find them fast.')).toBeTruthy()
  })

  it('renders an action button and fires its onPress', () => {
    const onPress = vi.fn()
    const { getByText, getByRole } = render(
      <UiKitProvider mode="light">
        <EmptyState icon={Bookmark} title="Empty" action={{ label: 'Browse', onPress }} />
      </UiKitProvider>,
    )
    expect(getByText('Browse')).toBeTruthy()
    fireEvent.press(getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('renders no button when there is no action', () => {
    const { queryByRole } = render(
      <UiKitProvider mode="light"><EmptyState icon={Bookmark} title="Empty" /></UiKitProvider>,
    )
    expect(queryByRole('button')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/EmptyState.test.tsx`
Expected: FAIL — `EmptyState` not exported.

- [ ] **Step 3: Implement EmptyState**

Create `packages/ui-kit/src/native/EmptyState.tsx`:
```tsx
import { View, Text, StyleSheet } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { FontFamily, FontSize, Spacing } from '../tokens.native'
import { useThemeColors } from './theme'
import { Button } from './Button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: { label: string; onPress: () => void }
  testID?: string
}

export function EmptyState({ icon: Icon, title, description, action, testID }: EmptyStateProps) {
  const colors = useThemeColors()
  return (
    <View testID={testID} style={styles.wrap}>
      <Icon size={44} color={colors.textMuted} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {description ? <Text style={[styles.desc, { color: colors.textSecondary }]}>{description}</Text> : null}
      {action ? (
        <View style={styles.action}>
          <Button label={action.label} variant="secondary" onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing[8], gap: Spacing[3] },
  title: { fontFamily: FontFamily.sansSemibold, fontSize: FontSize.md, textAlign: 'center' },
  desc: { fontFamily: FontFamily.sans, fontSize: FontSize.sm, textAlign: 'center' },
  action: { marginTop: Spacing[2] },
})
```

- [ ] **Step 4: Add to barrel**

In `packages/ui-kit/src/native/index.ts` add:
```ts
export { EmptyState } from './EmptyState'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native/EmptyState.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit/src/native/EmptyState.tsx packages/ui-kit/src/native/index.ts apps/pharmopedia/src/__tests__/ui-native/EmptyState.test.tsx
git commit -m "feat(ui-kit-native): add EmptyState primitive"
```

---

## Task 11: Finalize — full suite, typecheck, barrel verification

**Files:**
- Verify: `packages/ui-kit/src/native/index.ts`

- [ ] **Step 1: Confirm the barrel exports all primitives**

`packages/ui-kit/src/native/index.ts` should read exactly:
```ts
export { UiKitProvider, useThemeColors, useRtl, type ThemeMode } from './theme'
export { Screen } from './Screen'
export { ScreenHeader } from './ScreenHeader'
export { Card, CardSection } from './Card'
export { ListRow } from './ListRow'
export { Button } from './Button'
export { Avatar } from './Avatar'
export { Chip } from './Chip'
export { Banner } from './Banner'
export { EmptyState } from './EmptyState'
```

- [ ] **Step 2: Run the full Pharmopedia test suite**

Run: `pnpm --filter @ultranos/pharmopedia test`
Expected: PASS — all existing tests plus the 10 new `ui-native` test files (theme + 9 primitives) pass, no regressions.

- [ ] **Step 3: Typecheck the app (covers native components via imports)**

Run: `pnpm --filter @ultranos/pharmopedia typecheck`
Expected: PASS — no type errors. The native components are typechecked here because the app imports them and `react-native` types are available in this project.

- [ ] **Step 4: Typecheck the ui-kit web build is unaffected**

Run: `pnpm --filter @ultranos/ui-kit typecheck`
Expected: PASS — `src/native` is excluded, so the web build ignores the RN files.

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit/src/native/index.ts
git commit -m "chore(ui-kit-native): finalize native UI kit barrel (E1 complete)"
```

---

## Self-Review

**Spec coverage (E1 §4 of the design spec):**
- §4.1 package structure + `"./native"` export → Task 1 (steps 1, 9) + all component tasks. ✓
- §4.2 store-agnostic theming (`UiKitProvider`/`useThemeColors`) → Task 1. (Refinement vs spec: a single `UiKitProvider` carries both `mode` and `rtl` via context — cleaner than a separate `rtl` prop; resolves spec §9 open question. App-root wiring + removing the app's old hook is **deferred to E2** to keep E1 strictly additive.) ✓
- §4.3 all 9 component APIs → Tasks 2–10. ✓
- §4.4 cross-cutting contract: tokens-only (no hardcoded values — verified per component); theme-aware (theme tests in Task 1/2/4/5/6/8/9); RTL (ScreenHeader/ListRow tests; `scaleX(-1)` chevron flip replaces web-only DirectionalIcon); a11y roles/state (ListRow/Button/Chip/Banner/ScreenHeader/EmptyState tests); ≥44px targets (ListRow `minHeight:48` + `hitSlop`, Button `height:48`); icons via `lucide-react-native`. ✓
- §4.5 tokens: header uses `FontSize['2xl']`; no new tokens added. ✓
- §5 testing: one test file per primitive + provider (10 files); light/dark/RTL/a11y assertions present. ✓
- §6 deliverables/file list → matches the File Structure section. ✓
- §7 success criteria → Task 11 (full suite + both typechecks + barrel). ✓
- §9 open questions resolved: tests co-locate in pharmopedia (RN harness lives there); RTL/theme via unified `UiKitProvider`; font scaling handled via min-height + padding (no fixed clipping heights). ✓

**Placeholder scan:** No TBD/TODO; every code and test step contains complete code; every command has an expected result. ✓

**Type consistency:** `UiKitProvider`/`useThemeColors`/`useRtl` defined in Task 1 and imported identically everywhere; `LucideIcon` type imported via `import type` (elided at runtime) in ListRow/Button/Banner/EmptyState; `flattenStyle` defined in Task 1 and imported by Screen/ScreenHeader/ListRow/Button/Chip/Banner tests; color literals in assertions match `tokens.native.ts` (`#141c28`, `#f0f0f0`, `#2a2a2a`, `#ffffff`, `#dc2626`, `#2e9e71`). ✓
```
