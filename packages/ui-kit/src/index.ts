export {
  typography,
  colors,
  spacing,
  letterSpacing,
  borderRadius,
  shadows,
  transitions,
  rtlTypography,
  arabicFontFiles,
} from './tokens.js'

export {
  consumerColors,
  consumerSpacing,
  consumerTypography,
  consumerBorderRadius,
} from './consumer-theme.js'

export { ErrorBoundary, sanitizeErrorMessage, isStorageError } from './ErrorBoundary.js'
export type { ErrorBoundaryProps } from './ErrorBoundary.js'

export { useAsyncErrorBoundary } from './useAsyncErrorBoundary.js'
export type { UseAsyncErrorBoundaryOptions } from './useAsyncErrorBoundary.js'

export { StaleDataBanner } from './StaleDataBanner.js'
export type { StaleDataBannerProps } from './StaleDataBanner.js'

export {
  useSessionManager,
  SESSION_DURATIONS,
  INACTIVITY_TIMEOUT,
  WARNING_BEFORE_MS,
} from './useSessionManager.js'
export type {
  SessionState,
  UseSessionManagerConfig,
  UseSessionManagerReturn,
} from './useSessionManager.js'

export { SessionWarningToast } from './SessionWarningToast.js'
export type { SessionWarningToastProps } from './SessionWarningToast.js'

export { ReAuthModal } from './ReAuthModal.js'
export type { ReAuthModalProps } from './ReAuthModal.js'

export { SessionManagerProvider } from './SessionManagerProvider.js'
export type { SessionManagerProviderProps } from './SessionManagerProvider.js'

export { AppShell } from './AppShell.js'
export type { AppShellProps, AppShellUser, NavItem } from './AppShell.js'

export { Sidebar } from './Sidebar.js'
export type { SidebarProps, SidebarUser, SidebarNavItem } from './Sidebar.js'

export { EntitlementGate } from './EntitlementGate.js'
export type { EntitlementGateProps } from './EntitlementGate.js'

export { getSecurityHeaders } from './security-headers.js'
export type { SecurityHeadersConfig } from './security-headers.js'

export { getDirection } from './direction.js'
export type { SupportedLocale, Direction } from './direction.js'

export { DirectionalIcon, DIRECTIONAL_ICON_CSS } from './components/DirectionalIcon.js'
export type { DirectionalIconProps, IconCategory } from './components/DirectionalIcon.js'

export { PasswordStrengthBar, getPasswordStrength } from './components/PasswordStrengthBar.js'
export type { PasswordStrengthBarProps } from './components/PasswordStrengthBar.js'

export { EmptyState } from './components/ui/empty-state.js'
export type { EmptyStateProps } from './components/ui/empty-state.js'

export {
  formatNumber,
  formatInteger,
  formatDecimal,
  formatPercent,
  formatDate,
  formatDateTime,
  formatDateShort,
  formatTime,
  formatRelativeTime,
  getArabicPluralCategory,
  getDariPluralCategory,
  getPluralCategory,
} from './utils/format.js'
export type {
  ArabicPluralCategory,
  DariPluralCategory,
} from './utils/format.js'

// ─── Icons (Lucide) ─────────────────────────────────────────────────
// Consumers: prefer importing from '@ultranos/ui-kit/icons' for better tree-shaking.
export * from './icons.js'
