import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { AppShell } from '@/components/AppShell'
import { EmergencyButton } from '@/components/safety/EmergencyButton'
import { LockExpiryCheckerMount } from '@/components/samples/LockExpiryCheckerMount'
import { SyncProvider } from '@/components/providers/SyncProvider'
import { SyncDashboard } from '@/components/SyncDashboard'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <SyncProvider>
        <LockExpiryCheckerMount />
        <AppShell>{children}</AppShell>
        <EmergencyButton />
        <SyncDashboard />
      </SyncProvider>
    </NextIntlClientProvider>
  )
}