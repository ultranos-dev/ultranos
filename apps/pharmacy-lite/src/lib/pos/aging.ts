export interface AgingBuckets {
  /** 0-30 days outstanding */
  current: number
  /** 31-60 days outstanding */
  thirtyDay: number
  /** 61-90 days outstanding */
  sixtyDay: number
  /** 90+ days outstanding */
  ninetyPlus: number
}

export function computeAging(
  entries: { amount: number; timestamp: string }[],
  now: number = Date.now(),
): AgingBuckets {
  const DAY_MS = 86_400_000
  const b: AgingBuckets = { current: 0, thirtyDay: 0, sixtyDay: 0, ninetyPlus: 0 }
  for (const e of entries) {
    if (e.amount <= 0) continue
    const ageDays = Math.floor((now - new Date(e.timestamp).getTime()) / DAY_MS)
    if (ageDays <= 30) b.current += e.amount
    else if (ageDays <= 60) b.thirtyDay += e.amount
    else if (ageDays <= 90) b.sixtyDay += e.amount
    else b.ninetyPlus += e.amount
  }
  return b
}
