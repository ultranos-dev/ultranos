'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { colors, typography, shadows, borderRadius } from '../tokens.js'
import type { SupportedLocale } from '../direction.js'

export interface LanguageSelectorProps {
  currentLocale: SupportedLocale
  onLocaleChange: (locale: SupportedLocale) => void
}

interface LanguageOption {
  code: SupportedLocale
  label: string
  nativeLabel: string
}

const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية' },
  { code: 'prs', label: 'Dari', nativeLabel: 'دری' },
]

/**
 * Globe icon as inline SVG to avoid external icon library dependency.
 */
function GlobeIcon(): ReactNode {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

export function LanguageSelector({ currentLocale, onLocaleChange }: LanguageSelectorProps) {
  const [open, setOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(-1)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLDivElement | null)[]>([])

  const currentIndex = LANGUAGES.findIndex((l) => l.code === currentLocale)

  const closeDropdown = useCallback(() => {
    setOpen(false)
    setFocusIndex(-1)
    buttonRef.current?.focus()
  }, [])

  // Click outside to close
  useEffect(() => {
    if (!open) return

    function handleMouseDown(e: MouseEvent) {
      if (
        listRef.current &&
        !listRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setFocusIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  // Focus the current locale option when dropdown opens
  useEffect(() => {
    if (open) {
      const idx = currentIndex >= 0 ? currentIndex : 0
      setFocusIndex(idx)
      optionRefs.current[idx]?.focus()
    }
  }, [open, currentIndex])

  // Focus follows focusIndex
  useEffect(() => {
    if (open && focusIndex >= 0) {
      optionRefs.current[focusIndex]?.focus()
    }
  }, [open, focusIndex])

  function handleButtonKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen((prev) => !prev)
    }
  }

  function handleListKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeDropdown()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIndex((prev) => (prev < LANGUAGES.length - 1 ? prev + 1 : 0))
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIndex((prev) => (prev > 0 ? prev - 1 : LANGUAGES.length - 1))
      return
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (focusIndex >= 0) selectLocale(LANGUAGES[focusIndex]!.code)
    }
  }

  function selectLocale(locale: SupportedLocale) {
    if (locale !== currentLocale) {
      onLocaleChange(locale)
    }
    setOpen(false)
    setFocusIndex(-1)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Change language"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleButtonKeyDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: borderRadius.full,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          color: colors.neutral[600],
          padding: 0,
          transition: 'color 150ms ease, background-color 150ms ease',
        }}
      >
        <GlobeIcon />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Select language"
          aria-activedescendant={focusIndex >= 0 ? `lang-option-${LANGUAGES[focusIndex]!.code}` : undefined}
          onKeyDown={handleListKeyDown}
          style={{
            position: 'absolute',
            insetBlockStart: '100%',
            insetInlineEnd: '0',
            marginBlockStart: '0.5rem',
            minWidth: '160px',
            backgroundColor: colors.neutral[0],
            boxShadow: shadows.lg,
            border: `1px solid ${colors.neutral[200]}`,
            borderRadius: borderRadius.md,
            paddingBlock: '0.25rem',
            paddingInline: 0,
            zIndex: 200,
          }}
        >
          {LANGUAGES.map((lang, index) => (
            <div
              key={lang.code}
              id={`lang-option-${lang.code}`}
              ref={(el) => { optionRefs.current[index] = el }}
              role="option"
              aria-selected={lang.code === currentLocale}
              tabIndex={-1}
              onClick={() => selectLocale(lang.code)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                paddingInlineStart: '0.75rem',
                paddingInlineEnd: '0.75rem',
                paddingBlockStart: '0.5rem',
                paddingBlockEnd: '0.5rem',
                fontSize: typography.fontSize.sm,
                fontWeight:
                  lang.code === currentLocale
                    ? typography.fontWeight.semibold
                    : typography.fontWeight.normal,
                color:
                  lang.code === currentLocale
                    ? colors.primary[700]
                    : colors.neutral[700],
                backgroundColor:
                  index === focusIndex
                    ? colors.primary[100]
                    : lang.code === currentLocale
                      ? colors.primary[50]
                      : 'transparent',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <span>{lang.nativeLabel}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
