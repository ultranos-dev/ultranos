import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

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

// Mock next-intl — settings page uses useTranslations('settings') without a
// NextIntlClientProvider. Load the real en.json messages so rendered text
// matches what the tests assert (e.g. "My Account", "Organization", etc.).
vi.mock('next-intl', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const messages = require('../../messages/en.json') as Record<string, Record<string, string>>
  const makeT = (ns: string) => (key: string, params?: Record<string, unknown>) => {
    let val = messages[ns]?.[key] ?? key
    if (params) for (const [k, v] of Object.entries(params)) val = val.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    return val
  }
  return { useTranslations: (ns: string) => makeT(ns), useLocale: () => 'en' }
})

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
    storage: {
      from: () => ({
        createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    },
  }),
}))

// Mock staff-photo-api (imported by settings page when practitionerId is present)
vi.mock('@/lib/staff-photo-api', () => ({
  uploadStaffPhoto: vi.fn().mockResolvedValue({ photoUrl: 'key.webp', lastUpdated: '2026-01-01' }),
  removeStaffPhoto: vi.fn().mockResolvedValue({ lastUpdated: '2026-01-01' }),
}))

// Mock PhotoAvatarField (ui-kit component) — avoids pulling in Avatar/modal dependencies
vi.mock('@ultranos/ui-kit/components/photo/photo-avatar-field', () => ({
  PhotoAvatarField: () => null,
}))

// Mock trpc client.
// The settings page calls:
//   trpc.admin.getProfile.query()        (profile load)
//   trpc.admin.getOrganization.query()   (org load)
//   trpc.admin.getNotificationPreferences.query() (via NotificationPreferences child)
//   trpc.subscription.getOrgSubscriptions.query() (subscribed-modules load)
// All are wrapped in try/catch so missing stubs cause silent no-ops, but we
// provide them to enable the section content to load properly.
vi.mock('@/lib/trpc', () => ({
  trpc: {
    admin: {
      getProfile: { query: vi.fn().mockResolvedValue({ name: 'Test User', email: 'test@example.com', role: 'admin', createdAt: '2025-01-01', practitionerId: null, avatarUrl: null, updatedAt: null }) },
      updateAdminProfile: { mutate: vi.fn() },
      getOrganization: { query: vi.fn().mockResolvedValue({ id: 'org-1', name: 'Test Org', countryCode: 'AE', billingEmail: 'billing@test.com', timezone: 'Asia/Dubai' }) },
      updateOrganization: { mutate: vi.fn() },
      getNotificationPreferences: { query: vi.fn().mockResolvedValue({}) },
      updateNotificationPreferences: { mutate: vi.fn() },
    },
    subscription: {
      getOrgSubscriptions: { query: vi.fn().mockResolvedValue({ subscriptions: [] }) },
    },
  },
  reportAdminAuthEvent: vi.fn(),
}))

const { default: SettingsPage } = await import('../app/[locale]/settings/page')

describe('Settings Page — Restructured', () => {
  it('renders "My Account" section', () => {
    render(<SettingsPage />)
    // "My Account" appears in the nav pill tab bar (default active tab).
    // There is no separate section-heading that repeats "My Account".
    expect(screen.getByRole('tab', { name: 'My Account' })).toBeTruthy()
    // Subsections within My Account tab (default active)
    expect(screen.getByText('Profile')).toBeTruthy()
    expect(screen.getAllByText('Change Password').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Security Keys (FIDO2)')).toBeTruthy()
    expect(screen.getByText('Active Sessions')).toBeTruthy()
  })

  it('renders "Organization" section', async () => {
    render(<SettingsPage />)
    // Click Organization tab to make the section content visible
    fireEvent.click(screen.getByRole('tab', { name: 'Organization' }))
    // Wait for org section to appear (tab switch is synchronous but data load is async)
    await waitFor(() => {
      expect(screen.getByText('Organization Name')).toBeTruthy()
    })
    expect(screen.getByText('Billing Email')).toBeTruthy()
    expect(screen.getByText('Timezone')).toBeTruthy()
  })

  it('renders "Notifications" section', async () => {
    render(<SettingsPage />)
    // Click Notifications tab to make the section content visible
    fireEvent.click(screen.getByRole('tab', { name: 'Notifications' }))
    // Wait for notification preferences to load (async fetch inside NotificationPreferences)
    await waitFor(() => {
      expect(screen.getByText('KYC SLA breach alerts')).toBeTruthy()
    })
    expect(screen.getByText('Save Preferences')).toBeTruthy()
  })
})
