import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  signInWithOtp: vi.fn(async () => ({ error: null })),
  verifyOtp: vi.fn(async () => ({ data: { session: { access_token: 'tok', user: { id: 'u1', app_metadata: {} } } }, error: null })),
  updateUser: vi.fn(async () => ({ data: {}, error: null })),
  uploadProfilePhoto: vi.fn(async () => 'https://cdn/u1/avatar.jpg'),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k) }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: h.replace }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithOtp: h.signInWithOtp, verifyOtp: h.verifyOtp, updateUser: h.updateUser } } }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { login: () => void }) => unknown) => s({ login: vi.fn() }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string; setLang: () => void }) => unknown) => s({ lang: 'en', setLang: vi.fn() }), isRtlLang: () => false }))
vi.mock('@/lib/profile-photo', () => ({ uploadProfilePhoto: h.uploadProfilePhoto }))
vi.mock('@/components/LanguageChips', () => ({ LanguageChips: () => null }))
vi.mock('@/components/signup/PhotoPicker', () => ({ PhotoPicker: ({ onChange }: { onChange: (uri: string) => void }) => { const { Pressable, Text } = require('react-native'); return <Pressable testID="mock-photo" onPress={() => onChange('file:///test.jpg')}><Text>photo</Text></Pressable> } }))
vi.mock('@/components/signup/ProvincePicker', () => ({ ProvincePicker: ({ onChange }: { onChange: (p: string) => void }) => { const { Pressable, Text } = require('react-native'); return <Pressable testID="mock-province" onPress={() => onChange('Kabul')}><Text>province</Text></Pressable> } }))
vi.mock('@/components/signup/DistrictPicker', () => ({ DistrictPicker: ({ onChange }: { onChange: (d: string) => void }) => { const { Pressable, Text } = require('react-native'); return <Pressable testID="mock-district" onPress={() => onChange('Kabul')}><Text>district</Text></Pressable> } }))

import RegisterScreen from '@/app/(auth)/register'

async function press(getByTestId: (id: string) => unknown, id: string) {
  await act(async () => { fireEvent.press(getByTestId(id) as never) })
}

describe('Signup wizard', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('walks phone → otp → name → photo(skip) → address → finish and persists profile', async () => {
    const { getByTestId } = render(<RegisterScreen />)
    // Step 1: phone
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    await press(getByTestId, 'wizard-continue')
    await waitFor(() => expect(h.signInWithOtp).toHaveBeenCalled())
    // Step 2: otp
    fireEvent.changeText(getByTestId('otp-input'), '123456')
    await press(getByTestId, 'wizard-continue')
    await waitFor(() => expect(h.verifyOtp).toHaveBeenCalled())
    // Step 3: name
    fireEvent.changeText(getByTestId('given-name-input'), 'Sara')
    fireEvent.changeText(getByTestId('family-name-input'), 'Ahmadi')
    await press(getByTestId, 'wizard-continue')
    // Step 4: photo (skip)
    await press(getByTestId, 'wizard-skip')
    // Step 5: address
    await press(getByTestId, 'mock-province')
    await press(getByTestId, 'mock-district')
    await press(getByTestId, 'wizard-finish')
    await waitFor(() => expect(h.updateUser).toHaveBeenCalled())
    const arg = h.updateUser.mock.calls[0][0] as { data: { given_name: string; family_name: string; address: { province: string; district: string } } }
    expect(arg.data.given_name).toBe('Sara')
    expect(arg.data.family_name).toBe('Ahmadi')
    expect(arg.data.address.province).toBe('Kabul')
    expect(arg.data.address.district).toBe('Kabul')
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/(tabs)'))
  })

  it('blocks Continue on the name step until both names are entered', async () => {
    const { getByTestId, queryByTestId } = render(<RegisterScreen />)
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    await press(getByTestId, 'wizard-continue')
    fireEvent.changeText(getByTestId('otp-input'), '123456')
    await press(getByTestId, 'wizard-continue')
    // On name step now; continue without names should not advance to photo/skip
    await press(getByTestId, 'wizard-continue')
    expect(queryByTestId('wizard-skip')).toBeNull() // still on name step (photo step has the skip control)
  })

  it('uploads the chosen photo and persists photo_url on finish', async () => {
    const { getByTestId } = render(<RegisterScreen />)
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    await press(getByTestId, 'wizard-continue')
    fireEvent.changeText(getByTestId('otp-input'), '123456')
    await press(getByTestId, 'wizard-continue')
    fireEvent.changeText(getByTestId('given-name-input'), 'Sara')
    fireEvent.changeText(getByTestId('family-name-input'), 'Ahmadi')
    await press(getByTestId, 'wizard-continue')
    // Photo step: choose a photo (not skip), then continue
    await press(getByTestId, 'mock-photo')
    await press(getByTestId, 'wizard-continue')
    // Address
    await press(getByTestId, 'mock-province')
    await press(getByTestId, 'mock-district')
    await press(getByTestId, 'wizard-finish')
    await waitFor(() => expect(h.uploadProfilePhoto).toHaveBeenCalledWith('file:///test.jpg', 'u1'))
    const arg = h.updateUser.mock.calls[0][0] as { data: { photo_url?: string } }
    expect(arg.data.photo_url).toBe('https://cdn/u1/avatar.jpg')
  })

  it('shows a resend control on the OTP step', async () => {
    const { getByTestId } = render(<RegisterScreen />)
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    await press(getByTestId, 'wizard-continue')
    await waitFor(() => expect(h.signInWithOtp).toHaveBeenCalled())
    expect(getByTestId('wizard-resend')).toBeTruthy()
  })
})
