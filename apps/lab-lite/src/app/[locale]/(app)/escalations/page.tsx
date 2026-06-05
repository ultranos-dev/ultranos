import { EscalationStatusList } from '@/components/escalation/EscalationStatusList'

export default function EscalationsPage() {
  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-4">
      <EscalationStatusList />
    </div>
  )
}
