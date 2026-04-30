import type { RangeStatus } from '@/components/clinical/vitals-form'

interface VitalThreshold {
  warningLow: number
  warningHigh: number
  panicLow: number
  panicHigh: number
}

export const vitalsConfig = {
  weight: {
    warningLow: 3,
    warningHigh: 200,
    panicLow: 1,
    panicHigh: 350,
  },
  height: {
    warningLow: 40,
    warningHigh: 220,
    panicLow: 20,
    panicHigh: 260,
  },
  systolic: {
    warningLow: 90,
    warningHigh: 140,
    panicLow: 80,
    panicHigh: 180,
  },
  diastolic: {
    warningLow: 60,
    warningHigh: 90,
    panicLow: 50,
    panicHigh: 120,
  },
  temperature: {
    warningLow: 36.0,
    warningHigh: 38.5,
    panicLow: 35.0,
    panicHigh: 41.0,
  },
  bmi: {
    warningLow: 18.5,
    warningHigh: 25,
    panicLow: 15,
    panicHigh: 40,
  },
} as const satisfies Record<string, VitalThreshold>

export type VitalKey = keyof typeof vitalsConfig

export function getVitalRangeStatus(
  vital: VitalKey,
  value: number,
): RangeStatus {
  if (!Number.isFinite(value)) return 'normal'

  const config = vitalsConfig[vital]

  if (value <= config.panicLow || value >= config.panicHigh) return 'panic'
  if (value <= config.warningLow || value >= config.warningHigh) return 'warning'

  return 'normal'
}
