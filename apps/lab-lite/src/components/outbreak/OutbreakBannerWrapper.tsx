'use client'

/**
 * OutbreakBannerWrapper — Story 54.5
 *
 * Client-side wrapper that renders the OutbreakModeBanner and manages the
 * deactivation modal trigger. Placed in the root layout so it appears on
 * every screen while Outbreak Mode is active.
 */

import { useState } from 'react'
import { OutbreakModeBanner } from './OutbreakModeBanner'
import { DeactivateOutbreakModal } from './DeactivateOutbreakModal'

export function OutbreakBannerWrapper() {
  const [showDeactivate, setShowDeactivate] = useState(false)

  return (
    <>
      <OutbreakModeBanner onDeactivate={() => setShowDeactivate(true)} />
      {showDeactivate && (
        <DeactivateOutbreakModal
          onDeactivated={() => {
            setShowDeactivate(false)
            // Banner will auto-hide on next poll (30s) or on page refresh
            window.location.reload()
          }}
          onCancel={() => setShowDeactivate(false)}
        />
      )}
    </>
  )
}
