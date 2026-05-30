import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { AppSidebar } from '@/components/AppSidebar'
import { AppHeader } from '@/components/AppHeader'
import { SyncProvider } from '@/components/providers/SyncProvider'
import { SyncDashboard } from '@/components/SyncDashboard'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <SyncProvider>
        <AppSidebar>
          <AppHeader />
          {children}
        </AppSidebar>
        <SyncDashboard />
      </SyncProvider>
    </NextIntlClientProvider>
  )
}
