/**
 * ActiveMedicationsList — error-state isolation test.
 *
 * This file tests ONLY the Dexie-read-error scenario, kept in a separate file so
 * the vi.mock of @/lib/db does not bleed into active-medications-list.test.tsx which
 * needs the real Dexie for data-path tests.
 *
 * Critical invariant: Dexie read error → "unavailable" (never "No active medications")
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${JSON.stringify(values)})` : key,
  useLocale: () => 'en',
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { READ: 'READ', CREATE: 'CREATE', UPDATE: 'UPDATE' },
  AuditResourceType: { MEDICATION_STATEMENT: 'MEDICATION_STATEMENT' },
}))

vi.mock('../components/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
}))

// Mock the entire db module — the `where` call rejects on medicationStatements
vi.mock('../lib/db', () => ({
  db: {
    medicationStatements: {
      where: () => ({
        equals: () => ({
          toArray: () => Promise.reject(new Error('IndexedDB unavailable')),
        }),
      }),
    },
    interactionAuditLog: {
      where: () => ({ equals: () => ({ toArray: () => Promise.resolve([]) }) }),
    },
  },
}))

// Hub also offline
vi.mock('../lib/trpc', () => ({
  fetchActiveMedicationsFromHub: () => Promise.resolve(null),
}))

const { ActiveMedicationsList } = await import('../components/patient/ActiveMedicationsList')

describe('ActiveMedicationsList — Dexie read error state', () => {
  it('shows unavailable error (not empty-state) when Dexie throws', async () => {
    render(<ActiveMedicationsList patientId="error-patient-id" />)

    await waitFor(() => {
      expect(screen.getByTestId('medications-unavailable')).toBeTruthy()
    })

    // Safety invariant: NEVER show "no active medications" when data may exist
    expect(screen.queryByTestId('medications-empty')).toBeNull()
    expect(screen.queryByText(/noActiveMedications/)).toBeNull()

    // The error UI must have role="alert" for accessibility
    const alertEl = screen.getByRole('alert')
    expect(alertEl.getAttribute('aria-live')).toBe('assertive')
  })
})
