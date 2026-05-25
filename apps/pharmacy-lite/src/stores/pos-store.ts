import { create } from 'zustand'
import type { Invoice, CashDrawer } from '@/lib/pos/types'

interface PosState {
  activeInvoice: Invoice | null
  activeCashDrawer: CashDrawer | null
  setActiveInvoice: (invoice: Invoice | null) => void
  setActiveCashDrawer: (drawer: CashDrawer | null) => void
  clearActiveInvoice: () => void
}

export const usePosStore = create<PosState>((set) => ({
  activeInvoice: null,
  activeCashDrawer: null,
  setActiveInvoice: (invoice) => set({ activeInvoice: invoice }),
  setActiveCashDrawer: (drawer) => set({ activeCashDrawer: drawer }),
  clearActiveInvoice: () => set({ activeInvoice: null }),
}))
