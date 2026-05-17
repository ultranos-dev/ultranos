'use client'

import { colors, typography, spacing, borderRadius } from './tokens.js'

export interface EntitlementGateProps {
  moduleCode: string
  moduleName: string
  status: 'active' | 'trial' | 'inactive' | 'checking' | null
  onSignOut: () => void
  adminEmail?: string
  children: React.ReactNode
}

const SPIN_KEYFRAMES_ID = 'entitlement-spin-keyframes'

function ensureSpinKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById(SPIN_KEYFRAMES_ID)) return
  const style = document.createElement('style')
  style.id = SPIN_KEYFRAMES_ID
  style.textContent = '@keyframes entitlement-spin { to { transform: rotate(360deg); } }'
  document.head.appendChild(style)
}

/**
 * Soft entitlement gate — renders a blocking "not subscribed" page when
 * the user's organization lacks an active subscription for this module.
 *
 * This is a UX gate, not a security boundary. The API-level hard gate
 * (Story 27.3) is the authoritative security check.
 *
 * Each spoke app should create its own `useEntitlementCheck` hook that:
 *   1. Calls the `entitlement.check` tRPC endpoint on mount
 *   2. Sets `entitlementStatus` in the auth session store
 *   3. Re-checks on session refresh
 *   4. Fails open on network error (sets status to 'active')
 */
export function EntitlementGate({
  moduleName,
  status,
  onSignOut,
  adminEmail,
  children,
}: EntitlementGateProps) {
  if (status === 'active' || status === 'trial') {
    return <>{children}</>
  }

  if (status === 'checking' || status === null) {
    ensureSpinKeyframes()
    return (
      <div role="status" style={loadingContainerStyle}>
        <div style={spinnerStyle} />
      </div>
    )
  }

  // status === 'inactive'
  return (
    <div style={gateContainerStyle}>
      <div style={gateCardStyle}>
        <div style={iconContainerStyle}>
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.neutral[400]}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h1 style={titleStyle}>{moduleName}</h1>

        <p style={messageStyle}>
          Your organization has not subscribed to {moduleName}. Please contact
          your administrator.
        </p>

        {adminEmail && (
          <p style={contactStyle}>
            Contact:{' '}
            <a href={`mailto:${adminEmail}`} style={linkStyle}>
              {adminEmail}
            </a>
          </p>
        )}

        <button type="button" onClick={onSignOut} style={signOutButtonStyle}>
          Sign Out
        </button>
      </div>
    </div>
  )
}

const loadingContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  backgroundColor: colors.neutral[50],
}

const spinnerStyle: React.CSSProperties = {
  width: '2.5rem',
  height: '2.5rem',
  borderRadius: borderRadius.full,
  border: `3px solid ${colors.neutral[200]}`,
  borderTopColor: colors.primary[500],
  animation: 'entitlement-spin 0.8s linear infinite',
}

const gateContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: spacing[8],
  backgroundColor: colors.neutral[50],
  textAlign: 'center' as const,
}

const gateCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  maxWidth: '28rem',
  width: '100%',
  padding: spacing[8],
  backgroundColor: colors.neutral[0],
  borderRadius: borderRadius.xl,
  boxShadow: '0 4px 6px hsl(0 0% 0% / 0.07)',
}

const iconContainerStyle: React.CSSProperties = {
  marginBlockEnd: spacing[4],
}

const titleStyle: React.CSSProperties = {
  fontSize: typography.fontSize.xl,
  fontWeight: typography.fontWeight.bold,
  color: colors.neutral[900],
  marginBlockEnd: spacing[2],
}

const messageStyle: React.CSSProperties = {
  fontSize: typography.fontSize.base,
  lineHeight: typography.lineHeight.relaxed,
  color: colors.neutral[600],
  marginBlockEnd: spacing[6],
}

const contactStyle: React.CSSProperties = {
  fontSize: typography.fontSize.sm,
  color: colors.neutral[500],
  marginBlockEnd: spacing[6],
}

const linkStyle: React.CSSProperties = {
  color: colors.primary[600],
  textDecoration: 'underline',
}

const signOutButtonStyle: React.CSSProperties = {
  paddingBlock: spacing[2],
  paddingInline: spacing[6],
  fontSize: typography.fontSize.sm,
  fontWeight: typography.fontWeight.semibold,
  color: colors.neutral[600],
  backgroundColor: 'transparent',
  border: `1px solid ${colors.neutral[300]}`,
  borderRadius: borderRadius.md,
  cursor: 'pointer',
}
