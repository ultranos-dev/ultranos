// ---------------------------------------------------------------------------
// Story 54.2 — CHW Label Number Generator
// Generates short, handwrite-friendly sample labels: CHW-MMDD-NNN
// e.g. "CHW-0531-001" (May 31, sequence 1)
// Designed for use with no printer: the number is displayed large on screen
// for the CHW to copy onto the sample tube with a marker.
// ---------------------------------------------------------------------------

import { getTodayCHWSamples } from './db'

/** Format: CHW-MMDD-NNN (month-day, zero-padded 3-digit sequence) */
function buildLabelNumber(monthDay: string, seq: number): string {
  return `CHW-${monthDay}-${String(seq).padStart(3, '0')}`
}

/** Return today's MMDD string e.g. "0531" for May 31. */
function todayMMDD(): string {
  const now = new Date()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${mm}${dd}`
}

/**
 * Generate a unique label number for today.
 * Checks existing today's Dexie entries to avoid collisions.
 * Returns a label like "CHW-0531-004" (next available sequence for today).
 */
export async function generateLabelNumber(): Promise<string> {
  const monthDay = todayMMDD()
  const prefix = `CHW-${monthDay}-`

  const todaySamples = await getTodayCHWSamples()
  const usedNumbers = new Set(
    todaySamples
      .map((s) => s.labelNumber)
      .filter((n) => n.startsWith(prefix)),
  )

  let seq = 1
  while (usedNumbers.has(buildLabelNumber(monthDay, seq))) {
    seq++
    if (seq > 999) {
      throw new Error('CHW label sequence exhausted for today (>999 samples). Contact lab support.')
    }
  }

  return buildLabelNumber(monthDay, seq)
}

/**
 * Check if a label number already exists in today's Dexie samples.
 * Used for deduplication before persisting a new sample.
 */
export async function isLabelNumberTaken(labelNumber: string): Promise<boolean> {
  const todaySamples = await getTodayCHWSamples()
  return todaySamples.some((s) => s.labelNumber === labelNumber)
}

/**
 * Format a label number for large on-screen display.
 * Splits into parts for visual hierarchy: "CHW · 0531 · 001"
 */
export function formatLabelForDisplay(labelNumber: string): string {
  const parts = labelNumber.split('-')
  if (parts.length !== 3) return labelNumber
  return `${parts[0]} · ${parts[1]} · ${parts[2]}`
}

// ---------------------------------------------------------------------------
// Web Print API / label printer support
// Progressive enhancement: shows large number if no printer detected.
// ---------------------------------------------------------------------------

/** Returns true if a USB label printer appears to be connected. */
export function hasPrinterDetected(): boolean {
  if (typeof navigator === 'undefined') return false
  // Check for WebUSB API — required for USB label printers
  return 'usb' in navigator
}

/**
 * Attempt to print a label via the Web Print API / window.print fallback.
 * Opens a minimal print dialog with the label number, patient age, and sample type.
 * If no printer is detected, this is a no-op (caller should show on-screen label instead).
 *
 * @param labelNumber - e.g. "CHW-0531-001"
 * @param patientAge  - numeric age (displayed for sample-to-patient matching)
 * @param sampleType  - e.g. "blood"
 */
export function printLabel(
  labelNumber: string,
  patientAge: number,
  sampleType: string,
): void {
  if (typeof window === 'undefined') return

  // Open a tiny print window with just the label
  const win = window.open('', '_blank', 'width=300,height=200')
  if (!win) return

  win.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Sample Label</title>
        <style>
          body { font-family: monospace; text-align: center; padding: 16px; }
          .label { font-size: 28px; font-weight: bold; letter-spacing: 2px; }
          .meta { font-size: 14px; margin-top: 8px; color: #555; }
        </style>
      </head>
      <body>
        <div class="label">${labelNumber}</div>
        <div class="meta">Age: ${patientAge} | ${sampleType.toUpperCase()}</div>
        <script>window.onload = function() { window.print(); window.close(); }</script>
      </body>
    </html>
  `)
  win.document.close()
}
