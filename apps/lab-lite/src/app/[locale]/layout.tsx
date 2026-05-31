import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { AppSidebar } from '@/components/AppSidebar'
import { InstallPrompt } from '@/components/InstallPrompt'
import { EmergencyButton } from '@/components/safety/EmergencyButton'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <AppSidebar>
        {children}
        <InstallPrompt />
      </AppSidebar>
      <EmergencyButton />
    </NextIntlClientProvider>
  )
}
