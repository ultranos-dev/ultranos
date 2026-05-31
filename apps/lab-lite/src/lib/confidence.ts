export enum ConfidenceLevel {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/** Numeric score ranges for each confidence level */
export const CONFIDENCE_THRESHOLDS = {
  HIGH: { min: 0.8, max: 1.0 },
  MEDIUM: { min: 0.5, max: 0.8 },
  LOW: { min: 0.0, max: 0.5 },
} as const

/** Confidence level at or below which auto-escalation is triggered */
export const AUTO_ESCALATION_THRESHOLD: ConfidenceLevel = ConfidenceLevel.LOW

/** Convert a numeric confidence score (0-1) to a ConfidenceLevel */
export function scoreToLevel(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE_THRESHOLDS.HIGH.min) return ConfidenceLevel.HIGH
  if (score >= CONFIDENCE_THRESHOLDS.MEDIUM.min) return ConfidenceLevel.MEDIUM
  return ConfidenceLevel.LOW
}

/** Check if a confidence level should trigger auto-escalation */
export function shouldAutoEscalate(level: ConfidenceLevel): boolean {
  const order: Record<ConfidenceLevel, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 }
  return order[level] <= order[AUTO_ESCALATION_THRESHOLD]
}
