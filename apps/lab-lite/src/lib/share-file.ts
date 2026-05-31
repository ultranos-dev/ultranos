// ---------------------------------------------------------------------------
// Story 50.4 — Web Share API utility
// Shared by daily log sharing; also reusable for future report stories.
// Tries navigator.share (Web Share API Level 2) first; falls back to download.
// ---------------------------------------------------------------------------

/**
 * Share or download a PNG file.
 * Returns true if sharing succeeded (or fallback download triggered).
 * Returns false if the user cancelled the share dialog.
 * Never throws — callers must handle the returned boolean.
 */
export async function shareFile(
  blob: Blob,
  fileName: string,
  shareData: { title: string; text: string },
): Promise<boolean> {
  const file = new File([blob], fileName, { type: blob.type })

  if (
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: shareData.title,
        text: shareData.text,
      })
      return true
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled — not an error
        return false
      }
      // Other errors — fall through to download
    }
  }

  // Fallback: trigger a browser download
  triggerDownload(blob, fileName)
  return true
}

/** Trigger a browser download for the given blob. */
export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke after a short delay to allow the download to start
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Share a daily log PNG via Web Share API / download fallback.
 * @param imageBlob PNG blob of the rendered daily report
 * @param date      YYYY-MM-DD date string for file naming
 */
export async function shareDailyLog(imageBlob: Blob, date: string): Promise<boolean> {
  return shareFile(imageBlob, `lab-daily-report-${date}.png`, {
    title: `Lab Daily Report — ${date}`,
    text: `Daily Activity Log for ${date}`,
  })
}
