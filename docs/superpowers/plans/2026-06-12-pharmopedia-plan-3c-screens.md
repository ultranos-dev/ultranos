# Pharmopedia Plan 3c — Screens

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all five screens: navigation shell, login, search tab, drug detail (4 inner tabs), and profile tab.

**Architecture:** expo-router file-based navigation. All screens are React Native (View/Text/Pressable/TextInput). No ShadCN — this is a mobile app. Tests use @testing-library/react-native with mocked stores and DB.

**Tech Stack:** expo-router ~4, React Native ~0.76, @testing-library/react-native ~12, expo-location ~18, i18next

**Spec:** `docs/superpowers/specs/2026-06-12-pharmopedia-plan-3-design.md`
**Requires:** `2026-06-12-pharmopedia-plan-3b-data-layer.md` complete

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/pharmopedia/app/_layout.tsx` | Create | Root: init DB, init security store, AuthGuard |
| `apps/pharmopedia/app/(auth)/_layout.tsx` | Create | Auth group stack layout |
| `apps/pharmopedia/app/(tabs)/_layout.tsx` | Create | 2-tab bar: Search + Profile |
| `apps/pharmopedia/app/(auth)/login.tsx` | Create | OTP (patient) + credentials (clinical) login |
| `apps/pharmopedia/app/(tabs)/index.tsx` | Create | Search tab: FTS offline search |
| `apps/pharmopedia/app/(tabs)/profile.tsx` | Create | Role badge, sync status, logout |
| `apps/pharmopedia/app/drug/[atcCode].tsx` | Create | Drug detail screen with 4 inner tabs |
| `apps/pharmopedia/src/components/SearchBar.tsx` | Create | Debounced search input + language selector |
| `apps/pharmopedia/src/components/SyncStatusBanner.tsx` | Create | Syncing/cached/offline strip |
| `apps/pharmopedia/src/components/DrugCard.tsx` | Create | List item: INN, ATC, dose forms, class |
| `apps/pharmopedia/src/components/RoleBadge.tsx` | Create | Colored role pill |
| `apps/pharmopedia/src/components/PriceCard.tsx` | Create | Pharmacy name, distance, price, stock signal |
| `apps/pharmopedia/src/components/DrugDetail/OverviewTab.tsx` | Create | Tier 1 fields (all roles) |
| `apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx` | Create | Tier 2 fields (clinical+) |
| `apps/pharmopedia/src/components/DrugDetail/PricingTab.tsx` | Create | getPrices + GPS (online-only) |
| `apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx` | Create | Enrich form, role-gated fields |

---

## Task 9: Navigation Shell

**Context:** The root `_layout.tsx` is the app's entry point. It must: (1) mark the device-security-store as checked (unblocks write operations in hub-fetch); (2) open the SQLite database via `openDatabase()`; (3) call `auth-store.initialize()`; (4) redirect unauthenticated users to `(auth)/login`. The tabs layout defines the bottom tab bar with Search (house icon) and Profile (person icon).

**Files:**
- Create: `apps/pharmopedia/app/_layout.tsx`
- Create: `apps/pharmopedia/app/(auth)/_layout.tsx`
- Create: `apps/pharmopedia/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Create root _layout.tsx**

Create `apps/pharmopedia/app/_layout.tsx`:

```tsx
import { useEffect } from 'react'
import { Stack, Redirect } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { openDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useDeviceSecurityStore } from '@/stores/device-security-store'

export default function RootLayout() {
  const { isAuthenticated, initialized, initialize } = useAuthStore()
  const setSecurityResult = useDeviceSecurityStore((s) => s.setResult)

  useEffect(() => {
    async function init() {
      // Mark device as checked (isCompromised: false).
      // Full device integrity check (rooting/jailbreak detection) is deferred to a future plan.
      setSecurityResult({ isCompromised: false, reasons: [] })

      // Open SQLite and run migrations
      await openDatabase()

      // Mark auth store as initialized (no persisted session — fresh login required each launch)
      initialize()
    }
    init()
  }, [])

  // Wait for initialization before deciding where to redirect
  if (!initialized) return null

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="drug/[atcCode]" options={{ headerShown: true, title: '' }} />
      </Stack>
    </>
  )
}
```

- [ ] **Step 2: Create (auth)/_layout.tsx**

Create `apps/pharmopedia/app/(auth)/_layout.tsx`:

```tsx
import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
    </Stack>
  )
}
```

- [ ] **Step 3: Create (tabs)/_layout.tsx**

Create `apps/pharmopedia/app/(tabs)/_layout.tsx`:

```tsx
import { Tabs } from 'expo-router'
import { Search, User } from 'lucide-react-native'

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#2563eb' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  )
}
```

Note: `lucide-react-native` provides the icons. Add it to `package.json` if not already listed:
```bash
pnpm -F @ultranos/pharmopedia add lucide-react-native
```

- [ ] **Step 4: Typecheck**

```bash
pnpm -F @ultranos/pharmopedia typecheck
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/app/
git commit -m "feat(pharmopedia): navigation shell — root layout, auth group, tabs"
```

---

## Task 10: Login Screen

**Context:** Two auth flows on one screen, toggled with a segmented control. **Patient**: phone OTP via `supabase.auth.signInWithOtp({ phone })` then `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`. **Clinical staff**: email + password via `supabase.auth.signInWithPassword({ email, password })`. Both flows return a Supabase session with `access_token` (JWT RS256) and `user.app_metadata` carrying `role` and optional `facilityId`. On success, call `auth-store.login(token, user)` then navigate to `(tabs)`.

**Files:**
- Create: `apps/pharmopedia/app/(auth)/login.tsx`
- Create: `apps/pharmopedia/__tests__/screens/login.test.tsx`

- [ ] **Step 1: Write failing login screen tests**

Create `apps/pharmopedia/__tests__/screens/login.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import LoginScreen from '../../app/(auth)/login'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: jest.fn(),
      verifyOtp: jest.fn(),
      signInWithPassword: jest.fn(),
    },
  },
}))

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }))

const mockSignInWithPassword = supabase.auth.signInWithPassword as jest.Mock
const mockSignInWithOtp = supabase.auth.signInWithOtp as jest.Mock
const mockVerifyOtp = supabase.auth.verifyOtp as jest.Mock

beforeEach(() => {
  useAuthStore.setState({ token: null, user: null, isAuthenticated: false, initialized: true })
  jest.clearAllMocks()
})

describe('LoginScreen — clinical staff flow', () => {
  it('calls signInWithPassword and sets auth-store on success', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'jwt-token',
          user: { id: 'u1', app_metadata: { role: 'DOCTOR' } },
        },
      },
      error: null,
    })

    const { getByTestId } = render(<LoginScreen />)

    // Default to clinical tab
    fireEvent.changeText(getByTestId('email-input'), 'doctor@clinic.org')
    fireEvent.changeText(getByTestId('password-input'), 'password123')
    fireEvent.press(getByTestId('login-button'))

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().token).toBe('jwt-token')
    })
  })

  it('shows error message on failed login', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid credentials' },
    })

    const { getByTestId, findByText } = render(<LoginScreen />)
    fireEvent.changeText(getByTestId('email-input'), 'bad@email.com')
    fireEvent.changeText(getByTestId('password-input'), 'wrong')
    fireEvent.press(getByTestId('login-button'))

    expect(await findByText(/Invalid credentials/i)).toBeTruthy()
  })
})

describe('LoginScreen — patient OTP flow', () => {
  it('requests OTP on phone submit', async () => {
    mockSignInWithOtp.mockResolvedValueOnce({ data: {}, error: null })

    const { getByTestId } = render(<LoginScreen />)
    fireEvent.press(getByTestId('patient-tab'))
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    fireEvent.press(getByTestId('request-otp-button'))

    await waitFor(() => expect(mockSignInWithOtp).toHaveBeenCalledWith({ phone: '+93700000000' }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "screens/login"
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create login.tsx**

Create `apps/pharmopedia/app/(auth)/login.tsx`:

```tsx
import { useState } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'

type Flow = 'clinical' | 'patient'
type OtpStep = 'phone' | 'code'

export default function LoginScreen() {
  const router = useRouter()
  const login = useAuthStore((s) => s.login)

  const [flow, setFlow] = useState<Flow>('clinical')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpStep, setOtpStep] = useState<OtpStep>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClinicalLogin() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err || !data.session) {
      setError(err?.message ?? 'Login failed')
      return
    }
    const session = data.session
    login(session.access_token, {
      sub: session.user.id,
      role: (session.user.app_metadata?.role as string) ?? 'PATIENT',
      facilityId: session.user.app_metadata?.facilityId as string | undefined,
    })
    router.replace('/(tabs)')
  }

  async function handleRequestOtp() {
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({ phone })
    setLoading(false)
    if (err) { setError(err.message); return }
    setOtpStep('code')
  }

  async function handleVerifyOtp() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.auth.verifyOtp({ phone, token: otpCode, type: 'sms' })
    setLoading(false)
    if (err || !data.session) {
      setError(err?.message ?? 'OTP verification failed')
      return
    }
    const session = data.session
    login(session.access_token, {
      sub: session.user.id,
      role: (session.user.app_metadata?.role as string) ?? 'PATIENT',
      facilityId: session.user.app_metadata?.facilityId as string | undefined,
    })
    router.replace('/(tabs)')
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={styles.title}>Pharmopedia</Text>

      {/* Flow toggle */}
      <View style={styles.segmented}>
        <Pressable
          testID="clinical-tab"
          style={[styles.segment, flow === 'clinical' && styles.segmentActive]}
          onPress={() => setFlow('clinical')}
        >
          <Text style={flow === 'clinical' ? styles.segmentTextActive : styles.segmentText}>
            Clinical Staff
          </Text>
        </Pressable>
        <Pressable
          testID="patient-tab"
          style={[styles.segment, flow === 'patient' && styles.segmentActive]}
          onPress={() => setFlow('patient')}
        >
          <Text style={flow === 'patient' ? styles.segmentTextActive : styles.segmentText}>
            Patient
          </Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {flow === 'clinical' ? (
        <>
          <TextInput
            testID="email-input"
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            testID="password-input"
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <Pressable testID="login-button" style={styles.button} onPress={handleClinicalLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log In</Text>}
          </Pressable>
        </>
      ) : otpStep === 'phone' ? (
        <>
          <TextInput
            testID="phone-input"
            style={styles.input}
            placeholder="+93 70 000 0000"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Pressable testID="request-otp-button" style={styles.button} onPress={handleRequestOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send Code</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.hint}>Enter the code sent to {phone}</Text>
          <TextInput
            testID="otp-input"
            style={styles.input}
            placeholder="6-digit code"
            value={otpCode}
            onChangeText={setOtpCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Pressable testID="verify-otp-button" style={styles.button} onPress={handleVerifyOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify</Text>}
          </Pressable>
          <Pressable onPress={() => setOtpStep('phone')}>
            <Text style={styles.link}>Back</Text>
          </Pressable>
        </>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 32 },
  segmented: { flexDirection: 'row', marginBottom: 24, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#2563eb' },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  segmentActive: { backgroundColor: '#2563eb' },
  segmentText: { color: '#2563eb', fontWeight: '600' },
  segmentTextActive: { color: '#fff', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#dc2626', marginBottom: 12, textAlign: 'center' },
  hint: { color: '#6b7280', marginBottom: 12, textAlign: 'center' },
  link: { color: '#2563eb', textAlign: 'center', marginTop: 12 },
})
```

- [ ] **Step 4: Run login tests**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "screens/login"
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pharmopedia/app/(auth)/login.tsx apps/pharmopedia/__tests__/screens/login.test.tsx
git commit -m "feat(pharmopedia): login screen — OTP + clinical staff flows"
```

---

## Task 11: Search Tab

**Context:** Three components feed the search tab. `SearchBar` debounces input (300ms) and emits queries. `SyncStatusBanner` reads from sync-store and shows a strip: "Syncing…", "Last synced X ago", or "Offline — cached data" (when no network and lastSyncAt is set). `DrugCard` renders one search result row. The search tab itself queries FTS5 locally when the catalog is synced; falls back to the API when `lastVersion === 0` (first launch, sync not yet complete). On first launch with no sync and no network, shows an empty state.

**Files:**
- Create: `apps/pharmopedia/src/components/SearchBar.tsx`
- Create: `apps/pharmopedia/src/components/SyncStatusBanner.tsx`
- Create: `apps/pharmopedia/src/components/DrugCard.tsx`
- Create: `apps/pharmopedia/app/(tabs)/index.tsx`
- Create: `apps/pharmopedia/__tests__/components/SearchBar.test.tsx`
- Create: `apps/pharmopedia/__tests__/components/DrugCard.test.tsx`

- [ ] **Step 1: Write failing component tests**

Create `apps/pharmopedia/__tests__/components/SearchBar.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'
import { SearchBar } from '@/components/SearchBar'

jest.useFakeTimers()

describe('SearchBar', () => {
  it('calls onSearch after 300ms debounce', () => {
    const onSearch = jest.fn()
    const { getByTestId } = render(
      <SearchBar value="" onSearch={onSearch} lang="en" onLangChange={() => {}} />
    )
    fireEvent.changeText(getByTestId('search-input'), 'amox')
    expect(onSearch).not.toHaveBeenCalled()
    act(() => jest.advanceTimersByTime(300))
    expect(onSearch).toHaveBeenCalledWith('amox')
  })

  it('does not call onSearch before debounce expires', () => {
    const onSearch = jest.fn()
    const { getByTestId } = render(
      <SearchBar value="" onSearch={onSearch} lang="en" onLangChange={() => {}} />
    )
    fireEvent.changeText(getByTestId('search-input'), 'para')
    act(() => jest.advanceTimersByTime(100))
    expect(onSearch).not.toHaveBeenCalled()
  })
})
```

Create `apps/pharmopedia/__tests__/components/DrugCard.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { DrugCard } from '@/components/DrugCard'
import type { DrugSearchResult } from '@ultranos/shared-types'

const RESULT: DrugSearchResult = {
  atcCode: 'J01CA04',
  innName: 'amoxicillin',
  brandNames: ['Augmentin'],
  doseForms: ['tablet'],
  therapeuticClass: 'Antibiotic',
  localName: 'آموکسیسیلین',
}

describe('DrugCard', () => {
  it('renders INN name', () => {
    const { getByText } = render(<DrugCard result={RESULT} onPress={() => {}} />)
    expect(getByText('amoxicillin')).toBeTruthy()
  })

  it('renders ATC code', () => {
    const { getByText } = render(<DrugCard result={RESULT} onPress={() => {}} />)
    expect(getByText('J01CA04')).toBeTruthy()
  })

  it('renders local name when present', () => {
    const { getByText } = render(<DrugCard result={RESULT} onPress={() => {}} />)
    expect(getByText('آموکسیسیلین')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "components/SearchBar|components/DrugCard"
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Create SearchBar.tsx**

Create `apps/pharmopedia/src/components/SearchBar.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { View, TextInput, Pressable, Text, StyleSheet } from 'react-native'

const LANGS = ['en', 'prs', 'ps'] as const
type Lang = typeof LANGS[number]

interface Props {
  value: string
  onSearch: (q: string) => void
  lang: Lang
  onLangChange: (lang: Lang) => void
}

export function SearchBar({ value, onSearch, lang, onLangChange }: Props) {
  const [text, setText] = useState(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onSearch(text), 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [text])

  return (
    <View style={styles.container}>
      <TextInput
        testID="search-input"
        style={styles.input}
        placeholder="Search drugs…"
        value={text}
        onChangeText={setText}
        autoCorrect={false}
        autoCapitalize="none"
      />
      <View style={styles.langs}>
        {LANGS.map((l) => (
          <Pressable
            key={l}
            testID={`lang-${l}`}
            style={[styles.langBtn, lang === l && styles.langBtnActive]}
            onPress={() => onLangChange(l)}
          >
            <Text style={[styles.langText, lang === l && styles.langTextActive]}>
              {l === 'en' ? 'EN' : l === 'prs' ? 'دری' : 'پښتو'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 8 },
  langs: { flexDirection: 'row', gap: 8 },
  langBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db' },
  langBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  langText: { fontSize: 13, color: '#374151' },
  langTextActive: { color: '#fff' },
})
```

- [ ] **Step 4: Create SyncStatusBanner.tsx**

Create `apps/pharmopedia/src/components/SyncStatusBanner.tsx`:

```tsx
import { View, Text, StyleSheet } from 'react-native'
import { useSyncStore } from '@/store/sync-store'

export function SyncStatusBanner() {
  const { status, lastSyncAt } = useSyncStore()

  if (status === 'syncing') {
    return (
      <View style={[styles.banner, styles.syncing]}>
        <Text style={styles.text}>Syncing catalog…</Text>
      </View>
    )
  }

  if (status === 'error') {
    return (
      <View style={[styles.banner, styles.error]}>
        <Text style={styles.text}>Sync failed — showing cached data</Text>
      </View>
    )
  }

  if (!lastSyncAt) {
    return (
      <View style={[styles.banner, styles.warning]}>
        <Text style={styles.text}>Catalog not yet synced — connect to network</Text>
      </View>
    )
  }

  return null // Idle + synced = no banner
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: 16, paddingVertical: 8 },
  syncing: { backgroundColor: '#dbeafe' },
  error: { backgroundColor: '#fee2e2' },
  warning: { backgroundColor: '#fef9c3' },
  text: { fontSize: 13, textAlign: 'center' },
})
```

- [ ] **Step 5: Create DrugCard.tsx**

Create `apps/pharmopedia/src/components/DrugCard.tsx`:

```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { DrugSearchResult } from '@ultranos/shared-types'

interface Props {
  result: DrugSearchResult
  onPress: () => void
}

export function DrugCard({ result, onPress }: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress} testID={`drug-card-${result.atcCode}`}>
      <View style={styles.row}>
        <Text style={styles.innName}>{result.innName}</Text>
        <Text style={styles.atcCode}>{result.atcCode}</Text>
      </View>
      {result.localName && <Text style={styles.localName}>{result.localName}</Text>}
      <Text style={styles.meta}>
        {result.therapeuticClass}{result.doseForms.length > 0 ? ` • ${result.doseForms.join(', ')}` : ''}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fff' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  innName: { fontSize: 16, fontWeight: '600', color: '#111827', flex: 1 },
  atcCode: { fontSize: 13, color: '#6b7280', marginLeft: 8 },
  localName: { fontSize: 14, color: '#374151', marginTop: 2 },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 4 },
})
```

- [ ] **Step 6: Create search tab index.tsx**

Create `apps/pharmopedia/app/(tabs)/index.tsx`:

```tsx
import { useState, useCallback } from 'react'
import { View, FlatList, Text, StyleSheet, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import { SearchBar } from '@/components/SearchBar'
import { SyncStatusBanner } from '@/components/SyncStatusBanner'
import { DrugCard } from '@/components/DrugCard'
import { searchDrugs } from '@/db/fts'
import { searchDrugsApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import type { DrugSearchResult } from '@ultranos/shared-types'

type Lang = 'en' | 'prs' | 'ps'

export default function SearchTab() {
  const router = useRouter()
  const token = useAuthStore((s) => s.token)
  const lastVersion = useSyncStore((s) => s.lastVersion)
  const [results, setResults] = useState<DrugSearchResult[]>([])
  const [lang, setLang] = useState<Lang>('en')

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }

    if (lastVersion > 0) {
      // Catalog is synced — use local FTS
      const db = getDatabase()
      const rows = await searchDrugs(db, q, lang, 50)
      setResults(rows)
    } else if (token) {
      // Not yet synced — fall back to API
      try {
        const rows = await searchDrugsApi(q, lang, 20, token)
        setResults(rows)
      } catch {
        setResults([])
      }
    }
  }, [lastVersion, lang, token])

  return (
    <SafeAreaView style={styles.container}>
      <SearchBar value="" onSearch={handleSearch} lang={lang} onLangChange={setLang} />
      <SyncStatusBanner />
      {results.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Search by drug name, brand name, or ATC code</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.atcCode}
          renderItem={({ item }) => (
            <DrugCard
              result={item}
              onPress={() => router.push(`/drug/${item.atcCode}`)}
            />
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: '#6b7280', textAlign: 'center', fontSize: 15 },
})
```

- [ ] **Step 7: Run component tests**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "components/"
```
Expected: All tests PASS.

- [ ] **Step 8: Typecheck**

```bash
pnpm -F @ultranos/pharmopedia typecheck
```
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add apps/pharmopedia/src/components/SearchBar.tsx apps/pharmopedia/src/components/SyncStatusBanner.tsx apps/pharmopedia/src/components/DrugCard.tsx apps/pharmopedia/app/(tabs)/index.tsx apps/pharmopedia/__tests__/components/
git commit -m "feat(pharmopedia): search tab — SearchBar, SyncStatusBanner, DrugCard, FTS search"
```

---

## Task 12: Drug Detail Screen

**Context:** Drug detail is a pushed screen at `app/drug/[atcCode].tsx`. It reads the drug first from local SQLite (by atcCode), then falls back to the API if not found. The screen renders 2–4 inner tabs depending on role. **Overview** (all roles): Tier 1 plain-language fields. **Clinical** (clinical+): Tier 2 clinical fields — hidden for PATIENT. **Pricing** (all roles): online-only, calls getPrices with GPS — shows explicit offline warning, never empty results on network failure. **Enrich** (clinical+): role-gated form fields — DOCTOR/NURSE/LAB_TECH get localNames only; PHARMACIST/ADMIN get full set.

**Files:**
- Create: `apps/pharmopedia/src/components/RoleBadge.tsx`
- Create: `apps/pharmopedia/src/components/PriceCard.tsx`
- Create: `apps/pharmopedia/src/components/DrugDetail/OverviewTab.tsx`
- Create: `apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx`
- Create: `apps/pharmopedia/src/components/DrugDetail/PricingTab.tsx`
- Create: `apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx`
- Create: `apps/pharmopedia/app/drug/[atcCode].tsx`
- Create: `apps/pharmopedia/__tests__/screens/drug-detail.test.tsx`

- [ ] **Step 1: Write failing drug detail tests**

Create `apps/pharmopedia/__tests__/screens/drug-detail.test.tsx`:

```tsx
import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import DrugDetailScreen from '../../app/drug/[atcCode]'
import { getDrugRowByAtcCode, scopeEntryForRole } from '@/db/drug-catalog'
import { useAuthStore } from '@/store/auth-store'

jest.mock('@/db/drug-catalog', () => ({
  getDrugRowByAtcCode: jest.fn(),
  scopeEntryForRole: jest.fn(),
}))
jest.mock('@/db/migrations', () => ({ getDatabase: jest.fn() }))
jest.mock('@/api/drug-catalog', () => ({ getDrugByAtcCodeApi: jest.fn() }))
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ atcCode: 'J01CA04' }),
  useRouter: () => ({ back: jest.fn() }),
}))

const tier1Entry = {
  atcCode: 'J01CA04', innName: 'amoxicillin', brandNames: ['Augmentin'],
  doseForms: ['tablet'], therapeuticClass: 'Antibiotic', localNames: {},
  summaryPlain: { en: 'Broad-spectrum antibiotic.' },
  usedFor: [{ en: 'Bacterial infections' }], commonSideEffects: [{ en: 'Nausea' }],
  whenToSeekHelp: { en: 'If rash develops' }, storageInstructions: { en: 'Store below 25°C' },
  pregnancySummaryPlain: { en: 'Category B' }, warningsSummaryPlain: { en: 'Allergy risk' },
  version: 1, lastUpdated: '2026-06-12T00:00:00Z',
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(getDrugRowByAtcCode as jest.Mock).mockResolvedValue({ tier1_json: JSON.stringify(tier1Entry), tier2_json: null, tier3_json: null })
  ;(scopeEntryForRole as jest.Mock).mockReturnValue(tier1Entry)
})

describe('DrugDetailScreen', () => {
  it('renders INN name after loading', async () => {
    useAuthStore.setState({ token: 'tok', user: { sub: 'u1', role: 'PATIENT' }, isAuthenticated: true, initialized: true })
    const { findByText } = render(<DrugDetailScreen />)
    expect(await findByText('amoxicillin')).toBeTruthy()
  })

  it('does not render Clinical tab for PATIENT role', async () => {
    useAuthStore.setState({ token: 'tok', user: { sub: 'u1', role: 'PATIENT' }, isAuthenticated: true, initialized: true })
    const { queryByText, findByText } = render(<DrugDetailScreen />)
    await findByText('amoxicillin')
    expect(queryByText('Clinical')).toBeNull()
  })

  it('renders Clinical tab for DOCTOR role', async () => {
    useAuthStore.setState({ token: 'tok', user: { sub: 'u1', role: 'DOCTOR' }, isAuthenticated: true, initialized: true })
    const { findByText } = render(<DrugDetailScreen />)
    expect(await findByText('Clinical')).toBeTruthy()
  })

  it('renders Enrich tab for PHARMACIST role', async () => {
    useAuthStore.setState({ token: 'tok', user: { sub: 'u1', role: 'PHARMACIST' }, isAuthenticated: true, initialized: true })
    const { findByText } = render(<DrugDetailScreen />)
    expect(await findByText('Enrich')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "screens/drug-detail"
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create shared component files**

Create `apps/pharmopedia/src/components/RoleBadge.tsx`:

```tsx
import { View, Text, StyleSheet } from 'react-native'

const ROLE_COLORS: Record<string, string> = {
  PATIENT: '#dbeafe', DOCTOR: '#dcfce7', NURSE: '#dcfce7', LAB_TECH: '#fef3c7',
  PHARMACIST: '#f3e8ff', ADMIN: '#fee2e2',
}
const ROLE_TEXT_COLORS: Record<string, string> = {
  PATIENT: '#1d4ed8', DOCTOR: '#15803d', NURSE: '#15803d', LAB_TECH: '#92400e',
  PHARMACIST: '#7e22ce', ADMIN: '#b91c1c',
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: ROLE_COLORS[role] ?? '#f3f4f6' }]}>
      <Text style={[styles.text, { color: ROLE_TEXT_COLORS[role] ?? '#374151' }]}>
        {role}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '600' },
})
```

Create `apps/pharmopedia/src/components/PriceCard.tsx`:

```tsx
import { View, Text, StyleSheet } from 'react-native'
import type { PharmacyPrice } from '@ultranos/shared-types'

const STOCK_LABELS = { in_stock: 'In stock', low_stock: 'Low stock', out_of_stock: 'Out of stock' }
const STOCK_COLORS = { in_stock: '#15803d', low_stock: '#92400e', out_of_stock: '#b91c1c' }

export function PriceCard({ price }: { price: PharmacyPrice }) {
  return (
    <View style={styles.card} testID={`price-card-${price.facilityId}`}>
      <View style={styles.row}>
        <Text style={styles.pharmacy}>{price.pharmacyName}</Text>
        <Text style={styles.priceText}>{price.retailPrice.toFixed(2)} AFN</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.distance}>{price.distanceKm.toFixed(1)} km away</Text>
        <Text style={[styles.stock, { color: STOCK_COLORS[price.stockSignal] }]}>
          {STOCK_LABELS[price.stockSignal]}
        </Text>
      </View>
      {price.doseForm && (
        <Text style={styles.meta}>{price.doseForm}{price.quantity ? ` × ${price.quantity}` : ''}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fff' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pharmacy: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  priceText: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  distance: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  stock: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  meta: { fontSize: 13, color: '#6b7280', marginTop: 4 },
})
```

- [ ] **Step 4: Create DrugDetail tab components**

Create `apps/pharmopedia/src/components/DrugDetail/OverviewTab.tsx`:

```tsx
import { ScrollView, View, Text, StyleSheet } from 'react-native'
import type { DrugEntryTier1 } from '@ultranos/shared-types'

type Lang = 'en' | 'prs' | 'ps'

function localText(field: Record<string, string | undefined>, lang: Lang): string {
  return field[lang] ?? field.en ?? ''
}

export function OverviewTab({ entry, lang }: { entry: DrugEntryTier1; lang: Lang }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {entry.summaryPlain && localText(entry.summaryPlain, lang) ? (
        <Section title="Summary" text={localText(entry.summaryPlain, lang)} />
      ) : null}
      {entry.usedFor.length > 0 && (
        <Section title="Used for" items={entry.usedFor.map(f => localText(f, lang)).filter(Boolean)} />
      )}
      {entry.commonSideEffects.length > 0 && (
        <Section title="Common side effects" items={entry.commonSideEffects.map(f => localText(f, lang)).filter(Boolean)} />
      )}
      {localText(entry.whenToSeekHelp, lang) ? (
        <Section title="When to seek help" text={localText(entry.whenToSeekHelp, lang)} />
      ) : null}
      {localText(entry.storageInstructions, lang) ? (
        <Section title="Storage" text={localText(entry.storageInstructions, lang)} />
      ) : null}
      {localText(entry.pregnancySummaryPlain, lang) ? (
        <Section title="Pregnancy" text={localText(entry.pregnancySummaryPlain, lang)} />
      ) : null}
      {localText(entry.warningsSummaryPlain, lang) ? (
        <Section title="Warnings" text={localText(entry.warningsSummaryPlain, lang)} />
      ) : null}
    </ScrollView>
  )
}

function Section({ title, text, items }: { title: string; text?: string; items?: string[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {text && <Text style={styles.sectionText}>{text}</Text>}
      {items?.map((item, i) => <Text key={i} style={styles.item}>• {item}</Text>)}
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionText: { fontSize: 15, color: '#111827', lineHeight: 22 },
  item: { fontSize: 15, color: '#111827', lineHeight: 22 },
})
```

Create `apps/pharmopedia/src/components/DrugDetail/ClinicalTab.tsx`:

```tsx
import { ScrollView, View, Text, StyleSheet } from 'react-native'
import type { DrugEntryTier2 } from '@ultranos/shared-types'

export function ClinicalTab({ entry }: { entry: DrugEntryTier2 }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {entry.mechanismOfAction && (
        <Section title="Mechanism of action" text={entry.mechanismOfAction} />
      )}
      {entry.indicationsClinical.length > 0 && (
        <Section title="Clinical indications" items={entry.indicationsClinical} />
      )}
      {entry.contraindications.length > 0 && (
        <Section title="Contraindications" items={entry.contraindications} />
      )}
      {entry.adverseEvents.length > 0 && (
        <Section title="Adverse events" items={entry.adverseEvents.map(e => e.effect)} />
      )}
      {entry.adultDosing.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Adult dosing</Text>
          {entry.adultDosing.map((d, i) => (
            <Text key={i} style={styles.dosing}>
              {d.indication}: {d.adultDose} {d.frequency}{d.route ? ` (${d.route})` : ''}
            </Text>
          ))}
        </View>
      )}
      {entry.pregnancyCategory && (
        <Section title="Pregnancy category" text={`Category ${entry.pregnancyCategory}`} />
      )}
      {entry.renalAdjustment && (
        <Section title="Renal adjustment" text={entry.renalAdjustment} />
      )}
    </ScrollView>
  )
}

function Section({ title, text, items }: { title: string; text?: string; items?: string[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {text && <Text style={styles.text}>{text}</Text>}
      {items?.map((item, i) => <Text key={i} style={styles.text}>• {item}</Text>)}
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  text: { fontSize: 15, color: '#111827', lineHeight: 22 },
  dosing: { fontSize: 15, color: '#111827', lineHeight: 22, marginBottom: 4 },
})
```

Create `apps/pharmopedia/src/components/DrugDetail/PricingTab.tsx`:

```tsx
import { useState, useEffect } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import * as Location from 'expo-location'
import { getDrugPricesApi } from '@/api/drug-catalog'
import { useAuthStore } from '@/store/auth-store'
import { PriceCard } from '@/components/PriceCard'
import type { PharmacyPrice } from '@ultranos/shared-types'

type Sort = 'distance' | 'price'

export function PricingTab({ atcCode }: { atcCode: string }) {
  const token = useAuthStore((s) => s.token)
  const [prices, setPrices] = useState<PharmacyPrice[]>([])
  const [sort, setSort] = useState<Sort>('distance')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadPrices()
  }, [sort])

  async function loadPrices() {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setError('Location permission required to find nearby pharmacies')
        setLoading(false)
        return
      }
      const loc = await Location.getCurrentPositionAsync({})
      const results = await getDrugPricesApi(
        atcCode, loc.coords.latitude, loc.coords.longitude, sort, 10, token
      )
      setPrices(results)
    } catch {
      // Never silently show empty results on failure — always show explicit message
      setError('Pricing unavailable — check your connection and try again')
    }
    setLoading(false)
  }

  return (
    <View style={styles.container}>
      {/* Sort toggle */}
      <View style={styles.sortRow}>
        {(['distance', 'price'] as Sort[]).map((s) => (
          <Pressable
            key={s}
            style={[styles.sortBtn, sort === s && styles.sortBtnActive]}
            onPress={() => setSort(s)}
          >
            <Text style={[styles.sortText, sort === s && styles.sortTextActive]}>
              By {s}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 32 }} />}

      {!loading && error && (
        <View style={styles.errorBox} testID="pricing-error">
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={loadPrices} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && prices.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No pharmacy prices found nearby</Text>
        </View>
      )}

      {!loading && !error && prices.length > 0 && (
        <FlatList
          data={prices}
          keyExtractor={(item) => item.facilityId}
          renderItem={({ item }) => <PriceCard price={item} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  sortRow: { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  sortBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db' },
  sortBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  sortText: { fontSize: 14, color: '#374151' },
  sortTextActive: { color: '#fff' },
  errorBox: { padding: 24, alignItems: 'center' },
  errorText: { color: '#dc2626', textAlign: 'center', marginBottom: 12 },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#2563eb', borderRadius: 6 },
  retryText: { color: '#fff', fontWeight: '600' },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: '#6b7280' },
})
```

Create `apps/pharmopedia/src/components/DrugDetail/EnrichTab.tsx`:

```tsx
import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native'
import { enrichDrugApi } from '@/api/drug-catalog'
import { upsertDrugBatch } from '@/db/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'

const PHARMACIST_ROLES = new Set(['PHARMACIST', 'ADMIN'])
const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH'])

type FormularyStatus = 'on_formulary' | 'off_formulary' | 'restricted'

export function EnrichTab({ atcCode }: { atcCode: string }) {
  const { token, user } = useAuthStore()
  const role = user?.role ?? ''
  const isClinical = CLINICAL_ROLES.has(role) || PHARMACIST_ROLES.has(role)
  const isPharmacist = PHARMACIST_ROLES.has(role)

  const [localNameEn, setLocalNameEn] = useState('')
  const [localNamePrs, setLocalNamePrs] = useState('')
  const [dispensingNotes, setDispensingNotes] = useState('')
  const [formularyStatus, setFormularyStatus] = useState<FormularyStatus | ''>('')
  const [unitCost, setUnitCost] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isClinical) {
    return (
      <View style={styles.restricted}>
        <Text style={styles.restrictedText}>Enrichment requires clinical or pharmacist role</Text>
      </View>
    )
  }

  async function handleSubmit() {
    if (!token) return
    setLoading(true)
    setError(null)
    setSuccess(false)
    try {
      const fields: Record<string, unknown> = {}
      const localNames: Record<string, string> = {}
      if (localNameEn) localNames.en = localNameEn
      if (localNamePrs) localNames.prs = localNamePrs
      if (Object.keys(localNames).length > 0) fields.localNames = localNames
      if (isPharmacist) {
        if (dispensingNotes) fields.dispensingNotes = dispensingNotes
        if (formularyStatus) fields.formularyStatus = formularyStatus
        if (unitCost) fields.unitCost = parseFloat(unitCost)
      }
      const updated = await enrichDrugApi(atcCode, fields, token)
      // Optimistically update local DB
      await upsertDrugBatch(getDatabase(), [updated as never])
      setSuccess(true)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save enrichment')
    }
    setLoading(false)
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Local Names</Text>
      <TextInput testID="local-name-en" style={styles.input} placeholder="English name override" value={localNameEn} onChangeText={setLocalNameEn} />
      <TextInput testID="local-name-prs" style={styles.input} placeholder="Dari name (دری)" value={localNamePrs} onChangeText={setLocalNamePrs} />

      {isPharmacist && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Pharmacist Fields</Text>
          <TextInput testID="dispensing-notes" style={[styles.input, styles.multiline]} placeholder="Dispensing notes (max 500 chars)" value={dispensingNotes} onChangeText={setDispensingNotes} multiline maxLength={500} />

          <Text style={styles.label}>Formulary status</Text>
          <View style={styles.formularyRow}>
            {(['on_formulary', 'off_formulary', 'restricted'] as FormularyStatus[]).map((s) => (
              <Pressable
                key={s}
                testID={`formulary-${s}`}
                style={[styles.formularyBtn, formularyStatus === s && styles.formularyBtnActive]}
                onPress={() => setFormularyStatus(s)}
              >
                <Text style={[styles.formularyText, formularyStatus === s && styles.formularyTextActive]}>
                  {s.replace('_', ' ')}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput testID="unit-cost" style={styles.input} placeholder="Unit cost (AFN)" value={unitCost} onChangeText={setUnitCost} keyboardType="decimal-pad" />
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {success && <Text style={styles.successText}>Saved successfully</Text>}

      <Pressable testID="enrich-submit" style={styles.button} onPress={handleSubmit} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16 },
  restricted: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  restrictedText: { color: '#6b7280', textAlign: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  label: { fontSize: 14, color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 12 },
  multiline: { height: 80, textAlignVertical: 'top' },
  formularyRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  formularyBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db' },
  formularyBtnActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  formularyText: { fontSize: 13, color: '#374151' },
  formularyTextActive: { color: '#fff' },
  error: { color: '#dc2626', marginBottom: 8 },
  successText: { color: '#15803d', marginBottom: 8 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
```

- [ ] **Step 5: Create drug detail screen**

Create `apps/pharmopedia/app/drug/[atcCode].tsx`:

```tsx
import { useState, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, SafeAreaView, ScrollView } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { getDrugRowByAtcCode, scopeEntryForRole } from '@/db/drug-catalog'
import { getDrugByAtcCodeApi } from '@/api/drug-catalog'
import { getDatabase } from '@/db/migrations'
import { useAuthStore } from '@/store/auth-store'
import { OverviewTab } from '@/components/DrugDetail/OverviewTab'
import { ClinicalTab } from '@/components/DrugDetail/ClinicalTab'
import { PricingTab } from '@/components/DrugDetail/PricingTab'
import { EnrichTab } from '@/components/DrugDetail/EnrichTab'
import type { DrugEntryTier1, DrugEntryTier2, DrugEntryTier3 } from '@ultranos/shared-types'

const CLINICAL_ROLES = new Set(['DOCTOR', 'NURSE', 'LAB_TECH', 'PHARMACIST', 'ADMIN'])
type Tab = 'overview' | 'clinical' | 'pricing' | 'enrich'
type Lang = 'en' | 'prs' | 'ps'

export default function DrugDetailScreen() {
  const { atcCode } = useLocalSearchParams<{ atcCode: string }>()
  const router = useRouter()
  const { token, user } = useAuthStore()
  const role = user?.role ?? 'PATIENT'
  const isClinical = CLINICAL_ROLES.has(role)

  const [entry, setEntry] = useState<DrugEntryTier1 | DrugEntryTier2 | DrugEntryTier3 | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [lang] = useState<Lang>('en')

  const TABS: Tab[] = ['overview', ...(isClinical ? ['clinical' as Tab] : []), 'pricing', ...(isClinical ? ['enrich' as Tab] : [])]

  useEffect(() => {
    if (!atcCode) return
    loadDrug(atcCode)
  }, [atcCode])

  async function loadDrug(code: string) {
    setLoading(true)
    // Try local DB first
    const row = await getDrugRowByAtcCode(getDatabase(), code)
    if (row) {
      setEntry(scopeEntryForRole(row, role))
      setLoading(false)
      return
    }
    // Fall back to API
    if (token) {
      try {
        const apiEntry = await getDrugByAtcCodeApi(code, token)
        setEntry(apiEntry)
      } catch {
        // Not found
      }
    }
    setLoading(false)
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>
  }

  if (!entry) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Drug not found</Text>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>Go back</Text></Pressable>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.innName}>{entry.innName}</Text>
        <Text style={styles.subheader}>{entry.atcCode} · {entry.therapeuticClass}</Text>
      </View>

      {/* Inner tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            testID={`tab-${tab}`}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Tab content */}
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
  innName: { fontSize: 22, fontWeight: '700', color: '#111827', textTransform: 'capitalize' },
  subheader: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  tabBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexGrow: 0 },
  tab: { paddingHorizontal: 18, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#2563eb' },
  tabText: { fontSize: 15, color: '#6b7280' },
  tabTextActive: { color: '#2563eb', fontWeight: '600' },
  content: { flex: 1 },
  notFound: { fontSize: 18, color: '#374151', marginBottom: 12 },
  back: { color: '#2563eb', fontSize: 16 },
})
```

- [ ] **Step 6: Run drug detail tests**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "screens/drug-detail"
```
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/src/components/ apps/pharmopedia/app/drug/ apps/pharmopedia/__tests__/screens/drug-detail.test.tsx
git commit -m "feat(pharmopedia): drug detail screen — Overview, Clinical, Pricing, Enrich tabs"
```

---

## Task 13: Profile Tab

**Context:** Profile shows the user's role badge, facility (if set), sync status, manual "Sync now" button, language preference, and logout. Logout calls `auth-store.logout(db)` which clears the token and wipes the local DB + sync_meta, then redirects to `(auth)/login`. The "Sync now" button sets `sync-store.status = 'syncing'`, calls `runSync`, then updates sync-store on completion or error.

**Files:**
- Create: `apps/pharmopedia/app/(tabs)/profile.tsx`
- Create: `apps/pharmopedia/__tests__/screens/profile.test.tsx`

- [ ] **Step 1: Write failing profile tests**

Create `apps/pharmopedia/__tests__/screens/profile.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import ProfileTab from '../../app/(tabs)/profile'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { runSync } from '@/sync/catalog-sync'

jest.mock('@/sync/catalog-sync', () => ({ runSync: jest.fn() }))
jest.mock('@/db/migrations', () => ({ getDatabase: jest.fn(() => ({})) }))
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }))

const mockRunSync = runSync as jest.Mock

beforeEach(() => {
  useAuthStore.setState({
    token: 'tok', user: { sub: 'u1', role: 'DOCTOR' },
    isAuthenticated: true, initialized: true,
  })
  useSyncStore.setState({ status: 'idle', lastSyncAt: '2026-06-12T10:00:00Z', lastVersion: 5 })
  jest.clearAllMocks()
})

describe('ProfileTab', () => {
  it('renders role badge', () => {
    const { getByText } = render(<ProfileTab />)
    expect(getByText('DOCTOR')).toBeTruthy()
  })

  it('shows last synced timestamp', () => {
    const { getByTestId } = render(<ProfileTab />)
    expect(getByTestId('last-synced-text')).toBeTruthy()
  })

  it('calls runSync when Sync Now is pressed', async () => {
    mockRunSync.mockResolvedValueOnce({ synced: 3, version: 8 })
    const { getByTestId } = render(<ProfileTab />)
    fireEvent.press(getByTestId('sync-now-button'))
    await waitFor(() => expect(mockRunSync).toHaveBeenCalledTimes(1))
  })

  it('calls logout and wipes DB on logout press', async () => {
    const logoutSpy = jest.spyOn(useAuthStore.getState(), 'logout')
    const { getByTestId } = render(<ProfileTab />)
    fireEvent.press(getByTestId('logout-button'))
    await waitFor(() => expect(logoutSpy).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "screens/profile"
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create profile.tsx**

Create `apps/pharmopedia/app/(tabs)/profile.tsx`:

```tsx
import { View, Text, Pressable, StyleSheet, SafeAreaView } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuthStore } from '@/store/auth-store'
import { useSyncStore } from '@/store/sync-store'
import { runSync } from '@/sync/catalog-sync'
import { getDatabase } from '@/db/migrations'
import { RoleBadge } from '@/components/RoleBadge'

export default function ProfileTab() {
  const router = useRouter()
  const { user, token, logout } = useAuthStore()
  const { status, lastSyncAt, lastVersion, setStatus, setLastSync } = useSyncStore()

  async function handleSyncNow() {
    if (!token || status === 'syncing') return
    setStatus('syncing')
    try {
      const { version } = await runSync(getDatabase(), token)
      setLastSync(version, new Date().toISOString())
    } catch {
      setStatus('error')
    }
  }

  async function handleLogout() {
    await logout(getDatabase())
    router.replace('/(auth)/login')
  }

  function formatSyncTime(iso: string | null): string {
    if (!iso) return 'Never synced'
    const d = new Date(iso)
    return `Last synced: ${d.toLocaleDateString()} ${d.toLocaleTimeString()}`
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.label}>Role</Text>
        {user?.role && <RoleBadge role={user.role} />}
        {user?.facilityId && (
          <Text style={styles.facility}>Facility: {user.facilityId}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Catalog sync</Text>
        <Text testID="last-synced-text" style={styles.value}>{formatSyncTime(lastSyncAt)}</Text>
        <Text style={styles.value}>Version: {lastVersion}</Text>
        {status === 'syncing' && <Text style={styles.syncing}>Syncing…</Text>}
        {status === 'error' && <Text style={styles.error}>Sync failed</Text>}
        <Pressable
          testID="sync-now-button"
          style={[styles.button, status === 'syncing' && styles.buttonDisabled]}
          onPress={handleSyncNow}
          disabled={status === 'syncing'}
        >
          <Text style={styles.buttonText}>
            {status === 'syncing' ? 'Syncing…' : 'Sync Now'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Pressable
          testID="logout-button"
          style={[styles.button, styles.logoutButton]}
          onPress={handleLogout}
        >
          <Text style={[styles.buttonText, styles.logoutText]}>Log Out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 20 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  value: { fontSize: 15, color: '#374151' },
  facility: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  syncing: { fontSize: 14, color: '#2563eb' },
  error: { fontSize: 14, color: '#dc2626' },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  logoutButton: { backgroundColor: '#fee2e2' },
  logoutText: { color: '#b91c1c' },
})
```

- [ ] **Step 4: Run profile tests**

```bash
pnpm -F @ultranos/pharmopedia test -- --testPathPattern "screens/profile"
```
Expected: All tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
pnpm -F @ultranos/pharmopedia test
```
Expected: All tests PASS.

- [ ] **Step 6: Full typecheck**

```bash
pnpm -F @ultranos/pharmopedia typecheck
pnpm typecheck
```
Expected: No errors across the entire monorepo.

- [ ] **Step 7: Commit**

```bash
git add apps/pharmopedia/app/(tabs)/profile.tsx apps/pharmopedia/__tests__/screens/profile.test.tsx
git commit -m "feat(pharmopedia): profile tab — sync status, sync-now, logout"
```
