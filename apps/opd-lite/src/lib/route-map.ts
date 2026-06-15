interface BreadcrumbSegment {
  label: string
  href: string
}

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/patients': 'Patients',
  '/appointments': 'Appointments',
  '/notifications': 'Notifications',
  '/conflicts': 'Conflicts',
  '/duplicate-review': 'Duplicate Review',
  '/expiring-consents': 'Expiring Consents',
  '/register-patient': 'Register Patient',
  '/settings': 'Settings',
  '/settings/data-budget': 'Data Usage',
  '/kyc': 'KYC',
}

// Dynamic route prefix → { parent label + href, leaf label }
const DYNAMIC_ROUTES: Array<{
  prefix: string
  parentLabel: string
  parentHref: string
  leafLabel: string
}> = [
  {
    prefix: '/patient/',
    parentLabel: 'Patients',
    parentHref: '/patients',
    leafLabel: 'Patient Detail',
  },
  {
    prefix: '/encounter/',
    parentLabel: 'Patients',
    parentHref: '/patients',
    leafLabel: 'Encounter',
  },
]

export function buildBreadcrumbs(rawPathname: string): BreadcrumbSegment[] {
  // Strip next-intl locale prefix: /en/... → /...
  const pathname = rawPathname.replace(/^\/[a-z]{2}(\/|$)/, '/')

  // Direct match
  if (ROUTE_LABELS[pathname]) {
    if (pathname === '/') {
      return [{ label: ROUTE_LABELS['/'], href: '/' }]
    }
    const segments = pathname.split('/').filter(Boolean)
    const crumbs: BreadcrumbSegment[] = []
    let path = ''
    for (const segment of segments) {
      path += `/${segment}`
      const label = ROUTE_LABELS[path]
      if (label) {
        crumbs.push({ label, href: path })
      }
    }
    return crumbs.length > 0 ? crumbs : [{ label: ROUTE_LABELS[pathname], href: pathname }]
  }

  // Dynamic route match
  for (const route of DYNAMIC_ROUTES) {
    if (pathname.startsWith(route.prefix)) {
      return [
        { label: route.parentLabel, href: route.parentHref },
        { label: route.leafLabel, href: pathname },
      ]
    }
  }

  // Fallback: walk segments and collect known labels
  const segments = pathname.split('/').filter(Boolean)
  const crumbs: BreadcrumbSegment[] = []
  let path = ''
  for (let i = 0; i < segments.length; i++) {
    path += `/${segments[i]}`
    const label = ROUTE_LABELS[path]
    if (label) {
      crumbs.push({ label, href: path })
    } else if (i === segments.length - 1) {
      crumbs.push({ label: 'Detail', href: pathname })
    }
  }
  return crumbs
}
