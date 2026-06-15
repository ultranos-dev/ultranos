import type { LucideIcon } from '@ultranos/ui-kit/icons'
import {
  Home,
  Scan,
  FileText,
  List,
  Clock,
  Package,
  Receipt,
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
  /**
   * Present on parent/standalone items. Absent on sub-items (items whose URL
   * starts with a sibling parent's URL). Nav-main uses the presence/absence of
   * icon to distinguish parents from sub-items.
   */
  icon?: LucideIcon
  /**
   * If set, renders a numeric badge driven by the matching key in the `badges` prop.
   * Values: 'pending' | 'failed'
   */
  badgeKey?: 'pending' | 'failed'
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
    title: 'Dispensing',
    items: [
      { titleKey: 'scanRx',  url: '/scan',     icon: Scan },
      { titleKey: 'paperRx', url: '/paper-rx', icon: FileText },
      { titleKey: 'queue',   url: '/queue',    icon: List, badgeKey: 'pending' },
      { titleKey: 'history', url: '/history',  icon: Clock },
    ],
  },
  {
    title: 'Inventory',
    items: [
      // Stock Overview is the parent — its URL prefix is /inventory
      { titleKey: 'stockOverview', url: '/inventory',           icon: Package },
      // Sub-items: no icon, URLs start with /inventory/
      { titleKey: 'receiveStock',  url: '/inventory/receive' },
      { titleKey: 'catalog',       url: '/inventory/catalog' },
      { titleKey: 'suppliers',     url: '/inventory/suppliers' },
      { titleKey: 'stockCount',    url: '/inventory/count' },
      { titleKey: 'transfers',     url: '/inventory/transfers' },
    ],
  },
  {
    title: 'Financial',
    items: [
      // POS is the parent — its URL prefix is /pos
      { titleKey: 'pos', url: '/pos', icon: Receipt },
      // Sub-items: no icon, URLs start with /pos/
      { titleKey: 'cashDrawer',      url: '/pos/cash-drawer' },
      { titleKey: 'patientAccounts', url: '/pos/accounts' },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { titleKey: 'controlled', url: '/controlled', icon: ShieldAlert },
      { titleKey: 'unverified', url: '/unverified', icon: AlertTriangle },
    ],
  },
  {
    title: 'System',
    items: [
      { titleKey: 'reports',   url: '/reports',  icon: BarChart3 },
      { titleKey: 'syncQueue', url: '/sync',     icon: RefreshCw, badgeKey: 'failed' },
      { titleKey: 'settings',  url: '/settings', icon: Settings },
    ],
  },
]
