import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { db } from '@/lib/db'
import { PharmacySettingsView } from '@/components/pharmacy/PharmacySettingsView'
import { DEFAULT_PHARMACY_SETTINGS } from '@/lib/inventory/types'

// Mocks required by PharmacySettingsView sub-components
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({ session: null, isAuthenticated: false }),
    { getState: () => ({ session: null, isAuthenticated: false }) },
  ),
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { mfa: { listFactors: vi.fn().mockResolvedValue({ data: { totp: [] }, error: null }) } },
  }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

beforeEach(async () => { await db.pharmacySettings.clear(); await db.pharmacySettings.put({ ...DEFAULT_PHARMACY_SETTINGS, locationId: 'default', poSequenceNext: 7 }) })

describe('settings invoice match tolerance', () => {
  it('persists the tolerance and preserves poSequenceNext', async () => {
    render(<NextIntlClientProvider locale="en" messages={en}><PharmacySettingsView /></NextIntlClientProvider>)
    const input = await screen.findByTestId('setting-invoice-tolerance')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)
    await waitFor(async () => {
      const s = await db.pharmacySettings.get('default')
      expect(s!.invoiceMatchTolerancePercent).toBe(5)
      expect(s!.poSequenceNext).toBe(7) // counter preserved by the spread
    })
  })
})
