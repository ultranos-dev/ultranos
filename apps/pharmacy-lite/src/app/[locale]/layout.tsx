import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { SyncProvider } from '@/components/providers/SyncProvider'
import { SwUpdateNotification } from '@/components/SwUpdateNotification'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <SyncProvider>
        {children}
        <SwUpdateNotification />
      </SyncProvider>
    </NextIntlClientProvider>
  )
}
