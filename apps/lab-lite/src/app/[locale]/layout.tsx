import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { AppSidebar } from '@/components/AppSidebar'
import { InstallPrompt } from '@/components/InstallPrompt'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <AppSidebar>
        {children}
        <InstallPrompt />
      </AppSidebar>
    </NextIntlClientProvider>
  )
}
