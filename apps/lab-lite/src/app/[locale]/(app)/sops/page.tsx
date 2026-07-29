'use client'

import { SOPLibrary } from '@/components/sop/SOPLibrary'

// Auth is already enforced by the app layout's ClientErrorBoundary → AuthGuard.
// A page-level <AuthGuard> here would double-guard and blank the route.
export default function SOPsPage() {
  return <SOPLibrary />
}
