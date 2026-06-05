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
  primary:   'rounded-pill bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80',
  danger:    'rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90',
  warning:   'rounded-md bg-warning/20 text-foreground border border-warning/50 hover:bg-warning/30',
  ghost:     'rounded-md bg-transparent text-primary hover:bg-muted',
  outline:   'rounded-md border border-border bg-background text-foreground hover:bg-muted',
  icon:      'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
}

const baseText =
  'inline-flex items-center justify-center ' +
  'px-4 py-2 text-sm font-medium ' +
  'transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

const baseIcon =
  'inline-flex items-center justify-center rounded-full ' +
  'p-2 ' +
  'transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

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
