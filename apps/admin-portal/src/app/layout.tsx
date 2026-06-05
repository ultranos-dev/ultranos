import type { Metadata } from 'next'
import { Manrope, Public_Sans } from 'next/font/google'
import { getLocale } from 'next-intl/server'
import { getMessages } from 'next-intl/server'
import { NextIntlClientProvider } from 'next-intl'
import { getDirection } from '@ultranos/ui-kit'
import './globals.css'
import { AuthGuard } from '@/components/AuthGuard'
import { ThemeProvider } from '@/components/ThemeProvider'
import { cn } from '@/lib/utils'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
})

const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Ultranos Admin Portal',
  description: 'Back-office administration for provider verification, lab approvals, and operational alerts',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const dir = getDirection(locale)
  const isRtl = dir === 'rtl'
  const messages = await getMessages()

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={cn(manrope.variable, publicSans.variable)}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`,
          }}
        />
        {isRtl && <link rel="stylesheet" href="/fonts-arabic.css" />}
      </head>
      <body className="font-sans bg-background text-foreground antialiased">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <AuthGuard>
              {children}
            </AuthGuard>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
