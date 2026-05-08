'use client'

import { useState, useEffect, useRef, useCallback, useId, type ReactNode } from 'react'
import { colors, typography, shadows, borderRadius } from './tokens.js'

export interface NavItem {
  label: string
  href: string
  icon?: ReactNode
  active?: boolean
}

export interface AppShellUser {
  name: string
  email: string
  role: string
  initials: string
}

export interface AppShellProps {
  appName: string
  navItems?: NavItem[]
  user?: AppShellUser | null
  onSignOut?: () => void
  syncIndicator?: ReactNode
  notificationBell?: ReactNode
  children: ReactNode
}

export function AppShell({
  appName,
  navItems = [],
  user,
  onSignOut,
  syncIndicator,
  notificationBell,
  children,
}: AppShellProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const avatarRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const firstMenuItemRef = useRef<HTMLAnchorElement>(null)
  const instanceId = useId().replace(/:/g, '')

  const closeDropdown = useCallback(() => {
    setDropdownOpen(false)
    avatarRef.current?.focus()
  }, [])

  // Click outside to close dropdown
  useEffect(() => {
    if (!dropdownOpen) return

    function handleMouseDown(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        avatarRef.current &&
        !avatarRef.current.contains(e.target as Node)
      ) {
        closeDropdown()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [dropdownOpen, closeDropdown])

  // Focus first menu item when dropdown opens
  useEffect(() => {
    if (dropdownOpen) {
      firstMenuItemRef.current?.focus()
    }
  }, [dropdownOpen])

  function handleAvatarKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setDropdownOpen((prev) => !prev)
    } else if (e.key === 'Escape' && dropdownOpen) {
      e.preventDefault()
      closeDropdown()
    }
  }

  function handleDropdownKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeDropdown()
      return
    }

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const items = dropdownRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
      if (!items?.length) return
      const currentIndex = Array.from(items).indexOf(e.target as HTMLElement)
      let nextIndex: number
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1
      }
      items[nextIndex]?.focus()
      return
    }

    if (e.key === 'Tab') {
      // Close dropdown and let focus advance naturally
      setDropdownOpen(false)
    }
  }

  const hamburgerClass = `appshell-hamburger-${instanceId}`
  const navLinksClass = `appshell-nav-links-${instanceId}`
  const navLinksOpenClass = `appshell-nav-links-open-${instanceId}`

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav
        role="navigation"
        aria-label="Main navigation"
        style={{
          height: '56px',
          backgroundColor: colors.neutral[0],
          borderBlockEnd: `1px solid ${colors.neutral[200]}`,
          display: 'flex',
          alignItems: 'center',
          paddingInlineStart: '1rem',
          paddingInlineEnd: '1rem',
          fontFamily: typography.fontFamily.sans,
          position: 'relative',
          zIndex: 100,
        }}
      >
        {/* App name */}
        <span
          style={{
            fontWeight: typography.fontWeight.bold,
            color: colors.primary[700],
            fontSize: typography.fontSize.lg,
            whiteSpace: 'nowrap',
          }}
        >
          {appName}
        </span>

        {/* Hamburger (visible at narrow widths via CSS) */}
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen((prev) => !prev)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            marginInlineStart: 'auto',
            marginInlineEnd: '0.5rem',
            padding: '0.25rem',
            fontSize: '1.5rem',
            lineHeight: 1,
            color: colors.neutral[600],
          }}
          className={hamburgerClass}
        >
          &#9776;
        </button>

        {/* Nav links */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            marginInlineStart: '2rem',
            flex: 1,
          }}
          className={`${navLinksClass} ${mobileNavOpen ? navLinksOpenClass : ''}`}
        >
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              onClick={() => setMobileNavOpen(false)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                paddingInlineStart: '0.75rem',
                paddingInlineEnd: '0.75rem',
                paddingBlockStart: '0.5rem',
                paddingBlockEnd: '0.5rem',
                fontWeight: typography.fontWeight.medium,
                fontSize: typography.fontSize.sm,
                color: item.active ? colors.primary[600] : colors.neutral[600],
                textDecoration: 'none',
                borderBlockEnd: item.active ? `2px solid ${colors.primary[600]}` : '2px solid transparent',
                transition: 'color 150ms ease, border-color 150ms ease',
              }}
            >
              {item.icon}
              {item.label}
            </a>
          ))}
        </div>

        {/* Right section: slots + user */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginInlineStart: 'auto',
          }}
        >
          {syncIndicator}
          {notificationBell}

          {user && (
            <div style={{ position: 'relative' }}>
              <button
                ref={avatarRef}
                type="button"
                aria-label={`User menu for ${user.name}`}
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
                onClick={() => setDropdownOpen((prev) => !prev)}
                onKeyDown={handleAvatarKeyDown}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: borderRadius.full,
                  backgroundColor: colors.primary[100],
                  color: colors.primary[700],
                  fontWeight: typography.fontWeight.semibold,
                  fontSize: typography.fontSize.sm,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                {user.initials}
              </button>

              {dropdownOpen && (
                <div
                  ref={dropdownRef}
                  role="menu"
                  onKeyDown={handleDropdownKeyDown}
                  style={{
                    position: 'absolute',
                    insetBlockStart: '100%',
                    insetInlineEnd: '0',
                    marginBlockStart: '0.5rem',
                    minWidth: '200px',
                    backgroundColor: colors.neutral[0],
                    boxShadow: shadows.lg,
                    border: `1px solid ${colors.neutral[200]}`,
                    borderRadius: borderRadius.md,
                    paddingBlock: '0.5rem',
                    paddingInline: 0,
                    zIndex: 200,
                  }}
                >
                  {/* User info */}
                  <div
                    role="presentation"
                    style={{
                      paddingInlineStart: '1rem',
                      paddingInlineEnd: '1rem',
                      paddingBlockEnd: '0.5rem',
                      borderBlockEnd: `1px solid ${colors.neutral[200]}`,
                      marginBlockEnd: '0.25rem',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: typography.fontWeight.bold,
                        fontSize: typography.fontSize.sm,
                        color: colors.neutral[800],
                      }}
                    >
                      {user.name}
                    </div>
                    <span
                      style={{
                        display: 'inline-block',
                        marginBlockStart: '0.25rem',
                        paddingInlineStart: '0.5rem',
                        paddingInlineEnd: '0.5rem',
                        paddingBlockStart: '0.125rem',
                        paddingBlockEnd: '0.125rem',
                        backgroundColor: colors.primary[50],
                        color: colors.primary[700],
                        fontSize: '0.75rem',
                        borderRadius: borderRadius.full,
                        fontWeight: typography.fontWeight.medium,
                      }}
                    >
                      {user.role}
                    </span>
                  </div>

                  {/* Menu items */}
                  <a
                    ref={firstMenuItemRef}
                    role="menuitem"
                    href="#settings"
                    tabIndex={-1}
                    style={{
                      display: 'block',
                      paddingInlineStart: '1rem',
                      paddingInlineEnd: '1rem',
                      paddingBlockStart: '0.5rem',
                      paddingBlockEnd: '0.5rem',
                      fontSize: typography.fontSize.sm,
                      color: colors.neutral[700],
                      textDecoration: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Settings
                  </a>
                  {onSignOut && (
                    <button
                      role="menuitem"
                      tabIndex={-1}
                      onClick={() => {
                        onSignOut()
                        closeDropdown()
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'start',
                        paddingInlineStart: '1rem',
                        paddingInlineEnd: '1rem',
                        paddingBlockStart: '0.5rem',
                        paddingBlockEnd: '0.5rem',
                        fontSize: typography.fontSize.sm,
                        color: colors.neutral[700],
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Sign Out
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Responsive styles injected as a style tag */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media (min-width: 641px) {
              .${hamburgerClass} { display: none !important; }
            }
            @media (max-width: 640px) {
              .${navLinksClass} {
                display: none !important;
                position: absolute;
                inset-block-start: 56px;
                inset-inline-start: 0;
                inset-inline-end: 0;
                flex-direction: column;
                background: ${colors.neutral[0]};
                border-block-end: 1px solid ${colors.neutral[200]};
                padding-block: 0.5rem;
                padding-inline: 0.5rem;
                z-index: 99;
              }
              .${navLinksOpenClass} {
                display: flex !important;
              }
            }
          `,
        }}
      />

      {/* Main content */}
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}
