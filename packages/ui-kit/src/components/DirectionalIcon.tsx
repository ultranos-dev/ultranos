import { type ReactNode, type CSSProperties } from 'react'

export type IconCategory = 'navigation' | 'medical' | 'neutral'

export interface DirectionalIconProps {
  /** The icon element to render */
  children: ReactNode
  /** Whether this icon should mirror in RTL.
   * - 'navigation': mirrors in RTL (arrows, chevrons, back buttons)
   * - 'medical': never mirrors (pill, stethoscope, syringe, etc.)
   * - 'neutral': never mirrors (default)
   */
  category?: IconCategory
  /** Additional className to apply */
  className?: string
  /** Additional inline styles */
  style?: CSSProperties
  /** aria-hidden (defaults to true for decorative icons) */
  ariaHidden?: boolean
}

/**
 * Wrapper that applies RTL-aware mirroring to navigation icons.
 *
 * Navigation icons (arrows, chevrons, back buttons, breadcrumb separators)
 * should mirror horizontally in RTL mode. Medical icons (pill, stethoscope,
 * syringe, heartbeat, lab flask, thermometer, bandage) must NOT mirror.
 *
 * Uses CSS logical transform that responds to the `dir` attribute on a parent.
 */
export function DirectionalIcon({
  children,
  category = 'neutral',
  className,
  style,
  ariaHidden = true,
}: DirectionalIconProps) {
  const shouldMirror = category === 'navigation'

  return (
    <span
      className={className}
      aria-hidden={ariaHidden}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
        ...(shouldMirror ? { transform: 'var(--directional-icon-transform, none)' } : {}),
      }}
    >
      {children}
    </span>
  )
}

/**
 * CSS custom property definition for RTL mirroring.
 * Include this in a global stylesheet or inject via a style tag:
 *
 * ```css
 * [dir="rtl"] { --directional-icon-transform: scaleX(-1); }
 * [dir="ltr"] { --directional-icon-transform: none; }
 * ```
 */
export const DIRECTIONAL_ICON_CSS = `[dir="rtl"] { --directional-icon-transform: scaleX(-1); }
[dir="ltr"] { --directional-icon-transform: none; }`
