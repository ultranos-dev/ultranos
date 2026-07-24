'use client'

import * as React from 'react'
import { cn } from '../../lib/utils.js'

export interface DetailLayoutProps {
  /** Full-width content above the grid (e.g. allergy banner). Never inside a column. */
  banner?: React.ReactNode
  /** Sticky context column. On lg+ it sits on the inline-end and scroll-follows; below lg it stacks on top. */
  rail: React.ReactNode
  /** Accessible name for the rail landmark. */
  railLabel?: string
  /** Main flow column. */
  children: React.ReactNode
  className?: string
}

/**
 * Two-column detail workspace: main flow + sticky context rail.
 * lg+: grid [1fr | 20rem], rail sticky under the h-14 header.
 * < lg: single column, rail stacked above main (order utilities).
 * RTL-safe: grid columns follow `direction`, so the rail lands inline-end automatically.
 */
export function DetailLayout({ banner, rail, railLabel, children, className }: DetailLayoutProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {banner ? <div data-slot="detail-banner">{banner}</div> : null}
      <div className="gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">{children}</div>
        <aside
          aria-label={railLabel || undefined}
          className="order-1 mb-4 flex flex-col gap-4 lg:order-2 lg:mb-0 lg:sticky lg:top-[4.5rem] lg:max-h-[calc(100svh-4.5rem)] lg:overflow-y-auto lg:pb-2"
        >
          {rail}
        </aside>
      </div>
    </div>
  )
}
