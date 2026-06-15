# Pharmopedia Dark Mode & Theme System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full dark mode with light/dark/system toggle, backed by a theme token system and persistent user preference.

**Architecture:** A `ColorsDark` palette in `tokens.native.ts` mirrors the existing `Colors` export with semantic keys. A Zustand `theme-store` persists the user's choice (light/dark/system) to SecureStore. A `useThemeColors()` hook resolves the active palette. Every component migrates from static `Colors` imports to the hook.

**Tech Stack:** Zustand, expo-secure-store, react-native Appearance API, Vitest

**Spec:** `docs/superpowers/specs/2026-06-14-pharmopedia-ux-polish-design.md` — Epic 1

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `apps/pharmopedia/src/store/theme-store.ts` | Theme mode persistence + resolution |
| `apps/pharmopedia/src/hooks/useThemeColors.ts` | Hook returning active color palette |
| `apps/pharmopedia/src/__tests__/theme-store.test.ts` | Store unit tests |
| `apps/pharmopedia/src/__tests__/use-theme-colors.test.ts` | Hook unit tests |
| `apps/pharmopedia/src/__tests__/profile-theme-toggle.test.tsx` | Theme toggle UI tests |

### Modified Files

| File | Change |
|---|---|
| `packages/ui-kit/src/tokens.native.ts` | Add semantic keys to `Colors`, add `ColorsDark` export, export `ThemeColors` type |
| `apps/pharmopedia/app/_layout.tsx` | Init theme store, Appearance listener, dynamic StatusBar |
| `apps/pharmopedia/app/(tabs)/_layout.tsx` | Theme-aware tab bar colors |
| `apps/pharmopedia/app/(tabs)/profile.tsx` | Add Appearance toggle section |
| `apps/pharmopedia/app/(tabs)/index.tsx` | Theme-aware styles |
| `apps/pharmopedia/app/(tabs)/browse.tsx` | Theme-aware styles |
| `apps/pharmopedia/app/(tabs)/saved.tsx` | Theme-aware styles |
| `apps/pharmopedia/app/(auth)/login.tsx` | Theme-aware styles |
| `apps/pharmopedia/app/(auth)/register.tsx` | Theme-aware styles |
| `apps/pharmopedia/app/drug/[atcCode].tsx` | Theme-aware styles |
| `apps/pharmopedia/src/components/SearchBar.tsx` | Theme-aware styles |
| `apps/pharmopedia/src/components/DrugCard.tsx` | Theme-aware styles |
| `apps/pharmopedia/src/components/TherapeuticClassCard.tsx` | Theme-aware styles |
| `apps/pharmopedia/src/components/PriceCard.tsx` | Theme-aware styles |
| `apps/pharmopedia/src/components/SyncStatusBanner.tsx` | Theme-aware styles |
| `apps/pharmopedia/src/components/RoleBadge.tsx` | Theme-aware styles |
| `apps/pharmopedia/src/components/ShareButton.tsx` | Theme-aware styles |
| `apps/pharmopedia/src/components/DrugDetail/OverviewTab.tsx` | Theme-aware styles |
| `apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx` | Theme-aware styles |
| `apps/pharmopedia/src/components/DrugDetail/FormularyTab.tsx` | Theme-aware styles |
| `apps/pharmopedia/src/components/DrugDetail/PricingTab.tsx` | Theme-aware styles |
| `apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx` | Theme-aware styles |
| `apps/pharmopedia/src/i18n/locales/en.ts` | Add `profile.appearance`, `profile.themeLight`, `profile.themeDark`, `profile.themeSystem` keys |
| `apps/pharmopedia/src/i18n/locales/prs.ts` | Same keys in Dari |
| `apps/pharmopedia/src/i18n/locales/ps.ts` | Same keys in Pashto |
| `apps/pharmopedia/src/i18n/locales/ar.ts` | Same keys in Arabic |

---

## Task 1: Add semantic colors and dark palette to tokens.native.ts

**Files:**
- Modify: `packages/ui-kit/src/tokens.native.ts`
- Test: `apps/pharmopedia/src/__tests__/theme-tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/theme-tokens.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { Colors, ColorsDark } from '@ultranos/ui-kit/tokens.native'

const SEMANTIC_KEYS = [
  'surface', 'surfaceElevated', 'surfaceSubtle',
  'textPrimary', 'textSecondary', 'textMuted',
  'border', 'borderSubtle', 'overlay',
] as const

describe('tokens.native — theme colors', () => {
  it('Colors has all semantic keys', () => {
    for (const key of SEMANTIC_KEYS) {
      expect(Colors).toHaveProperty(key)
      expect(typeof Colors[key]).toBe('string')
    }
  })

  it('ColorsDark has all semantic keys', () => {
    for (const key of SEMANTIC_KEYS) {
      expect(ColorsDark).toHaveProperty(key)
      expect(typeof ColorsDark[key]).toBe('string')
    }
  })

  it('ColorsDark has same accent colors as Colors', () => {
    expect(ColorsDark.primary500).toBe(Colors.primary500)
    expect(ColorsDark.danger).toBe(Colors.danger)
    expect(ColorsDark.warning).toBe(Colors.warning)
    expect(ColorsDark.success).toBe(Colors.success)
  })

  it('surface values differ between light and dark', () => {
    expect(Colors.surface).not.toBe(ColorsDark.surface)
    expect(Colors.surfaceElevated).not.toBe(ColorsDark.surfaceElevated)
    expect(Colors.textPrimary).not.toBe(ColorsDark.textPrimary)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/theme-tokens.test.ts`
Expected: FAIL — `ColorsDark` is not exported from tokens.native.ts

- [ ] **Step 3: Add semantic keys to Colors and create ColorsDark**

In `packages/ui-kit/src/tokens.native.ts`, add the following after the existing `Colors` export (before the `// ── Typography` section):

```typescript
  // ── Semantic — theme-aware aliases (light mode defaults) ──
  surface:         '#ffffff',
  surfaceElevated: '#ffffff',
  surfaceSubtle:   '#f5f5f5',
  textPrimary:     '#141c28',  // neutral900
  textSecondary:   '#4a5568',  // neutral600
  textMuted:       '#838e9d',  // neutral400
  border:          '#d8dde6',  // neutral200
  borderSubtle:    '#eef1f5',  // neutral100
  overlay:         'rgba(0,0,0,0.5)',
```

These go inside the existing `Colors` object, before the closing `} as const`.

Then add a new `ColorsDark` export after the `Colors` block:

```typescript
// ── Dark palette ──────────────────────────────────────────────────────────────

export const ColorsDark = {
  // Primary — same as light (designed for sufficient contrast on dark surfaces)
  primary50:  Colors.primary50,
  primary100: Colors.primary100,
  primary200: Colors.primary200,
  primary300: Colors.primary300,
  primary400: Colors.primary400,
  primary500: Colors.primary500,
  primary600: Colors.primary600,
  primary700: Colors.primary700,
  primary800: Colors.primary800,
  primary900: Colors.primary900,

  // Neutral — inverted
  neutral0:   '#121212',
  neutral50:  '#1a1a1a',
  neutral100: '#262626',
  neutral200: '#333333',
  neutral300: '#4a4a4a',
  neutral400: '#666666',
  neutral500: '#888888',
  neutral600: '#a0a0a0',
  neutral700: '#bbbbbb',
  neutral800: '#d4d4d4',
  neutral900: '#f0f0f0',

  // Semantic — same as light
  danger:      Colors.danger,
  dangerLight: '#3b1111',
  dangerDark:  '#fca5a5',

  warning:      Colors.warning,
  warningLight: '#3b2506',
  warningDark:  '#fcd34d',

  success:      Colors.success,
  successLight: '#052e16',
  successDark:  '#86efac',

  info:      Colors.info,
  infoLight: '#1e2a4a',
  infoDark:  '#93c5fd',

  // Allergy — same prominence, adjusted for dark
  allergy:       '#f87171',
  allergyBg:     '#3b1111',
  allergyBorder: '#dc2626',

  // Convenience
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',

  // Semantic — dark mode
  surface:         '#121212',
  surfaceElevated: '#1e1e1e',
  surfaceSubtle:   '#2a2a2a',
  textPrimary:     '#f0f0f0',
  textSecondary:   '#a0a0a0',
  textMuted:       '#666666',
  border:          '#333333',
  borderSubtle:    '#262626',
  overlay:         'rgba(0,0,0,0.7)',
} as const

/** Union type for either palette — use in component style factories. */
export type ThemeColors = typeof Colors | typeof ColorsDark
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/theme-tokens.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit/src/tokens.native.ts apps/pharmopedia/src/__tests__/theme-tokens.test.ts
git commit -m "feat(pharmopedia): add ColorsDark palette + semantic color keys to tokens.native"
```

---

## Task 2: Create theme store

**Files:**
- Create: `apps/pharmopedia/src/store/theme-store.ts`
- Test: `apps/pharmopedia/src/__tests__/theme-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/theme-store.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react-native'

// Mock SecureStore
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}))

// Mock Appearance
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

import * as SecureStore from 'expo-secure-store'
import { Appearance } from 'react-native'
import { useThemeStore, type ThemeMode } from '@/store/theme-store'

beforeEach(() => {
  vi.clearAllMocks()
  useThemeStore.setState({
    mode: 'light',
    resolvedTheme: 'light',
    initialized: false,
  })
})

describe('theme-store', () => {
  it('initializes with light defaults', () => {
    const { result } = renderHook(() => useThemeStore())
    expect(result.current.mode).toBe('light')
    expect(result.current.resolvedTheme).toBe('light')
    expect(result.current.initialized).toBe(false)
  })

  it('init loads persisted mode from SecureStore', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue('dark')

    const { result } = renderHook(() => useThemeStore())
    await act(async () => { await result.current.init() })

    expect(result.current.mode).toBe('dark')
    expect(result.current.resolvedTheme).toBe('dark')
    expect(result.current.initialized).toBe(true)
  })

  it('init resolves system mode using Appearance', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue('system')
    vi.mocked(Appearance.getColorScheme).mockReturnValue('dark')

    const { result } = renderHook(() => useThemeStore())
    await act(async () => { await result.current.init() })

    expect(result.current.mode).toBe('system')
    expect(result.current.resolvedTheme).toBe('dark')
  })

  it('init defaults to light when SecureStore is empty', async () => {
    vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null)

    const { result } = renderHook(() => useThemeStore())
    await act(async () => { await result.current.init() })

    expect(result.current.mode).toBe('light')
    expect(result.current.resolvedTheme).toBe('light')
  })

  it('setMode persists to SecureStore and updates state', async () => {
    const { result } = renderHook(() => useThemeStore())
    await act(async () => { await result.current.init() })
    await act(async () => { await result.current.setMode('dark') })

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('@pharmopedia/theme', 'dark')
    expect(result.current.mode).toBe('dark')
    expect(result.current.resolvedTheme).toBe('dark')
  })

  it('setMode to system resolves via Appearance', async () => {
    vi.mocked(Appearance.getColorScheme).mockReturnValue('dark')

    const { result } = renderHook(() => useThemeStore())
    await act(async () => { await result.current.init() })
    await act(async () => { await result.current.setMode('system') })

    expect(result.current.mode).toBe('system')
    expect(result.current.resolvedTheme).toBe('dark')
  })

  it('onSystemChange updates resolvedTheme when mode is system', () => {
    useThemeStore.setState({ mode: 'system', resolvedTheme: 'light', initialized: true })

    const { result } = renderHook(() => useThemeStore())
    act(() => { result.current.onSystemChange('dark') })

    expect(result.current.resolvedTheme).toBe('dark')
  })

  it('onSystemChange is ignored when mode is not system', () => {
    useThemeStore.setState({ mode: 'light', resolvedTheme: 'light', initialized: true })

    const { result } = renderHook(() => useThemeStore())
    act(() => { result.current.onSystemChange('dark') })

    expect(result.current.resolvedTheme).toBe('light')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/theme-store.test.ts`
Expected: FAIL — module `@/store/theme-store` not found

- [ ] **Step 3: Implement theme-store.ts**

Create `apps/pharmopedia/src/store/theme-store.ts`:

```typescript
import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { Appearance } from 'react-native'

export type ThemeMode = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

const THEME_KEY = '@pharmopedia/theme'
const VALID_MODES: ReadonlySet<string> = new Set(['light', 'dark', 'system'])

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') {
    return (Appearance.getColorScheme() as ResolvedTheme) ?? 'light'
  }
  return mode
}

interface ThemeState {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  initialized: boolean
  init: () => Promise<void>
  setMode: (mode: ThemeMode) => Promise<void>
  onSystemChange: (colorScheme: string | null) => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'light',
  resolvedTheme: 'light',
  initialized: false,

  async init() {
    if (get().initialized) return
    let mode: ThemeMode = 'light'
    try {
      const saved = await SecureStore.getItemAsync(THEME_KEY)
      if (saved && VALID_MODES.has(saved)) {
        mode = saved as ThemeMode
      }
    } catch {
      // SecureStore unavailable — default to light
    }
    set({ mode, resolvedTheme: resolveTheme(mode), initialized: true })
  },

  async setMode(mode: ThemeMode) {
    await SecureStore.setItemAsync(THEME_KEY, mode)
    set({ mode, resolvedTheme: resolveTheme(mode) })
  },

  onSystemChange(colorScheme: string | null) {
    if (get().mode !== 'system') return
    set({ resolvedTheme: (colorScheme as ResolvedTheme) ?? 'light' })
  },
}))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/theme-store.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/store/theme-store.ts apps/pharmopedia/src/__tests__/theme-store.test.ts
git commit -m "feat(pharmopedia): theme-store with light/dark/system mode + SecureStore persistence"
```

---

## Task 3: Create useThemeColors hook

**Files:**
- Create: `apps/pharmopedia/src/hooks/useThemeColors.ts`
- Test: `apps/pharmopedia/src/__tests__/use-theme-colors.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/use-theme-colors.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react-native'
import { Colors, ColorsDark } from '@ultranos/ui-kit/tokens.native'
import { useThemeStore } from '@/store/theme-store'

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

import { useThemeColors } from '@/hooks/useThemeColors'

beforeEach(() => {
  useThemeStore.setState({ mode: 'light', resolvedTheme: 'light', initialized: true })
})

describe('useThemeColors', () => {
  it('returns Colors when resolvedTheme is light', () => {
    const { result } = renderHook(() => useThemeColors())
    expect(result.current.surface).toBe(Colors.surface)
    expect(result.current.textPrimary).toBe(Colors.textPrimary)
  })

  it('returns ColorsDark when resolvedTheme is dark', () => {
    useThemeStore.setState({ resolvedTheme: 'dark' })
    const { result } = renderHook(() => useThemeColors())
    expect(result.current.surface).toBe(ColorsDark.surface)
    expect(result.current.textPrimary).toBe(ColorsDark.textPrimary)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/use-theme-colors.test.ts`
Expected: FAIL — module `@/hooks/useThemeColors` not found

- [ ] **Step 3: Implement useThemeColors**

Create `apps/pharmopedia/src/hooks/useThemeColors.ts`:

```typescript
import { Colors, ColorsDark } from '@ultranos/ui-kit/tokens.native'
import { useThemeStore } from '@/store/theme-store'

export function useThemeColors() {
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
  return resolvedTheme === 'dark' ? ColorsDark : Colors
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/use-theme-colors.test.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/hooks/useThemeColors.ts apps/pharmopedia/src/__tests__/use-theme-colors.test.ts
git commit -m "feat(pharmopedia): useThemeColors hook — resolves Colors or ColorsDark from theme store"
```

---

## Task 4: Wire theme store into root layout

**Files:**
- Modify: `apps/pharmopedia/app/_layout.tsx`

- [ ] **Step 1: Add theme store import and initialization**

In `apps/pharmopedia/app/_layout.tsx`:

Add import at the top (alongside existing store imports):

```typescript
import { useThemeStore } from '@/store/theme-store'
import { Appearance } from 'react-native'
```

Inside `RootLayout`, add store selectors (alongside existing ones):

```typescript
const themeInit = useThemeStore((s) => s.init)
const themeInitialized = useThemeStore((s) => s.initialized)
const resolvedTheme = useThemeStore((s) => s.resolvedTheme)
const onSystemChange = useThemeStore((s) => s.onSystemChange)
```

- [ ] **Step 2: Add theme init to the init() function**

Inside the existing `useEffect` `init()` function, add `await themeInit()` after `await langInit()` (both in the try block and the catch block — theme init is independent of database):

```typescript
async function init() {
  try {
    setSecurityResult({ isCompromised: false, reasons: [] })
    await openDatabase()
    await langInit()
    await themeInit()
    initI18n(useLangStore.getState().lang)
    await useBookmarkStore.getState().init(getDatabase())
  } catch {
    await langInit()
    await themeInit()
    initI18n(useLangStore.getState().lang)
  } finally {
    initialize()
  }
}
```

- [ ] **Step 3: Add Appearance listener for system theme changes**

Add a second `useEffect` for system theme listening:

```typescript
useEffect(() => {
  const sub = Appearance.addChangeListener(({ colorScheme }) => {
    onSystemChange(colorScheme)
  })
  return () => sub.remove()
}, [onSystemChange])
```

- [ ] **Step 4: Update the loading gate and StatusBar**

Update the loading check to include theme:

```typescript
if (!initialized || !langInitialized || !themeInitialized || !fontsLoaded) return null
```

Change `<StatusBar style="auto" />` to:

```typescript
<StatusBar style={resolvedTheme === 'dark' ? 'light' : 'dark'} />
```

- [ ] **Step 5: Run existing tests to verify no regressions**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All existing tests pass. New `themeInit` calls don't break because SecureStore is mocked.

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/app/_layout.tsx
git commit -m "feat(pharmopedia): wire theme store into root layout with system appearance listener"
```

---

## Task 5: Add i18n keys for theme

**Files:**
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/prs.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ps.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ar.ts`

- [ ] **Step 1: Add theme keys to en.ts**

Add to the `profile` section of `apps/pharmopedia/src/i18n/locales/en.ts`:

```typescript
appearance: 'Appearance',
themeLight: 'Light',
themeDark: 'Dark',
themeSystem: 'System',
```

- [ ] **Step 2: Add theme keys to prs.ts (Dari)**

Add to the `profile` section:

```typescript
appearance: 'ظاهر',
themeLight: 'روشن',
themeDark: 'تاریک',
themeSystem: 'سیستم',
```

- [ ] **Step 3: Add theme keys to ps.ts (Pashto)**

Add to the `profile` section:

```typescript
appearance: 'بڼه',
themeLight: 'رڼا',
themeDark: 'تیاره',
themeSystem: 'سیسټم',
```

- [ ] **Step 4: Add theme keys to ar.ts (Arabic)**

Add to the `profile` section:

```typescript
appearance: 'المظهر',
themeLight: 'فاتح',
themeDark: 'داكن',
themeSystem: 'النظام',
```

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/src/i18n/locales/en.ts apps/pharmopedia/src/i18n/locales/prs.ts apps/pharmopedia/src/i18n/locales/ps.ts apps/pharmopedia/src/i18n/locales/ar.ts
git commit -m "feat(pharmopedia): i18n keys for theme appearance toggle (4 locales)"
```

---

## Task 6: Add theme toggle to profile screen

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/profile.tsx`
- Test: `apps/pharmopedia/src/__tests__/profile-theme-toggle.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/profile-theme-toggle.test.tsx`:

```typescript
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { useThemeStore, type ThemeMode } from '@/store/theme-store'

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
vi.mock('@/store/auth-store', () => ({
  useAuthStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({ user: { role: 'DOCTOR' }, token: 'tok', isAuthenticated: true, initialized: true, logout: vi.fn() }),
  ),
}))
vi.mock('@/store/sync-store', () => ({
  useSyncStore: vi.fn((sel: (s: Record<string, unknown>) => unknown) =>
    sel({ status: 'idle', lastSyncAt: '2026-01-01', lastVersion: 1, syncedCount: 0, setStatus: vi.fn(), setSyncedCount: vi.fn(), setLastSync: vi.fn() }),
  ),
}))

// Import AFTER mocks
import ProfileScreen from '@/app/(tabs)/profile'

beforeEach(() => {
  vi.clearAllMocks()
  useThemeStore.setState({ mode: 'light', resolvedTheme: 'light', initialized: true })
})

describe('Profile — theme toggle', () => {
  it('renders appearance section with three options', () => {
    const { getByText } = render(<ProfileScreen />)
    expect(getByText('profile.appearance')).toBeTruthy()
    expect(getByText('profile.themeLight')).toBeTruthy()
    expect(getByText('profile.themeDark')).toBeTruthy()
    expect(getByText('profile.themeSystem')).toBeTruthy()
  })

  it('highlights the active mode', () => {
    useThemeStore.setState({ mode: 'dark', resolvedTheme: 'dark' })
    const { getByTestId } = render(<ProfileScreen />)
    // The active button should have the active style
    expect(getByTestId('theme-dark')).toBeTruthy()
  })

  it('calls setMode when a theme option is pressed', async () => {
    const setModeSpy = vi.fn()
    useThemeStore.setState({ mode: 'light', resolvedTheme: 'light', initialized: true, setMode: setModeSpy })
    const { getByTestId } = render(<ProfileScreen />)

    fireEvent.press(getByTestId('theme-dark'))
    expect(setModeSpy).toHaveBeenCalledWith('dark')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/profile-theme-toggle.test.tsx`
Expected: FAIL — profile screen does not render theme toggle elements

- [ ] **Step 3: Add theme toggle to profile.tsx**

In `apps/pharmopedia/app/(tabs)/profile.tsx`:

Add imports:

```typescript
import { useThemeStore, type ThemeMode } from '@/store/theme-store'
```

Inside the component, add store selectors:

```typescript
const themeMode = useThemeStore((s) => s.mode)
const setThemeMode = useThemeStore((s) => s.setMode)
```

Define theme options constant (inside the component or at module scope):

```typescript
const THEME_OPTIONS: { value: ThemeMode; labelKey: string }[] = [
  { value: 'light', labelKey: 'profile.themeLight' },
  { value: 'dark', labelKey: 'profile.themeDark' },
  { value: 'system', labelKey: 'profile.themeSystem' },
]
```

Add the Appearance section JSX after the Language section and before the Sync section:

```tsx
<Text style={styles.sectionTitle}>{t('profile.appearance')}</Text>
<View style={styles.themeRow}>
  {THEME_OPTIONS.map((opt) => (
    <Pressable
      key={opt.value}
      testID={`theme-${opt.value}`}
      style={[styles.themeBtn, themeMode === opt.value && styles.themeBtnActive]}
      onPress={() => void setThemeMode(opt.value)}
    >
      <Text style={[styles.themeText, themeMode === opt.value && styles.themeTextActive]}>
        {t(opt.labelKey)}
      </Text>
    </Pressable>
  ))}
</View>
```

Add styles (matching the existing language selector pattern):

```typescript
themeRow: {
  flexDirection: 'row',
  gap: Spacing[2],
  marginBottom: Spacing[6],
},
themeBtn: {
  flex: 1,
  paddingVertical: Spacing[2],
  borderRadius: Radius.md,
  borderWidth: 1,
  borderColor: Colors.neutral200,
  alignItems: 'center',
},
themeBtnActive: {
  backgroundColor: Colors.primary500,
  borderColor: Colors.primary500,
},
themeText: {
  fontSize: 14,
  fontFamily: FontFamily.sansMedium,
  color: Colors.neutral700,
},
themeTextActive: {
  color: Colors.white,
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/profile-theme-toggle.test.tsx`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/app/\(tabs\)/profile.tsx apps/pharmopedia/src/__tests__/profile-theme-toggle.test.tsx
git commit -m "feat(pharmopedia): appearance toggle on profile screen (light/dark/system)"
```

---

## Task 7: Migrate tab layout to theme-aware colors

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Replace static Colors import with useThemeColors**

In `apps/pharmopedia/app/(tabs)/_layout.tsx`:

Replace the import:

```typescript
// Before
import { Colors } from '@ultranos/ui-kit/tokens.native'

// After
import { useThemeColors } from '@/hooks/useThemeColors'
```

Inside the component, add:

```typescript
const colors = useThemeColors()
```

Update `tabBarActiveTintColor` and add `tabBarStyle`:

```typescript
<Tabs screenOptions={{
  headerShown: false,
  tabBarActiveTintColor: colors.primary500,
  tabBarInactiveTintColor: colors.textMuted,
  tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
}}>
```

- [ ] **Step 2: Run existing tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/pharmopedia/app/\(tabs\)/_layout.tsx
git commit -m "feat(pharmopedia): theme-aware tab bar colors"
```

---

## Task 8: Migrate SyncStatusBanner to theme-aware colors

**Files:**
- Modify: `apps/pharmopedia/src/components/SyncStatusBanner.tsx`

- [ ] **Step 1: Replace Colors with useThemeColors**

In `apps/pharmopedia/src/components/SyncStatusBanner.tsx`:

Replace:
```typescript
import { Colors, FontFamily, Spacing } from '@ultranos/ui-kit/tokens.native'
```

With:
```typescript
import { FontFamily, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
```

Inside the component, add:
```typescript
const colors = useThemeColors()
```

Replace the static `StyleSheet.create()` block with a themed approach. Move the color-dependent styles inline and keep static styles in the StyleSheet:

```typescript
export function SyncStatusBanner() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const status = useSyncStore((s) => s.status)
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt)
  const syncedCount = useSyncStore((s) => s.syncedCount)

  if (!isDatabaseReady()) return null

  if (status === 'syncing') {
    return (
      <View style={[styles.banner, { backgroundColor: colors.infoLight }]}>
        <Text style={[styles.text, { color: colors.textPrimary }]}>
          {syncedCount > 0
            ? t('sync.syncingCount', { count: syncedCount })
            : t('sync.syncing')}
        </Text>
      </View>
    )
  }

  if (status === 'error') {
    return (
      <View style={[styles.banner, { backgroundColor: colors.dangerLight }]}>
        <Text style={[styles.text, { color: colors.textPrimary }]}>{t('sync.failed')}</Text>
      </View>
    )
  }

  if (!lastSyncAt) {
    return (
      <View style={[styles.banner, { backgroundColor: colors.warningLight }]}>
        <Text style={[styles.text, { color: colors.textPrimary }]}>{t('sync.notSynced')}</Text>
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: Spacing[4], paddingVertical: Spacing[2] },
  text: { fontSize: 13, fontFamily: FontFamily.sans, textAlign: 'center' },
})
```

- [ ] **Step 2: Run existing SyncStatusBanner tests**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/sync-status-banner`
Expected: PASS (existing tests should still pass since the rendering behavior is unchanged)

- [ ] **Step 3: Commit**

```bash
git add apps/pharmopedia/src/components/SyncStatusBanner.tsx
git commit -m "feat(pharmopedia): theme-aware SyncStatusBanner"
```

---

## Task 9: Migrate DrugCard to theme-aware colors

**Files:**
- Modify: `apps/pharmopedia/src/components/DrugCard.tsx`

- [ ] **Step 1: Replace Colors with useThemeColors**

In `apps/pharmopedia/src/components/DrugCard.tsx`:

Replace:
```typescript
import { Colors, FontFamily, Spacing } from '@ultranos/ui-kit/tokens.native'
```

With:
```typescript
import { FontFamily, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
```

Add inside the component:
```typescript
const colors = useThemeColors()
```

Replace the static styles with inline theme colors:

```typescript
export function DrugCard({ result, lang, onPress }: Props) {
  const colors = useThemeColors()
  const useLocal = lang !== 'en' && !!result.localName
  const primaryName = useLocal ? result.localName! : result.innName
  const secondaryName = useLocal ? result.innName : undefined
  const isRtl = isRtlLang(lang)

  return (
    <Pressable
      style={[styles.card, { backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle }]}
      onPress={onPress}
      testID={`drug-card-${result.atcCode}`}
    >
      <View style={styles.row}>
        <Text
          testID="drug-primary-name"
          style={[styles.primaryName, { color: colors.textPrimary }, isRtl && styles.rtlText]}
          numberOfLines={1}
        >
          {primaryName}
        </Text>
        <Text style={[styles.atcCode, { color: colors.textMuted }]}>{result.atcCode}</Text>
      </View>
      {secondaryName && (
        <Text testID="drug-secondary-name" style={[styles.secondaryName, { color: colors.textSecondary }]}>
          {secondaryName}
        </Text>
      )}
      <Text style={[styles.meta, { color: colors.textSecondary }]}>
        {result.therapeuticClass}{result.doseForms.length > 0 ? ` • ${result.doseForms.join(', ')}` : ''}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { padding: Spacing[4] - 2, borderBottomWidth: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  primaryName: { fontSize: 16, fontFamily: FontFamily.sansSemibold, flex: 1 },
  secondaryName: { fontSize: 13, fontFamily: FontFamily.sans, marginTop: 2 },
  atcCode: { fontSize: 13, fontFamily: FontFamily.sans, marginStart: Spacing[2] },
  rtlText: { fontFamily: FontFamily.arabic, textAlign: 'right' },
  meta: { fontSize: 13, fontFamily: FontFamily.sans, marginTop: 4 },
})
```

- [ ] **Step 2: Run existing DrugCard tests**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/drug-card`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/pharmopedia/src/components/DrugCard.tsx
git commit -m "feat(pharmopedia): theme-aware DrugCard"
```

---

## Task 10: Migrate remaining components to theme-aware colors

**Files:**
- Modify: `apps/pharmopedia/src/components/SearchBar.tsx`
- Modify: `apps/pharmopedia/src/components/TherapeuticClassCard.tsx`
- Modify: `apps/pharmopedia/src/components/PriceCard.tsx`
- Modify: `apps/pharmopedia/src/components/RoleBadge.tsx`
- Modify: `apps/pharmopedia/src/components/ShareButton.tsx`

Apply the same pattern from Task 9 to each component. For each:

- [ ] **Step 1: Migrate SearchBar.tsx**

Replace `import { Colors, ... }` with `import { ... } from '@ultranos/ui-kit/tokens.native'` (keeping non-color imports) + `import { useThemeColors } from '@/hooks/useThemeColors'`. Add `const colors = useThemeColors()` inside the component. Replace all `Colors.xxx` in styles with `colors.xxx` using inline style arrays:

- `Colors.white` → `colors.surface`
- `Colors.neutral200` → `colors.border`
- `Colors.neutral900` → `colors.textPrimary`
- `Colors.neutral700` → `colors.textSecondary`
- `Colors.primary500` → `colors.primary500`

- [ ] **Step 2: Migrate TherapeuticClassCard.tsx**

Same pattern:
- `Colors.white` → `colors.surface`
- `Colors.neutral100` → `colors.borderSubtle`
- `Colors.neutral50` → `colors.surfaceSubtle`
- `Colors.neutral900` → `colors.textPrimary`
- `Colors.neutral500` → `colors.textSecondary`

- [ ] **Step 3: Migrate PriceCard.tsx**

Same pattern:
- `Colors.white` → `colors.surface`
- `Colors.neutral100` → `colors.borderSubtle`
- `Colors.neutral900` → `colors.textPrimary`
- `Colors.neutral500` → `colors.textSecondary`

Note: `Colors.success`, `Colors.warningDark`, `Colors.dangerDark` for stock status should use `colors.success`, `colors.warningDark`, `colors.dangerDark` (these exist in both palettes with appropriate dark-mode variants).

- [ ] **Step 4: Migrate RoleBadge.tsx and ShareButton.tsx**

Same pattern. RoleBadge has hardcoded role-specific colors — these should stay hardcoded (they are semantic, not surface colors). Only migrate background and text colors that reference neutral/white/surface values.

- [ ] **Step 5: Run all component tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/src/components/SearchBar.tsx apps/pharmopedia/src/components/TherapeuticClassCard.tsx apps/pharmopedia/src/components/PriceCard.tsx apps/pharmopedia/src/components/RoleBadge.tsx apps/pharmopedia/src/components/ShareButton.tsx
git commit -m "feat(pharmopedia): theme-aware SearchBar, TherapeuticClassCard, PriceCard, RoleBadge, ShareButton"
```

---

## Task 11: Migrate DrugDetail tab components to theme-aware colors

**Files:**
- Modify: `apps/pharmopedia/src/components/DrugDetail/OverviewTab.tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/FormularyTab.tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/PricingTab.tsx`
- Modify: `apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx`

- [ ] **Step 1: Migrate OverviewTab.tsx**

Replace `import { Colors, ... }` and add `useThemeColors`. In the component:

```typescript
const colors = useThemeColors()
```

Replace style references:
- `Colors.neutral700` → `colors.textSecondary` (section titles)
- `Colors.neutral900` → `colors.textPrimary` (body text)

Pass `colors` to the `Section` sub-component or make it use `useThemeColors()` itself.

- [ ] **Step 2: Migrate ClinicalTab.tsx**

Same pattern. Severity badge colors (`danger`, `warning`, etc.) use `colors.danger`, `colors.dangerLight`, etc. — these have dark-mode appropriate variants in `ColorsDark`.

- [ ] **Step 3: Migrate FormularyTab.tsx**

Same pattern. Formulary status badges and recall alert styling use semantic colors from the palette.

- [ ] **Step 4: Migrate PricingTab.tsx**

Same pattern. Error/retry states use `colors.danger`. Loading indicator uses `colors.primary500`.

- [ ] **Step 5: Migrate EnrichTab.tsx**

Same pattern. Form inputs use `colors.surface`, `colors.border`, `colors.textPrimary`.

- [ ] **Step 6: Run all DrugDetail tests**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/src/components/DrugDetail/
git commit -m "feat(pharmopedia): theme-aware DrugDetail tabs (Overview, Clinical, Formulary, Pricing, Enrich)"
```

---

## Task 12: Migrate screen files to theme-aware colors

**Files:**
- Modify: `apps/pharmopedia/app/(tabs)/index.tsx`
- Modify: `apps/pharmopedia/app/(tabs)/browse.tsx`
- Modify: `apps/pharmopedia/app/(tabs)/saved.tsx`
- Modify: `apps/pharmopedia/app/(tabs)/profile.tsx`
- Modify: `apps/pharmopedia/app/(auth)/login.tsx`
- Modify: `apps/pharmopedia/app/(auth)/register.tsx`
- Modify: `apps/pharmopedia/app/drug/[atcCode].tsx`

- [ ] **Step 1: Migrate tab screens (index, browse, saved)**

For each screen:
- Replace `Colors` import with `useThemeColors` hook
- Add `const colors = useThemeColors()` inside the component
- Replace `Colors.white` / background colors → `colors.surface`
- Replace `Colors.neutral*` text colors → `colors.textPrimary` / `colors.textSecondary` / `colors.textMuted`
- Replace border colors → `colors.border` / `colors.borderSubtle`

- [ ] **Step 2: Migrate profile.tsx**

Same pattern. The theme toggle styles added in Task 6 should also use `colors` instead of static `Colors` — update `themeBtn`, `themeBtnActive`, `themeText`, `themeTextActive` styles to use `colors.border`, `colors.primary500`, `colors.textSecondary`, `colors.white`.

- [ ] **Step 3: Migrate auth screens (login, register)**

Same pattern. Input field backgrounds, borders, text colors, button styles.

- [ ] **Step 4: Migrate drug detail screen**

Same pattern for the header, tab bar, and background. The tab underline indicator color uses `colors.primary500`.

- [ ] **Step 5: Run full test suite**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/pharmopedia/app/
git commit -m "feat(pharmopedia): theme-aware screens (tabs, auth, drug detail)"
```

---

## Task 13: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `cd apps/pharmopedia && npx vitest run`
Expected: All tests pass, including the 3 new test files (theme-tokens, theme-store, use-theme-colors, profile-theme-toggle)

- [ ] **Step 2: Verify token exports**

Run: `cd apps/pharmopedia && npx vitest run src/__tests__/theme-tokens.test.ts`
Expected: PASS

- [ ] **Step 3: Commit any remaining fixes**

If any test failures, fix and commit:

```bash
git add -A
git commit -m "fix(pharmopedia): test fixes for dark mode theme migration"
```
