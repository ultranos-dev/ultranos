import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'

const { mockDiscoverAccount, mockClaimAccount, mockRegisterFromSession } = vi.hoisted(() => ({
  mockDiscoverAccount: vi.fn().mockResolvedValue({ matchType: 'none' }),
  mockClaimAccount: vi.fn().mockResolvedValue({ ok: true }),
  mockRegisterFromSession: vi.fn().mockResolvedValue({ patientId: 'blind-id-1' }),
}))

vi.mock('@/api/account', () => ({
  discoverAccount: mockDiscoverAccount,
  claimAccount: mockClaimAccount,
  registerFromSession: mockRegisterFromSession,
}))

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  signInWithOtp: vi.fn(async () => ({ error: null })),
  verifyOtp: vi.fn(async () => ({ data: { session: { access_token: 'tok', user: { id: 'u1', app_metadata: {} } } }, error: null })),
  updateUser: vi.fn(async () => ({ data: {}, error: null })),
  signOut: vi.fn(async () => ({ error: null })),
  uploadProfilePhoto: vi.fn(async () => 'u1/avatar.jpg'),
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k) }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: h.replace }) }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { signInWithOtp: h.signInWithOtp, verifyOtp: h.verifyOtp, updateUser: h.updateUser, signOut: h.signOut } } }))
vi.mock('@/store/auth-store', () => ({ useAuthStore: (s: (x: { login: () => void; token: string | null }) => unknown) => s({ login: vi.fn(), token: 'tok' }) }))
vi.mock('@/store/lang-store', () => ({ useLangStore: (s: (x: { lang: string; setLang: () => void }) => unknown) => s({ lang: 'en', setLang: vi.fn() }), isRtlLang: () => false }))
vi.mock('@/lib/profile-photo', () => ({ uploadProfilePhoto: h.uploadProfilePhoto }))
vi.mock('@/components/LanguageMenu', () => ({ LanguageMenu: () => null }))
vi.mock('@/components/signup/PhotoPicker', () => ({ PhotoPicker: ({ onChange }: { onChange: (uri: string) => void }) => { const { Pressable, Text } = require('react-native'); return <Pressable testID="mock-photo" onPress={() => onChange('file:///test.jpg')}><Text>photo</Text></Pressable> } }))
vi.mock('@/components/signup/ProvincePicker', () => ({ ProvincePicker: ({ onChange }: { onChange: (p: string) => void }) => { const { Pressable, Text } = require('react-native'); return <Pressable testID="mock-province" onPress={() => onChange('Kabul')}><Text>province</Text></Pressable> } }))
vi.mock('@/components/signup/DistrictPicker', () => ({ DistrictPicker: ({ onChange }: { onChange: (d: string) => void }) => { const { Pressable, Text } = require('react-native'); return <Pressable testID="mock-district" onPress={() => onChange('Kabul')}><Text>district</Text></Pressable> } }))

import RegisterScreen from '@/app/(auth)/register'

async function press(getByTestId: (id: string) => unknown, id: string) {
  await act(async () => { fireEvent.press(getByTestId(id) as never) })
}

describe('Signup wizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no existing account found
    mockDiscoverAccount.mockResolvedValue({ matchType: 'none' })
    mockRegisterFromSession.mockResolvedValue({ patientId: 'blind-id-1' })
  })

  it('walks phone → otp → name → dob → photo(skip) → address → finish and persists profile', async () => {
    const { getByTestId } = render(<RegisterScreen />)
    // Step 1: phone
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    await press(getByTestId, 'wizard-continue')
    await waitFor(() => expect(h.signInWithOtp).toHaveBeenCalled())
    // Step 2: otp
    fireEvent.changeText(getByTestId('otp-input'), '123456')
    await press(getByTestId, 'wizard-continue')
    await waitFor(() => expect(h.verifyOtp).toHaveBeenCalled())
    // After OTP verify, discoverAccount is called; matchType: 'none' → name step
    await waitFor(() => expect(mockDiscoverAccount).toHaveBeenCalledWith('tok', { phone: '+93700000000' }))
    // Step 3: name
    fireEvent.changeText(getByTestId('given-name-input'), 'Sara')
    fireEvent.changeText(getByTestId('family-name-input'), 'Ahmadi')
    await press(getByTestId, 'wizard-continue')
    // Step 4: dob
    fireEvent.changeText(getByTestId('dob-input'), '1990-05-15')
    await press(getByTestId, 'wizard-continue')
    // Step 5: photo (skip)
    await press(getByTestId, 'wizard-skip')
    // Step 6: address
    await press(getByTestId, 'mock-province')
    await press(getByTestId, 'mock-district')
    await press(getByTestId, 'wizard-finish')
    await waitFor(() => expect(h.updateUser).toHaveBeenCalled())
    const arg = h.updateUser.mock.calls[0][0] as { data: { given_name: string; family_name: string; address: { province: string; district: string } } }
    expect(arg.data.given_name).toBe('Sara')
    expect(arg.data.family_name).toBe('Ahmadi')
    expect(arg.data.address.province).toBe('Kabul')
    expect(arg.data.address.district).toBe('Kabul')
    await waitFor(() => expect(mockRegisterFromSession).toHaveBeenCalledWith('tok', expect.objectContaining({
      firstName: 'Sara',
      nameFather: 'Ahmadi',
      dateOfBirth: '1990-05-15',
      preferredLanguage: 'en',
    })))
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/(tabs)'))
  })

  it('blocks Continue on the name step until both names are entered', async () => {
    const { getByTestId, queryByTestId } = render(<RegisterScreen />)
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    await press(getByTestId, 'wizard-continue')
    fireEvent.changeText(getByTestId('otp-input'), '123456')
    await press(getByTestId, 'wizard-continue')
    // Wait for discovery to complete and name step to be shown
    await waitFor(() => expect(getByTestId('given-name-input')).toBeTruthy())
    // On name step now; continue without names should not advance to dob/skip
    await press(getByTestId, 'wizard-continue')
    // dob-input only appears after name step, not the dob step; wizard-skip only appears on photo step
    expect(queryByTestId('wizard-skip')).toBeNull()
    expect(queryByTestId('dob-input')).toBeNull()
  })

  it('uploads the chosen photo and persists photo_url on finish', async () => {
    const { getByTestId } = render(<RegisterScreen />)
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    await press(getByTestId, 'wizard-continue')
    fireEvent.changeText(getByTestId('otp-input'), '123456')
    await press(getByTestId, 'wizard-continue')
    await waitFor(() => expect(getByTestId('given-name-input')).toBeTruthy())
    fireEvent.changeText(getByTestId('given-name-input'), 'Sara')
    fireEvent.changeText(getByTestId('family-name-input'), 'Ahmadi')
    await press(getByTestId, 'wizard-continue')
    // DOB step
    fireEvent.changeText(getByTestId('dob-input'), '1990-05-15')
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
    // bucket is now private — photo_url stores the object path, not a public URL
    expect(arg.data.photo_url).toBe('u1/avatar.jpg')
    await waitFor(() => expect(mockRegisterFromSession).toHaveBeenCalledWith('tok', expect.objectContaining({
      firstName: 'Sara',
      photoUrl: 'u1/avatar.jpg',
    })))
  })

  it('shows a resend control on the OTP step', async () => {
    const { getByTestId } = render(<RegisterScreen />)
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    await press(getByTestId, 'wizard-continue')
    await waitFor(() => expect(h.signInWithOtp).toHaveBeenCalled())
    expect(getByTestId('wizard-resend')).toBeTruthy()
  })

  it('staff flow: shows staff screen and signs out + routes to login', async () => {
    mockDiscoverAccount.mockResolvedValue({ matchType: 'staff' })
    const { getByTestId } = render(<RegisterScreen />)
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    await press(getByTestId, 'wizard-continue')
    fireEvent.changeText(getByTestId('otp-input'), '123456')
    await press(getByTestId, 'wizard-continue')
    await waitFor(() => expect(getByTestId('wizard-staff-signin')).toBeTruthy())
    await press(getByTestId, 'wizard-staff-signin')
    await waitFor(() => expect(h.signOut).toHaveBeenCalled())
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/(auth)/login'))
  })

  it('patient/claim flow: shows claim panel, submits birth year and routes to tabs', async () => {
    mockDiscoverAccount.mockResolvedValue({
      matchType: 'patient',
      candidate: { ref: 'ref-123-blind', maskedName: 'A*** H***', birthYear: 1990 },
    })
    const { getByTestId } = render(<RegisterScreen />)
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    await press(getByTestId, 'wizard-continue')
    fireEvent.changeText(getByTestId('otp-input'), '123456')
    await press(getByTestId, 'wizard-continue')
    await waitFor(() => expect(getByTestId('claim-birthyear-input')).toBeTruthy())
    fireEvent.changeText(getByTestId('claim-birthyear-input'), '1990')
    await press(getByTestId, 'wizard-claim')
    await waitFor(() => expect(mockClaimAccount).toHaveBeenCalledWith('tok', {
      ref: 'ref-123-blind',
      phone: '+93700000000',
      birthYear: 1990,
    }))
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith('/(tabs)'))
  })

  it('none/register path: finish calls registerFromSession with correct shape', async () => {
    mockDiscoverAccount.mockResolvedValue({ matchType: 'none' })
    const { getByTestId } = render(<RegisterScreen />)
    fireEvent.changeText(getByTestId('phone-input'), '+93700000000')
    await press(getByTestId, 'wizard-continue')
    fireEvent.changeText(getByTestId('otp-input'), '123456')
    await press(getByTestId, 'wizard-continue')
    await waitFor(() => expect(getByTestId('given-name-input')).toBeTruthy())
    fireEvent.changeText(getByTestId('given-name-input'), 'Ahmad')
    fireEvent.changeText(getByTestId('family-name-input'), 'Khan')
    await press(getByTestId, 'wizard-continue')
    fireEvent.changeText(getByTestId('dob-input'), '1985-03-20')
    await press(getByTestId, 'wizard-continue')
    await press(getByTestId, 'wizard-skip')
    await press(getByTestId, 'mock-province')
    await press(getByTestId, 'mock-district')
    await press(getByTestId, 'wizard-finish')
    await waitFor(() => expect(mockRegisterFromSession).toHaveBeenCalledWith(
      'tok',
      expect.objectContaining({
        firstName: 'Ahmad',
        nameFather: 'Khan',
        dateOfBirth: '1985-03-20',
        preferredLanguage: 'en',
        addressProvinceCurrent: 'Kabul',
        addressDistrictCurrent: 'Kabul',
      }),
    ))
  })
})
