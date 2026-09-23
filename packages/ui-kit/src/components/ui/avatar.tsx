'use client'

import { useState } from 'react'
import { User } from '../../icons.js'
import { cn } from '../../lib/utils.js'

/**
 * Display-only avatar. Shows the photo when `src` is provided (a ready-to-use URL —
 * usually a server-generated signed URL), otherwise a deterministic initials circle
 * (colored by name) and finally a generic user icon. Does NO fetching, so it is cheap
 * to render in large tables. Shared across every app that lists patients or staff.
 */

// Deterministic palette from semantic tokens (works in light/RTL/dark).
const PALETTE = [
  'bg-primary/15 text-primary',
  'bg-success/15 text-success',
  'bg-warning/15 text-warning',
  'bg-destructive/15 text-destructive',
  'bg-accent/40 text-accent-foreground',
  'bg-muted text-muted-foreground',
]

function hashIndex(s: string, n: number): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % n
}

function toInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return (parts[0]!.slice(0, 2)).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export interface AvatarProps {
  /** Ready-to-render image URL (e.g. a signed URL). Null/undefined → initials/icon fallback. */
  src?: string | null
  /** Display name used for the initials + deterministic color. */
  name?: string | null
  /** Pixel diameter (default 32). */
  size?: number
  /**
   * Double concentric brand ring: a 1px primary stroke @100% with a 1px primary
   * stroke @50% just outside it. Used on profile/detail avatars.
   */
  ring?: boolean
  className?: string
}

/** Double concentric primary ring (1px @100% + 1px @50%), token-driven for theming. */
const AVATAR_RING =
  'shadow-[0_0_0_1px_oklch(var(--primary)),0_0_0_2px_oklch(var(--primary)/0.5)]'

export function Avatar({ src, name, size = 32, ring = false, className }: AvatarProps) {
  const [errored, setErrored] = useState(false)
  const label = (name ?? '').trim()
  const showImg = !!src && !errored
  const initials = toInitials(label)
  const colorClass = PALETTE[hashIndex(label || 'anon', PALETTE.length)]

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        showImg ? 'bg-muted' : colorClass,
        ring && AVATAR_RING,
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt="" className="h-full w-full object-cover" onError={() => setErrored(true)} />
      ) : initials ? (
        <span className="font-semibold leading-none" style={{ fontSize: Math.max(10, Math.round(size * 0.38)) }}>
          {initials}
        </span>
      ) : (
        <User style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }} />
      )}
    </span>
  )
}
