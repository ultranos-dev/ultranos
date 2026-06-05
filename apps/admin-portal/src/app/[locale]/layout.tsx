import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { AuthGuard } from '@/components/AuthGuard'

export default async function LocaleLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages()

  return (
    <NextIntlClientProvider messages={messages}>
      <AuthGuard>{children}</AuthGuard>
    </NextIntlClientProvider>
  )
}
