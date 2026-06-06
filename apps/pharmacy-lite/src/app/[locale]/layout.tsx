import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { SyncProvider } from '@/components/providers/SyncProvider'
import { SyncDashboard } from '@/components/pharmacy/SyncDashboard'
import { SwUpdateNotification } from '@/components/SwUpdateNotification'
import { AppSidebar } from '@/components/sidebar/app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <SyncProvider>
        <TooltipProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <BreadcrumbHeader />
              <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[100] focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-ring"
              >
                Skip to content
              </a>
              <main id="main-content">{children}</main>
            </SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
        <SyncDashboard />
        <SwUpdateNotification />
      </SyncProvider>
    </NextIntlClientProvider>
  )
}