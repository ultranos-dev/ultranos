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
} from '@ultranos/ui-kit/icons'
import { DirectionalIcon } from '@ultranos/ui-kit'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: Home },
  { label: 'Providers', href: '/providers', icon: User },
  { label: 'License Expiry', href: '/providers/expiry', icon: Clock, indent: true },
  { label: 'Labs', href: '/labs', icon: FlaskConical },
  { label: 'Inventory', href: '/inventory', icon: Package },
  { label: 'Suppliers', href: '/inventory/suppliers', icon: Plus, indent: true },
  { label: 'Network', href: '/network', icon: Globe },
  { label: 'Staff', href: '/staff', icon: BadgeIcon },
  { label: 'Mentorship', href: '/mentorship', icon: Users },
  { label: 'Certifications', href: '/certifications', icon: FileCheck },
  { label: 'Users', href: '/users', icon: Users },
  { label: 'Create User', href: '/users/create', icon: Plus, indent: true },
  { label: 'Patients', href: '/patients', icon: User },
  { label: 'Merge Tool', href: '/patients/merge', icon: Plus, indent: true },
  { label: 'AI Models', href: '/ai-models', icon: CpuIcon },
  { label: 'Alerts', href: '/alerts', icon: Bell },
  { label: 'Alert Config', href: '/alerts/configuration', icon: SlidersHorizontal, indent: true },
  { label: 'Audit Log', href: '/audit', icon: FileText },
  { label: 'Subscriptions', href: '/subscriptions', icon: CreditCardIcon },
  { label: 'Billing', href: '/subscriptions/billing', icon: WalletIcon, indent: true },
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
          <SignOutIcon className="h-4 w-4 shrink-0" />
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


function CpuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path d="M14 6H6v8h8V6Z" />
      <path fillRule="evenodd" d="M9.25 3V1.75a.75.75 0 0 1 1.5 0V3h1.5V1.75a.75.75 0 0 1 1.5 0V3h.5A2.75 2.75 0 0 1 17 5.75v.5h1.25a.75.75 0 0 1 0 1.5H17v1.5h1.25a.75.75 0 0 1 0 1.5H17v1.5h1.25a.75.75 0 0 1 0 1.5H17v.5A2.75 2.75 0 0 1 14.25 17h-.5v1.25a.75.75 0 0 1-1.5 0V17h-1.5v1.25a.75.75 0 0 1-1.5 0V17h-1.5v1.25a.75.75 0 0 1-1.5 0V17h-.5A2.75 2.75 0 0 1 3 14.25v-.5H1.75a.75.75 0 0 1 0-1.5H3v-1.5H1.75a.75.75 0 0 1 0-1.5H3v-1.5H1.75a.75.75 0 0 1 0-1.5H3v-.5A2.75 2.75 0 0 1 5.75 3h.5V1.75a.75.75 0 0 1 1.5 0V3h1.5ZM4.5 5.75c0-.69.56-1.25 1.25-1.25h8.5c.69 0 1.25.56 1.25 1.25v8.5c0 .69-.56 1.25-1.25 1.25h-8.5c-.69 0-1.25-.56-1.25-1.25v-8.5Z" clipRule="evenodd" />
    </svg>
  )
}


function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M2.5 4A1.5 1.5 0 0 0 1 5.5V6h18v-.5A1.5 1.5 0 0 0 17.5 4h-15ZM19 8.5H1v6A1.5 1.5 0 0 0 2.5 16h15a1.5 1.5 0 0 0 1.5-1.5v-6ZM3 13.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75Zm4.75-.75a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" clipRule="evenodd" />
    </svg>
  )
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path d="M1 4.25a3.733 3.733 0 0 1 2.25-.75h13.5c.844 0 1.623.279 2.25.75A2.25 2.25 0 0 0 16.75 2H3.25A2.25 2.25 0 0 0 1 4.25ZM1 7.25a3.733 3.733 0 0 1 2.25-.75h13.5c.844 0 1.623.279 2.25.75A2.25 2.25 0 0 0 16.75 5H3.25A2.25 2.25 0 0 0 1 7.25ZM7 8a1 1 0 0 0-1 1 8 8 0 0 0 8 8h2a2.25 2.25 0 0 0 2.25-2.25v-1a2.25 2.25 0 0 0-2.25-2.25h-1a.75.75 0 0 1-.75-.75v-.75A.75.75 0 0 0 14 9H7Zm6.75 5.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
    </svg>
  )
}


function BadgeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 2a.75.75 0 0 1 .75.75v.258a33.186 33.186 0 0 1 6.668.83.75.75 0 0 1-.336 1.461 31.28 31.28 0 0 0-1.103-.232l1.702 7.545a.75.75 0 0 1-.387.832A4.981 4.981 0 0 1 15 14c-.825 0-1.606-.2-2.294-.556a.75.75 0 0 1-.387-.832l1.77-7.849a31.743 31.743 0 0 0-3.339-.254v11.505a20.01 20.01 0 0 1 3.78.501.75.75 0 1 1-.339 1.462A18.558 18.558 0 0 0 10 17.5c-1.442 0-2.845.165-4.191.477a.75.75 0 0 1-.338-1.462 20.01 20.01 0 0 1 3.779-.501V4.509c-1.129.026-2.243.112-3.34.254l1.771 7.85a.75.75 0 0 1-.387.83A4.981 4.981 0 0 1 5 14a4.981 4.981 0 0 1-2.294-.556.75.75 0 0 1-.387-.832L4.02 5.067c-.37.07-.738.148-1.103.232a.75.75 0 0 1-.336-1.462 33.186 33.186 0 0 1 6.668-.829V2.75A.75.75 0 0 1 10 2ZM5 12.216l-1.357-6.012a29.845 29.845 0 0 0-1.143.41L5 12.216Zm10 0 2.5-5.602a29.845 29.845 0 0 0-1.143-.41L15 12.216Z" clipRule="evenodd" />
    </svg>
  )
}


function SignOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Z" clipRule="evenodd" />
      <path fillRule="evenodd" d="M19 10a.75.75 0 0 0-.75-.75H8.704l1.048-.943a.75.75 0 1 0-1.004-1.114l-2.5 2.25a.75.75 0 0 0 0 1.114l2.5 2.25a.75.75 0 1 0 1.004-1.114l-1.048-.943h9.546A.75.75 0 0 0 19 10Z" clipRule="evenodd" />
    </svg>
  )
}
