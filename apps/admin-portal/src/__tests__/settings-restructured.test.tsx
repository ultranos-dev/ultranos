import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// jsdom does not implement IntersectionObserver. The settings page constructs
// one in a mount effect (scroll-spy for the section nav); without this stub the
// effect throws and rendering fails. Provide a no-op implementation.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return [] }
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  usePathname: () => '/settings',
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock supabase client
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      mfa: {
        listFactors: vi.fn().mockResolvedValue({ data: { all: [] }, error: null }),
        enroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
        unenroll: vi.fn(),
      },
      signInWithPassword: vi.fn(),
      updateUser: vi.fn(),
      signOut: vi.fn(),
    },
  }),
}))

// Mock trpc client
vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getAdminProfile: { query: vi.fn().mockResolvedValue({ name: 'Test User', email: 'test@example.com', role: 'admin', createdAt: '2025-01-01' }) },
      updateAdminProfile: { mutate: vi.fn() },
      getOrganization: { query: vi.fn().mockResolvedValue({ id: 'org-1', name: 'Test Org', country: 'UAE', billingEmail: 'billing@test.com', timezone: 'Asia/Dubai' }) },
      updateOrganization: { mutate: vi.fn() },
      getNotificationPreferences: { query: vi.fn().mockResolvedValue({}) },
      updateNotificationPreferences: { mutate: vi.fn() },
    },
  },
  reportAdminAuthEvent: vi.fn(),
}))

const { default: SettingsPage } = await import('../app/[locale]/settings/page')

describe('Settings Page — Restructured', () => {
  it('renders "My Account" section', () => {
    render(<SettingsPage />)
    // Nav pill + section heading = 2 occurrences
    expect(screen.getAllByText('My Account').length).toBeGreaterThanOrEqual(2)
    // Subsections within My Account
    expect(screen.getByText('Profile')).toBeTruthy()
    expect(screen.getAllByText('Change Password').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Security Keys (FIDO2)')).toBeTruthy()
    expect(screen.getByText('Active Sessions')).toBeTruthy()
  })

  it('renders "Organization" section', async () => {
    render(<SettingsPage />)
    expect(screen.getAllByText('Organization').length).toBeGreaterThanOrEqual(2)
    // Wait for org data to load
    await waitFor(() => {
      expect(screen.getByText('Organization Name')).toBeTruthy()
    })
    expect(screen.getByText('Billing Email')).toBeTruthy()
    expect(screen.getByText('Timezone')).toBeTruthy()
  })

  it('renders "Notifications" section', async () => {
    render(<SettingsPage />)
    expect(screen.getAllByText('Notifications').length).toBeGreaterThanOrEqual(1)
    // Wait for notification preferences to load
    await waitFor(() => {
      expect(screen.getByText('KYC SLA breach alerts')).toBeTruthy()
    })
    expect(screen.getByText('Save Preferences')).toBeTruthy()
  })
})
