/**
 * Announce a message to screen readers via the dashboard's aria-live region.
 * The region is in ClinicalDashboard.tsx with id="dashboard-live-region".
 */
export function announceToDashboard(message: string): void {
  const el = document.getElementById('dashboard-live-region')
  if (!el) return
  // Clear then set — ensures repeated identical messages are re-announced
  el.textContent = ''
  requestAnimationFrame(() => {
    el.textContent = message
  })
}
