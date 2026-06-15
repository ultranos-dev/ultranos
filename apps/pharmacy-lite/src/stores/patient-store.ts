import { create } from 'zustand'
import type { LocalPatient } from '@/lib/db'

interface PatientState {
  activePatient: LocalPatient | null
  setActivePatient: (patient: LocalPatient | null) => void
  clearPatient: () => void
}

export const usePatientStore = create<PatientState>((set) => ({
  activePatient: null,
  setActivePatient: (patient) => set({ activePatient: patient }),
  clearPatient: () => set({ activePatient: null }),
}))
