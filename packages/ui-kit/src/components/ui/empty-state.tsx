'use client'

import * as React from 'react'
import { Inbox, type LucideIcon } from '../../icons.js'
import { Button } from './button.js'
import { cn } from '../../lib/utils.js'

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Primary message — required */
  title: string
  /** Supporting text below title */
  description?: string
  /** Any Lucide icon component. Defaults to `Inbox`. */
  icon?: LucideIcon
  /** Renders a single CTA button */
  action?: { label: string; onClick: () => void }
  /** `'md'` — vertical centered (default). `'sm'` — horizontal compact. */
  size?: 'md' | 'sm'
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  size = 'md',
  className,
  ...props
}: EmptyStateProps) {
  if (size === 'sm') {
    return (
      <div
        className={cn('flex items-center gap-2.5 p-4', className)}
        {...props}
      >
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-3" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {action && (
          <Button
            variant="outline"
            size="xs"
            onClick={action.onClick}
            className="shrink-0"
          >
            {action.label}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-4 py-8 text-center',
        className,
      )}
      {...props}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-5" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
      )}
      {action && (
        <Button
          variant="outline"
          size="sm"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
