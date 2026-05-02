import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClientErrorBoundary } from '@/components/ClientErrorBoundary'
import './globals.css'

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '900'],
})

export const metadata: Metadata = {
  title: 'OPD Lite — Patient Search',
  description: 'Ultranos OPD Lite PWA for clinical encounters',
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
