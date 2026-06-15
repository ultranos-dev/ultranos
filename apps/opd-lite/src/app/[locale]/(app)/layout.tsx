import { AppSidebar } from '@/components/AppSidebar'
import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
import { SyncDashboard } from '@/components/SyncDashboard'
import { InstallPrompt } from '@/components/InstallPrompt'
import { SyncAwareStaleDataBanner } from '@/components/SyncAwareStaleDataBanner'
import {
  SidebarInset,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <SyncAwareStaleDataBanner />
          <BreadcrumbHeader />
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-[100] focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-ring"
          >
            Skip to content
          </a>
          <main id="main-content" className="flex flex-1 flex-col gap-4 p-4">{children}</main>
          <InstallPrompt />
        </SidebarInset>
      </SidebarProvider>
      <SyncDashboard />
    </TooltipProvider>
  )
}
