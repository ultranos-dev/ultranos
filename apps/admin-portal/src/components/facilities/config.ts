import { trpc } from '@/lib/trpc'

export interface FacilityKindConfig {
  key: 'pharmacy' | 'clinical'
  i18nNs: 'pharmacies' | 'clinics'
  typeOptions?: string[]
  extraBooleanFields: { name: string; label: string }[]
  extraArrayFields: { name: string; label: string }[]
  createFn: (input: Record<string, unknown>) => Promise<{ id: string }>
  updateFn: (input: Record<string, unknown>) => Promise<unknown>
  archiveFn: (input: { id: string }) => Promise<unknown>
  restoreFn: (input: { id: string }) => Promise<unknown>
  listFn: (input: { cursor: number; limit: number; q?: string; includeArchived?: boolean }) => Promise<{ facilities: any[]; nextCursor: number | null }>
  getDetailFn?: (input: { id: string }) => Promise<unknown>
}

export const pharmacyKind: FacilityKindConfig = {
  key: 'pharmacy',
  i18nNs: 'pharmacies',
  extraBooleanFields: [
    { name: 'hasDelivery', label: 'hasDelivery' },
    { name: 'acceptsInsurance', label: 'acceptsInsurance' },
  ],
  extraArrayFields: [],
  createFn: (i) => trpc.pharmacy.create.mutate(i as never),
  updateFn: (i) => trpc.pharmacy.update.mutate(i as never),
  archiveFn: (i) => trpc.pharmacy.archive.mutate(i),
  restoreFn: (i) => trpc.pharmacy.restore.mutate(i),
  listFn: (i) => trpc.pharmacy.listForAdmin.query(i as never),
  getDetailFn: (i) => trpc.pharmacy.getDetail.query(i as never),
}

export const clinicalKind: FacilityKindConfig = {
  key: 'clinical',
  i18nNs: 'clinics',
  typeOptions: ['clinic', 'hospital', 'opd'],
  extraBooleanFields: [
    { name: 'emergencyServices', label: 'emergencyServices' },
  ],
  extraArrayFields: [
    { name: 'departments', label: 'departments' },
    { name: 'specialties', label: 'specialties' },
  ],
  createFn: (i) => trpc.clinicalFacility.create.mutate(i as never),
  updateFn: (i) => trpc.clinicalFacility.update.mutate(i as never),
  archiveFn: (i) => trpc.clinicalFacility.archive.mutate(i),
  restoreFn: (i) => trpc.clinicalFacility.restore.mutate(i),
  listFn: (i) => trpc.clinicalFacility.listForAdmin.query(i as never),
  getDetailFn: (i) => trpc.clinicalFacility.getDetail.query(i as never),
}
