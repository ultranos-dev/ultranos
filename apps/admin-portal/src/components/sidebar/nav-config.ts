import type { LucideIcon } from 'lucide-react'
import {
  Home,
  User,
  FlaskConical,
  Package,
  Bell,
  FileText,
  Clock,
  Settings,
  Users,
  Receipt,
  Globe,
  SlidersHorizontal,
  FileCheck,
  Cpu,
  CreditCard,
  Wallet,
} from '@ultranos/ui-kit/icons'

export interface NavItem {
  title: string
  url: string
  icon?: LucideIcon
}

export interface NavGroup {
  title: string
  icon: LucideIcon
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    icon: Home,
    items: [
      { title: 'Dashboard', url: '/dashboard', icon: Home },
    ],
  },
  {
    title: 'Clinical',
    icon: User,
    items: [
      { title: 'Providers', url: '/providers', icon: User },
      { title: 'License Expiry', url: '/providers/expiry', icon: Clock },
      { title: 'Patients', url: '/patients', icon: User },
      { title: 'Merge Tool', url: '/patients/merge' },
      { title: 'Alerts', url: '/alerts', icon: Bell },
      { title: 'Alert Config', url: '/alerts/configuration', icon: SlidersHorizontal },
    ],
  },
  {
    title: 'Operations',
    icon: FlaskConical,
    items: [
      { title: 'Labs', url: '/labs', icon: FlaskConical },
      { title: 'Create Lab', url: '/labs/create' },
      { title: 'Inventory', url: '/inventory', icon: Package },
      { title: 'Suppliers', url: '/inventory/suppliers' },
      { title: 'Network', url: '/network', icon: Globe },
      { title: 'Mentorship', url: '/mentorship', icon: Users },
      { title: 'Certifications', url: '/certifications', icon: FileCheck },
    ],
  },
  {
    title: 'Administration',
    icon: Users,
    items: [
      { title: 'Users', url: '/users', icon: Users },
      { title: 'Create User', url: '/users/create' },
      { title: 'AI Models', url: '/ai-models', icon: Cpu },
      { title: 'Audit Log', url: '/audit', icon: FileText },
    ],
  },
  {
    title: 'Billing',
    icon: CreditCard,
    items: [
      { title: 'Subscriptions', url: '/subscriptions', icon: CreditCard },
      { title: 'Billing', url: '/subscriptions/billing', icon: Wallet },
      { title: 'Invoices', url: '/subscriptions/invoices', icon: Receipt },
    ],
  },
  {
    title: 'System',
    icon: Settings,
    items: [
      { title: 'Settings', url: '/settings', icon: Settings },
    ],
  },
]
