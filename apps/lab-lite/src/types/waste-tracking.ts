export enum ContainerType {
  SHARPS = 'SHARPS',
  INFECTIOUS = 'INFECTIOUS',
  CHEMICAL = 'CHEMICAL',
}

export enum ContainerStatus {
  ACTIVE = 'ACTIVE',
  FULL = 'FULL',
  DISPOSED = 'DISPOSED',
}

export enum FillLevel {
  QUARTER = 'QUARTER',
  HALF = 'HALF',
  THREE_QUARTER = 'THREE_QUARTER',
  FULL = 'FULL',
}

export enum DisposalMethod {
  AUTOCLAVE = 'AUTOCLAVE',
  INCINERATION = 'INCINERATION',
  PICKUP = 'PICKUP',
  OTHER = 'OTHER',
}

export interface FillHistoryEntry {
  level: FillLevel
  recordedAt: string
  recordedBy: string
}

export interface WasteContainer {
  id: string
  location: string
  type: ContainerType
  status: ContainerStatus
  startDate: string
  expectedFillDate: string | null
  fillDate: string | null
  fillLevel: FillLevel
  fillHistory: FillHistoryEntry[]
  disposedBy: string | null
  disposedAt: string | null
  disposalMethod: DisposalMethod | null
  quantityEstimate: string | null
  hlcTimestamp: string
}

export interface WasteDisposalRecord {
  id: string
  containerId: string
  type: ContainerType
  disposedBy: string
  disposedAt: string
  disposalMethod: DisposalMethod
  quantityEstimate: string
  location: string
  hlcTimestamp: string
}

export interface WasteAlert {
  containerId: string
  location: string
  type: ContainerType
  message: string
  severity: 'WARNING' | 'URGENT'
  generatedAt: string
}

export interface WasteSummary {
  period: string
  totalContainersDisposed: number
  byType: Record<ContainerType, number>
  byLocation: Record<string, number>
  averageFillDaysByType: Record<ContainerType, number>
  complianceNotes: string[]
}
