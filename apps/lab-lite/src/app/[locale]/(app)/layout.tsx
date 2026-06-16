import { AppShell } from '@/components/AppShell'
import { EmergencyButton } from '@/components/safety/EmergencyButton'
import { LockExpiryCheckerMount } from '@/components/samples/LockExpiryCheckerMount'
import { SyncDashboard } from '@/components/SyncDashboard'
import { PhiCleanupGuard } from '@/components/PhiCleanupGuard'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PhiCleanupGuard />
      <LockExpiryCheckerMount />
      <AppShell>{children}</AppShell>
      <EmergencyButton />
      <SyncDashboard />
    </>
  )
}
