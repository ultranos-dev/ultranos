import type { ElementType, ComponentPropsWithoutRef } from 'react'

/**
 * Shared surface primitive for patient-kit sections (moved from opd-lite's app-local
 * Card, unchanged styling — semantic tokens only). Renders as any element via `as`.
 */
const variants = {
  primary: 'rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50',
} as const

type CardVariant = keyof typeof variants

type CardProps<T extends ElementType = 'div'> = {
  as?: T
  variant?: CardVariant
} & ComponentPropsWithoutRef<T>

export function Card<T extends ElementType = 'div'>({
  as,
  variant = 'primary',
  className = '',
  children,
  ...rest
}: CardProps<T>) {
  const Comp = (as || 'div') as ElementType
  return (
    <Comp className={`${variants[variant]} ${className}`} {...rest}>
      {children}
    </Comp>
  )
}
