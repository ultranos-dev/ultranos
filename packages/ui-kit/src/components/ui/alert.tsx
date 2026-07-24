'use client'

import * as React from 'react'
import { cn } from '../../lib/utils.js'

type AlertVariant = 'info' | 'warning' | 'destructive' | 'success'

const VARIANT: Record<AlertVariant, string> = {
  info:        'border-primary/20 bg-primary/10 text-primary',
  warning:     'border-warning/30 bg-warning/10 text-warning',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
  success:     'border-success/20 bg-success/10 text-success',
}

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: AlertVariant
  title?: React.ReactNode
  icon?: React.ReactNode
}

export function Alert({
  variant = 'info',
  title,
  icon,
  children,
  className,
  role = 'status',
  ...rest
}: AlertProps) {
  return (
    <div
      role={role}
      className={cn('rounded-xl border px-4 py-3 text-sm', VARIANT[variant], className)}
      {...rest}
    >
      <div className="flex items-start gap-2">
        {icon ? <span className="mt-0.5 shrink-0" aria-hidden={true}>{icon}</span> : null}
        <div className="min-w-0 flex-1">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
        </div>
      </div>
    </div>
  )
}
