export enum TemperatureSource {
  BLE_SENSOR = 'BLE_SENSOR',
  MANUAL = 'MANUAL',
}

export enum ExcursionSeverity {
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
  EXTENDED = 'EXTENDED',
}

export interface TemperatureReading {
  id: string
  locationId: string
  locationName: string
  temperatureCelsius: number
  timestamp: string
  source: TemperatureSource
  sensorId: string | null
  recordedBy: string
  hlcTimestamp: string
}

export type TemperatureLocationType = 'FRIDGE' | 'FREEZER' | 'AMBIENT'

export interface TemperatureLocation {
  id: string
  name: string
  minTemp: number
  maxTemp: number
  type: TemperatureLocationType
  sensorId: string | null
}

export interface TemperatureExcursion {
  id: string
  locationId: string
  locationName: string
  startTime: string
  endTime: string | null
  peakTemperature: number
  durationMinutes: number | null
  severity: ExcursionSeverity
  acknowledged: boolean
  acknowledgedBy: string | null
  affectedReagents: string[]
}
