import { AppShell } from '@/components/AppShell'
import { EmergencyButton } from '@/components/safety/EmergencyButton'
import { LockExpiryCheckerMount } from '@/components/samples/LockExpiryCheckerMount'
import { SyncDashboard } from '@/components/SyncDashboard'
import { PhiCleanupGuard } from '@/components/PhiCleanupGuard'
import { MonitoringSyncInit } from '@/components/MonitoringSyncInit'
import { NotificationToaster } from '@/components/NotificationToaster'
import { LabKeyGate } from '@/components/LabKeyGate'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // Story 58.3 fix: gate the ENTIRE authenticated subtree — pages AND the background
  // sync components below — on encryption-key readiness. The session rehydrates from
  // storage before the memory-only key is re-established, so without this gate these
  // components run encrypted Dexie I/O with no key and throw EncryptionKeyNotAvailableError.
  return (
    <LabKeyGate>
      <PhiCleanupGuard />
      <LockExpiryCheckerMount />
      <MonitoringSyncInit />
      <AppShell>{children}</AppShell>
      <EmergencyButton />
      <SyncDashboard />
      <NotificationToaster />
    </LabKeyGate>
  )
}
