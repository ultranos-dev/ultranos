/**
 * Business-day calculation with configurable MENA weekend support.
 *
 * Default weekend: Thursday (4) + Friday (5) — Afghanistan convention.
 * UAE/Saudi: Friday (5) + Saturday (6).
 * Some countries: Friday only ([5]).
 *
 * JS Date.getDay() mapping: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
 *
 * Story 45.5 — Task 7
 */

/** Default Afghanistan weekend: Thursday=4, Friday=5 */
export function getDefaultWeekendDays(): number[] {
  return [4, 5]
}

/**
 * Add `days` business days to an ISO date string (YYYY-MM-DD).
 * If `startDate` falls on a weekend, first advances to the next business day,
 * then counts `days` additional business days from there.
 *
 * @param startDate - ISO date string (YYYY-MM-DD)
 * @param days      - number of business days to add (>= 0)
 * @param weekend   - array of JS day-of-week numbers that are non-working
 * @returns ISO date string (YYYY-MM-DD)
 */
export function addBusinessDays(
  startDate: string,
  days: number,
  weekend: number[] = getDefaultWeekendDays(),
): string {
  // Parse without timezone shift: treat as local midnight
  const [year, month, day] = startDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  // If starting on a weekend day, advance to the next business day first
  while (weekend.includes(date.getDay())) {
    date.setDate(date.getDate() + 1)
  }

  // Now count `days` business days
  let remaining = days
  while (remaining > 0) {
    date.setDate(date.getDate() + 1)
    if (!weekend.includes(date.getDay())) {
      remaining--
    }
  }

  return toIsoDateString(date)
}

function toIsoDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
