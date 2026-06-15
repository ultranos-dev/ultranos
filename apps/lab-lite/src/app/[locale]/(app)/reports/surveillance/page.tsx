// Surveillance alert history page — server component shell.
import { SurveillanceDashboard } from '@/components/reports/SurveillanceDashboard'

export default async function SurveillancePage({
  searchParams,
}: {
  searchParams: Promise<{ alertId?: string }>
}) {
  const params = await searchParams
  return <SurveillanceDashboard highlightAlertId={params.alertId} />
}
