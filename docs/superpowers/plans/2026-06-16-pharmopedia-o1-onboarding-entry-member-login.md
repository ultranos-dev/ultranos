# Pharmopedia O1 — Onboarding Entry + Member Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single login screen with a two-path onboarding chooser (Ultranos member vs public) and repurpose `login.tsx` as email/password member sign-in, styled to mirror the OPD Lite / Lab Lite login.

**Architecture:** A shared `AuthShell` component (translated from the OPD/Lab Lite ShadCN login-02 left panel: branded icon-chip + wordmark + language chips header, centered title/subtitle + content, "Ultranos Healthcare Platform" footer) is the base for both a new `onboarding.tsx` chooser and the rebuilt `login.tsx`. The public path routes to the existing `register.tsx` until O2.

**Tech Stack:** Expo Router, React Native, Supabase Auth, `@ultranos/ui-kit/native` (Button), Vitest + react-test-renderer.

**Conventions (keep):** tokens-only; theme via `useThemeColors`; RTL via `isRtlLang`; icons from `lucide-react-native`. **Commits:** repo forbids autonomous commits — run `Commit` steps only on the user's go-ahead, with the `Co-Authored-By` trailer.

---

## File Structure

**Created:**
- `apps/pharmopedia/src/components/AuthShell.tsx` — shared auth screen scaffold (header chip + wordmark + LanguageChips, centered content, footer).
- `apps/pharmopedia/app/(auth)/onboarding.tsx` — two-path chooser.
- Tests: `src/__tests__/auth-shell.test.tsx`, `src/__tests__/onboarding-screen.test.tsx`.

**Modified:**
- `apps/pharmopedia/app/(auth)/login.tsx` — rebuilt as member sign-in on `AuthShell` (toggle + patient-OTP removed).
- `apps/pharmopedia/app/(auth)/_layout.tsx` — register `onboarding` (initial route).
- `apps/pharmopedia/app/_layout.tsx` — unauthenticated redirect → `/(auth)/onboarding`.
- `apps/pharmopedia/app/welcome.tsx` — "Get Started" → `/(auth)/onboarding`.
- `apps/pharmopedia/src/i18n/locales/{en,prs,ps,ar}.ts` — `onboarding` namespace + `login.memberTitle`/`memberSubtitle` + `common.poweredBy`.
- `apps/pharmopedia/src/__mocks__/lucide-react-native.js` — add `Building2`, `UserPlus`.
- `apps/pharmopedia/src/__tests__/login-screen.test.tsx`, `welcome-screen.test.tsx` — updated for the new flow.

---

## Task 1: i18n keys + lucide mock icons

**Files:**
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts`, `prs.ts`, `ps.ts`, `ar.ts`
- Modify: `apps/pharmopedia/src/__mocks__/lucide-react-native.js`

- [ ] **Step 1: Add `common.poweredBy` to each locale's `common` block**
- `en.ts`: `poweredBy: 'Ultranos Healthcare Platform',`
- `prs.ts`: `poweredBy: 'پلتفرم صحی اولترانوس',`
- `ps.ts`: `poweredBy: 'د اولټرانوس روغتیایی پلیټفارم',`
- `ar.ts`: `poweredBy: 'منصة أولترانوس الصحية',`

- [ ] **Step 2: Add `memberTitle` + `memberSubtitle` to each locale's `login` block**
- `en.ts`: `memberTitle: 'Sign in to Ultranos',` and `memberSubtitle: 'Use your Ultranos staff account',`
- `prs.ts`: `memberTitle: 'ورود به اولترانوس',` `memberSubtitle: 'از حساب کارمندی اولترانوس خود استفاده کنید',`
- `ps.ts`: `memberTitle: 'اولټرانوس ته ننوتل',` `memberSubtitle: 'د اولټرانوس د کارمند حساب وکاروئ',`
- `ar.ts`: `memberTitle: 'تسجيل الدخول إلى أولترانوس',` `memberSubtitle: 'استخدم حساب موظفي أولترانوس',`

- [ ] **Step 3: Add an `onboarding` namespace block to each locale (after the `tabs` or `home` block — same position in all four)**

`en.ts`:
```ts
  onboarding: {
    chooseTitle: 'Welcome to Pharmopedia',
    chooseSubtitle: 'How would you like to continue?',
    memberTitle: 'I use an Ultranos app',
    memberSubtitle: 'Sign in with your OPD Lite, Pharmacy Lite, Lab Lite or Admin account',
    publicTitle: "I'm new here",
    publicSubtitle: 'Create a personal account',
  },
```
`prs.ts`:
```ts
  onboarding: {
    chooseTitle: 'به فارموپیدیا خوش آمدید',
    chooseSubtitle: 'چگونه می‌خواهید ادامه دهید؟',
    memberTitle: 'من از یک برنامه اولترانوس استفاده می‌کنم',
    memberSubtitle: 'با حساب OPD Lite، Pharmacy Lite، Lab Lite یا Admin خود وارد شوید',
    publicTitle: 'من تازه‌وارد هستم',
    publicSubtitle: 'یک حساب شخصی بسازید',
  },
```
`ps.ts`:
```ts
  onboarding: {
    chooseTitle: 'فارموپیډیا ته ښه راغلاست',
    chooseSubtitle: 'څنګه غواړئ دوام ورکړئ؟',
    memberTitle: 'زه د اولټرانوس له یوې اپلیکیشن څخه کار اخلم',
    memberSubtitle: 'د خپل OPD Lite، Pharmacy Lite، Lab Lite یا Admin حساب سره ننوځئ',
    publicTitle: 'زه دلته نوی یم',
    publicSubtitle: 'شخصي حساب جوړ کړئ',
  },
```
`ar.ts`:
```ts
  onboarding: {
    chooseTitle: 'مرحبًا بك في فارموبيديا',
    chooseSubtitle: 'كيف ترغب في المتابعة؟',
    memberTitle: 'أستخدم أحد تطبيقات أولترانوس',
    memberSubtitle: 'سجّل الدخول بحساب OPD Lite أو Pharmacy Lite أو Lab Lite أو Admin',
    publicTitle: 'أنا جديد هنا',
    publicSubtitle: 'أنشئ حسابًا شخصيًا',
  },
```
Keep the `onboarding` block at the **same position** in all four files so the objects stay structurally identical (`Translations = typeof en`).

- [ ] **Step 4: Add `Building2` and `UserPlus` to the lucide mock**

In `apps/pharmopedia/src/__mocks__/lucide-react-native.js` add near the other icon consts:
```js
const Building2 = createIconMock('Building2')
const UserPlus = createIconMock('UserPlus')
```
and add `Building2,` and `UserPlus,` to the `module.exports = { … }` object.

- [ ] **Step 5: Typecheck locale parity**

Run: `pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -E "locales/(prs|ps|ar)\.ts" | grep -iE "onboarding|poweredBy|memberTitle|memberSubtitle" | head`
Expected: empty (no missing-key errors for the new keys). Pre-existing unrelated literal-type errors in those files may remain — ignore.

- [ ] **Step 6: Commit**
```bash
git add apps/pharmopedia/src/i18n/locales apps/pharmopedia/src/__mocks__/lucide-react-native.js
git commit -m "i18n(pharmopedia): onboarding namespace + member-login keys"
```

---

## Task 2: AuthShell component

**Files:**
- Create: `apps/pharmopedia/src/components/AuthShell.tsx`
- Test: `apps/pharmopedia/src/__tests__/auth-shell.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/auth-shell.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'
import { Text } from 'react-native'
import { AuthShell } from '@/components/AuthShell'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string; setLang: () => void }) => unknown) => s({ lang: 'en', setLang: vi.fn() }), isRtlLang: () => false }))

describe('AuthShell', () => {
  it('renders the wordmark, title, subtitle, children, and footer', () => {
    const { getByText } = render(
      <AuthShell title="Sign in" subtitle="Use your account"><Text>form-here</Text></AuthShell>,
    )
    expect(getByText('Pharmopedia')).toBeTruthy()
    expect(getByText('Sign in')).toBeTruthy()
    expect(getByText('Use your account')).toBeTruthy()
    expect(getByText('form-here')).toBeTruthy()
    expect(getByText('common.poweredBy')).toBeTruthy()
  })

  it('shows a back control only when onBack is provided and fires it', () => {
    const onBack = vi.fn()
    const { getByTestId, queryByTestId, rerender } = render(<AuthShell title="T"><Text>x</Text></AuthShell>)
    expect(queryByTestId('auth-back')).toBeNull()
    rerender(<AuthShell title="T" onBack={onBack}><Text>x</Text></AuthShell>)
    fireEvent.press(getByTestId('auth-back'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/auth-shell.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AuthShell**

Create `apps/pharmopedia/src/components/AuthShell.tsx`:
```tsx
import { type ReactNode } from 'react'
import { View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Pill, ChevronLeft } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useLangStore, isRtlLang } from '@/store/lang-store'
import { LanguageChips } from '@/components/LanguageChips'

interface Props {
  title: string
  subtitle?: string
  onBack?: () => void
  children: ReactNode
}

export function AuthShell({ title, subtitle, onBack, children }: Props) {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const rtl = isRtlLang(useLangStore((s) => s.lang))
  const align = { textAlign: rtl ? ('right' as const) : ('left' as const) }
  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.surface }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={[styles.header, rtl && styles.headerRtl]}>
          {onBack ? (
            <Pressable testID="auth-back" onPress={onBack} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8} style={styles.back}>
              <ChevronLeft size={22} color={colors.textPrimary} style={rtl ? styles.flip : undefined} />
            </Pressable>
          ) : null}
          <View style={[styles.chip, { backgroundColor: colors.primary500 }]}><Pill size={16} color={colors.white} /></View>
          <Text style={[styles.wordmark, { color: colors.textPrimary }]}>Pharmopedia</Text>
        </View>
        <LanguageChips />
        <ScrollView contentContainerStyle={styles.center} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Text style={[styles.title, { color: colors.textPrimary }, align, rtl && styles.arabic]}>{title}</Text>
            {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }, align, rtl && styles.arabic]}>{subtitle}</Text> : null}
            <View style={styles.body}>{children}</View>
          </View>
        </ScrollView>
        <Text style={[styles.footer, { color: colors.textMuted }]}>{t('common.poweredBy')}</Text>
      </SafeAreaView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: Spacing[6] },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], paddingTop: Spacing[2] },
  headerRtl: { flexDirection: 'row-reverse' },
  back: { padding: Spacing[1] },
  flip: { transform: [{ scaleX: -1 }] },
  chip: { width: 32, height: 32, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontFamily: FontFamily.headingBold, fontSize: FontSize.base },
  center: { flexGrow: 1, justifyContent: 'center' },
  content: { width: '100%', maxWidth: 360, alignSelf: 'center', gap: Spacing[3] },
  title: { fontFamily: FontFamily.headingBold, fontSize: FontSize['2xl'] },
  subtitle: { fontFamily: FontFamily.sans, fontSize: FontSize.sm },
  arabic: { fontFamily: FontFamily.arabic },
  body: { gap: Spacing[3], marginTop: Spacing[2] },
  footer: { fontFamily: FontFamily.sans, fontSize: FontSize.xs, textAlign: 'center', paddingVertical: Spacing[3] },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/auth-shell.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add apps/pharmopedia/src/components/AuthShell.tsx apps/pharmopedia/src/__tests__/auth-shell.test.tsx
git commit -m "feat(pharmopedia): AuthShell scaffold (OPD/Lab Lite login style)"
```

---

## Task 3: Onboarding chooser

**Files:**
- Create: `apps/pharmopedia/app/(auth)/onboarding.tsx`
- Test: `apps/pharmopedia/src/__tests__/onboarding-screen.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/pharmopedia/src/__tests__/onboarding-screen.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react-native'

const push = vi.fn()
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string; setLang: () => void }) => unknown) => s({ lang: 'en', setLang: vi.fn() }), isRtlLang: () => false }))

import OnboardingScreen from '@/app/(auth)/onboarding'

describe('OnboardingScreen', () => {
  it('renders both choice cards', () => {
    const { getByText } = render(<OnboardingScreen />)
    expect(getByText('onboarding.memberTitle')).toBeTruthy()
    expect(getByText('onboarding.publicTitle')).toBeTruthy()
  })

  it('routes the member card to login and the public card to register', () => {
    const { getByTestId } = render(<OnboardingScreen />)
    fireEvent.press(getByTestId('onboarding-member'))
    expect(push).toHaveBeenCalledWith('/(auth)/login')
    fireEvent.press(getByTestId('onboarding-public'))
    expect(push).toHaveBeenCalledWith('/(auth)/register')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/onboarding-screen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the chooser**

Create `apps/pharmopedia/app/(auth)/onboarding.tsx`:
```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Building2, UserPlus, ChevronRight } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { AuthShell } from '@/components/AuthShell'

export default function OnboardingScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()

  const cards: { testID: string; icon: LucideIcon; title: string; subtitle: string; onPress: () => void }[] = [
    { testID: 'onboarding-member', icon: Building2, title: t('onboarding.memberTitle'), subtitle: t('onboarding.memberSubtitle'), onPress: () => router.push('/(auth)/login') },
    { testID: 'onboarding-public', icon: UserPlus, title: t('onboarding.publicTitle'), subtitle: t('onboarding.publicSubtitle'), onPress: () => router.push('/(auth)/register') },
  ]

  return (
    <AuthShell title={t('onboarding.chooseTitle')} subtitle={t('onboarding.chooseSubtitle')}>
      <View style={styles.cards}>
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <Pressable
              key={c.testID}
              testID={c.testID}
              onPress={c.onPress}
              accessibilityRole="button"
              accessibilityLabel={c.title}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.primary50 }]}><Icon size={22} color={colors.primary600} /></View>
              <View style={styles.cardBody}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{c.title}</Text>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>{c.subtitle}</Text>
              </View>
              <ChevronRight size={20} color={colors.textMuted} />
            </Pressable>
          )
        })}
      </View>
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  cards: { gap: Spacing[3], marginTop: Spacing[2] },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3], borderWidth: 1, borderRadius: Radius.lg, padding: Spacing[4] },
  iconWrap: { width: 44, height: 44, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontFamily: FontFamily.sansSemibold, fontSize: FontSize.base },
  cardSub: { fontFamily: FontFamily.sans, fontSize: FontSize.sm },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/onboarding-screen.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add "apps/pharmopedia/app/(auth)/onboarding.tsx" apps/pharmopedia/src/__tests__/onboarding-screen.test.tsx
git commit -m "feat(pharmopedia): onboarding entry chooser"
```

---

## Task 4: Rebuild login.tsx as member sign-in

**Files:**
- Modify (replace): `apps/pharmopedia/app/(auth)/login.tsx`
- Modify: `apps/pharmopedia/src/__tests__/login-screen.test.tsx`

- [ ] **Step 1: Replace the login test for the new flow**

Replace `apps/pharmopedia/src/__tests__/login-screen.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react-native'

const replace = vi.fn()
const back = vi.fn()
const signInWithPassword = vi.fn(async () => ({ data: { session: null }, error: { message: 'bad' } }))
const resetPasswordForEmail = vi.fn(async () => ({ error: null }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ replace, back }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithPassword, resetPasswordForEmail } } }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { login: () => void }) => unknown) => s({ login: vi.fn() }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string; setLang: () => void }) => unknown) => s({ lang: 'en', setLang: vi.fn() }), isRtlLang: () => false }))

import LoginScreen from '@/app/(auth)/login'

describe('LoginScreen (member sign-in)', () => {
  it('renders email + password and the member title; no clinical/patient toggle', () => {
    const { getByTestId, queryByTestId, getByText } = render(<LoginScreen />)
    expect(getByText('login.memberTitle')).toBeTruthy()
    expect(getByTestId('email-input')).toBeTruthy()
    expect(getByTestId('password-input')).toBeTruthy()
    expect(queryByTestId('clinical-tab')).toBeNull()
    expect(queryByTestId('patient-tab')).toBeNull()
  })

  it('calls signInWithPassword on submit', async () => {
    const { getByTestId } = render(<LoginScreen />)
    fireEvent.changeText(getByTestId('email-input'), 'a@b.co')
    fireEvent.changeText(getByTestId('password-input'), 'pw')
    fireEvent.press(getByTestId('login-button'))
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalled())
  })

  it('triggers a reset email from forgot-password', async () => {
    const { getByTestId } = render(<LoginScreen />)
    fireEvent.changeText(getByTestId('email-input'), 'a@b.co')
    fireEvent.press(getByTestId('forgot-password-button'))
    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.co'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/login-screen.test.tsx`
Expected: FAIL — old `login.tsx` still has the toggle / missing `login.memberTitle`.

- [ ] **Step 3: Replace `login.tsx`**

Replace `apps/pharmopedia/app/(auth)/login.tsx`:
```tsx
import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'
import { hapticNotification } from '@/lib/haptics'
import { NotificationFeedbackType } from 'expo-haptics'
import { Button } from '@ultranos/ui-kit/native'
import { FontFamily, FontSize, Radius, Spacing } from '@ultranos/ui-kit/tokens.native'
import { useThemeColors } from '@/hooks/useThemeColors'
import { AuthShell } from '@/components/AuthShell'

export default function LoginScreen() {
  const { t } = useTranslation()
  const colors = useThemeColors()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)

  async function handleSignIn() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err || !data.session) {
      setError(err?.message ?? t('login.loginFailed'))
      void hapticNotification(NotificationFeedbackType.Error)
      return
    }
    const session = data.session
    const meta = (session.user.app_metadata ?? {}) as Record<string, unknown>
    login(session.access_token, {
      sub: session.user.id,
      role: (meta['role'] as string) ?? 'PATIENT',
      facilityId: meta['facilityId'] as string | undefined,
    })
    router.replace('/(tabs)' as never)
  }

  async function handleForgotPassword() {
    if (!email) { setError(t('login.resetEmail')); return }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email)
    setLoading(false)
    if (err) {
      setError(t('login.resetFailed'))
      void hapticNotification(NotificationFeedbackType.Error)
    } else {
      setError(null)
      setResetSent(true)
    }
  }

  return (
    <AuthShell title={t('login.memberTitle')} subtitle={t('login.memberSubtitle')} onBack={() => router.back()}>
      {error ? (
        <View style={[styles.banner, { backgroundColor: colors.dangerLight, borderColor: colors.danger }]}>
          <Text style={[styles.bannerText, { color: colors.dangerDark }]}>{error}</Text>
        </View>
      ) : null}
      {resetSent ? (
        <View style={[styles.banner, { backgroundColor: colors.successLight, borderColor: colors.success }]}>
          <Text style={[styles.bannerText, { color: colors.successDark }]}>{t('login.resetSent')}</Text>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('login.email')}</Text>
        <TextInput
          testID="email-input"
          style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]}
          placeholder={t('login.email')}
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>{t('login.password')}</Text>
        <TextInput
          testID="password-input"
          style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surfaceSubtle }]}
          placeholder={t('login.password')}
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </View>
      <Pressable testID="forgot-password-button" onPress={handleForgotPassword} style={styles.forgotRow} accessibilityRole="button" accessibilityLabel={t('login.forgotPassword')}>
        <Text style={[styles.forgot, { color: colors.textMuted }]}>{t('login.forgotPassword')}</Text>
      </Pressable>
      <Button testID="login-button" label={t('login.logIn')} variant="primary" loading={loading} onPress={handleSignIn} />
    </AuthShell>
  )
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: Radius.lg, paddingHorizontal: Spacing[4], paddingVertical: Spacing[3] },
  bannerText: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
  field: { gap: Spacing[1] },
  label: { fontFamily: FontFamily.sansMedium, fontSize: FontSize.sm },
  input: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing[3], fontSize: FontSize.base, fontFamily: FontFamily.sans },
  forgotRow: { alignSelf: 'flex-end' },
  forgot: { fontFamily: FontFamily.sans, fontSize: FontSize.sm },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/login-screen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add "apps/pharmopedia/app/(auth)/login.tsx" apps/pharmopedia/src/__tests__/login-screen.test.tsx
git commit -m "feat(pharmopedia): member sign-in on AuthShell (toggle/OTP removed)"
```

---

## Task 5: Routing wiring (welcome → onboarding, redirect, auth stack)

**Files:**
- Modify: `apps/pharmopedia/app/(auth)/_layout.tsx`
- Modify: `apps/pharmopedia/app/_layout.tsx`
- Modify: `apps/pharmopedia/app/welcome.tsx`
- Modify: `apps/pharmopedia/src/__tests__/welcome-screen.test.tsx`

- [ ] **Step 1: Add a navigation assertion to the welcome test**

The current `welcome-screen.test.tsx` mocks `expo-router` with an inline `replace: vi.fn()` (unassertable) and only checks rendered text. Make the `replace` mock stable and add a navigation test. Replace the `expo-router` mock block and add the test:

Change the mock (top of file):
```tsx
const replace = vi.fn()
vi.mock('expo-router', () => ({
  useRouter: () => ({ replace }),
}))
```
Add inside `describe('WelcomeScreen', …)`:
```tsx
  it('routes Get Started to the onboarding chooser', async () => {
    const { getByTestId } = render(<WelcomeScreen />)
    fireEvent.press(getByTestId('get-started-button'))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/(auth)/onboarding'))
  })
```
Add `fireEvent, waitFor` to the `@testing-library/react-native` import. (`get-started-button` is the existing testID in `welcome.tsx`; `handleGetStarted` is async — `waitFor` covers the `await` before `replace`.)

- [ ] **Step 2: Run the welcome test to verify it fails**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/welcome-screen.test.tsx`
Expected: FAIL — welcome still routes to `/(auth)/login`.

- [ ] **Step 3: Point welcome at onboarding**

In `apps/pharmopedia/app/welcome.tsx`, change the `handleGetStarted` redirect:
```ts
    router.replace('/(auth)/onboarding')
```
(replacing `router.replace('/(auth)/login')`).

- [ ] **Step 4: Register the onboarding screen as the auth stack's first route**

Replace `apps/pharmopedia/app/(auth)/_layout.tsx`:
```tsx
import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  )
}
```

- [ ] **Step 5: Point the unauthenticated redirect at onboarding**

In `apps/pharmopedia/app/_layout.tsx`, change the redirect target:
```tsx
      {!showWelcome && !isAuthenticated && <Redirect href="/(auth)/onboarding" />}
```
(replacing `href="/(auth)/login"`).

- [ ] **Step 6: Run the welcome test to verify it passes**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/welcome-screen.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add "apps/pharmopedia/app/(auth)/_layout.tsx" apps/pharmopedia/app/_layout.tsx apps/pharmopedia/app/welcome.tsx apps/pharmopedia/src/__tests__/welcome-screen.test.tsx
git commit -m "feat(pharmopedia): route entry through onboarding chooser"
```

---

## Task 6: Finalize — full suite + typechecks

**Files:** none (verification only)

- [ ] **Step 1: Full Pharmopedia suite**

Run: `pnpm --filter @ultranos/pharmopedia test 2>&1 | grep -E "Test Files|Tests |FAIL " | sort | uniq`
Expected: the new auth-shell/onboarding tests pass and login/welcome tests pass. The previously-failing `login-screen` "register-link" case is **gone** (login was rebuilt). Remaining failures should only be the `clinical-tab-extended` ×4 (drug-detail content → E5). Confirm no NEW failures.

- [ ] **Step 2: ui-native unaffected**

Run: `pnpm --filter @ultranos/pharmopedia exec vitest run src/__tests__/ui-native 2>&1 | grep -E "Test Files|Tests "`
Expected: 12 files / 41 tests pass (unchanged).

- [ ] **Step 3: Typechecks**

Run: `pnpm --filter @ultranos/ui-kit typecheck >/dev/null 2>&1 && echo UIKIT_PASS; pnpm --filter @ultranos/pharmopedia typecheck 2>&1 | grep -c "native/"`
Expected: `UIKIT_PASS` and native error count `0`.

- [ ] **Step 4: Commit (only if verification-driven fixes were needed)**
```bash
git add -A
git commit -m "chore(pharmopedia): O1 onboarding entry + member login complete"
```

---

## Self-Review

**Spec coverage (O1 spec §2a, §3):**
- §2a auth shell (icon-chip + wordmark + LanguageChips header, centered title/subtitle, footer, banners/labeled-fields/full-width button) → Task 2 (`AuthShell`) + Task 4 (login fields/banners/button). ✓
- §3.1 onboarding chooser on the shell → Task 3. ✓
- §3.2 welcome → onboarding → Task 5. ✓
- §3.3 member sign-in (toggle + patient-OTP removed; email/password + forgot-password; back to chooser) → Task 4. ✓
- §3.4 routing wiring (auth stack initial route + unauth redirect) → Task 5. ✓
- §3.5 i18n (onboarding ns + login.memberTitle/Subtitle + common.poweredBy, 4 locales) → Task 1. ✓
- §4 testing (chooser routes; member login email/pw + forgot-password, no toggle; welcome → onboarding) → Tasks 2–5; finalize Task 6. ✓
- §6 success criteria → Task 6. ✓

**Placeholder scan:** every code/test step has complete code; commands have expected results. Task 5 Step 1 references the existing welcome test's mock shape (router `replace`) and gives the exact new assertion — concrete, not a placeholder. ✓

**Type consistency:** `AuthShell({ title, subtitle, onBack, children })` consistent across Tasks 2/3/4; `Button` imported from `@ultranos/ui-kit/native` with `label/variant/loading/onPress/testID` (E1 API); icons `Building2`/`UserPlus` added to the mock in Task 1 before use in Task 3; i18n keys used in Tasks 3/4 (`onboarding.*`, `login.memberTitle/Subtitle`, `common.poweredBy`) all defined in Task 1. ✓

**Carried caveat:** premium feel / final spacing + the OPD-Lite side-by-side comparison need a real Expo run (consistent with the standing animation caveat).
```
