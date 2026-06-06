import type { LucideIcon } from '@ultranos/ui-kit/icons'
import {
  Home,
  Calendar,
  Users,
  Bell,
  AlertTriangle,
  UserSearch,
  FileWarning,
  Shield,
  Settings,
} from '@ultranos/ui-kit/icons'

export type NavBadgeKey =
  | 'todayAppointments'
  | 'notifications'
  | 'conflicts'
  | 'duplicateReviews'
  | 'expiringConsents'

export interface NavChildItem {
  titleKey: string
  url: string
  badgeKey?: NavBadgeKey
}

export interface NavItem {
  /**
   * Translation key within the 'sidebar' namespace.
   * Resolved via useTranslations('sidebar')(titleKey) at render time.
   */
  titleKey: string
  url: string
  icon: LucideIcon
  /**
   * If set, renders a numeric badge driven by the matching key in the `badges` prop.
   */
  badgeKey?: NavBadgeKey
  /**
   * Explicit sub-items rendered inside a collapsible. An auto "Overview" link
   * pointing to `url` is always prepended when children are present.
   */
  children?: NavChildItem[]
}

export interface NavGroup {
  /** Displayed as the sidebar group label. Empty string for unlabelled singleton groups. */
  title: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    title: '',
    items: [
      { titleKey: 'dashboard', url: '/', icon: Home },
    ],
  },
  {
    title: 'Core',
    items: [
      { titleKey: 'appointments', url: '/appointments', icon: Calendar, badgeKey: 'todayAppointments' },
      {
        titleKey: 'patients',
        url: '/patients',
        icon: Users,
        children: [
          { titleKey: 'registerPatient', url: '/register-patient' },
        ],
      },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { titleKey: 'notifications', url: '/notifications', icon: Bell, badgeKey: 'notifications' },
      { titleKey: 'conflicts', url: '/conflicts', icon: AlertTriangle, badgeKey: 'conflicts' },
      { titleKey: 'duplicateReviews', url: '/duplicate-review', icon: UserSearch, badgeKey: 'duplicateReviews' },
      { titleKey: 'expiringConsents', url: '/expiring-consents', icon: FileWarning, badgeKey: 'expiringConsents' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { titleKey: 'kyc', url: '/kyc', icon: Shield },
    ],
  },
  {
    title: 'System',
    items: [
      { titleKey: 'settings', url: '/settings', icon: Settings },
    ],
  },
]
