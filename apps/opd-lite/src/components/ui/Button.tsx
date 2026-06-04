import { forwardRef, type ButtonHTMLAttributes } from 'react'

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'warning'
  | 'ghost'
  | 'outline'
  | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  fullWidth?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-pill-green text-pill-text',
  secondary: 'bg-secondary text-secondary-foreground',
  danger: 'bg-destructive text-white',
  warning: 'bg-warning/20 text-foreground border border-warning/50',
  ghost: 'bg-transparent text-primary',
  outline: 'border border-border bg-background text-foreground',
  icon: 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
}

const baseText =
  'inline-flex items-center justify-center rounded-pill ' +
  'px-5 py-2 text-sm font-semibold ' +
  'transition-all duration-100 ease-out ' +
  'hover:brightness-[1.04] active:brightness-[0.88] ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'disabled:hover:brightness-100 ' +
  'motion-reduce:hover:brightness-100 motion-reduce:active:brightness-100'

const baseIcon =
  'inline-flex items-center justify-center rounded-full ' +
  'p-2 ' +
  'transition-all duration-100 ease-out ' +
  'active:brightness-[0.88] ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed ' +
  'motion-reduce:active:brightness-100'

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
    const base = variant === 'icon' ? baseIcon : baseText

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
