import { MedicalTimeline } from '@/components/timeline/MedicalTimeline'
import { usePatientProfile } from '@/hooks/usePatientProfile'
import { useMedicalHistory } from '@/hooks/useMedicalHistory'

export function TimelineScreen() {
  const { patient, isLoading: profileLoading } = usePatientProfile()
  const { events, activeMedications, isLoading, error } = useMedicalHistory(
    patient?.id,
  )

  return (
    <MedicalTimeline
      events={events}
      activeMedications={activeMedications}
      isLoading={profileLoading || isLoading}
      error={error}
      patientId={patient?.id}
    />
  )
}
