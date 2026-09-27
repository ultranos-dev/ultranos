'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Button as UIKitButton, buttonVariants } from '@ultranos/ui-kit/components/ui/button'

/**
 * patient-kit Button — thin adapter over the shared ui-kit ShadCN Button, mapping the
 * apps' historical variant vocabulary onto the ui-kit variants (moved from opd-lite's
 * app-local Button so shared sections keep identical button styling). No styling here.
 *
 *   primary -> default · secondary -> secondary · danger -> destructive ·
 *   warning -> warning · ghost -> ghost · outline -> outline · icon -> ghost + size=icon
 */
type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'warning'
  | 'ghost'
  | 'outline'
  | 'icon'

type UIKitSize = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'
type UIKitVariant = NonNullable<NonNullable<Parameters<typeof buttonVariants>[0]>['variant']>

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: UIKitSize
  fullWidth?: boolean
}

const VARIANT_MAP: Record<ButtonVariant, { variant: UIKitVariant; size?: UIKitSize }> = {
  primary:   { variant: 'default' },
  secondary: { variant: 'secondary' },
  danger:    { variant: 'destructive' },
  warning:   { variant: 'warning' },
  ghost:     { variant: 'ghost' },
  outline:   { variant: 'outline' },
  icon:      { variant: 'ghost', size: 'icon' },
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size, fullWidth, className, ...props }, ref) => {
    const mapped = VARIANT_MAP[variant]
    return (
      <UIKitButton
        ref={ref}
        variant={mapped.variant}
        size={size ?? mapped.size ?? 'default'}
        className={[fullWidth && 'w-full', className].filter(Boolean).join(' ') || undefined}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'
