import type { Metadata } from 'next'
import './globals.css'
import { AuthGuard } from '@/components/AuthGuard'
import { ThemeProvider } from '@/components/ThemeProvider'

export const metadata: Metadata = {
  title: 'Ultranos Admin Portal',
  description: 'Back-office administration for provider verification, lab approvals, and operational alerts',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans bg-canvas text-text-primary antialiased">
        <ThemeProvider>
          <AuthGuard>
            {children}
          </AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  )
}
