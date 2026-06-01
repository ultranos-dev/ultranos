// Surveillance alert history page — server component shell.
import { SurveillanceDashboard } from '@/components/reports/SurveillanceDashboard'

export default function SurveillancePage({
  searchParams,
}: {
  searchParams: { alertId?: string }
}) {
  return <SurveillanceDashboard highlightAlertId={searchParams.alertId} />
}
