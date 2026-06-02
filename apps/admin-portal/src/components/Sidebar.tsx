'use client'

import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { SessionTimer } from '@/components/SessionTimer'
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
  Plus,
  Receipt,
  Globe,
  SlidersHorizontal,
  FileCheck,
  ChevronLeft,
  Cpu,
  CreditCard,
  Wallet,
  LogOut,
} from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: Home },
  { label: 'Providers', href: '/providers', icon: User },
  { label: 'License Expiry', href: '/providers/expiry', icon: Clock, indent: true },
  { label: 'Labs', href: '/labs', icon: FlaskConical },
  { label: 'Create Lab', href: '/labs/create', icon: Plus, indent: true },
  { label: 'Inventory', href: '/inventory', icon: Package },
  { label: 'Suppliers', href: '/inventory/suppliers', icon: Plus, indent: true },
  { label: 'Network', href: '/network', icon: Globe },
  { label: 'Mentorship', href: '/mentorship', icon: Users },
  { label: 'Certifications', href: '/certifications', icon: FileCheck },
  { label: 'Users', href: '/users', icon: Users },
  { label: 'Create User', href: '/users/create', icon: Plus, indent: true },
  { label: 'Patients', href: '/patients', icon: User },
  { label: 'Merge Tool', href: '/patients/merge', icon: Plus, indent: true },
  { label: 'AI Models', href: '/ai-models', icon: Cpu },
  { label: 'Alerts', href: '/alerts', icon: Bell },
  { label: 'Alert Config', href: '/alerts/configuration', icon: SlidersHorizontal, indent: true },
  { label: 'Audit Log', href: '/audit', icon: FileText },
  { label: 'Subscriptions', href: '/subscriptions', icon: CreditCard },
  { label: 'Billing', href: '/subscriptions/billing', icon: Wallet, indent: true },
  { label: 'Invoices', href: '/subscriptions/invoices', icon: Receipt, indent: true },
  { label: 'Settings', href: '/settings', icon: Settings },
] as const

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const session = useAuthSessionStore((s) => s.session)
  const clearSession = useAuthSessionStore((s) => s.clearSession)

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    clearSession()
    router.push('/login')
  }

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-60'} relative bg-sidebar flex flex-col shrink-0 min-h-screen transition-[width] duration-200 ease-out`}
    >
      {/* Logo */}
      <div className="p-4 border-b border-white/10">
        {collapsed ? (
          <span className="flex items-center justify-center text-lg font-bold text-accent">U</span>
        ) : (
          <h1 className="text-lg font-bold tracking-tight text-text-on-dark">
            <span className="text-accent">U</span>ltranos Admin
          </h1>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4" aria-label="Admin navigation">
        {navItems.map((item) => {
          const indent = 'indent' in item && item.indent
          const isActive = indent
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(`${item.href}/`)

          return (
            <div key={item.href} className="relative group">
              <Link
                href={item.href}
                className={`flex items-center gap-3 ${collapsed ? 'justify-center px-2' : indent ? 'px-8' : 'px-4'} py-2.5 text-sm rounded-xl mx-2 transition-colors ${
                  isActive
                    ? 'bg-white/[0.12] text-accent font-medium'
                    : 'text-white/80 hover:bg-white/[0.08] hover:text-white'
                }`}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
              {/* Tooltip when collapsed */}
              {collapsed && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 rounded-lg bg-surface-raised text-text-primary text-xs font-medium shadow-card border border-border opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50">
                  {item.label}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-4 space-y-3">
        {!collapsed && session && (
          <div className="space-y-1">
            <p className="text-xs text-white/60 truncate">{session.email}</p>
            <SessionTimer />
          </div>
        )}
        <button
          onClick={handleSignOut}
          className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2'} w-full py-2 rounded-xl text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors text-sm`}
          aria-label="Sign Out"
        >
          <LogOut size={16} className="shrink-0" />
          {!collapsed && 'Sign Out'}
        </button>
      </div>

      {/* Collapse toggle — floating on sidebar edge */}
      <button
        onClick={onToggle}
        className="absolute top-1/2 -translate-y-1/2 -right-3 z-40 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-raised text-text-secondary shadow-card hover:bg-accent-subtle hover:text-text-primary transition-colors duration-200"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <DirectionalIcon category="navigation">
          <ChevronLeft className={`h-3 w-3 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} />
        </DirectionalIcon>
      </button>
    </aside>
  )
}
