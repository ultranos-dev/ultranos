'use client'
import type { LucideIcon } from 'lucide-react'
import { Toaster, toast } from 'sonner'

export function AppToaster(props: React.ComponentProps<typeof Toaster>) {
  return <Toaster position="top-right" richColors closeButton {...props} />
}

export function notify(opts: {
  icon: LucideIcon
  appName: string
  subject: string
  urgent?: boolean
  onClick?: () => void
}) {
  const Icon = opts.icon
  const fn = opts.urgent ? toast.error : toast
  fn(opts.subject, {
    description: opts.appName,
    icon: <Icon className="h-4 w-4" aria-hidden />,
    ...(opts.onClick
      ? { action: { label: 'View', onClick: () => opts.onClick?.() } }
      : {}),
  })
}
