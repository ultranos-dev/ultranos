import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { FhirPatient } from '@ultranos/shared-types'

// PatientHeaderCard.handlePhotoUpdated no longer calls patient.update on the Hub.
// The Hub route (Task 5) already persisted + audited the photo; the header just
// mirrors the new key into Dexie and propagates state to the parent.

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

// PatientAvatar stub: fires onPhotoUpdated with a nullable key (new signature).
vi.mock('@/components/patient/PatientAvatar', () => ({
  PatientAvatar: ({ onPhotoUpdated }: { onPhotoUpdated?: (k: string | null) => void }) => (
    <button onClick={() => onPhotoUpdated?.('key.webp')}>upload-photo</button>
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
  })

  it('mirrors a photo update into Dexie without calling patient.update', async () => {
    global.fetch = vi.fn() as unknown as typeof fetch
    render(
      <PatientHeaderCard patient={patient} patientId={PATIENT_ID}
        onEditClick={() => {}} onPatientUpdated={() => {}} />,
    )
    fireEvent.click(screen.getByText('upload-photo')) // PatientAvatar mock fires onPhotoUpdated('key.webp')
    await waitFor(() => expect(putPatient).toHaveBeenCalled())
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
