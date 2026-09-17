/**
 * EncounterHistoryList — Dexie read error state (isolated file).
 *
 * This file tests ONLY the Dexie-read-error scenario, kept separate so the
 * vi.mock of @/lib/db does not bleed into encounter-history-list.test.tsx which
 * needs the real Dexie for data-path tests.
 *
 * Critical invariant: Dexie read error → "unavailable" (never "No encounters")
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('next/link', () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock('../lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { READ: 'READ' },
  AuditResourceType: { ENCOUNTER: 'ENCOUNTER' },
}))

// Mock the entire db module — db.encounters.where throws on read
vi.mock('../lib/db', () => ({
  db: {
    encounters: {
      where: () => { throw new Error('IndexedDB unavailable') },
    },
    soapLedger: {
      where: () => ({ equals: () => ({ toArray: () => Promise.resolve([]) }) }),
    },
    conditions: {
      where: () => ({ equals: () => ({ toArray: () => Promise.resolve([]) }) }),
    },
    medications: {
      where: () => ({ equals: () => ({ count: () => Promise.resolve(0) }) }),
    },
    observations: {
      where: () => ({ equals: () => ({ toArray: () => Promise.resolve([]) }) }),
    },
    allergyIntolerances: {
      where: () => ({ equals: () => ({ toArray: () => Promise.resolve([]) }) }),
    },
    practitionerKeys: {
      where: () => ({ equals: () => ({ first: () => Promise.resolve(null) }) }),
    },
  },
}))

// Mock sync-store (no prior sync)
vi.mock('../stores/sync-store', () => ({
  useSyncStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ lastSyncedAt: null, isPending: false, isError: false, pendingCount: 0, failedCount: 0, updateSyncStatus: vi.fn() }),
  ),
}))

// Mock auth session store
vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ session: null, setSession: vi.fn() }),
  ),
}))

// Mock allergy-store
vi.mock('../stores/allergy-store', () => ({
  useAllergyStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ allergies: [], isLoading: false, loadError: null, loadAllergies: vi.fn() }),
  ),
}))

// Mock trpc
vi.mock('../lib/trpc', () => ({
  listPatientEncounters: vi.fn().mockRejectedValue(new Error('offline')),
}))

// Mock sync-pull
vi.mock('../lib/sync-pull', () => ({
  pullPatientChanges: vi.fn().mockRejectedValue(new Error('offline')),
}))

// Mock supabase
vi.mock('../lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
  }),
}))

// Mock EncounterDetailModal
vi.mock('../components/patient/EncounterDetailModal', () => ({
  EncounterDetailModal: () => null,
}))

const { EncounterHistoryList } = await import('../components/patient/EncounterHistoryList')

describe('EncounterHistoryList — Dexie read error state', () => {
  it('shows unavailable error (not empty-state) when Dexie throws', async () => {
    render(<EncounterHistoryList patientId="error-patient-id" />)

    await waitFor(() => {
      expect(screen.getByTestId('encounters-unavailable')).toBeTruthy()
    })

    // Safety invariant: NEVER show "no encounters" when data may exist
    expect(screen.queryByTestId('no-encounters')).toBeNull()
    expect(screen.queryByTestId('encounters-unsynced')).toBeNull()

    // The error UI must have role="alert" for accessibility
    const alertEl = screen.getByRole('alert')
    expect(alertEl.getAttribute('aria-live')).toBe('assertive')
  })
})
