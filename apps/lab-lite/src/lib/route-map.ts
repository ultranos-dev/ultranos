interface BreadcrumbSegment {
  label: string
  href: string
}

const SUPPORTED_LOCALES = ['en', 'ar', 'prs', 'ps']

/** Strip the locale prefix from next/navigation pathname if present. */
function stripLocale(pathname: string): string {
  for (const locale of SUPPORTED_LOCALES) {
    if (pathname === `/${locale}`) return '/'
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1)
  }
  return pathname
}

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/upload': 'Upload Results',
  '/orders': 'Orders',
  '/worklist': 'Worklist',
  '/reports': 'Reports',
  '/reports/daily': 'Daily Log',
  '/patients/register': 'Register Patient',
  '/history': 'Result History',
  '/queue': 'Patient Queue',
  '/consent': 'Consent',
  '/sops': 'SOPs',
  '/atlas': 'Visual Atlas',
  '/peer-network': 'Peer Network',
  '/safety-reporting': 'Safety Reporting',
  '/equipment': 'Equipment',
  '/shift-handover': 'Shift Handover',
  '/quality': 'Quality Dashboard',
  '/achievements': 'Team Achievements',
  '/certification': 'Certification',
  '/mentorship': 'Mentorship',
  '/finance/payment': 'New Payment',
  '/finance/receipts': 'Receipts',
  '/finance/reconciliation': 'Reconciliation',
  '/finance/reagents': 'Reagents',
  '/finance/cost-analysis': 'Cost Analysis',
  '/finance/cost-settings': 'Cost Settings',
  '/authorization': 'Authorization Queue',
  '/notifications': 'Notifications',
  '/readiness': 'Readiness Board',
  '/network': 'Network',
  '/inventory/network': 'Network Inventory',
  '/settings': 'Settings',
}

export function buildBreadcrumbs(pathname: string): BreadcrumbSegment[] {
  const stripped = stripLocale(pathname)

  // Direct match
  if (ROUTE_LABELS[stripped]) {
    return [{ label: ROUTE_LABELS[stripped]!, href: stripped }]
  }

  // Prefix match — find the longest matching ancestor segment
  const segments = stripped.split('/').filter(Boolean)
  const crumbs: BreadcrumbSegment[] = []
  let path = ''
  for (const segment of segments) {
    path += `/${segment}`
    const label = ROUTE_LABELS[path]
    if (label) crumbs.push({ label, href: path })
  }

  return crumbs.length > 0 ? crumbs : [{ label: 'Page', href: stripped }]
}
