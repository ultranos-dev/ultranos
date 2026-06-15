/**
 * Temperature excursion alert message generation and severity escalation.
 *
 * Alert format: "Reagent fridge exceeded [maxTemp] C at [time] —
 *   duration [X] hours. Affected reagents may be compromised."
 *
 * Severity levels:
 *   WARNING  — temperature within 1 C of limit (approaching excursion)
 *   CRITICAL — temperature exceeds limit
 *   EXTENDED — temperature has exceeded limit for 2+ hours
 */

import type { TemperatureExcursion, TemperatureLocation } from '@/types/temperature-monitoring'
import { ExcursionSeverity } from '@/types/temperature-monitoring'
import { getExcursionDuration } from './temperature-service'

export interface TemperatureAlert {
  excursionId: string
  locationId: string
  locationName: string
  severity: ExcursionSeverity
  message: string
  notifyLabManager: boolean
}

/**
 * Generate an alert for a temperature excursion.
 */
export function generateAlert(
  excursion: TemperatureExcursion,
  location: TemperatureLocation,
): TemperatureAlert {
  const durationMinutes = getExcursionDuration(excursion)
  const durationHours = (durationMinutes / 60).toFixed(1)
  const exceedTime = new Date(excursion.startTime).toLocaleTimeString()

  const breachedLimit = excursion.peakTemperature > location.maxTemp
    ? location.maxTemp
    : location.minTemp

  const direction = excursion.peakTemperature > location.maxTemp
    ? 'exceeded'
    : 'fell below'

  const message =
    `${location.name} ${direction} ${breachedLimit}°C at ${exceedTime} — ` +
    `duration ${durationHours} hours. Affected reagents may be compromised.`

  const notifyLabManager =
    excursion.severity === ExcursionSeverity.CRITICAL ||
    excursion.severity === ExcursionSeverity.EXTENDED

  return {
    excursionId: excursion.id,
    locationId: excursion.locationId,
    locationName: excursion.locationName,
    severity: excursion.severity,
    message,
    notifyLabManager,
  }
}

/**
 * Determine the severity for a temperature reading relative to location limits.
 * Exported for use by the temperature service.
 */
export function classifySeverity(
  temperatureCelsius: number,
  location: TemperatureLocation,
): ExcursionSeverity | null {
  const { minTemp, maxTemp } = location

  if (temperatureCelsius < minTemp - 1 || temperatureCelsius > maxTemp + 1) {
    return ExcursionSeverity.CRITICAL
  }
  if (temperatureCelsius < minTemp || temperatureCelsius > maxTemp) {
    return ExcursionSeverity.WARNING
  }
  return null // Normal
}

/**
 * Check if an existing excursion should be escalated based on duration.
 * Returns the escalated severity, or the current severity if no change.
 */
export function checkEscalation(excursion: TemperatureExcursion): ExcursionSeverity {
  const durationMinutes = getExcursionDuration(excursion)

  if (durationMinutes > 120 && excursion.severity !== ExcursionSeverity.EXTENDED) {
    return ExcursionSeverity.EXTENDED
  }

  return excursion.severity
}
