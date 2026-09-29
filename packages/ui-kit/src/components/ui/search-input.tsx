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
  /**
   * Accessible label for the trailing magnifier button. Defaults to "Search".
   * The button's name is intentionally kept INDEPENDENT of the input's own
   * `aria-label`/`placeholder` so the two controls never share an accessible
   * name (a duplicate-name a11y issue, and it makes `getByLabelText` ambiguous).
   * Pass a localized string here when you want the button labelled per-locale.
   */
  searchLabel?: string
}

/**
 * First strong directional character of `value` → its writing direction. Used to
 * flip the WRAPPER (and thus the trailing magnifier button) to match RTL content
 * typed into an otherwise-LTR app: without this, an Arabic/Pashto/Dari name is
 * right-aligned by the input's own bidi while the button stays on the right, so
 * the text renders *behind* the button. Returns undefined for neutral/empty input
 * (the wrapper then inherits the document direction).
 */
function resolveContentDir(value: unknown): 'rtl' | 'ltr' | undefined {
  if (typeof value !== 'string') return undefined
  for (const ch of value) {
    const c = ch.codePointAt(0)
    if (c === undefined) continue
    // Hebrew, Arabic, Syriac, Thaana, NKo + Arabic presentation forms → RTL.
    if ((c >= 0x0590 && c <= 0x08ff) || (c >= 0xfb1d && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff)) return 'rtl'
    // Latin letters (Basic + Latin-1 Supplement + Extended-A/B) → LTR.
    if ((c >= 0x0041 && c <= 0x005a) || (c >= 0x0061 && c <= 0x007a) || (c >= 0x00c0 && c <= 0x024f)) return 'ltr'
  }
  return undefined
}

/**
 * Search field with a trailing circular magnifier button (inline-end, RTL-safe).
 * Built from the shared ui-kit `Input` + `Button` so it matches the design system.
 * The wrapper's direction follows the typed content so the button and the text are
 * always on opposite ends — text is never hidden behind the button, in any locale.
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
  // Button label is decoupled from the input's aria-label/placeholder so the
  // input and its magnifier button never expose the same accessible name.
  const label = searchLabel ?? 'Search'
  const contentDir = resolveContentDir(props.value)

  return (
    <div dir={contentDir} className={cn('relative flex items-center', className)}>
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
        size="icon-xs"
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
        <Search className="size-3" />
      </Button>
    </div>
  )
}

export { SearchInput }
