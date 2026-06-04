import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { getLocale } from 'next-intl/server'
import { getDirection } from '@ultranos/ui-kit'
import { ClientErrorBoundary } from '@/components/ClientErrorBoundary'
import { ThemeProvider } from '@/components/ThemeProvider'
import './globals.css'

const manrope = localFont({
  src: [
    {
      path: '../../public/fonts/manrope/Manrope-Regular.woff2',
      weight: '100 900',
      style: 'normal',
    },
  ],
  variable: '--font-manrope',
  display: 'swap',
})

const publicSans = localFont({
  src: [
    { path: '../../public/fonts/public-sans/PublicSans-Regular.woff2',  weight: '400', style: 'normal' },
    { path: '../../public/fonts/public-sans/PublicSans-Medium.woff2',   weight: '500', style: 'normal' },
    { path: '../../public/fonts/public-sans/PublicSans-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: '../../public/fonts/public-sans/PublicSans-Bold.woff2',     weight: '700', style: 'normal' },
  ],
  variable: '--font-public-sans',
  display: 'swap',
})

const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`

export const metadata: Metadata = {
  title: 'Pharmacy Lite — Prescription Fulfillment',
  description: 'Ultranos Pharmacy Lite PWA for medication dispensing',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const dir = getDirection(locale)
  const isRtl = dir === 'rtl'

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${manrope.variable} ${publicSans.variable}`}
    >
      <head>
        {isRtl && <link rel="stylesheet" href="/fonts-arabic.css" />}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans bg-background text-foreground antialiased">
        <ThemeProvider>
          <ClientErrorBoundary>
            {children}
          </ClientErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  )
}
