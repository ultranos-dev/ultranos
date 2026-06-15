/**
 * Manual temperature reading prompt logic.
 *
 * When BLE sensors are unavailable, the system prompts twice-daily
 * manual temperature readings:
 *   Morning window:  7:00 AM – 10:00 AM (prompt at 8:00 AM)
 *   Afternoon window: 1:00 PM – 4:00 PM  (prompt at 2:00 PM)
 */

import type { TemperatureReading } from '@/types/temperature-monitoring'
import { getReadingsByLocation, getTemperatureLocations } from '@/lib/db'

interface PromptWindow {
  startHour: number
  endHour: number
  promptHour: number
}

const MORNING_WINDOW: PromptWindow = { startHour: 7, endHour: 10, promptHour: 8 }
const AFTERNOON_WINDOW: PromptWindow = { startHour: 13, endHour: 16, promptHour: 14 }

const PROMPT_WINDOWS: PromptWindow[] = [MORNING_WINDOW, AFTERNOON_WINDOW]

/**
 * Determine which prompt window the given time falls within, if any.
 */
function getCurrentWindow(now: Date): PromptWindow | null {
  const hour = now.getHours()
  return PROMPT_WINDOWS.find((w) => hour >= w.startHour && hour < w.endHour) ?? null
}

/**
 * Calculate the next prompt time based on the last reading.
 * Returns the next scheduled prompt time (8:00 AM or 2:00 PM).
 */
export function getNextPromptTime(lastReading: TemperatureReading | null): Date {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const hour = now.getHours()

  // If no last reading, the next prompt is the earliest upcoming window
  if (!lastReading) {
    if (hour < MORNING_WINDOW.promptHour) {
      return new Date(today.getTime() + MORNING_WINDOW.promptHour * 60 * 60 * 1000)
    }
    if (hour < AFTERNOON_WINDOW.promptHour) {
      return new Date(today.getTime() + AFTERNOON_WINDOW.promptHour * 60 * 60 * 1000)
    }
    // Past both windows today — next morning
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
    return new Date(tomorrow.getTime() + MORNING_WINDOW.promptHour * 60 * 60 * 1000)
  }

  const lastTime = new Date(lastReading.timestamp)
  const lastHour = lastTime.getHours()
  const lastDate = new Date(lastTime.getFullYear(), lastTime.getMonth(), lastTime.getDate())
  const isToday = lastDate.getTime() === today.getTime()

  if (isToday) {
    // Last reading was today — find the next window after that reading
    if (lastHour < AFTERNOON_WINDOW.startHour) {
      return new Date(today.getTime() + AFTERNOON_WINDOW.promptHour * 60 * 60 * 1000)
    }
    // Both windows covered today — next morning
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
    return new Date(tomorrow.getTime() + MORNING_WINDOW.promptHour * 60 * 60 * 1000)
  }

  // Last reading was a previous day — next prompt is earliest today
  if (hour < MORNING_WINDOW.promptHour) {
    return new Date(today.getTime() + MORNING_WINDOW.promptHour * 60 * 60 * 1000)
  }
  if (hour < AFTERNOON_WINDOW.promptHour) {
    return new Date(today.getTime() + AFTERNOON_WINDOW.promptHour * 60 * 60 * 1000)
  }
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000)
  return new Date(tomorrow.getTime() + MORNING_WINDOW.promptHour * 60 * 60 * 1000)
}

/**
 * Check if a manual reading prompt is currently due for a location.
 * A prompt is due when we're within a window and no reading exists in that window.
 */
export async function isPromptDue(locationId: string): Promise<boolean> {
  const now = new Date()
  const currentWindow = getCurrentWindow(now)
  if (!currentWindow) return false

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const windowStart = new Date(today.getTime() + currentWindow.startHour * 60 * 60 * 1000)

  const readings = await getReadingsByLocation(locationId)
  const hasReadingInWindow = readings.some((r) => {
    const readingTime = new Date(r.timestamp)
    return readingTime >= windowStart && readingTime <= now
  })

  return !hasReadingInWindow
}

/**
 * Get all locations with overdue manual readings.
 * Returns locations where a prompt window is active but no reading has been logged.
 */
export async function getMissedPrompts(): Promise<
  Array<{ locationId: string; locationName: string; lastReading: string | null }>
> {
  const now = new Date()
  const currentWindow = getCurrentWindow(now)
  if (!currentWindow) return []

  const locations = await getTemperatureLocations()
  const missed: Array<{ locationId: string; locationName: string; lastReading: string | null }> = []

  for (const loc of locations) {
    const due = await isPromptDue(loc.id)
    if (due) {
      const readings = await getReadingsByLocation(loc.id)
      missed.push({
        locationId: loc.id,
        locationName: loc.name,
        lastReading: readings.length > 0 ? readings[0].timestamp : null,
      })
    }
  }

  return missed
}
