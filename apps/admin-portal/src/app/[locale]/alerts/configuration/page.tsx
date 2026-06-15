import { BreadcrumbHeader } from '@/components/BreadcrumbHeader'
import { SurveillanceConfigForm } from '@/components/alerts/SurveillanceConfigForm'
import { SurveillanceAlertHistory } from '@/components/alerts/SurveillanceAlertHistory'

export default function AlertConfigurationPage() {
  return (
    <>
      <BreadcrumbHeader />
      <main id="main-content" className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Alert Configuration</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure surveillance thresholds and notification channels for your lab network.
            </p>
          </div>
          <SurveillanceConfigForm />
          <SurveillanceAlertHistory />
        </div>
      </main>
    </>
  )
}
