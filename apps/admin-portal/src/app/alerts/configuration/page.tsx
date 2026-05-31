'use client'

import { TopHeader } from '@/components/TopHeader'
import { SurveillanceConfigForm } from '@/components/alerts/SurveillanceConfigForm'
import { SurveillanceAlertHistory } from '@/components/alerts/SurveillanceAlertHistory'

export default function AlertConfigurationPage() {
  return (
    <>
      <TopHeader title="Alert Configuration" description="Configure surveillance alert thresholds and notification channels." />
      <div className="mx-auto max-w-7xl px-8 py-6 space-y-10">
        <SurveillanceConfigForm />
        <div className="border-t border-border pt-8">
          <SurveillanceAlertHistory />
        </div>
      </div>
    </>
  )
}
