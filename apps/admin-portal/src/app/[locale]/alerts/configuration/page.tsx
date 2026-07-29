import { SurveillanceConfigForm } from '@/components/alerts/SurveillanceConfigForm'
import { SurveillanceAlertHistory } from '@/components/alerts/SurveillanceAlertHistory'

export default function AlertConfigurationPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Alert Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure surveillance thresholds and notification channels for your lab network.
        </p>
      </div>
      <SurveillanceConfigForm />
      <SurveillanceAlertHistory />
    </div>
  )
}
