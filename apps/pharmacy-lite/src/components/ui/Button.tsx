import { forwardRef, type ButtonHTMLAttributes } from 'react'

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'warning'
  | 'ghost'
  | 'outline'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  fullWidth?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-pill-green text-pill-text',
  secondary: 'bg-neutral-200 text-neutral-700',
  danger: 'bg-red-600 text-white',
  warning: 'bg-amber-600 text-white',
  ghost: 'bg-transparent text-primary-500',
  outline: 'border border-neutral-300 bg-white text-neutral-700',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      fullWidth,
      className = '',
      children,
      ...props
    },
    ref,
  ) => {
    const base =
      'inline-flex items-center justify-center rounded-pill ' +
      'px-5 py-2 text-sm font-semibold ' +
      'transition-[transform,filter,background-color] duration-100 ease-[cubic-bezier(0.23,1,0.32,1)] ' +
      'hover:brightness-[1.04] active:brightness-[0.88] ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 ' +
      'disabled:opacity-50 disabled:cursor-not-allowed ' +
      'disabled:hover:brightness-100 ' +
      'motion-reduce:transition-none'

    const classes = [
      base,
      variantClasses[variant],
      fullWidth && 'w-full',
      className,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
