import Link from 'next/link'
import { ChevronLeft } from '@ultranos/ui-kit/icons'
import { ThresholdConfigPanel } from '@/components/escalation/ThresholdConfigPanel'
import { EscalationContactsPanel } from '@/components/escalation/EscalationContactsPanel'

export default function CriticalValuesSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-8">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="text-neutral-400 hover:text-neutral-600 rtl:-scale-x-100"
          aria-label="Back to settings"
        >
          <ChevronLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">Critical Values &amp; Escalation</h1>
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
