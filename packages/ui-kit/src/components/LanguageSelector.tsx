'use client'

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { colors, typography, shadows, borderRadius } from '../tokens.js'
import { getDirection } from '../direction.js'
import type { SupportedLocale } from '../direction.js'

/** Returns the font-family string appropriate for a locale's native label. */
function nativeLabelFont(locale: SupportedLocale): string {
  return getDirection(locale) === 'rtl'
    ? typography.fontFamily['sans-ar']
    : 'inherit'
}

export interface LanguageSelectorProps {
  currentLocale: SupportedLocale
  onLocaleChange: (locale: SupportedLocale) => void
  collapsed?: boolean
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
  { code: 'ps', label: 'Pashto', nativeLabel: 'پښتو' },
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

export function LanguageSelector({ currentLocale, onLocaleChange, collapsed = false }: LanguageSelectorProps) {
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
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: '0.75rem',
          width: '100%',
          paddingBlock: '0.5rem',
          paddingInline: '0.5rem',
          borderRadius: borderRadius.md,
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          color: colors.neutral[400],
          fontSize: typography.fontSize.sm,
          fontFamily: 'inherit',
          transition: 'color 150ms ease, background-color 150ms ease',
        }}
      >
        <GlobeIcon />
        {!collapsed && (
          <span lang={currentLocale} style={{ fontFamily: nativeLabelFont(currentLocale) }}>
            {LANGUAGES.find((l) => l.code === currentLocale)?.nativeLabel}
          </span>
        )}
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
            insetBlockEnd: '100%',
            insetInlineStart: '0',
            marginBlockEnd: '0.5rem',
            minWidth: '160px',
            backgroundColor: colors.neutral[800],
            boxShadow: shadows.lg,
            border: `1px solid ${colors.neutral[700]}`,
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
              lang={lang.code}
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
                fontFamily: nativeLabelFont(lang.code),
                fontWeight:
                  lang.code === currentLocale
                    ? typography.fontWeight.semibold
                    : typography.fontWeight.normal,
                color:
                  lang.code === currentLocale
                    ? colors.primary[300]
                    : colors.neutral[300],
                backgroundColor:
                  index === focusIndex
                    ? colors.primary[900]
                    : lang.code === currentLocale
                      ? colors.neutral[700]
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
