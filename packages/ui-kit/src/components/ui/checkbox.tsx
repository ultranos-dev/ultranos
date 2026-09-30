'use client'

import * as React from 'react'
import { cn } from '../../lib/utils.js'

type CheckboxVariant = 'primary' | 'destructive' | 'warning' | 'success'
type CheckboxSize = 'sm' | 'md'

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  /** Color of the box when checked. Defaults to the app-green primary. Use
   *  `destructive`/`warning` for safety acknowledgments that must stay colored. */
  variant?: CheckboxVariant
  /** sm = 16px (default), md = 20px (list rows / larger touch targets). */
  size?: CheckboxSize
  /** Extra classes for the outer wrapper (e.g. `mt-0.5` alignment). */
  className?: string
}

// Static class strings per variant (Tailwind can't build class names dynamically).
const VARIANT_CHECKED: Record<CheckboxVariant, string> = {
  primary:
    'peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground',
  destructive:
    'peer-checked:border-destructive peer-checked:bg-destructive peer-checked:text-destructive-foreground',
  warning: 'peer-checked:border-warning peer-checked:bg-warning peer-checked:text-white',
  success: 'peer-checked:border-success peer-checked:bg-success peer-checked:text-white',
}

const VARIANT_RING: Record<CheckboxVariant, string> = {
  primary: 'peer-focus-visible:ring-ring',
  destructive: 'peer-focus-visible:ring-destructive',
  warning: 'peer-focus-visible:ring-warning',
  success: 'peer-focus-visible:ring-success',
}

const BOX_SIZE: Record<CheckboxSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
}

const CHECK_SIZE: Record<CheckboxSize, string> = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
}

/**
 * Shared circular checkbox — one style for every Ultranos web app.
 *
 * A real, accessible `<input type="checkbox">` sits transparently over a circular
 * visual indicator (so it's keyboard-focusable and clickable on its own, in or
 * out of a `<label>`). Forwards all native input props (checked, onChange,
 * disabled, readOnly, required, id, name, aria-*, ref) — a drop-in for
 * `<input type="checkbox">`, moving sizing/color to `size`/`variant`.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ variant = 'primary', size = 'sm', className, disabled, ...props }, ref) => {
    return (
      <span className={cn('relative inline-flex shrink-0', BOX_SIZE[size], className)}>
        <input
          ref={ref}
          type="checkbox"
          disabled={disabled}
          className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none flex items-center justify-center rounded-full border border-border bg-background text-transparent transition-colors',
            BOX_SIZE[size],
            VARIANT_CHECKED[variant],
            'peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1',
            VARIANT_RING[variant],
            'peer-disabled:opacity-50',
          )}
        >
          {/* Inline check glyph (no icons dependency, so tests that mock the
              icon module don't need to expose it). */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={CHECK_SIZE[size]}
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
      </span>
    )
  },
)

Checkbox.displayName = 'Checkbox'
