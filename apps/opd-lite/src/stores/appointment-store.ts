import { create } from 'zustand'

interface AppointmentState {
  selectedDate: Date
  viewMode: 'day' | 'week'
  setSelectedDate: (date: Date) => void
  setViewMode: (mode: 'day' | 'week') => void
  nextDay: () => void
  prevDay: () => void
  nextWeek: () => void
  prevWeek: () => void
}

export const useAppointmentStore = create<AppointmentState>((set) => ({
  selectedDate: new Date(),
  viewMode: 'day',

  setSelectedDate: (date: Date) => set({ selectedDate: date }),
  setViewMode: (mode: 'day' | 'week') => set({ viewMode: mode }),

  nextDay: () =>
    set((state) => {
      const next = new Date(state.selectedDate)
      next.setDate(next.getDate() + 1)
      return { selectedDate: next }
    }),

  prevDay: () =>
    set((state) => {
      const prev = new Date(state.selectedDate)
      prev.setDate(prev.getDate() - 1)
      return { selectedDate: prev }
    }),

  nextWeek: () =>
    set((state) => {
      const next = new Date(state.selectedDate)
      next.setDate(next.getDate() + 7)
      return { selectedDate: next }
    }),

  prevWeek: () =>
    set((state) => {
      const prev = new Date(state.selectedDate)
      prev.setDate(prev.getDate() - 7)
      return { selectedDate: prev }
    }),
}))
