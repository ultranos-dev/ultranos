import type { LucideIcon } from '@ultranos/ui-kit/icons'
import {
  LayoutGrid,
  Scan,
  FileText,
  List,
  Clock,
  Package,
  PackageCheck,
  BookOpen,
  UserPlus,
  ClipboardCheck,
  Share2,
  Receipt,
  Banknote,
  Users,
  ShieldAlert,
  AlertTriangle,
  BarChart3,
  RefreshCw,
  Settings,
} from '@ultranos/ui-kit/icons'

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
   * Values: 'pending' | 'failed'
   */
  badgeKey?: 'pending' | 'failed'
}

export interface NavGroup {
  /** Displayed as the sidebar group label. English, not i18n. */
  title: string
  icon: LucideIcon
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    title: 'Dispensing',
    icon: LayoutGrid,
    items: [
      { titleKey: 'dashboard', url: '/',         icon: LayoutGrid },
      { titleKey: 'scanRx',   url: '/scan',      icon: Scan },
      { titleKey: 'paperRx',  url: '/paper-rx',  icon: FileText },
      { titleKey: 'queue',    url: '/queue',     icon: List,     badgeKey: 'pending' },
      { titleKey: 'history',  url: '/history',   icon: Clock },
    ],
  },
  {
    title: 'Inventory',
    icon: Package,
    items: [
      { titleKey: 'stockOverview', url: '/inventory',           icon: Package },
      { titleKey: 'receiveStock',  url: '/inventory/receive',   icon: PackageCheck },
      { titleKey: 'catalog',       url: '/inventory/catalog',   icon: BookOpen },
      { titleKey: 'suppliers',     url: '/inventory/suppliers', icon: UserPlus },
      { titleKey: 'stockCount',    url: '/inventory/count',     icon: ClipboardCheck },
      { titleKey: 'transfers',     url: '/inventory/transfers', icon: Share2 },
    ],
  },
  {
    title: 'Financial',
    icon: Receipt,
    items: [
      { titleKey: 'pos',             url: '/pos',             icon: Receipt },
      { titleKey: 'cashDrawer',      url: '/pos/cash-drawer', icon: Banknote },
      { titleKey: 'patientAccounts', url: '/pos/accounts',    icon: Users },
    ],
  },
  {
    title: 'Clinical',
    icon: ShieldAlert,
    items: [
      { titleKey: 'controlled', url: '/controlled', icon: ShieldAlert },
      { titleKey: 'unverified', url: '/unverified', icon: AlertTriangle },
    ],
  },
  {
    title: 'System',
    icon: Settings,
    items: [
      { titleKey: 'reports',   url: '/reports',  icon: BarChart3 },
      { titleKey: 'syncQueue', url: '/sync',     icon: RefreshCw, badgeKey: 'failed' },
      { titleKey: 'settings',  url: '/settings', icon: Settings },
    ],
  },
]
