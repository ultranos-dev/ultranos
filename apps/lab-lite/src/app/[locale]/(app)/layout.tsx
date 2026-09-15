import { AppShell } from '@/components/AppShell'
import { EmergencyButton } from '@/components/safety/EmergencyButton'
import { LockExpiryCheckerMount } from '@/components/samples/LockExpiryCheckerMount'
import { SyncDashboard } from '@/components/SyncDashboard'
import { PhiCleanupGuard } from '@/components/PhiCleanupGuard'
import { MonitoringSyncInit } from '@/components/MonitoringSyncInit'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PhiCleanupGuard />
      <LockExpiryCheckerMount />
      <MonitoringSyncInit />
      <AppShell>{children}</AppShell>
      <EmergencyButton />
      <SyncDashboard />
    </>
  )
}
