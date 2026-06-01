'use client'

// ---------------------------------------------------------------------------
// Story 54.2 — CHW Mode Gate
// Renders CHW-specific layout when CHW mode is active.
// Completely REMOVES (not hides) result entry, QC, inventory, and advanced
// settings from the component tree per AC #8.
//
// Usage:
//   <CHWModeGate chw={<CHWDashboard />} standard={<LabDashboard />} />
// ---------------------------------------------------------------------------

import { useIsCHWMode } from '@/lib/chw-mode'
import type { ReactNode } from 'react'

interface CHWModeGateProps {
  /** Component tree rendered when CHW mode is active. */
  chw: ReactNode
  /** Component tree rendered for normal lab users. */
  standard: ReactNode
}

/**
 * Renders either the CHW-specific layout or the standard lab layout
 * based on the current user's role. The inactive branch is NOT rendered —
 * it is completely absent from the component tree (AC #8).
 */
export function CHWModeGate({ chw, standard }: CHWModeGateProps): ReactNode {
  const isChw = useIsCHWMode()
  return isChw ? chw : standard
}
