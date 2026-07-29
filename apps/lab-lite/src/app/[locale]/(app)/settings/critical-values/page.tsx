import Link from 'next/link'
import { ChevronLeft } from '@ultranos/ui-kit/icons'
import { ThresholdConfigPanel } from '@/components/escalation/ThresholdConfigPanel'
import { EscalationContactsPanel } from '@/components/escalation/EscalationContactsPanel'

export default function CriticalValuesSettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="text-muted-foreground hover:text-muted-foreground rtl:-scale-x-100"
          aria-label="Back to settings"
        >
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Critical Values &amp; Escalation</h1>
      </div>

      {/* Thresholds */}
      <section>
        <ThresholdConfigPanel />
      </section>

      {/* Escalation Contacts */}
      <section>
        <EscalationContactsPanel />
      </section>
    </div>
  )
}
