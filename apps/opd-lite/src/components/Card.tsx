import type { ElementType, ComponentPropsWithoutRef } from 'react'

const variants = {
  primary:
    'rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50',
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
  const Comp = as || 'div'
  return (
    <Comp className={`${variants[variant]} ${className}`} {...rest}>
      {children}
    </Comp>
  )
}
