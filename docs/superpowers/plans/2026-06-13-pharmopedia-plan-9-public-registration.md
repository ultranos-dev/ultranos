# Pharmopedia Plan 9 — Public User Registration Screen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-registration screen for public users that uses phone OTP, mirrors the patient login OTP flow, and is accessible from a "Register" link on the login screen.

**Architecture:** A new `app/(auth)/register.tsx` screen reuses the same `supabase.auth.signInWithOtp` + `verifyOtp` call chain as the patient login path — Supabase creates the user on first OTP verify if they don't exist. The role defaults to `'PATIENT'` from `app_metadata`. `_layout.tsx` gets one additional `Stack.Screen` entry; `login.tsx` gets a bottom link navigating to `/register`. New `register.*` i18n keys are added to all four locale files; a `login.register` key is added to the login block.

**Tech Stack:** React Native (core), Expo Router 4, Supabase JS v2, react-i18next, Vitest + `@testing-library/react-native`, TypeScript.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/pharmopedia/src/i18n/locales/en.ts` | Modify | Add `register` block + `login.register` key |
| `apps/pharmopedia/src/i18n/locales/prs.ts` | Modify | Same — English fallback strings |
| `apps/pharmopedia/src/i18n/locales/ps.ts` | Modify | Same — English fallback strings |
| `apps/pharmopedia/src/i18n/locales/ar.ts` | Modify | Same — English fallback strings |
| `apps/pharmopedia/app/(auth)/register.tsx` | Create | Two-step phone-OTP registration screen |
| `apps/pharmopedia/app/(auth)/_layout.tsx` | Modify | Add `register` to auth Stack |
| `apps/pharmopedia/app/(auth)/login.tsx` | Modify | Add "Register" bottom link |
| `apps/pharmopedia/src/__tests__/register-screen.test.tsx` | Create | 7 tests for register screen behaviour |
| `apps/pharmopedia/src/__tests__/login-screen.test.tsx` | Create | 1 test confirming register link renders |

---

## Key Types

```typescript
// Supabase OTP calls reused verbatim from login.tsx:
supabase.auth.signInWithOtp({ phone: string })
  // → { error: AuthError | null }

supabase.auth.verifyOtp({ phone: string, token: string, type: 'sms' })
  // → { data: { session: Session | null }, error: AuthError | null }

// After successful verify, same login() + navigate pattern as login.tsx:
login(session.access_token, {
  sub: session.user.id,
  role: (meta['role'] as string) ?? 'PATIENT',
  facilityId: meta['facilityId'] as string | undefined,
})
router.replace('/(tabs)' as never)
```

---

## Task 1: i18n Additions for Register Screen

**Files:**
- Modify: `apps/pharmopedia/src/i18n/locales/en.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/prs.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ps.ts`
- Modify: `apps/pharmopedia/src/i18n/locales/ar.ts`

- [ ] **Step 1: Add `register` block and `login.register` key to `en.ts`**

In `apps/pharmopedia/src/i18n/locales/en.ts`, after the closing of the `login` block (before `} as const`), add:

```typescript
  register: {
    title: 'Create Account',
    subtitle: 'Free access to the Pharmopedia drug reference',
    phone: '+93 70 000 0000',
    sendCode: 'Send Code',
    enterCode: 'Enter the code sent to {{phone}}',
    sixDigitCode: '6-digit code',
    verify: 'Create Account',
    back: 'Back',
    signIn: 'Already have an account? Sign in',
    failed: 'Registration failed',
    otpFailed: 'Verification failed',
  },
```

Also add `register` to the `login` block in `en.ts`. Find the `otpFailed` line in `login` and add after it:

```typescript
    register: "Don't have an account? Register",
```

The updated `login` block ending becomes:
```typescript
    loginFailed: 'Login failed',
    otpFailed: 'OTP verification failed',
    register: "Don't have an account? Register",
  },
```

- [ ] **Step 2: Run TypeScript check — expect failure on prs/ps/ar**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia typecheck 2>&1 | head -30
```

Expected: TypeScript errors on `prs.ts`, `ps.ts`, `ar.ts` — each is missing the new `register` key and `login.register` key (enforced by `Translations = typeof en`).

- [ ] **Step 3: Add `register` block and `login.register` key to `prs.ts`**

In `apps/pharmopedia/src/i18n/locales/prs.ts`, after the `formulary` block (before the closing `}`), add:

```typescript
  register: {
    title: 'Create Account',
    subtitle: 'Free access to the Pharmopedia drug reference',
    phone: '\u200f+93 70 000 0000',
    sendCode: 'Send Code',
    enterCode: 'Enter the code sent to {{phone}}',
    sixDigitCode: '6-digit code',
    verify: 'Create Account',
    back: 'برگشت',
    signIn: 'Already have an account? Sign in',
    failed: 'Registration failed',
    otpFailed: 'Verification failed',
  },
```

Also add `register` to the `login` block in `prs.ts` (after `otpFailed`):

```typescript
    register: "Don't have an account? Register",
```

- [ ] **Step 4: Add `register` block and `login.register` key to `ps.ts` and `ar.ts`**

In `apps/pharmopedia/src/i18n/locales/ps.ts`, same additions:

```typescript
  register: {
    title: 'Create Account',
    subtitle: 'Free access to the Pharmopedia drug reference',
    phone: '\u200f+93 70 000 0000',
    sendCode: 'Send Code',
    enterCode: 'Enter the code sent to {{phone}}',
    sixDigitCode: '6-digit code',
    verify: 'Create Account',
    back: 'شاته',
    signIn: 'Already have an account? Sign in',
    failed: 'Registration failed',
    otpFailed: 'Verification failed',
  },
```

Add to `login` block in `ps.ts`:
```typescript
    register: "Don't have an account? Register",
```

In `apps/pharmopedia/src/i18n/locales/ar.ts`, same additions:

```typescript
  register: {
    title: 'Create Account',
    subtitle: 'Free access to the Pharmopedia drug reference',
    phone: '\u200f+93 70 000 0000',
    sendCode: 'Send Code',
    enterCode: 'Enter the code sent to {{phone}}',
    sixDigitCode: '6-digit code',
    verify: 'Create Account',
    back: 'رجوع',
    signIn: 'Already have an account? Sign in',
    failed: 'Registration failed',
    otpFailed: 'Verification failed',
  },
```

Add to `login` block in `ar.ts`:
```typescript
    register: "Don't have an account? Register",
```

- [ ] **Step 5: Run TypeScript check — expect clean**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos
git add "apps/pharmopedia/src/i18n/locales/en.ts" "apps/pharmopedia/src/i18n/locales/prs.ts" "apps/pharmopedia/src/i18n/locales/ps.ts" "apps/pharmopedia/src/i18n/locales/ar.ts"
git commit -m "feat(pharmopedia): i18n keys for public registration screen"
```

---

## Task 2: Register Screen, Layout Update, Login Link, Tests

**Files:**
- Create: `apps/pharmopedia/src/__tests__/register-screen.test.tsx`
- Create: `apps/pharmopedia/src/__tests__/login-screen.test.tsx`
- Create: `apps/pharmopedia/app/(auth)/register.tsx`
- Modify: `apps/pharmopedia/app/(auth)/_layout.tsx`
- Modify: `apps/pharmopedia/app/(auth)/login.tsx`

- [ ] **Step 1: Write failing tests for the register screen**

Create `apps/pharmopedia/src/__tests__/register-screen.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import RegisterScreen from '@/../../app/(auth)/register'

const mockReplace = vi.fn()
const mockPush = vi.fn()
vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
}))

const mockSignInWithOtp = vi.fn()
const mockVerifyOtp = vi.fn()
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: (...args: unknown[]) => mockSignInWithOtp(...args),
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
    },
  },
}))

const mockLogin = vi.fn()
vi.mock('@/store/auth-store', () => ({
  useAuthStore: (sel: (s: { login: typeof mockLogin }) => unknown) => sel({ login: mockLogin }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      if (key === 'register.enterCode' && opts?.phone) return `Enter code for ${opts.phone}`
      return key
    },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RegisterScreen — phone step', () => {
  it('renders phone input and send-code button', () => {
    render(<RegisterScreen />)
    expect(screen.getByTestId('phone-input')).toBeTruthy()
    expect(screen.getByTestId('request-otp-button')).toBeTruthy()
  })

  it('moves to code step after successful OTP request', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    render(<RegisterScreen />)
    fireEvent.changeText(screen.getByTestId('phone-input'), '+93701234567')
    await fireEvent.press(screen.getByTestId('request-otp-button'))
    expect(screen.getByTestId('otp-input')).toBeTruthy()
  })

  it('shows error message when OTP request fails', async () => {
    mockSignInWithOtp.mockResolvedValue({ error: { message: 'Too many requests' } })
    render(<RegisterScreen />)
    await fireEvent.press(screen.getByTestId('request-otp-button'))
    expect(screen.getByText('Too many requests')).toBeTruthy()
  })
})

describe('RegisterScreen — code step', () => {
  async function renderAtCodeStep() {
    mockSignInWithOtp.mockResolvedValue({ error: null })
    render(<RegisterScreen />)
    fireEvent.changeText(screen.getByTestId('phone-input'), '+93701234567')
    await fireEvent.press(screen.getByTestId('request-otp-button'))
  }

  it('calls login() and navigates to /(tabs) after successful OTP verify', async () => {
    await renderAtCodeStep()
    mockVerifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token: 'tok',
          user: { id: 'uid-1', app_metadata: { role: 'PATIENT' } },
        },
      },
      error: null,
    })
    fireEvent.changeText(screen.getByTestId('otp-input'), '123456')
    await fireEvent.press(screen.getByTestId('verify-otp-button'))
    expect(mockLogin).toHaveBeenCalledWith('tok', { sub: 'uid-1', role: 'PATIENT', facilityId: undefined })
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)')
  })

  it('shows error message when OTP verify fails', async () => {
    await renderAtCodeStep()
    mockVerifyOtp.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid code' } })
    await fireEvent.press(screen.getByTestId('verify-otp-button'))
    expect(screen.getByText('Invalid code')).toBeTruthy()
  })

  it('back button returns to phone step', async () => {
    await renderAtCodeStep()
    await fireEvent.press(screen.getByTestId('register-back-button'))
    expect(screen.getByTestId('phone-input')).toBeTruthy()
  })
})

describe('RegisterScreen — sign-in link', () => {
  it('navigates to /login when sign-in link is pressed', () => {
    render(<RegisterScreen />)
    fireEvent.press(screen.getByTestId('sign-in-link'))
    expect(mockPush).toHaveBeenCalledWith('/login')
  })
})
```

- [ ] **Step 2: Write the login-screen register-link test**

Create `apps/pharmopedia/src/__tests__/login-screen.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react-native'
import LoginScreen from '@/../../app/(auth)/login'

const mockPush = vi.fn()
vi.mock('expo-router', () => ({
  useRouter: () => ({ replace: vi.fn(), push: mockPush }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: vi.fn(), signInWithOtp: vi.fn(), verifyOtp: vi.fn() } },
}))

vi.mock('@/store/auth-store', () => ({
  useAuthStore: (sel: (s: { login: () => void }) => unknown) => sel({ login: vi.fn() }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('LoginScreen — register link', () => {
  it('renders register-link that navigates to /register', () => {
    render(<LoginScreen />)
    const link = screen.getByTestId('register-link')
    expect(link).toBeTruthy()
    fireEvent.press(link)
    expect(mockPush).toHaveBeenCalledWith('/register')
  })
})
```

- [ ] **Step 3: Run tests — confirm they fail**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/register-screen.test.tsx src/__tests__/login-screen.test.tsx
```

Expected: FAIL — `register` module not found, `register-link` testID not found.

- [ ] **Step 4: Create `register.tsx`**

Create `apps/pharmopedia/app/(auth)/register.tsx`:

```typescript
import { useState } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth-store'

type Step = 'phone' | 'code'

export default function RegisterScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const login = useAuthStore((s) => s.login)

  const [phone, setPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [step, setStep] = useState<Step>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRequestOtp() {
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithOtp({ phone })
    setLoading(false)
    if (err) { setError(err.message); return }
    setStep('code')
  }

  async function handleVerifyOtp() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase.auth.verifyOtp({ phone, token: otpCode, type: 'sms' })
    setLoading(false)
    if (err || !data.session) {
      setError(err?.message ?? t('register.otpFailed'))
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Text style={styles.title}>{t('register.title')}</Text>
      <Text style={styles.subtitle}>{t('register.subtitle')}</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      {step === 'phone' ? (
        <>
          <TextInput
            testID="phone-input"
            style={styles.input}
            placeholder={t('register.phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Pressable testID="request-otp-button" style={styles.button} onPress={handleRequestOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('register.sendCode')}</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.hint}>{t('register.enterCode', { phone })}</Text>
          <TextInput
            testID="otp-input"
            style={styles.input}
            placeholder={t('register.sixDigitCode')}
            value={otpCode}
            onChangeText={setOtpCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <Pressable testID="verify-otp-button" style={styles.button} onPress={handleVerifyOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('register.verify')}</Text>}
          </Pressable>
          <Pressable testID="register-back-button" onPress={() => setStep('phone')}>
            <Text style={styles.link}>{t('register.back')}</Text>
          </Pressable>
        </>
      )}

      <Pressable testID="sign-in-link" onPress={() => router.push('/login' as never)}>
        <Text style={styles.link}>{t('register.signIn')}</Text>
      </Pressable>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', marginBottom: 32 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  error: { color: '#dc2626', marginBottom: 12, textAlign: 'center' },
  hint: { color: '#6b7280', marginBottom: 12, textAlign: 'center' },
  link: { color: '#2563eb', textAlign: 'center', marginTop: 12 },
})
```

- [ ] **Step 5: Update `_layout.tsx` to add register screen**

Replace the entire content of `apps/pharmopedia/app/(auth)/_layout.tsx` with:

```typescript
import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  )
}
```

- [ ] **Step 6: Add "Register" link to `login.tsx`**

In `apps/pharmopedia/app/(auth)/login.tsx`, find the closing of the conditional render block. The current last line before `</KeyboardAvoidingView>` closes the ternary. Add the register link after the ternary and before `</KeyboardAvoidingView>`:

Current ending:
```typescript
      )}
    </KeyboardAvoidingView>
```

Replace with:
```typescript
      )}

      <Pressable testID="register-link" onPress={() => router.push('/register' as never)}>
        <Text style={styles.link}>{t('login.register')}</Text>
      </Pressable>
    </KeyboardAvoidingView>
```

- [ ] **Step 7: Run the new test files**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test src/__tests__/register-screen.test.tsx src/__tests__/login-screen.test.tsx
```

Expected: 8/8 PASS (7 register-screen + 1 login-screen).

- [ ] **Step 8: Run full test suite**

```bash
cd c:/Users/malan/OneDrive/Documents/Ultranos && pnpm -F pharmopedia test
```

Expected: all tests pass (63 existing + 8 new = 71).

- [ ] **Step 9: Commit**

```bash
cd c:/Users/malan/OneDrive/Documents\Ultranos
git add "apps/pharmopedia/app/(auth)/register.tsx" "apps/pharmopedia/app/(auth)/_layout.tsx" "apps/pharmopedia/app/(auth)/login.tsx" "apps/pharmopedia/src/__tests__/register-screen.test.tsx" "apps/pharmopedia/src/__tests__/login-screen.test.tsx"
git commit -m "feat(pharmopedia): public registration screen with phone OTP flow"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| Public user self-registration via phone OTP | Task 2 — `register.tsx` two-step OTP flow |
| New account defaults to `PATIENT` role | Task 2 — `role: (meta['role'] as string) ?? 'PATIENT'` |
| Register accessible from login screen | Task 2 — `register-link` Pressable in `login.tsx` |
| Expo Router routes `/(auth)/register` | Task 2 — `Stack.Screen name="register"` in `_layout.tsx` |
| i18n keys in all 4 locales | Task 1 — `register.*` + `login.register` in en/prs/ps/ar |

### Placeholder Scan

No TBDs. All code blocks are complete implementations. No "handle edge cases" steps.

### Type Consistency

- `Translations = typeof en` — adding `register` and `login.register` to `en.ts` forces TypeScript to require them in prs/ps/ar. Task 1 Step 2 verifies this fails before they're added.
- `router.push('/login' as never)` / `router.replace('/(tabs)' as never)` — same cast pattern used throughout existing screens.
- `useAuthStore((s) => s.login)` — selector pattern matches existing usage in `login.tsx:16`.
- Test `mockVerifyOtp` shape matches `supabase.auth.verifyOtp` return type: `{ data: { session }, error }`.
