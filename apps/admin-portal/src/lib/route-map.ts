interface BreadcrumbSegment {
  label: string
  href: string
}

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/providers': 'Providers',
  '/providers/expiry': 'License Expiry',
  '/patients': 'Patients',
  '/patients/merge': 'Merge Tool',
  '/alerts': 'Alerts',
  '/alerts/configuration': 'Alert Config',
  '/labs': 'Labs',
  '/labs/create': 'Create Lab',
  '/inventory': 'Inventory',
  '/inventory/suppliers': 'Suppliers',
  '/network': 'Network',
  '/mentorship': 'Mentorship',
  '/certifications': 'Certifications',
  '/users': 'Users',
  '/users/create': 'Create User',
  '/ai-models': 'AI Models',
  '/audit': 'Audit Log',
  '/subscriptions': 'Subscriptions',
  '/subscriptions/billing': 'Billing',
  '/subscriptions/invoices': 'Invoices',
  '/settings': 'Settings',
}

export function buildBreadcrumbs(pathname: string): BreadcrumbSegment[] {
  // Direct match first
  if (ROUTE_LABELS[pathname]) {
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

  // Dynamic route — find prefix matches
  const segments = pathname.split('/').filter(Boolean)
  const crumbs: BreadcrumbSegment[] = []
  let path = ''

  for (let i = 0; i < segments.length; i++) {
    path += `/${segments[i]}`
    const label = ROUTE_LABELS[path]
    if (label) {
      crumbs.push({ label, href: path })
    } else if (i === segments.length - 1) {
      const subPageLabels: Record<string, string> = {
        staff: 'Staff',
        certifications: 'Certifications',
        health: 'Health',
        profile: 'Profile',
        create: 'Create',
        merge: 'Merge',
        billing: 'Billing',
        invoices: 'Invoices',
      }
      if (subPageLabels[segments[i]]) {
        crumbs.push({ label: subPageLabels[segments[i]], href: pathname })
      } else {
        crumbs.push({ label: 'Detail', href: pathname })
      }
    }
  }

  return crumbs
}
