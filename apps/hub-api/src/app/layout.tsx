export const metadata = {
  title: 'Ultranos Hub API',
  description: 'Central Hub API for the Ultranos healthcare ecosystem',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
