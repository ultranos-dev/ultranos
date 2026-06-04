import { forwardRef } from 'react'
import type React from 'react'
import { Button as UiButton } from '@ultranos/ui-kit/components/ui/button'

// Derive variant type directly from the UiButton component — no reliance on ButtonProps export
type UiVariant = 'default' | 'secondary' | 'destructive' | 'ghost' | 'outline' | 'success' | 'link'

type LabButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'warning'
  | 'ghost'
  | 'outline'
  | 'brand'

interface ButtonProps extends Omit<React.ComponentPropsWithRef<typeof UiButton>, 'variant'> {
  variant?: LabButtonVariant
  fullWidth?: boolean
}

const VARIANT_MAP: Record<LabButtonVariant, UiVariant> = {
  primary: 'default',
  secondary: 'secondary',
  danger: 'destructive',
  warning: 'outline',
  ghost: 'ghost',
  outline: 'outline',
  brand: 'ghost',
}

const VARIANT_EXTRA_CLASSES: Partial<Record<LabButtonVariant, string>> = {
  warning: 'border-amber-500 bg-amber-600 text-white hover:bg-amber-700 hover:brightness-100',
  brand: 'bg-pill-green text-pill-text hover:bg-pill-green hover:brightness-105 hover:text-pill-text',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', fullWidth, className = '', ...props }, ref) => {
    const uiVariant = VARIANT_MAP[variant]
    const extraClass = VARIANT_EXTRA_CLASSES[variant] ?? ''

    const computedClass = [
      fullWidth ? 'w-full' : '',
      extraClass,
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <UiButton
        ref={ref}
        variant={uiVariant}
        className={computedClass || undefined}
        {...props}
      />
    )
  },
)

Button.displayName = 'Button'
