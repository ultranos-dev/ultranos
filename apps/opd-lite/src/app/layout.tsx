import type { Metadata, Viewport } from 'next'
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

export const viewport: Viewport = {
  themeColor: '#1e40af',
}

export const metadata: Metadata = {
  title: 'OPD Lite — Patient Search',
  description: 'Ultranos OPD Lite PWA for clinical encounters',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OPD Lite',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const dir = getDirection(locale)
  const isRtl = dir === 'rtl'

  return (
    <html lang={locale} dir={dir} className={`${manrope.variable} ${publicSans.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`,
          }}
        />
        <link rel="stylesheet" href="/fonts-arabic.css" />
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
