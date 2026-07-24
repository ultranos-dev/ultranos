import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { FhirPatient } from '@ultranos/shared-types'

// The patient profile-photo update POSTs to the Hub's protectedProcedure
// `patient.update`, which returns 401 without a bearer token. This test locks in
// that the request carries the Supabase access token AND is audited as a PHI write.

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('@ultranos/ui-kit', () => ({
  formatRelativeTime: () => 'just now',
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}))

// PatientAvatar → expose a button that fires onPhotoUpdated, simulating a completed upload.
vi.mock('@/components/patient/PatientAvatar', () => ({
  PatientAvatar: ({ onPhotoUpdated }: { onPhotoUpdated?: (p: string) => void }) => (
    <button onClick={() => onPhotoUpdated?.('patients/abc/photo.jpg')}>upload-photo</button>
  ),
}))

const putPatient = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/db', () => ({
  db: {
    observations: {
      where: () => ({ equals: () => ({ toArray: async () => [] }) }),
    },
    patients: { put: (...args: unknown[]) => putPatient(...args) },
  },
}))

const getSession = vi.fn().mockResolvedValue({
  data: { session: { access_token: 'TESTTOKEN' } },
})
vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession } }),
}))

const auditPhiAccess = vi.fn()
vi.mock('@/lib/audit', () => ({
  auditPhiAccess: (...args: unknown[]) => auditPhiAccess(...args),
  AuditAction: { UPDATE: 'UPDATE' },
  AuditResourceType: { PATIENT: 'Patient' },
}))

import { PatientHeaderCard } from '@/components/patient/PatientHeaderCard'

const PATIENT_ID = '5d60f549-6fd0-4633-8746-2877d3f62abb'

const patient: FhirPatient = {
  id: PATIENT_ID,
  resourceType: 'Patient',
  name: [{ given: ['Test'], text: 'Test Patient' }],
  gender: 'male',
  birthYearOnly: true,
  telecom: [{ system: 'phone', value: '0700000000' }],
  _ultranos: {
    nameLocal: 'Test Patient',
    patient_tier: 'FREE',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    birthYear: 1990,
    bloodGroup: 'O+',
  },
  meta: { lastUpdated: '2026-07-20T00:00:00.000Z', versionId: '1' },
} as unknown as FhirPatient

describe('PatientHeaderCard — profile photo update', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch
  })

  it('sends the Supabase bearer token when persisting a new photo to the Hub', async () => {
    render(
      <PatientHeaderCard
        patient={patient}
        patientId={PATIENT_ID}
        onEditClick={() => {}}
        onPatientUpdated={() => {}}
      />,
    )

    fireEvent.click(screen.getByText('upload-photo'))

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    const calls = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const [url, init] = calls[0] as [string, RequestInit]
    expect(String(url)).toContain('patient.update')
    const headers = init.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer TESTTOKEN')
  })

  it('audits the photo change as a PHI write', async () => {
    render(
      <PatientHeaderCard
        patient={patient}
        patientId={PATIENT_ID}
        onEditClick={() => {}}
        onPatientUpdated={() => {}}
      />,
    )

    fireEvent.click(screen.getByText('upload-photo'))

    await waitFor(() => expect(auditPhiAccess).toHaveBeenCalled())
    expect(auditPhiAccess).toHaveBeenCalledWith('UPDATE', 'Patient', PATIENT_ID, PATIENT_ID, expect.anything())
  })
})
