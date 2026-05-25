import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { AppShellWrapper } from '@/components/AppShellWrapper'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <AppShellWrapper>
        {children}
      </AppShellWrapper>
    </NextIntlClientProvider>
  )
}
