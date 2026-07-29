'use client'

import * as React from 'react'
import { Search } from '../../icons.js'
import { cn } from '../../lib/utils.js'
import { Input } from './input.js'
import { Button } from './button.js'

export interface SearchInputProps
  extends Omit<React.ComponentProps<'input'>, 'className'> {
  /**
   * Called when the trailing magnifier button is clicked or the Enter key is
   * pressed. Optional — when omitted, clicking the button focuses the field so
   * the control is never inert (useful for live-filtering search bars).
   */
  onSearch?: () => void
  /** Wrapper className — put layout classes here (e.g. `min-w-[200px] flex-1`). The input fills the wrapper width. */
  className?: string
  /** Extra classes for the inner input element. */
  inputClassName?: string
  /** Accessible label for the magnifier button. Falls back to `aria-label`, then `placeholder`, then "Search". */
  searchLabel?: string
}

/**
 * Search field with a trailing circular magnifier button (inline-end, RTL-safe).
 * Built from the shared ui-kit `Input` + `Button` so it matches the design system.
 */
function SearchInput({
  className,
  inputClassName,
  onSearch,
  searchLabel,
  onKeyDown,
  type = 'text',
  ...props
}: SearchInputProps) {
  const label =
    searchLabel ??
    (typeof props['aria-label'] === 'string' ? (props['aria-label'] as string) : undefined) ??
    (typeof props.placeholder === 'string' ? props.placeholder : undefined) ??
    'Search'

  return (
    <div className={cn('relative flex items-center', className)}>
      <Input
        type={type}
        // pe-11 reserves room for the trailing button so text never runs under it
        className={cn('w-full pe-11', inputClassName)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSearch) {
            e.preventDefault()
            onSearch()
          }
          onKeyDown?.(e)
        }}
        {...props}
      />
      <Button
        type="button"
        variant="default"
        size="icon-sm"
        aria-label={label}
        className="absolute end-1.5 top-1/2 -translate-y-1/2"
        onClick={(e) => {
          if (onSearch) {
            onSearch()
          } else {
            // No handler: focus the field so the button is still meaningful.
            e.currentTarget.parentElement?.querySelector('input')?.focus()
          }
        }}
      >
        <Search className="size-4" />
      </Button>
    </div>
  )
}

export { SearchInput }
