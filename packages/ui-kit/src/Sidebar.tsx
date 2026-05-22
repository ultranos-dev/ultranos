'use client'

import { useState, useCallback, type ReactNode } from 'react'
import { colors, typography, shadows, borderRadius, spacing, transitions } from './tokens.js'
import { DirectionalIcon } from './components/DirectionalIcon.js'

export interface SidebarNavItem {
  label: string
  href: string
  icon?: ReactNode
  active?: boolean
  badge?: number | null
  group?: string
}

export interface SidebarUser {
  name: string
  email?: string
  role: string
  initials: string
}

export interface SidebarProps {
  appName: string
  navItems?: SidebarNavItem[]
  user?: SidebarUser | null
  onSignOut?: () => void
  syncIndicator?: ReactNode
  languageSelector?: ReactNode
  children: ReactNode
  defaultCollapsed?: boolean
  persistKey?: string
}

const SIDEBAR_WIDTH_EXPANDED = '240px'
const SIDEBAR_WIDTH_COLLAPSED = '64px'

function getInitialCollapsed(persistKey?: string, defaultCollapsed?: boolean): boolean {
  if (typeof window === 'undefined') return defaultCollapsed ?? false
  if (!persistKey) return defaultCollapsed ?? false
  try {
    const stored = localStorage.getItem(persistKey)
    if (stored !== null) return stored === 'true'
  } catch {
    // localStorage unavailable
  }
  return defaultCollapsed ?? false
}

export function Sidebar({
  appName,
  navItems = [],
  user,
  onSignOut,
  syncIndicator,
  languageSelector,
  children,
  defaultCollapsed = false,
  persistKey,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() => getInitialCollapsed(persistKey, defaultCollapsed))

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      if (persistKey) {
        try {
          localStorage.setItem(persistKey, String(next))
        } catch {
          // localStorage unavailable
        }
      }
      return next
    })
  }, [persistKey])

  const sidebarWidth = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED

  // Group nav items and insert dividers
  const groupedItems: { item: SidebarNavItem; showDivider: boolean }[] = []
  let lastGroup: string | undefined
  for (const item of navItems) {
    const showDivider = lastGroup !== undefined && item.group !== lastGroup
    groupedItems.push({ item, showDivider })
    lastGroup = item.group
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <nav
        role="navigation"
        aria-label="Main navigation"
        style={{
          width: sidebarWidth,
          minWidth: sidebarWidth,
          backgroundColor: colors.neutral[900],
          color: colors.neutral[0],
          display: 'flex',
          flexDirection: 'column',
          fontFamily: typography.fontFamily.sans,
          transition: `width ${transitions.normal}, min-width ${transitions.normal}`,
          overflow: 'hidden',
          position: 'sticky',
          insetBlockStart: 0,
          height: '100vh',
          zIndex: 100,
        }}
      >
        {/* Header: App name + collapse toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            paddingInline: spacing[3],
            paddingBlock: spacing[4],
            borderBlockEnd: `1px solid ${colors.neutral[700]}`,
          }}
        >
          {!collapsed && (
            <span
              style={{
                fontWeight: typography.fontWeight.bold,
                fontSize: typography.fontSize.md,
                color: colors.primary[300],
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {appName}
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapse}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleCollapse()
              }
            }}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: colors.neutral[400],
              padding: spacing[1],
              borderRadius: borderRadius.sm,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <DirectionalIcon category="navigation">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: collapsed ? 'rotate(180deg)' : undefined,
                  transition: `transform ${transitions.fast}`,
                }}
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </DirectionalIcon>
          </button>
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBlock: spacing[2] }}>
          {groupedItems.map(({ item, showDivider }) => (
            <div key={item.href}>
              {showDivider && (
                <div
                  data-testid="group-divider"
                  style={{
                    height: '1px',
                    backgroundColor: colors.neutral[700],
                    marginBlock: spacing[2],
                    marginInline: spacing[3],
                  }}
                />
              )}
              <a
                href={item.href}
                aria-current={item.active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing[3],
                  paddingInline: spacing[3],
                  paddingBlock: spacing[2],
                  marginInline: spacing[2],
                  borderRadius: borderRadius.md,
                  color: item.active ? colors.primary[300] : colors.neutral[300],
                  backgroundColor: item.active ? colors.primary[900] : 'transparent',
                  textDecoration: 'none',
                  fontSize: typography.fontSize.sm,
                  fontWeight: item.active ? typography.fontWeight.semibold : typography.fontWeight.medium,
                  whiteSpace: 'nowrap',
                  transition: `background-color ${transitions.fast}, color ${transitions.fast}`,
                  position: 'relative',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', flexShrink: 0 }}>
                  {item.icon}
                </span>
                {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                {item.badge != null && item.badge > 0 && (
                  <span
                    style={{
                      backgroundColor: colors.danger,
                      color: colors.neutral[0],
                      fontSize: '0.625rem',
                      fontWeight: typography.fontWeight.bold,
                      lineHeight: 1,
                      paddingInline: collapsed ? '0.25rem' : '0.375rem',
                      paddingBlock: '0.125rem',
                      borderRadius: borderRadius.full,
                      minWidth: '18px',
                      textAlign: 'center',
                      position: collapsed ? 'absolute' : 'static',
                      insetBlockStart: collapsed ? '2px' : undefined,
                      insetInlineEnd: collapsed ? '4px' : undefined,
                    }}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </a>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ borderBlockStart: `1px solid ${colors.neutral[700]}`, paddingBlock: spacing[3], paddingInline: spacing[3] }}>
          {syncIndicator && (
            <div style={{ marginBlockEnd: spacing[2], display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start' }}>
              {syncIndicator}
            </div>
          )}
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing[3], marginBlockEnd: spacing[2] }}>
              <span style={{
                width: '32px', height: '32px', borderRadius: borderRadius.full,
                backgroundColor: colors.primary[700], color: colors.primary[100],
                fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.xs,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {user.initials}
              </span>
              {!collapsed && (
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <div style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium, color: colors.neutral[100], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.name}
                  </div>
                  <span style={{ fontSize: '0.625rem', color: colors.primary[400], fontWeight: typography.fontWeight.medium }}>
                    {user.role}
                  </span>
                </div>
              )}
            </div>
          )}
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
                gap: spacing[3], width: '100%', paddingBlock: spacing[2], paddingInline: spacing[2],
                backgroundColor: 'transparent', border: 'none', borderRadius: borderRadius.md,
                color: colors.neutral[400], fontSize: typography.fontSize.sm, cursor: 'pointer',
                fontFamily: 'inherit', transition: `color ${transitions.fast}`,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {!collapsed && 'Sign out'}
            </button>
          )}
          {languageSelector && (
            <div style={{ marginBlockStart: spacing[2], display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start' }}>
              {languageSelector}
            </div>
          )}
        </div>
      </nav>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}
