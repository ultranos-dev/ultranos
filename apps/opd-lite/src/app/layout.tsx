import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { ClientErrorBoundary } from '@/components/ClientErrorBoundary'
import './globals.css'

const inter = localFont({
  src: [
    { path: '../../public/fonts/inter-latin.woff2', weight: '400 900', style: 'normal' },
    { path: '../../public/fonts/inter-latin-ext.woff2', weight: '400 900', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'OPD Lite — Patient Search',
  description: 'Ultranos OPD Lite PWA for clinical encounters',
  manifest: '/manifest.webmanifest',
  themeColor: '#1e40af',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OPD Lite',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={inter.variable}>
      <body className="font-sans bg-neutral-50 text-neutral-900 antialiased">
        <ClientErrorBoundary>
          {children}
        </ClientErrorBoundary>
      </body>
    </html>
  )
}
