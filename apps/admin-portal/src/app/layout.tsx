import type { Metadata } from 'next'
import { Manrope, Public_Sans } from 'next/font/google'
import './globals.css'
import { AuthGuard } from '@/components/AuthGuard'
import { ThemeProvider } from '@/components/ThemeProvider'
import { cn } from "@/lib/utils";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={cn(manrope.variable, publicSans.variable)}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans bg-background text-foreground antialiased">
        <ThemeProvider>
          <AuthGuard>
            {children}
          </AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  )
}
