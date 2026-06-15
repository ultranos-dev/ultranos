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

export const metadata: Metadata = {
  title: 'Lab Diagnostics Portal — Ultranos',
  description: 'Ultranos Lab Lite PWA for diagnostic result upload',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const dir = getDirection(locale)
  const isRtl = dir === 'rtl'

  return (
    <html lang={locale} dir={dir} className={`${manrope.variable} ${publicSans.variable}`} suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/fonts-arabic.css" />
        {/* Inline theme detection: runs before hydration to avoid flash-of-wrong-theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans bg-background text-foreground antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none"
        >
          Skip to main content
        </a>
        <ClientErrorBoundary>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </ClientErrorBoundary>
      </body>
    </html>
  )
}
