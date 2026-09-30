import { describe, it, expect } from 'vitest'

// Regression coverage for the "walk-ins disappear after re-login" bug.
//
// Root cause: locally-created appointments (create + walk-in) carried ONLY a
// `Patient/<id>` participant, so the Hub derived `participant_refs = [patientId]`
// with NO practitioner ref. The pull (`appointment.listByPractitioner`) filters
// `participant_refs contains [practitionerId]`, so the row persisted to Supabase
// but was orphaned — never pulled back once the encrypted local cache cleared.
//
// `appointmentParticipants` is the single builder every write path uses so the
// practitioner ref is always present (and never silently dropped on edit, which
// would re-orphan the row because `syncBatch` re-derives participant_refs from
// this array on every push).
import { appointmentParticipants } from '@/hooks/useAppointments'

describe('appointmentParticipants — practitioner association for pull retrieval', () => {
  it('includes the authenticated practitioner alongside the patient (create/walk-in)', () => {
    expect(appointmentParticipants('pat-1', 'Ahmad K.', 'doc-1')).toEqual([
      { actor: { reference: 'Patient/pat-1', display: 'Ahmad K.' }, status: 'accepted' },
      { actor: { reference: 'Practitioner/doc-1' }, status: 'accepted' },
    ])
  })

  it('omits the practitioner entry when no session practitioner is available (offline-safe)', () => {
    expect(appointmentParticipants('pat-1', 'Ahmad K.', undefined)).toEqual([
      { actor: { reference: 'Patient/pat-1', display: 'Ahmad K.' }, status: 'accepted' },
    ])
  })

  it('preserves an existing practitioner participant on edit (never reassigns owner)', () => {
    const existing = [
      { actor: { reference: 'Patient/old', display: 'Old' }, status: 'accepted' as const },
      { actor: { reference: 'Practitioner/doc-owner' }, status: 'accepted' as const },
    ]
    expect(
      appointmentParticipants('pat-1', 'Ahmad K.', 'doc-editor', 'accepted', existing),
    ).toEqual([
      { actor: { reference: 'Patient/pat-1', display: 'Ahmad K.' }, status: 'accepted' },
      { actor: { reference: 'Practitioner/doc-owner' }, status: 'accepted' },
    ])
  })

  it('heals a legacy patient-only appointment on edit by stamping the session practitioner', () => {
    const existing = [
      { actor: { reference: 'Patient/old', display: 'Old' }, status: 'accepted' as const },
    ]
    expect(
      appointmentParticipants('pat-1', 'Ahmad K.', 'doc-editor', 'accepted', existing),
    ).toEqual([
      { actor: { reference: 'Patient/pat-1', display: 'Ahmad K.' }, status: 'accepted' },
      { actor: { reference: 'Practitioner/doc-editor' }, status: 'accepted' },
    ])
  })

  it('preserves the patient participant status on edit', () => {
    expect(appointmentParticipants('pat-1', 'Ahmad K.', 'doc-1', 'tentative')[0]!.status).toBe(
      'tentative',
    )
  })
})
